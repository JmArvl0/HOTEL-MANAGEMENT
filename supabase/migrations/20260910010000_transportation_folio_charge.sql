-- Transportation fares on the guest folio. A separately-requested ride (Account ->
-- Transportation, or the checkout ride request) is an operational request with no price
-- until Front Desk commits a vehicle: the moment a trip is ASSIGNED, the vehicle type's
-- flat fare (base_fare + booking_fee, x2 legs for ROUND_TRIP) is posted to the guest's
-- invoice as a 'transportation' folio charge. The guest then settles it with the
-- remaining balance (customer "Settle remaining balance" or Front Desk payment) -- no
-- separate deposit; the reservation deposit only ever covered the historical
-- transport_lines sold at checkout.
--
-- Governance: the charge originates with Front Desk at ASSIGN; reversal stays with
-- Accounting's existing charge-reverse/adjustment flows (the same person must not both
-- originate and cancel a folio entry). Customer self-cancel exists only at
-- REQUESTED/REVIEWED -- before any charge exists -- so no customer refund path is needed.
--
-- Double-charge is impossible: the version-locked state machine allows a single
-- SCHEDULED -> ASSIGNED transition, and the deterministic folio idempotency key
-- (md5(request id || '|transport-fare')) is a replay backstop.

alter table public.transportation_requests add column if not exists fare_amount numeric(12,2);
alter table public.transportation_requests add column if not exists fare_posted_at timestamptz;

-- Recreated from the LIVE body (verified identical to 20260905010000 before editing).
-- Only the ASSIGN path changes: vehicle type becomes required, the fare is computed from
-- it, and the charge + fare_amount are written. Signature unchanged, so grants survive;
-- revoke/grant repeated below for uniform hygiene.
create or replace function public.staff_transition_transportation_request(p_request_id uuid,p_action text,p_details jsonb,p_staff_user_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t transportation_requests%rowtype;new_status text;allowed_from text[];
 v_driver text;v_vehicle uuid;v_date date;v_time text;v_notes text;v_visible text;v_reason text;audit_action text;
 v_vt transport_vehicle_types%rowtype;v_res reservations%rowtype;v_inv invoices%rowtype;v_fare numeric(12,2);v_fare_key uuid;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','manager') then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED';end if;
 if p_action in('REVIEW','SCHEDULE','ASSIGN','START','COMPLETE') and actor<>'front_desk' then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED';end if;
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
  if v_driver is null or char_length(v_driver)>120 then raise exception'INVALID_DRIVER_ASSIGNMENT';end if;
  if v_vehicle is null then raise exception'INVALID_VEHICLE_TYPE';end if;
  select * into v_vt from transport_vehicle_types where id=v_vehicle and active;if not found then raise exception'INVALID_VEHICLE_TYPE';end if;
 end if;
 if p_action='SCHEDULE' and v_date is not null and (v_time is null or v_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if p_action='ASSIGN' then
  v_fare:=round((v_vt.base_fare+v_vt.booking_fee)*(case t.service_type when'ROUND_TRIP'then 2 else 1 end),2);
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
 if p_action='ASSIGN' then
  v_fare_key:=md5(t.id||'|transport-fare')::uuid;
  select * into v_res from reservations where id=t.reservation_id for update;
  if v_res.status not in('confirmed','checked_in')then raise exception'TRANSPORTATION_RESERVATION_NOT_READY';end if;
  select * into v_inv from invoices where reservation_id=v_res.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
  if not exists(select 1 from folio_charges where idempotency_key=v_fare_key)then
   insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key)
   values(v_inv.id,v_res.id,(case t.service_type when'PICKUP'then'Pickup'when'DROPOFF'then'Drop-off'else'Round trip'end)||' - '||v_vt.name,'transportation',v_fare,p_staff_user_id,v_fare_key);
   update invoices set amount=amount+v_fare,balance=balance+v_fare,status=case when paid>0 then'partial'else'unpaid'end where id=v_inv.id;
   update reservations set payment_status=case when deposit>0 then'partial'else'unpaid'end where id=v_res.id;
  end if;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,audit_action,'transportation_request',t.id::text,
  jsonb_build_object('status',t.status,'version',t.version,'driverName',t.driver_name,'vehicleTypeId',t.vehicle_type_id,'pickupDate',t.pickup_date,'pickupTime',t.pickup_time),
  jsonb_build_object('status',new_status,'version',t.version+1,'reason',v_reason,'customerVisibleNotes',v_visible,'fareAmount',v_fare));
 return jsonb_build_object('id',t.id,'status',new_status,'version',t.version+1,'fareAmount',v_fare);end$$;

-- Only the service role may call the recreated function (unchanged signature keeps its
-- grants, but repeat the revoke/grant for uniform hygiene).
revoke all on function public.staff_transition_transportation_request(uuid,text,jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.staff_transition_transportation_request(uuid,text,jsonb,uuid,integer) to service_role;
