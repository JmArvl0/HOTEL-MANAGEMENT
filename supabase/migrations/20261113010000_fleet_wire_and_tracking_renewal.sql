-- Supplied local Fleet contract, 2026-11-06. Network activation remains off.
begin;

create or replace function public.fleet_attach_ride_details() returns trigger
language plpgsql security definer set search_path=public as $$
declare p transport_pickup_profiles%rowtype; request jsonb; traveler jsonb;
begin
 select pp.* into p from transport_pickup_profiles pp join fleet_transport_links fl on fl.request_id=pp.request_id where fl.id=new.link_id;
 if not found then raise exception 'FLEET_PICKUP_PROFILE_REQUIRED'; end if;
 request:=new.payload->'request'; traveler:=request->'traveler';
 new.payload:=jsonb_build_object('contract_version',2,'source_system','HAVEN',
  'external_request_id',new.payload->>'external_request_id','external_booking_id',new.payload->>'external_request_id',
  'external_revision',1,'event_id',new.id,'event_kind','create',
  'round_trip_reference',request->>'journey_reference','leg_kind',lower(request->>'leg'),
  'request',(request-'traveler'-'journey_reference'-'leg')||jsonb_build_object(
   'guest_reference',traveler->'guest_reference','guest_name',p.traveler_name,'guest_phone',p.phone,'guest_email',p.email,
   'guest_photo_reference',p.photo_reference,'guest_photo_version',p.photo_version,
   'ride_preferences',to_jsonb(p.ride_preferences),'luggage',jsonb_build_object('count',p.luggage_count,'notes',p.luggage_notes),'passenger_notes',p.ride_notes));
 return new;
end $$;

-- Never silently change an attempted immutable create into a different wire.
update public.fleet_transport_outbox set state='NEEDS_REVIEW',last_error='FLEET_CONTRACT_REPREPARATION_REQUIRED'
 where state in('PREPARED','SENDING','FAILED') and payload->>'source_system' is distinct from 'HAVEN';

