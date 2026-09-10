-- Standalone Transportation Service (DB): customer-filed, Front Desk operated transport
-- requests for an existing reservation. NO TomTom, NO external fleet API, NO GPS --
-- locations are plain validated text. The transport_vehicle_types catalogue (formerly the
-- TomTom fare model) is reused read-only as the vehicle-type pick list for assignment;
-- its fare columns are simply ignored by this workflow.
--
-- Design:
--  * transportation_requests is one row per trip request with its own state machine
--    (REQUESTED -> REVIEWED -> SCHEDULED -> ASSIGNED -> IN_PROGRESS -> COMPLETED, plus
--    CANCELLED / REJECTED terminal states). Rows are never deleted -- cancellation keeps
--    history (house rules).
--  * Ownership is enforced server-side only: every customer RPC re-checks
--    reservation.user_id = p_user_id; the app server is the sole reader/writer
--    (RLS on, no grants, service-role only).
--  * Duplicate prevention: a partial unique index blocks a second ACTIVE request with the
--    same reservation + service type + date + pickup location (double-click / retry), and
--    the idempotency_key unique constraint makes a retried submit a no-op.
--  * Concurrency: version column + p_expected_version (optimistic) and `for update` row
--    locks, so two staff members cannot unknowingly assign different drivers to the same
--    request.
--  * Nullable pickup/dropoff latitude/longitude columns exist purely so a future TomTom /
--    fleet migration can add coordinates additively. This version never populates or
--    reads them.
--  * Audit: every RPC writes audit_logs rows directly (actor, action, resource, metadata).

