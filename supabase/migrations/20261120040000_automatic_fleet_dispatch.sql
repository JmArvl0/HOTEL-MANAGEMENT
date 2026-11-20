begin;

alter table public.fleet_transport_outbox add column auto_dispatch boolean not null default false;
create index fleet_transport_auto_due_idx on public.fleet_transport_outbox(next_attempt_at)
 where auto_dispatch and state in ('PREPARED','FAILED','SENDING');

-- Front Desk can still cancel a queued ride or resolve delivery issues, but it
-- cannot move a Fleet ride into the hotel-operated assignment and fare path.
create function public.guard_automatic_fleet_status() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from fleet_transport_links l join fleet_transport_outbox o on o.link_id=l.id
  where l.request_id=old.id and o.auto_dispatch) then
  raise exception 'TRANSPORTATION_USE_FLEET';
 end if;
 return new;
end;
$$;
create trigger guard_automatic_fleet_status before update of status on public.transportation_requests
for each row when(old.status is distinct from new.status and new.status in ('REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS','COMPLETED'))
execute function public.guard_automatic_fleet_status();

-- Both staff preparation and consented submissions use the same immutable Fleet leg and event IDs.
create function public.write_fleet_transport_outbox(p_actor uuid,p_request uuid,p_expected_version integer,p_automatic boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t transportation_requests%rowtype; p transport_pickup_profiles%rowtype; l fleet_transport_links%rowtype;
 r reservations%rowtype; v_leg text; eid uuid; body jsonb; n integer:=0;
begin
 select * into t from transportation_requests where id=p_request for update;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 if t.version is distinct from p_expected_version then raise exception 'FLEET_REQUEST_STALE'; end if;
 if t.status not in('REVIEWED','SCHEDULED') and not (p_automatic and t.status='REQUESTED') then raise exception 'FLEET_REVIEW_REQUEST_FIRST'; end if;
 select * into p from transport_pickup_profiles where request_id=t.id;
 if not found or not p.sharing_enabled then raise exception 'FLEET_PICKUP_CONSENT_REQUIRED'; end if;
 select * into r from reservations where id=t.reservation_id;
 if not found or r.status not in('confirmed','checked_in') then raise exception 'FLEET_STAY_NOT_ACTIVE'; end if;
 foreach v_leg in array case when t.service_type='ROUND_TRIP' then array['OUTBOUND','RETURN'] else array['OUTBOUND'] end loop
  insert into fleet_transport_links(request_id,leg,external_request_id) values(t.id,v_leg,'haven:'||t.id::text||':'||lower(v_leg)) on conflict(request_id,leg) do nothing;
  select * into l from fleet_transport_links where request_id=t.id and fleet_transport_links.leg=v_leg for update;
  if exists(select 1 from fleet_transport_outbox where link_id=l.id and (attempts>0 or auto_dispatch)) then raise exception 'FLEET_RECONCILIATION_REQUIRED'; end if;
  select id into eid from fleet_transport_outbox where link_id=l.id;
  eid:=coalesce(eid,gen_random_uuid());
  body:=jsonb_build_object('contract_version',2,'external_request_id',l.external_request_id,'external_revision',1,'event_id',eid,'event_kind','create',
   'request',jsonb_build_object('booking_reference',coalesce(r.confirmation_number,r.id),'guest_name',p.traveler_name,
    'pickup_location',case when v_leg='RETURN' then t.dropoff_location else t.pickup_location end,
    'dropoff_location',case when v_leg='RETURN' then t.return_location else t.dropoff_location end,
    'pickup_datetime',to_char(case when v_leg='RETURN' then t.return_date else t.pickup_date end,'YYYY-MM-DD')||'T'||case when v_leg='RETURN' then t.return_time else t.pickup_time end||':00+08:00',
    'passenger_count',t.passenger_count,'load_type','Passenger','service_code','GUEST_TRANSPORT','priority','Normal','special_requests',t.special_instructions,
    'traveler',jsonb_build_object('guest_reference',p.traveler_reference,'display_name',p.traveler_name,'phone',p.phone,'email',p.email,'photo_reference',p.photo_reference,'photo_version',p.photo_version),
    'journey_reference',t.id,'leg',v_leg));
  insert into fleet_transport_outbox(id,link_id,request_version,profile_version,payload,created_by,auto_dispatch) values(eid,l.id,t.version,p.version,body,p_actor,p_automatic)
  on conflict(link_id) do update set request_version=t.version,profile_version=p.version,payload=body,state='PREPARED',last_error=null;
  update fleet_transport_links set needs_review=false,updated_at=now() where id=l.id;
  n:=n+1;
 end loop;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'fleet_transport_prepared','transportation_request',t.id::text,jsonb_build_object('legs',n));
 return jsonb_build_object('legs',n);
