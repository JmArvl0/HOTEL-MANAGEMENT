-- Transportation is priced after booking. Hotel-operated trips use the assigned
-- vehicle's rate; Fleet-operated trips require explicit review of all saved leg fares.
begin;

create function public.transportation_sent_to_fleet(p_request uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from fleet_transport_links l
  join fleet_transport_outbox o on o.link_id=l.id
  where l.request_id=p_request and o.attempts>0
 );
$$;

-- Called with the reservation and request locked. Reuse the original deterministic
-- charge key and the accounting recomputation, including existing folio credits.
create function public.post_transportation_folio_fare(
 p_trip public.transportation_requests,p_amount numeric,p_label text,p_actor uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 invoice_id text;
 charge_id uuid;
 charge_key uuid:=md5(p_trip.id||'|transport-fare')::uuid;
begin
 select id into invoice_id from invoices where reservation_id=p_trip.reservation_id for update;
 if not found then raise exception 'FOLIO_NOT_FOUND'; end if;
 if p_amount<0 or p_amount>9999999999.99 then raise exception 'INVALID_TRANSPORTATION_FARE'; end if;
 if p_amount=0 then return null; end if;
 insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)
 values(invoice_id,p_trip.reservation_id,
  (case p_trip.service_type when 'PICKUP' then 'Pickup' when 'DROPOFF' then 'Drop-off' else 'Round trip' end)||' - '||p_label,
  'transportation',p_amount,p_actor,charge_key,'transportation',p_trip.id::text)
 on conflict(idempotency_key) where idempotency_key is not null do nothing returning id into charge_id;
 if found then
  update invoices set amount=amount+p_amount where id=invoice_id;
  perform sync_invoice_financials(invoice_id);
 else
  select id into charge_id from folio_charges where idempotency_key=charge_key;
 end if;
 return charge_id;
end;
$$;

