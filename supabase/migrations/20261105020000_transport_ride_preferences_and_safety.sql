-- Haven-side preparation. Fleet remains off pending partner acceptance.
begin;
alter table public.transport_pickup_profiles
 add column ride_preferences text[] not null default '{}'
  check(ride_preferences <@ array['QUIET_RIDE','HELP_WITH_LUGGAGE','COOL_CABIN']::text[] and cardinality(ride_preferences)<=3),
 add column luggage_count integer not null default 0 check(luggage_count between 0 and 20),
 add column luggage_notes text not null default '' check(length(luggage_notes)<=300),
 add column ride_notes text not null default '' check(length(ride_notes)<=500);
alter table public.fleet_transport_links add column guest_safety jsonb
 check(guest_safety is null or jsonb_typeof(guest_safety)='object');

-- Reuse the existing ownership, actor, version, photo and consent transaction.
-- The wrapper's additional update commits or rolls back with the original save.
create function public.save_transport_ride_profile(p_actor uuid,p_request uuid,p_expected_version integer,p_details jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; preferences text[];
begin
 preferences:=array(select jsonb_array_elements_text(coalesce(p_details->'ridePreferences','[]'::jsonb)));
 if cardinality(preferences)<>(select count(distinct value) from unnest(preferences) as value) then raise exception 'RIDE_PREFERENCES_INVALID'; end if;
 result:=save_transport_pickup_profile(p_actor,p_request,p_expected_version,p_details);
 update transport_pickup_profiles set ride_preferences=preferences,
  luggage_count=coalesce((p_details->>'luggageCount')::integer,0),
  luggage_notes=coalesce(trim(p_details->>'luggageNotes'),''),
  ride_notes=coalesce(trim(p_details->>'rideNotes'),'') where request_id=p_request;
 return result;
end $$;

-- Every create caller takes the same current ride-details snapshot. A retry of
-- an attempted event cannot pass prepare_fleet_transport's immutable-send gate.
create function public.fleet_attach_ride_details() returns trigger
language plpgsql security definer set search_path=public as $$
declare p transport_pickup_profiles%rowtype;
begin
 select pp.* into p from transport_pickup_profiles pp join fleet_transport_links fl on fl.request_id=pp.request_id where fl.id=new.link_id;
 if not found then raise exception 'FLEET_PICKUP_PROFILE_REQUIRED'; end if;
 new.payload:=jsonb_set(new.payload,'{request}',(new.payload->'request')||jsonb_build_object(
  'ride_preferences',to_jsonb(p.ride_preferences),
  'luggage',jsonb_build_object('count',p.luggage_count,'notes',p.luggage_notes),
  'passenger_notes',p.ride_notes));
 return new;
end $$;
create trigger fleet_ride_details_snapshot before insert or update of payload on public.fleet_transport_outbox
for each row execute function public.fleet_attach_ride_details();

-- The original receiver inserts the APPLIED inbox row before updating its
-- versioned projection. Capture only allowlisted guest fields in that same
-- transaction. No local status/fare writer is called. Every newer assignment
-- replaces the whole snapshot, so omitted/rotated tracking never reuses a link.
create function public.fleet_project_guest_safety() returns trigger
language plpgsql security definer set search_path=public as $$
declare event jsonb;
begin
 if not new.assignment_active or new.needs_review then
  new.guest_safety:=null;
 elsif new.partner_version>old.partner_version then
  select payload into event from fleet_transport_inbox where link_id=new.id and outcome='APPLIED'
   and (payload->>'request_version')::bigint=new.partner_version order by received_at desc,event_id limit 1;
  new.guest_safety:=case when event is null then null else jsonb_build_object(
   'assignment_reference',event->>'assignment_reference','driver',event->'driver',
   'vehicle',event->'vehicle','tracking',event->'tracking') end;
 end if;
 return new;
end $$;
create trigger fleet_guest_safety_snapshot before update of partner_version,assignment_active,needs_review on public.fleet_transport_links
for each row execute function public.fleet_project_guest_safety();

revoke all on function public.save_transport_ride_profile(uuid,uuid,integer,jsonb),public.fleet_attach_ride_details(),public.fleet_project_guest_safety() from public,anon,authenticated;
grant execute on function public.save_transport_ride_profile(uuid,uuid,integer,jsonb) to service_role;
commit;