create table if not exists public.transportation_requests(
 id uuid primary key default gen_random_uuid(),
 reservation_id text not null references public.reservations(id) on delete restrict,
 user_id uuid not null references public.user_accounts(id) on delete restrict,
 service_type text not null check(service_type in('PICKUP','DROPOFF','ROUND_TRIP')),
 pickup_location text not null check(char_length(pickup_location) between 5 and 200),
 dropoff_location text not null check(char_length(dropoff_location) between 2 and 200),
 pickup_date date not null,
 pickup_time text not null check(pickup_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 return_location text check(return_location is null or char_length(return_location) between 5 and 200),
 return_date date,
 return_time text check(return_time is null or return_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 passenger_count integer not null check(passenger_count between 1 and 20),
 special_instructions text check(char_length(coalesce(special_instructions,''))<=500),
 status text not null default 'REQUESTED' check(status in('REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED','REJECTED')),
 driver_name text check(driver_name is null or char_length(driver_name) between 2 and 120),
 vehicle_type_id uuid references public.transport_vehicle_types(id),
 staff_notes text,
 customer_visible_notes text,
 cancellation_reason text,
 reviewed_at timestamptz, scheduled_at timestamptz, assigned_at timestamptz,
 started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
 version integer not null default 1,
 idempotency_key uuid not null unique,
 -- Future TomTom/fleet readiness only: never populated or exposed in this version.
 pickup_latitude numeric(9,6), pickup_longitude numeric(9,6),
 dropoff_latitude numeric(9,6), dropoff_longitude numeric(9,6),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(service_type<>'ROUND_TRIP' or (return_location is not null and return_date is not null and return_time is not null)));

create index if not exists transportation_requests_status_idx on public.transportation_requests(status);
create index if not exists transportation_requests_pickup_date_idx on public.transportation_requests(pickup_date);
create index if not exists transportation_requests_reservation_idx on public.transportation_requests(reservation_id);
-- Duplicate prevention: one ACTIVE request per reservation + service type + date + pickup location.
create unique index if not exists transportation_requests_active_unique
 on public.transportation_requests(reservation_id,service_type,pickup_date,pickup_location)
 where status in('REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS');

alter table public.transportation_requests enable row level security;
revoke all on table public.transportation_requests from public,anon,authenticated;

-- Customer submit. Guest role, reservation ownership and reservation eligibility are all
-- re-checked server-side; the hotel side of the route is filled from the single-row
-- hotel_operational_policies label (never hardcoded in the app). Idempotent by key.
create or replace function public.customer_submit_transportation_request(
 p_user_id uuid,p_reservation_id text,p_service_type text,
 p_pickup_location text,p_dropoff_location text,p_pickup_date date,p_pickup_time text,
 p_return_location text,p_return_date date,p_return_time text,
 p_passenger_count integer,p_special_instructions text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;hotel_label text;existing transportation_requests%rowtype;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;today date;rid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_idempotency_key is null then raise exception'INVALID_TRANSPORTATION_REQUEST';end if;
 select * into existing from transportation_requests where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('id',existing.id,'status',existing.status);end if;
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
  if v_return_date<p_pickup_date then raise exception'INVALID_RETURN_SCHEDULE';end if;
 end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;
 if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in') then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 today:=hotel_today(coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot()));
 if p_pickup_date<today then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if p_pickup_date>r.check_out then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if exists(select 1 from transportation_requests where reservation_id=r.id and service_type=p_service_type and pickup_date=p_pickup_date and pickup_location=v_pickup and status in('REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS'))then raise exception'TRANSPORTATION_REQUEST_DUPLICATE';end if;
 insert into transportation_requests(reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,idempotency_key)
 values(r.id,p_user_id,p_service_type,v_pickup,v_dropoff,p_pickup_date,p_pickup_time,v_return_location,v_return_date,v_return_time,p_passenger_count,nullif(trim(coalesce(p_special_instructions,'')),''),'REQUESTED',p_idempotency_key)
 returning id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_transportation_request','transportation_request',rid::text,jsonb_build_object('reservationId',r.id,'serviceType',p_service_type,'pickupDate',p_pickup_date,'pickupTime',p_pickup_time,'passengerCount',p_passenger_count));
 return jsonb_build_object('id',rid,'status','REQUESTED');end$$;

-- Customer cancel: only before the hotel commits resources (REQUESTED/REVIEWED). Once
-- SCHEDULED, staff must handle it. Never deletes; keeps the row as history.
create or replace function public.customer_cancel_transportation_request(p_user_id uuid,p_request_id uuid,p_reason text,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t transportation_requests%rowtype;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select tr.* into t from transportation_requests tr join reservations r on r.id=tr.reservation_id where tr.id=p_request_id and r.user_id=p_user_id for update of tr;
 if not found then raise exception'TRANSPORTATION_REQUEST_NOT_FOUND';end if;
 if t.status not in('REQUESTED','REVIEWED') then raise exception'CANCELLATION_NOT_PERMITTED';end if;
 if t.version<>p_expected_version then raise exception'TRANSPORTATION_REQUEST_STALE';end if;
 update transportation_requests set status='CANCELLED',cancelled_at=now(),cancellation_reason=nullif(trim(coalesce(p_reason,'')),'Customer cancelled the transportation request.'),version=t.version+1,updated_at=now() where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_cancel_transportation_request','transportation_request',t.id::text,jsonb_build_object('status',t.status,'version',t.version),jsonb_build_object('status','CANCELLED','version',t.version+1));
 return jsonb_build_object('id',t.id,'status','CANCELLED');end$$;

-- Staff state machine. Front Desk executes the operational path (REVIEW/SCHEDULE/ASSIGN/
-- START/COMPLETE); Manager may only CANCEL or REJECT (supervisory exception handling) --
-- matching HAVEN's "Manager supervises and authorizes, departments execute" split.
-- Transitions are validated here server-side; the app's TS map is display-only.
create or replace function public.staff_transition_transportation_request(p_request_id uuid,p_action text,p_details jsonb,p_staff_user_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t transportation_requests%rowtype;new_status text;allowed_from text[];
 v_driver text;v_vehicle uuid;v_date date;v_time text;v_notes text;v_visible text;v_reason text;audit_action text;begin
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
  if v_vehicle is not null and not exists(select 1 from transport_vehicle_types where id=v_vehicle and active)then raise exception'INVALID_VEHICLE_TYPE';end if;
 end if;
 if p_action='SCHEDULE' and v_date is not null and (v_time is null or v_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
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
  version=t.version+1,updated_at=now()
 where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,audit_action,'transportation_request',t.id::text,
  jsonb_build_object('status',t.status,'version',t.version,'driverName',t.driver_name,'vehicleTypeId',t.vehicle_type_id,'pickupDate',t.pickup_date,'pickupTime',t.pickup_time),
  jsonb_build_object('status',new_status,'version',t.version+1,'reason',v_reason,'customerVisibleNotes',v_visible));
 return jsonb_build_object('id',t.id,'status',new_status,'version',t.version+1);end$$;

-- Only the service role may call the new SECURITY DEFINER functions.
revoke all on function public.customer_submit_transportation_request(uuid,text,text,text,text,date,text,text,date,text,integer,text,uuid),public.customer_cancel_transportation_request(uuid,uuid,text,integer),public.staff_transition_transportation_request(uuid,text,jsonb,uuid,integer) from public,anon,authenticated;
grant execute on function public.customer_submit_transportation_request(uuid,text,text,text,text,date,text,text,date,text,integer,text,uuid),public.customer_cancel_transportation_request(uuid,uuid,text,integer),public.staff_transition_transportation_request(uuid,text,jsonb,uuid,integer) to service_role;