end $$;

create or replace function public.prepare_fleet_transport(p_actor uuid,p_request uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from user_accounts where id=p_actor and role='front_desk' and active and account_status='active')
 then raise exception 'FLEET_FORBIDDEN'; end if;
 return public.write_fleet_transport_outbox(p_actor,p_request,p_expected_version,false);
end;
$$;

-- Never replace a snapshot on replay, including after the passenger withdraws sharing.
create function public.queue_guest_fleet_transport(p_actor uuid,p_request uuid,p_profile jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare trip transportation_requests%rowtype;
begin
 select * into trip from transportation_requests where id=p_request for update;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 if exists(select 1 from fleet_transport_links where request_id=p_request) then return; end if;
 if p_profile->'sharingEnabled' is distinct from 'true'::jsonb then raise exception 'FLEET_PICKUP_CONSENT_REQUIRED'; end if;
 if exists(select 1 from transport_pickup_profiles where request_id=p_request) then raise exception 'FLEET_PICKUP_PROFILE_CHANGED'; end if;
 perform public.save_transport_ride_profile(p_actor,p_request,0,p_profile);
 perform public.write_fleet_transport_outbox(p_actor,p_request,trip.version,true);
end;
$$;

create function public.create_stay_transportation_request(
 p_user_id uuid,p_reservation_id text,p_service_type text,
 p_pickup_location text,p_dropoff_location text,p_pickup_date date,p_pickup_time text,
 p_return_location text,p_return_date date,p_return_time text,
 p_passenger_count integer,p_special_instructions text,p_idempotency_key uuid,
 p_actor uuid,p_profile jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;hotel_label text;existing transportation_requests%rowtype;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;today date;rid uuid;
 fingerprint text:=md5(jsonb_build_array(p_service_type,trim(p_pickup_location),trim(p_dropoff_location),
  p_pickup_date,p_pickup_time,trim(p_return_location),p_return_date,p_return_time,p_passenger_count,trim(p_special_instructions))::text);
begin
 select role into actor from user_accounts where id=p_actor and active and (p_profile is null or account_status='active');
 if actor is null or not ((actor='guest' and p_actor=p_user_id) or (actor='front_desk' and p_profile is not null)) then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_idempotency_key is null then raise exception'INVALID_TRANSPORTATION_REQUEST';end if;
 if p_profile is not null then fingerprint:=md5(fingerprint||p_profile::text); end if;
 perform pg_advisory_xact_lock(hashtextextended('transportation:'||p_idempotency_key,0));
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;
 if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 select * into existing from transportation_requests where idempotency_key=p_idempotency_key;
 if found then
  if (existing.reservation_id,existing.user_id) is distinct from (r.id,p_user_id) then raise exception 'RETRY_PAYLOAD_CONFLICT';end if;
  if existing.request_fingerprint is not null then
   if existing.request_fingerprint is distinct from fingerprint then raise exception 'RETRY_PAYLOAD_CONFLICT';end if;
  elsif (existing.service_type,existing.pickup_date,existing.pickup_time,existing.return_date,existing.return_time,existing.return_location,existing.passenger_count,existing.special_instructions)
   is distinct from (p_service_type,p_pickup_date,p_pickup_time,p_return_date,p_return_time,nullif(trim(p_return_location),''),p_passenger_count,nullif(trim(p_special_instructions),''))
   or (p_service_type<>'DROPOFF' and existing.pickup_location is distinct from trim(p_pickup_location))
   or (p_service_type='DROPOFF' and existing.dropoff_location is distinct from trim(p_dropoff_location))
  then raise exception 'RETRY_PAYLOAD_CONFLICT';end if;
  return jsonb_build_object('id',existing.id,'status',existing.status);
 end if;
 if p_service_type not in('PICKUP','DROPOFF','ROUND_TRIP') then raise exception'INVALID_SERVICE_TYPE';end if;
 if p_passenger_count is null or p_passenger_count<1 or p_passenger_count>20 then raise exception'INVALID_PASSENGER_COUNT';end if;
 if p_pickup_date is null or p_pickup_time is null or p_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 select coalesce(nullif(trim(transfer_hotel_label),''),'HAVEN Hotel & Residences') into hotel_label from hotel_operational_policies where key='default';
 v_pickup:=nullif(trim(coalesce(p_pickup_location,'')),'');
 v_dropoff:=nullif(trim(coalesce(p_dropoff_location,'')),'');
 v_return_location:=nullif(trim(coalesce(p_return_location,'')),'');
 if p_service_type='PICKUP' then
  if v_pickup is null or char_length(v_pickup)>200 then raise exception'INVALID_PICKUP_LOCATION';end if;
  v_dropoff:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
 elsif p_service_type='DROPOFF' then
  if v_dropoff is null or char_length(v_dropoff)>200 then raise exception'INVALID_DROPOFF_LOCATION';end if;
  v_pickup:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
 else
  if v_pickup is null or char_length(v_pickup)>200 then raise exception'INVALID_PICKUP_LOCATION';end if;
  if v_return_location is null or char_length(v_return_location)>200 then raise exception'INVALID_RETURN_LOCATION';end if;
  if p_return_date is null or p_return_time is null or p_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception'INVALID_RETURN_SCHEDULE';end if;
  v_dropoff:=hotel_label;v_return_date:=p_return_date;v_return_time:=p_return_time;
  if v_return_date<p_pickup_date or (v_return_date=p_pickup_date and v_return_time<=p_pickup_time) then raise exception'INVALID_RETURN_SCHEDULE';end if;
 end if;
 if r.status not in('confirmed','checked_in') then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 today:=hotel_today(coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot()));
 if p_pickup_date<greatest(today,r.check_in) then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if p_pickup_date>r.check_out or v_return_date>r.check_out then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if exists(select 1 from transportation_requests where reservation_id=r.id and service_type=p_service_type and pickup_date=p_pickup_date and pickup_location=v_pickup and status in('REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS'))then raise exception'TRANSPORTATION_REQUEST_DUPLICATE';end if;
 insert into transportation_requests(reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,idempotency_key,request_fingerprint)
 values(r.id,p_user_id,p_service_type,v_pickup,v_dropoff,p_pickup_date,p_pickup_time,v_return_location,v_return_date,v_return_time,p_passenger_count,nullif(trim(coalesce(p_special_instructions,'')),''),'REQUESTED',p_idempotency_key,fingerprint)
 returning id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor,case when actor='front_desk' then 'front_desk_submit_transportation_request' else 'customer_submit_transportation_request' end,'transportation_request',rid::text,jsonb_build_object('reservationId',r.id,'serviceType',p_service_type,'pickupDate',p_pickup_date,'pickupTime',p_pickup_time,'passengerCount',p_passenger_count));
 return jsonb_build_object('id',rid,'status','REQUESTED');end$$;