create or replace function public.staff_transition_transportation_request(p_request_id uuid,p_action text,p_details jsonb,p_staff_user_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t transportation_requests%rowtype;new_status text;allowed_from text[];
 v_driver text;v_vehicle uuid;v_date date;v_time text;v_notes text;v_visible text;v_reason text;audit_action text;
 v_vt transport_vehicle_types%rowtype;v_res reservations%rowtype;v_fare numeric(12,2);
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','manager') then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED';end if;
 if p_action in('REVIEW','SCHEDULE','ASSIGN','START','COMPLETE') and actor<>'front_desk' then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED';end if;
 -- Keep the shared reservation → request → invoice lock order for assignment.
 if p_action='ASSIGN' then
  select r.* into v_res from reservations r join transportation_requests tr on tr.reservation_id=r.id
   where tr.id=p_request_id for update of r;
  if not found then raise exception 'TRANSPORTATION_REQUEST_NOT_FOUND'; end if;
  if v_res.status not in('confirmed','checked_in') then raise exception 'TRANSPORTATION_RESERVATION_NOT_READY'; end if;
 end if;
 select * into t from transportation_requests where id=p_request_id for update;
 if not found then raise exception'TRANSPORTATION_REQUEST_NOT_FOUND';end if;
 if t.version<>p_expected_version then raise exception'TRANSPORTATION_REQUEST_STALE';end if;
 v_driver:=nullif(trim(coalesce(p_details->>'driverName','')),'');
 v_vehicle:=nullif(p_details->>'vehicleTypeId','');
 v_date:=nullif(p_details->>'pickupDate','');
 v_time:=nullif(p_details->>'pickupTime','');
 v_notes:=nullif(trim(coalesce(p_details->>'staffNotes','')),'');
 v_visible:=nullif(trim(coalesce(p_details->>'customerVisibleNotes','')),'');
 v_reason:=nullif(trim(coalesce(p_details->>'reason','')),'');
 case p_action
  when'REVIEW'then allowed_from:=array['REQUESTED'];new_status:='REVIEWED';audit_action:='transportation_review';
  when'SCHEDULE'then allowed_from:=array['REVIEWED'];new_status:='SCHEDULED';audit_action:='transportation_schedule';
  when'ASSIGN'then allowed_from:=array['SCHEDULED'];new_status:='ASSIGNED';audit_action:='transportation_assign';
  when'START'then allowed_from:=array['ASSIGNED'];new_status:='IN_PROGRESS';audit_action:='transportation_start';
  when'COMPLETE'then allowed_from:=array['IN_PROGRESS'];new_status:='COMPLETED';audit_action:='transportation_complete';
  when'CANCEL'then allowed_from:=array['REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS'];new_status:='CANCELLED';audit_action:='transportation_cancel';
  when'REJECT'then allowed_from:=array['REQUESTED','REVIEWED'];new_status:='REJECTED';audit_action:='transportation_reject';
  else raise exception'TRANSPORTATION_TRANSITION_INVALID';end case;
 if not(t.status=any(allowed_from)) then raise exception'TRANSPORTATION_TRANSITION_INVALID';end if;
 if p_action in('CANCEL','REJECT') and v_reason is null then raise exception'TRANSPORTATION_REASON_REQUIRED';end if;
 if p_action='ASSIGN' then
  if public.transportation_sent_to_fleet(t.id) then raise exception 'TRANSPORTATION_USE_FLEET'; end if;
  if v_driver is null or char_length(v_driver) not between 2 and 120 then raise exception'INVALID_DRIVER_ASSIGNMENT';end if;
  if v_vehicle is null then raise exception'INVALID_VEHICLE_TYPE';end if;
  select * into v_vt from transport_vehicle_types where id=v_vehicle and active;if not found or v_vt.seats<t.passenger_count then raise exception'INVALID_VEHICLE_TYPE';end if;
 end if;
 if p_action='SCHEDULE' and v_date is not null and (v_time is null or v_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if p_action='ASSIGN' then
  v_fare:=round((v_vt.base_fare+v_vt.booking_fee)*(case t.service_type when'ROUND_TRIP'then 2 else 1 end),2);
  if p_details ? 'expectedFareMinor' and (p_details->>'expectedFareMinor')::numeric is distinct from v_fare*100 then
   raise exception 'TRANSPORTATION_FARE_CHANGED';
  end if;
  perform public.post_transportation_folio_fare(t,v_fare,v_vt.name,p_staff_user_id);
 end if;
 update transportation_requests set
  status=new_status,
  driver_name=case when p_action='ASSIGN' then v_driver else coalesce(v_driver,t.driver_name) end,
  vehicle_type_id=case when p_action='ASSIGN' then v_vehicle else coalesce(v_vehicle,t.vehicle_type_id) end,
  pickup_date=case when p_action='SCHEDULE' and v_date is not null then v_date else t.pickup_date end,
  pickup_time=case when p_action='SCHEDULE' and v_time is not null then v_time else t.pickup_time end,
  staff_notes=case when v_notes is not null then v_notes else t.staff_notes end,
  customer_visible_notes=case when v_visible is not null then v_visible else t.customer_visible_notes end,
  cancellation_reason=case when p_action in('CANCEL','REJECT') then v_reason else t.cancellation_reason end,
  reviewed_at=case when p_action='REVIEW' then now() else t.reviewed_at end,
  scheduled_at=case when p_action='SCHEDULE' then now() else t.scheduled_at end,
  assigned_at=case when p_action='ASSIGN' then now() else t.assigned_at end,
  started_at=case when p_action='START' then now() else t.started_at end,
  completed_at=case when p_action='COMPLETE' then now() else t.completed_at end,
  cancelled_at=case when p_action='CANCEL' then now() else t.cancelled_at end,
  fare_amount=case when p_action='ASSIGN' then v_fare else t.fare_amount end,
  fare_posted_at=case when p_action='ASSIGN' then now() else t.fare_posted_at end,
  version=t.version+1,updated_at=now()
 where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,audit_action,'transportation_request',t.id::text,
  jsonb_build_object('status',t.status,'version',t.version,'driverName',t.driver_name,'vehicleTypeId',t.vehicle_type_id,'pickupDate',t.pickup_date,'pickupTime',t.pickup_time),
  jsonb_build_object('status',new_status,'version',t.version+1,'reason',v_reason,'customerVisibleNotes',v_visible,'fareAmount',v_fare));
 return jsonb_build_object('id',t.id,'status',new_status,'version',t.version+1,'fareAmount',v_fare);end$$;

-- Only the latest applied authenticated HAVEN snapshot for each required leg
-- counts. The revision token protects the amount displayed at confirmation time.
create function public.get_transportation_fleet_fare(p_request uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 with leg_fares as (
  select l.leg, evidence.fare
  from fleet_transport_links l
  cross join lateral (
   select i.payload#>'{wire_snapshot,fare}' as fare
   from fleet_transport_inbox i
   where i.link_id=l.id and i.outcome='APPLIED'
    and (i.payload->>'request_version')::bigint=l.partner_version
   order by i.received_at desc,i.event_id
   limit 1
  ) evidence
  where l.request_id=p_request and not l.needs_review
   and l.partner_status in('SCHEDULED','ASSIGNED','IN_TRANSIT','COMPLETED')
   and evidence.fare->>'currency'='PHP' and evidence.fare->>'fare_revision_id' is not null
 ), quote as (
  select count(*) as legs,bool_or(leg='OUTBOUND') as outbound,
   sum((fare->>'fare_amount_minor')::numeric) as minor,
   md5(jsonb_agg(jsonb_build_array(leg,fare->>'fare_revision_id',fare->>'fare_amount_minor') order by leg)::text) as revision
  from leg_fares
 )
 select jsonb_build_object('postedAmount',t.fare_amount,
  'quote',case when q.outbound and q.legs=(case t.service_type when 'ROUND_TRIP' then 2 else 1 end)
   and q.minor between 0 and 999999999999
   then jsonb_build_object('amountMinor',q.minor,'revision',q.revision) end,
  'canPost',t.status not in('CANCELLED','REJECTED') and r.status in('confirmed','checked_in') and t.fare_posted_at is null)
 from transportation_requests t join reservations r on r.id=t.reservation_id cross join quote q
 where t.id=p_request;
$$;

create function public.post_confirmed_fleet_fare(p_request uuid,p_actor uuid,p_revision text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 stay reservations%rowtype;
 trip transportation_requests%rowtype;
 pricing jsonb;
 fare numeric(12,2);
 charge_id uuid;
begin
 if not exists(select 1 from user_accounts where id=p_actor and role='front_desk' and active and account_status='active') then
  raise exception 'TRANSPORTATION_AUTHORITY_REQUIRED';
 end if;
 select r.* into stay from reservations r join transportation_requests t on t.reservation_id=r.id
  where t.id=p_request for update of r;
 if not found then raise exception 'TRANSPORTATION_REQUEST_NOT_FOUND'; end if;
 select * into trip from transportation_requests where id=p_request for update;
 if trip.fare_posted_at is not null then
  return jsonb_build_object('fareAmount',trip.fare_amount,'alreadyConfirmed',true);
 end if;
 if stay.status not in('confirmed','checked_in') or trip.status in('CANCELLED','REJECTED') then
  raise exception 'TRANSPORTATION_RESERVATION_NOT_READY';
 end if;
 perform id from fleet_transport_links where request_id=p_request order by leg for update;
 pricing:=public.get_transportation_fleet_fare(p_request);
 if pricing#>>'{quote,revision}' is null or pricing#>>'{quote,revision}' is distinct from p_revision then
  raise exception 'TRANSPORTATION_FARE_CHANGED';
 end if;
 fare:=(pricing#>>'{quote,amountMinor}')::numeric/100;
 charge_id:=public.post_transportation_folio_fare(trip,fare,'Fleet transportation',p_actor);
 update transportation_requests set fare_amount=fare,fare_posted_at=now(),updated_at=now() where id=trip.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'confirm_fleet_transportation_fare','transportation_request',trip.id::text,
  jsonb_build_object('fareAmount',fare,'fareRevision',p_revision,'folioChargeId',charge_id));
 return jsonb_build_object('fareAmount',fare,'alreadyConfirmed',false);
end;
$$;

-- A billing-only change must leave accepted dispatch and tracking intact.
create or replace function public.fleet_invalidate_preparation() returns trigger
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if tg_table_name='transportation_requests' then
  if (to_jsonb(old)-array['fare_amount','fare_posted_at','updated_at']) =
     (to_jsonb(new)-array['fare_amount','fare_posted_at','updated_at']) then return new; end if;
  rid:=new.id;
 else
  rid:=new.request_id;
 end if;
 update fleet_transport_outbox o set state='NEEDS_REVIEW',last_error='LOCAL_DETAILS_CHANGED'
 from fleet_transport_links l where o.link_id=l.id and l.request_id=rid and o.state<>'NEEDS_REVIEW';
 update fleet_transport_links set needs_review=true,assignment_active=false,updated_at=now() where request_id=rid;
 return new;
end;
$$;

create or replace function public.customer_cancel_transportation_request(p_user_id uuid,p_request_id uuid,p_reason text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t transportation_requests%rowtype;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select tr.* into t from transportation_requests tr join reservations r on r.id=tr.reservation_id where tr.id=p_request_id and r.user_id=p_user_id for update of tr;
 if not found then raise exception'TRANSPORTATION_REQUEST_NOT_FOUND';end if;
 if t.status not in('REQUESTED','REVIEWED') or public.transportation_sent_to_fleet(t.id) then raise exception'CANCELLATION_NOT_PERMITTED';end if;
 if t.version<>p_expected_version then raise exception'TRANSPORTATION_REQUEST_STALE';end if;
 update transportation_requests set status='CANCELLED',cancelled_at=now(),cancellation_reason=nullif(trim(coalesce(p_reason,'')),'Customer cancelled the transportation request.'),version=t.version+1,updated_at=now() where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_cancel_transportation_request','transportation_request',t.id::text,jsonb_build_object('status',t.status,'version',t.version),jsonb_build_object('status','CANCELLED','version',t.version+1));
 return jsonb_build_object('id',t.id,'status','CANCELLED');end$$;

-- Close uncommitted local requests with the stay. Dispatched and later-stage
-- rides keep their history and existing Front Desk coordination path.
create function public.cancel_uncommitted_reservation_transportation() returns trigger
language plpgsql security definer set search_path=public as $$
declare trip transportation_requests%rowtype;
begin
 for trip in select * from transportation_requests where reservation_id=new.id
   and status in('REQUESTED','REVIEWED') and fare_posted_at is null order by id for update
 loop
  if public.transportation_sent_to_fleet(trip.id) then continue; end if;
  update transportation_requests set status='CANCELLED',cancelled_at=now(),
   cancellation_reason='The linked hotel reservation was cancelled.',version=version+1,updated_at=now()
  where id=trip.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(null,'cancel_transportation_with_reservation','transportation_request',trip.id::text,
   jsonb_build_object('status',trip.status),jsonb_build_object('status','CANCELLED','reservationId',new.id));
 end loop;
 return new;
end;
$$;

create trigger cancel_uncommitted_reservation_transportation
after update of status on public.reservations for each row
when (new.status='cancelled' and old.status is distinct from new.status)
execute function public.cancel_uncommitted_reservation_transportation();

create function public.validate_transportation_route() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and
  (old.service_type,old.pickup_location,old.dropoff_location,old.pickup_date,old.pickup_time,old.return_location,old.return_date,old.return_time)
  is not distinct from
  (new.service_type,new.pickup_location,new.dropoff_location,new.pickup_date,new.pickup_time,new.return_location,new.return_date,new.return_time)
 then return new; end if;
 if lower(trim(new.pickup_location))=lower(trim(new.dropoff_location))
  or (new.service_type='ROUND_TRIP' and lower(trim(new.return_location))=lower(trim(new.dropoff_location))) then
  raise exception 'INVALID_TRANSPORTATION_SAME_LOCATION';
 end if;
 if new.service_type='ROUND_TRIP' and (new.return_date,new.return_time)<=(new.pickup_date,new.pickup_time) then
  raise exception 'INVALID_RETURN_SCHEDULE';
 end if;
 return new;
end;
$$;

create trigger validate_transportation_route
before insert or update of service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time
on public.transportation_requests for each row execute function public.validate_transportation_route();

-- Even a secondary audit-write failure must not unwind a verified stay.
create or replace function public.trigger_file_booking_transportation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(new.source,''))='website' and new.status='confirmed'
  and (old is null or old.status is distinct from 'confirmed') then
  begin
   perform public.file_booking_transportation_request(new.id);
  exception when others then
   raise warning 'Transportation filing for reservation % failed (%).',new.id,sqlstate;
  end;
 end if;
 return new;
end;
$$;

revoke all on function public.transportation_sent_to_fleet(uuid),
 public.post_transportation_folio_fare(public.transportation_requests,numeric,text,uuid),
 public.get_transportation_fleet_fare(uuid),public.post_confirmed_fleet_fare(uuid,uuid,text),
 public.cancel_uncommitted_reservation_transportation(),public.validate_transportation_route()
 from public,anon,authenticated;
grant execute on function public.get_transportation_fleet_fare(uuid),public.post_confirmed_fleet_fare(uuid,uuid,text)
 to service_role;
commit;