create function public.receive_haven_fleet_snapshot(p_snapshot jsonb,p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype;
begin
 if p_snapshot->>'source_system' is distinct from 'HAVEN' or p_event->>'source_system' is distinct from 'PMS'
  or p_event->'wire_snapshot' is distinct from p_snapshot or p_event->>'event_id' is distinct from p_snapshot->>'event_id'
  or p_event->>'external_request_id' is distinct from p_snapshot->>'external_request_id' then raise exception 'FLEET_EVENT_CONFLICT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event->>'event_id',0));
 select * into l from fleet_transport_links where external_request_id=p_snapshot->>'external_request_id' for update;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 if p_snapshot->>'round_trip_reference' is distinct from l.request_id::text or p_snapshot->>'leg_kind' is distinct from lower(l.leg)
  or not exists(select 1 from fleet_transport_outbox where link_id=l.id and (payload->>'external_revision')::bigint=(p_snapshot->>'external_revision')::bigint) then raise exception 'FLEET_EVENT_CONFLICT'; end if;
 return receive_fleet_transport_status(p_event);
end $$;

create function public.replay_fleet_transport_status(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare saved fleet_transport_inbox%rowtype;
begin
 select * into saved from fleet_transport_inbox where event_id=p_event->>'event_id';
 if not found then raise exception 'FLEET_LEGACY_EVENT_NOT_FOUND'; end if;
 if saved.payload is distinct from p_event then raise exception 'FLEET_EVENT_CONFLICT'; end if;
 return jsonb_build_object('delivered',true,'duplicate',true,'outcome',saved.outcome);
end $$;

create function public.finish_fleet_contract_create(p_id uuid,p_lease uuid,p_reference text,p_snapshot jsonb,p_event jsonb,p_error text,p_review boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare saved boolean;
begin
 if p_event is not null then perform pg_advisory_xact_lock(hashtextextended(p_event->>'event_id',0)); end if;
 saved:=finish_fleet_transport(p_id,p_lease,p_reference,p_error,p_review);
 if saved and p_snapshot is not null and p_error is null and not p_review then perform receive_haven_fleet_snapshot(p_snapshot,p_event); end if;
 return saved;
end $$;

create function public.authorize_fleet_pickup_photo(p_external text,p_photo uuid,p_version integer,p_assignment uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare authorized jsonb;
begin
 select jsonb_build_object('request_id',tr.id,'photo_path',p.photo_path,'photo_version',p.photo_version) into authorized
 from fleet_transport_links fl join transportation_requests tr on tr.id=fl.request_id
 join reservations r on r.id=tr.reservation_id join transport_pickup_profiles p on p.request_id=tr.id
 where fl.external_request_id=p_external and fl.assignment_active and not fl.needs_review
  and fl.partner_status in('ASSIGNED','IN_TRANSIT') and fl.partner_version>0
  and fl.guest_safety->>'assignment_reference'=p_assignment::text
  and r.status in('confirmed','checked_in') and tr.status not in('COMPLETED','CANCELLED','REJECTED')
  and p.sharing_enabled and p.photo_reference=p_photo and p.photo_version=p_version and p.photo_path is not null;
 return authorized;
end $$;

create table public.fleet_tracking_renewals(
 id uuid primary key, link_id uuid not null references public.fleet_transport_links(id) on delete restrict,
 expected_version integer not null check(expected_version>0), assignment_reference uuid not null,
 previous_tracking_url text,
 state text not null default 'PENDING' check(state in('PENDING','SENDING','SUCCEEDED','FAILED','NEEDS_REVIEW')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid,lease_until timestamptz,last_error text,
 created_by uuid not null references public.user_accounts(id),created_at timestamptz not null default now(),finished_at timestamptz
);
create unique index fleet_tracking_renewals_one_pending on public.fleet_tracking_renewals(link_id) where state in('PENDING','SENDING','FAILED');
alter table public.fleet_tracking_renewals enable row level security;
revoke all on public.fleet_tracking_renewals from public,anon,authenticated;
grant select,insert,update on public.fleet_tracking_renewals to service_role;

create function public.queue_fleet_tracking_renewal(p_actor uuid,p_link uuid,p_key uuid,p_expected integer,p_assignment uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype; t transportation_requests%rowtype; existing fleet_tracking_renewals%rowtype;
begin
 if not exists(select 1 from user_accounts where id=p_actor and role='front_desk' and active and account_status='active') then raise exception 'FLEET_FORBIDDEN'; end if;
 select tr.* into t from transportation_requests tr join fleet_transport_links fl on fl.request_id=tr.id where fl.id=p_link for update of tr;
 select * into l from fleet_transport_links where id=p_link for update;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 if not l.assignment_active or l.needs_review or l.partner_status not in('ASSIGNED','IN_TRANSIT') or t.status in('COMPLETED','CANCELLED','REJECTED')
  or l.guest_safety->>'assignment_reference' is distinct from p_assignment::text
  or not exists(select 1 from reservations where id=t.reservation_id and status in('confirmed','checked_in'))
  or not exists(select 1 from transport_pickup_profiles where request_id=t.id and sharing_enabled) then raise exception 'FLEET_ASSIGNMENT_NOT_ACTIVE'; end if;
 select * into existing from fleet_tracking_renewals where id=p_key;
 if found then
  if existing.link_id<>p_link or existing.expected_version is distinct from p_expected or existing.assignment_reference is distinct from p_assignment then raise exception 'FLEET_EVENT_CONFLICT'; end if;
  return existing.id;
 end if;
 select * into existing from fleet_tracking_renewals where link_id=p_link and state in('PENDING','SENDING','FAILED') for update;
 if found and existing.assignment_reference=p_assignment then return existing.id; end if;
 if found then update fleet_tracking_renewals set state='NEEDS_REVIEW',last_error='ASSIGNMENT_CHANGED' where id=existing.id; end if;
 if l.partner_version is distinct from p_expected::bigint or p_key is null then raise exception 'FLEET_REQUEST_STALE'; end if;
 insert into fleet_tracking_renewals(id,link_id,expected_version,assignment_reference,previous_tracking_url,created_by)
 values(p_key,p_link,p_expected,p_assignment,l.guest_safety->'tracking'->>'url',p_actor);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'fleet_tracking_renewal_requested','transportation_request',t.id::text,jsonb_build_object('eventId',p_key,'expectedVersion',p_expected));
 return p_key;
end $$;

create function public.claim_fleet_tracking_renewal(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare command fleet_tracking_renewals%rowtype; l fleet_transport_links%rowtype; t transportation_requests%rowtype;
begin
 select tr.* into t from transportation_requests tr join fleet_transport_links fl on fl.request_id=tr.id join fleet_tracking_renewals c on c.link_id=fl.id where c.id=p_id for update of tr;
 select fl.* into l from fleet_transport_links fl join fleet_tracking_renewals c on c.link_id=fl.id where c.id=p_id for update of fl;
 select * into command from fleet_tracking_renewals where id=p_id for update;
 if not found or command.state not in('PENDING','FAILED','SENDING') or command.attempts>=8 or command.next_attempt_at>now()
  or (command.state='SENDING' and command.lease_until>now()) then return null; end if;
 if not l.assignment_active or l.needs_review or l.guest_safety->>'assignment_reference' is distinct from command.assignment_reference::text
  or t.status in('COMPLETED','CANCELLED','REJECTED') or not exists(select 1 from reservations where id=t.reservation_id and status in('confirmed','checked_in'))
  or not exists(select 1 from transport_pickup_profiles where request_id=t.id and sharing_enabled)
  or (command.attempts=0 and l.partner_version<>command.expected_version) then
  update fleet_tracking_renewals set state='NEEDS_REVIEW',last_error='ASSIGNMENT_CHANGED' where id=p_id; return null;
 end if;
 update fleet_tracking_renewals set state='SENDING',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '30 seconds' where id=p_id;
 return jsonb_build_object('externalRequestId',l.external_request_id,'fleetReference',l.fleet_reference,'previousTrackingUrl',command.previous_tracking_url,
  'payload',jsonb_build_object('event_id',command.id,'expected_request_version',command.expected_version,'assignment_reference',command.assignment_reference));
end $$;

create function public.finish_fleet_tracking_renewal(p_id uuid,p_lease uuid,p_snapshot jsonb,p_event jsonb,p_error text,p_review boolean) returns text
language plpgsql security definer set search_path=public as $$
declare command fleet_tracking_renewals%rowtype; l fleet_transport_links%rowtype; result jsonb; final_state text;
begin
 if p_event is not null then perform pg_advisory_xact_lock(hashtextextended(p_event->>'event_id',0)); end if;
 select fl.* into l from fleet_transport_links fl join fleet_tracking_renewals c on c.link_id=fl.id where c.id=p_id for update of fl;
 select * into command from fleet_tracking_renewals where id=p_id for update;
 if not found or command.state<>'SENDING' or command.lease_id is null or command.lease_id is distinct from p_lease then return 'NEEDS_REVIEW'; end if;
 final_state:=case when p_review then 'NEEDS_REVIEW' when p_error is not null then 'FAILED' else 'SUCCEEDED' end;
 if p_snapshot is not null then
  if p_snapshot->>'external_request_id' is distinct from l.external_request_id
   or p_snapshot->>'fleet_reference' is distinct from l.fleet_reference
   or p_snapshot->>'assignment_reference' is distinct from command.assignment_reference::text
   or (p_snapshot->>'request_version')::bigint<=command.expected_version
   or p_snapshot->'tracking'->>'url' is null
   or (command.previous_tracking_url is not null and p_snapshot->'tracking'->>'url'=command.previous_tracking_url) then raise exception 'FLEET_RENEWAL_RESULT_CONFLICT'; end if;
  result:=receive_haven_fleet_snapshot(p_snapshot,p_event);
  if result->>'outcome'='NEEDS_REVIEW' then final_state:='NEEDS_REVIEW'; end if;
 end if;
 update fleet_tracking_renewals set state=final_state,last_error=p_error,lease_id=null,lease_until=null,
  next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,least(command.attempts,7)))::integer)),
  finished_at=case when final_state='SUCCEEDED' then now() end where id=p_id;
 return final_state;
end $$;

revoke all on function public.receive_haven_fleet_snapshot(jsonb,jsonb),public.replay_fleet_transport_status(jsonb),public.finish_fleet_contract_create(uuid,uuid,text,jsonb,jsonb,text,boolean),public.authorize_fleet_pickup_photo(text,uuid,integer,uuid),
 public.queue_fleet_tracking_renewal(uuid,uuid,uuid,integer,uuid),public.claim_fleet_tracking_renewal(uuid,uuid),public.finish_fleet_tracking_renewal(uuid,uuid,jsonb,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.receive_haven_fleet_snapshot(jsonb,jsonb),public.replay_fleet_transport_status(jsonb),public.finish_fleet_contract_create(uuid,uuid,text,jsonb,jsonb,text,boolean),public.authorize_fleet_pickup_photo(text,uuid,integer,uuid),
 public.queue_fleet_tracking_renewal(uuid,uuid,uuid,integer,uuid),public.claim_fleet_tracking_renewal(uuid,uuid),public.finish_fleet_tracking_renewal(uuid,uuid,jsonb,jsonb,text,boolean) to service_role;
commit;