create or replace function public.customer_submit_transportation_request(
 p_user_id uuid,p_reservation_id text,p_service_type text,p_pickup_location text,p_dropoff_location text,
 p_pickup_date date,p_pickup_time text,p_return_location text,p_return_date date,p_return_time text,
 p_passenger_count integer,p_special_instructions text,p_idempotency_key uuid)
returns jsonb language sql security definer set search_path=public as $$
 select public.create_stay_transportation_request(p_user_id,p_reservation_id,p_service_type,p_pickup_location,p_dropoff_location,
  p_pickup_date,p_pickup_time,p_return_location,p_return_date,p_return_time,p_passenger_count,p_special_instructions,p_idempotency_key,p_user_id,null)
$$;

create function public.submit_fleet_transportation_request(p_actor uuid,p_reservation_id text,p_ride jsonb,p_profile jsonb,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare guest_id uuid; result jsonb;
begin
 if p_profile->'sharingEnabled' is distinct from 'true'::jsonb then raise exception 'FLEET_PICKUP_CONSENT_REQUIRED'; end if;
 select r.user_id into guest_id from reservations r join user_accounts u on u.id=r.user_id
 where r.id=p_reservation_id and u.role='guest' and u.active and u.account_status='active';
 if guest_id is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
 result:=public.create_stay_transportation_request(guest_id,p_reservation_id,p_ride->>'serviceType',p_ride->>'pickupLocation',
  p_ride->>'dropoffLocation',(p_ride->>'pickupDate')::date,p_ride->>'pickupTime',p_ride->>'returnLocation',
  (p_ride->>'returnDate')::date,p_ride->>'returnTime',(p_ride->>'passengerCount')::int,p_ride->>'specialInstructions',
  p_idempotency_key,p_actor,p_profile);
 perform public.queue_guest_fleet_transport(p_actor,(result->>'id')::uuid,p_profile);
 return result;
end;
$$;

create or replace function public.claim_fleet_transport(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o fleet_transport_outbox%rowtype; t transportation_requests%rowtype; l fleet_transport_links%rowtype;
begin
 select tr.* into t from transportation_requests tr join fleet_transport_links fl on fl.request_id=tr.id join fleet_transport_outbox ob on ob.link_id=fl.id where ob.id=p_id for update of tr;
 select * into o from fleet_transport_outbox where id=p_id for update;
 if not found then return null; end if;
 if o.state not in('PREPARED','FAILED','SENDING') or (o.state='SENDING' and o.lease_until>now()) or o.next_attempt_at>now() or o.attempts>=8 then return null; end if;
 select * into l from fleet_transport_links where id=o.link_id;
 if t.version<>o.request_version or (t.status not in('REVIEWED','SCHEDULED') and not (o.auto_dispatch and t.status='REQUESTED'))
  or not exists(select 1 from reservations r where r.id=t.reservation_id and r.status in('confirmed','checked_in') and t.pickup_date between r.check_in and r.check_out and (t.return_date is null or t.return_date between r.check_in and r.check_out))
  or (o.auto_dispatch and (
    (case when l.leg='RETURN' then t.return_date+t.return_time::time else t.pickup_date+t.pickup_time::time end)
      at time zone 'Asia/Manila')<=now())
  or not exists(select 1 from transport_pickup_profiles where request_id=t.id and sharing_enabled and version=o.profile_version) then
  update fleet_transport_outbox set state='NEEDS_REVIEW',last_error='LOCAL_DETAILS_CHANGED' where id=o.id; return null;
 end if;
 update fleet_transport_outbox set state='SENDING',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '30 seconds' where id=o.id;
 return jsonb_build_object('id',o.id,'payload',o.payload,'attempt',o.attempts+1);
end $$;

create or replace function public.trigger_file_booking_transportation() returns trigger
language plpgsql security definer set search_path=public as $$
declare ride_id uuid; profile jsonb;
begin
 if lower(coalesce(new.source,''))='website' and new.status='confirmed'
  and (old is null or old.status is distinct from 'confirmed') then
  begin
   ride_id:=public.file_booking_transportation_request(new.id);
   if ride_id is not null and new.transportation_preferences #> '{fleetOptions,sharingEnabled}' = 'true'::jsonb then
    profile:=jsonb_build_object('travelerName',new.guest_name,'phone',new.transportation_preferences #>> '{fleetOptions,contactPhone}','sharingEnabled',true,
      'ridePreferences',coalesce(new.transportation_preferences #> '{fleetOptions,ridePreferences}','[]'::jsonb));
    perform public.queue_guest_fleet_transport(new.user_id,ride_id,profile);
   end if;
  exception when others then
   raise warning 'Transportation filing for reservation % failed (%).',new.id,sqlstate;
  end;
 end if;
 return new;
end;
$$;

-- PostgreSQL runs triggers of the same kind in name order. Let
-- fleet_stay_changed invalidate previous snapshots before filing this one.
alter trigger file_booking_transportation_on_confirm on public.reservations
 rename to queue_booking_transportation_on_confirm;

revoke all on function public.guard_automatic_fleet_status(),
 public.write_fleet_transport_outbox(uuid,uuid,integer,boolean),
 public.queue_guest_fleet_transport(uuid,uuid,jsonb),
 public.create_stay_transportation_request(uuid,text,text,text,text,date,text,text,date,text,integer,text,uuid,uuid,jsonb),
 public.submit_fleet_transportation_request(uuid,text,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.submit_fleet_transportation_request(uuid,text,jsonb,jsonb,uuid) to service_role;

commit;
