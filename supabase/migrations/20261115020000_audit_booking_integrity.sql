begin;

alter table public.reservation_change_requests add column request_fingerprint text;
alter table public.transportation_requests add column request_fingerprint text;
alter table public.guest_requests add column request_fingerprint text;

create or replace function public.room_nightly_rates(p_room_type text, p_from date, p_to date)
returns table(night date, rate numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_from is null or p_to is null or p_to-p_from not between 1 and 365 then raise exception 'INVALID_STAY_RANGE'; end if;
  return query select d.night::date,
         coalesce(
           (select p.nightly_rate
              from public.room_rate_plans p
             where p.room_type_id = t.id
               and p.status = 'active'
               and p.start_date <= d.night
               and p.end_date >= d.night
               and (p.days_of_week & (1 << ((extract(isodow from d.night)::int) - 1))) <> 0
             order by (p.end_date - p.start_date) asc, p.decided_at desc nulls last, p.id desc
             limit 1),
           t.base_rate) as rate
    from public.room_types t,
         generate_series(p_from::timestamp, case when p_to-p_from between 1 and 365 then p_to::timestamp - interval '1 day' end, interval '1 day') as d(night)
   where t.name = p_room_type
     and t.active
     and p_from is not null and p_to is not null and p_to > p_from;
end $$;

create or replace function public.create_booking_hold(
  p_user_id uuid, p_room_type text, p_check_in date, p_check_out date, p_guest_count integer,
  p_first_name text, p_last_name text, p_email text, p_mobile text,
  p_address text default null, p_nationality text default null,
  p_expected_arrival text default null, p_special_requests text default null,
  p_request_options jsonb default '[]'::jsonb, p_transport_lines jsonb default '[]'::jsonb,
  p_transportation_preferences jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);v_transport numeric(12,2):=0;combined numeric(12,2);required numeric(12,2);result uuid;
 v_pref jsonb;v_service text;v_pickup text;v_dropoff_pref text;v_return_location text;v_pickup_date date;v_pickup_time text;v_return_date date;v_return_time text;v_passengers int;
 v_rates jsonb;v_uniform numeric;
begin
 perform expire_booking_holds();
 if exists(select 1 from guests g where (g.user_account_id=p_user_id or lower(g.email)=lower(trim(p_email)) or exists(
    select 1 from guest_aliases a where a.alias_type='email' and a.normalized_value=lower(trim(p_email)) and a.survivor_guest_id=g.id))
    and hotel_guest_dnr_blocked(null,g.id,'booking')) then raise exception 'GUEST_DO_NOT_RENT';end if;
 if p_check_in is null or p_check_out is null or p_check_in<hotel_today(current_operational_policy_snapshot()) or p_check_in>hotel_today(current_operational_policy_snapshot())+730 or p_check_out-p_check_in not between 1 and 365 then raise exception 'INVALID_DATES';end if;
 if p_guest_count is null or p_guest_count not between 1 and 8 then raise exception 'INVALID_GUEST_COUNT';end if;
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_mobile),'')is null then raise exception 'INVALID_GUEST_DETAILS';end if;
 if coalesce(p_request_options,'[]'::jsonb)::text<>'[]'and (jsonb_typeof(coalesce(p_request_options,'[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_request_options,'[]'::jsonb))e where jsonb_typeof(e.value)<>'string' or coalesce(e.value#>>'{}','')='' or char_length(e.value#>>'{}')>40))then raise exception 'INVALID_REQUEST_OPTIONS';end if;
 if coalesce(p_transport_lines,'[]'::jsonb)::text<>'[]'and(jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))<>'array' or (select count(*)from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb)))>12 or exists(select 1 from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln where jsonb_typeof(ln.value)<>'object' or nullif(trim(coalesce(ln.value->>'name','')),'')is null or char_length(ln.value->>'name')>120 or coalesce(ln.value->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' or (ln.value->>'price')::numeric<=0))then raise exception 'INVALID_TRANSPORT_LINE';end if;
 -- Transportation preferences: strict, service-type-conditional. The client never supplies
 -- the hotel side of the route — the filer fills it from hotel_operational_policies.
 if p_transportation_preferences is not null then
  if jsonb_typeof(p_transportation_preferences)<>'object' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  v_pref:=p_transportation_preferences;
  v_service:=lower(coalesce(v_pref->>'serviceType',''));
  v_pickup:=nullif(trim(coalesce(v_pref->>'pickupLocation','')),'');
  v_dropoff_pref:=nullif(trim(coalesce(v_pref->>'dropoffLocation','')),'');
  v_return_location:=nullif(trim(coalesce(v_pref->>'returnLocation','')),'');
  v_pickup_date:=nullif(v_pref->>'pickupDate','')::date;
  v_pickup_time:=v_pref->>'pickupTime';
  v_return_date:=nullif(v_pref->>'returnDate','')::date;
  v_return_time:=v_pref->>'returnTime';
  v_passengers:=nullif(v_pref->>'passengerCount','')::int;
  if v_service not in('pickup','dropoff','round_trip') then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service in ('pickup','round_trip') and (v_pickup is null or char_length(v_pickup) not between 5 and 200) then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service='pickup' and v_dropoff_pref is not null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service='dropoff' then
   if v_dropoff_pref is null or char_length(v_dropoff_pref) not between 5 and 200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_service='round_trip' then
   if v_return_location is null or char_length(v_return_location) not between 5 and 200 or v_return_date is null or v_return_time is null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_date<v_pickup_date or v_return_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (v_return_date=v_pickup_date and v_return_time<=v_pickup_time) then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_pickup_date is null or v_pickup_time is null or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_pickup_date<p_check_in or v_pickup_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_passengers is null or v_passengers<1 or v_passengers>20 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if char_length(coalesce(v_pref->>'specialInstructions',''))>500 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
 end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select public.hotel_available_units(p_room_type,p_check_in,p_check_out,null,null,null,now()) into inventory; reserved:=0; held:=0;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 -- Rate resolution: ONE authoritative per-night sum, frozen onto the hold. A future
 -- plan change can never reprice a live hold.
 nights:=p_check_out-p_check_in;
 select coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb),round(coalesce(sum(rate),0),2),case when count(distinct rate)=1 then min(rate)else null end into v_rates,total,v_uniform from room_nightly_rates(p_room_type,p_check_in,p_check_out);
 if jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))='array'then select coalesce(sum(round((ln.value->>'price')::numeric,2)),0)into v_transport from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln;end if;
 combined:=round(total+v_transport,2);required:=case p.calculation_type when'percentage'then round(combined*p.percentage_basis_points/10000.0,2)else least(combined,round(p.fixed_amount,2))end;
 if required<=0 then raise exception 'DEPOSIT_AMOUNT_UNAVAILABLE';end if;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,transport_lines,transportation_preferences,nightly_rates,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,v_uniform,total,combined,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),coalesce(p_transport_lines,'[]'::jsonb),p_transportation_preferences,v_rates,now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end $$;

create or replace function public.file_booking_transportation_request(p_reservation_id text)returns uuid
language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;pref jsonb;service text;hotel_label text;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;
 v_pickup_date date;v_pickup_time text;v_passengers int;v_instructions text;request_key uuid;rid uuid;today date;
begin
 select * into r from reservations where id=p_reservation_id;if not found then return null;end if;
 pref:=r.transportation_preferences;
 if pref is null or jsonb_typeof(pref)<>'object' then return null;end if;
 request_key:=md5(r.id||'|transportation')::uuid;
 select id into rid from transportation_requests where idempotency_key=request_key;if found then return rid;end if;
 begin
  service:=upper(coalesce(pref->>'serviceType',''));
  v_pickup:=nullif(trim(coalesce(pref->>'pickupLocation','')),'');
  v_dropoff:=nullif(trim(coalesce(pref->>'dropoffLocation','')),'');
  v_return_location:=nullif(trim(coalesce(pref->>'returnLocation','')),'');
  v_pickup_date:=nullif(pref->>'pickupDate','')::date;
  v_pickup_time:=pref->>'pickupTime';
  v_return_date:=nullif(pref->>'returnDate','')::date;
  v_return_time:=pref->>'returnTime';
  v_passengers:=nullif(pref->>'passengerCount','')::int;
  v_instructions:=nullif(trim(coalesce(pref->>'specialInstructions','')),'');
  select coalesce(nullif(trim(transfer_hotel_label),''),'HAVEN Hotel & Residences')into hotel_label from hotel_operational_policies where key='default';
  today:=hotel_today(coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot()));
  if service not in('PICKUP','DROPOFF','ROUND_TRIP')then return null;end if;
  if (service in ('PICKUP','ROUND_TRIP') and (v_pickup is null or char_length(v_pickup)>200)) or v_pickup_date is null or v_pickup_time is null
   or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_passengers is null or v_passengers<1 or v_passengers>20
   or char_length(coalesce(v_instructions,''))>500 then return null;end if;
  if v_pickup_date<greatest(today,r.check_in) or v_pickup_date>r.check_out then return null;end if;
  if service='PICKUP' then v_dropoff:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
  elsif service='DROPOFF' then v_pickup:=hotel_label;v_dropoff:=coalesce(v_dropoff,'');v_return_location:=null;v_return_date:=null;v_return_time:=null;
   if nullif(v_dropoff,'')is null or char_length(v_dropoff)>200 then return null;end if;
  else
   v_dropoff:=hotel_label;
   if v_return_location is null or char_length(v_return_location)>200 or v_return_date is null or v_return_time is null
    or v_return_date not between v_pickup_date and r.check_out or (v_return_date=v_pickup_date and v_return_time<=v_pickup_time) or v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null;end if;
  end if;
  begin
   insert into transportation_requests(reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,idempotency_key)
   values(r.id,r.user_id,service,v_pickup,v_dropoff,v_pickup_date,v_pickup_time,v_return_location,v_return_date,v_return_time,v_passengers,v_instructions,'REQUESTED',request_key)
   returning id into rid;
  exception when unique_violation then
   insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_transportation_skipped','reservation',r.id,jsonb_build_object('reason','duplicate'));
   return null;
  end;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(r.user_id,'file_booking_transportation_request','transportation_request',rid::text,jsonb_build_object('reservationId',r.id,'serviceType',service,'pickupDate',v_pickup_date,'pickupTime',v_pickup_time,'passengerCount',v_passengers));
  return rid;
 exception when others then
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_transportation_skipped','reservation',r.id,jsonb_build_object('reason',sqlerrm));
  return null;
 end;
end$$;

create or replace function public.customer_submit_transportation_request(
 p_user_id uuid,p_reservation_id text,p_service_type text,
 p_pickup_location text,p_dropoff_location text,p_pickup_date date,p_pickup_time text,
 p_return_location text,p_return_date date,p_return_time text,
 p_passenger_count integer,p_special_instructions text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;hotel_label text;existing transportation_requests%rowtype;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;today date;rid uuid;
 fingerprint text:=md5(jsonb_build_array(p_service_type,trim(p_pickup_location),trim(p_dropoff_location),
  p_pickup_date,p_pickup_time,trim(p_return_location),p_return_date,p_return_time,p_passenger_count,trim(p_special_instructions))::text);
begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_idempotency_key is null then raise exception'INVALID_TRANSPORTATION_REQUEST';end if;
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
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_transportation_request','transportation_request',rid::text,jsonb_build_object('reservationId',r.id,'serviceType',p_service_type,'pickupDate',p_pickup_date,'pickupTime',p_pickup_time,'passengerCount',p_passenger_count));
 return jsonb_build_object('id',rid,'status','REQUESTED');end$$;

create or replace function public.customer_request_reservation_change(
  p_user_id uuid, p_reservation_id text, p_check_in date, p_check_out date, p_room_type text,
  p_guests integer, p_special_requests text, p_reason text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r reservations%rowtype;
  existing reservation_change_requests%rowtype;
  policy jsonb;
  cin date;
  cout date;
  room_type_name text;
  guest_count integer;
  notes text:=nullif(trim(p_special_requests),'');
  plan jsonb;
  requires_review boolean;
  policy_days integer;
  cid uuid;
  aid uuid;
  fingerprint text:=md5(jsonb_build_array(p_check_in,p_check_out,nullif(trim(p_room_type),''),p_guests,notes,trim(p_reason))::text);
begin
  perform public.hotel_lock_operating_day();
  if not exists(select 1 from user_accounts where id=p_user_id and active and role='guest') then
    raise exception 'CUSTOMER_ACCESS_REQUIRED';
  end if;
  if p_idempotency_key is null or nullif(trim(p_reason),'') is null then raise exception 'INVALID_MODIFICATION'; end if;
  select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;
  if found then
    if existing.reservation_id is distinct from r.id or existing.requested_by is distinct from p_user_id then
      raise exception 'RETRY_PAYLOAD_CONFLICT';
    end if;
    if existing.request_fingerprint is not null then
      if existing.request_fingerprint<>fingerprint then raise exception 'RETRY_PAYLOAD_CONFLICT'; end if;
    elsif (existing.requested_check_in,existing.requested_check_out,existing.requested_room_type,existing.requested_guests,
        existing.requested_special_requests,existing.reason) is distinct from
        (coalesce(p_check_in,existing.requested_check_in),coalesce(p_check_out,existing.requested_check_out),
         coalesce(nullif(trim(p_room_type),''),existing.requested_room_type),coalesce(p_guests,existing.requested_guests),
         notes,trim(p_reason)) then raise exception 'RETRY_PAYLOAD_CONFLICT';
    end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status,
      'calculatedTotal',existing.calculated_total,'paymentDifference',existing.payment_difference,
      'managerApprovalId',existing.manager_approval_id);
  end if;
  if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in ('pending','approved')) then
    raise exception 'CHANGE_ALREADY_OPEN';
  end if;

  policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
  policy_days:=coalesce((policy->>'selfServiceModificationDays')::integer,3);
  cin:=coalesce(p_check_in,r.check_in);
  cout:=coalesce(p_check_out,r.check_out);
  room_type_name:=coalesce(nullif(trim(p_room_type),''),r.room_type);
  guest_count:=coalesce(p_guests,r.guests);
  plan:=hotel_reservation_amendment(r,cin,cout,room_type_name,guest_count,notes,null,p_user_id,p_reason,false,null);
  requires_review:=r.check_in-hotel_today(policy)<=policy_days or (plan->>'roomChoiceRequired')::boolean;
  if not requires_review then
    plan:=hotel_reservation_amendment(r,cin,cout,room_type_name,guest_count,notes,null,p_user_id,p_reason,true,plan->'quote');
  end if;
  insert into reservation_change_requests(reservation_id,requested_by,requested_check_in,requested_check_out,
    requested_room_type,requested_guests,requested_special_requests,reason,status,calculated_total,payment_difference,idempotency_key,execution_status,amendment_quote,request_fingerprint)
  values(r.id,p_user_id,cin,cout,room_type_name,guest_count,notes,trim(p_reason),
    case when requires_review then 'pending' else 'executed' end,(plan->>'calculatedTotal')::numeric,
    (plan->>'paymentDifference')::numeric,p_idempotency_key,case when requires_review then 'pending_review' else 'not_required' end,
    case when requires_review then plan->'quote' end,fingerprint)
  returning id into cid;
  if requires_review then
    insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,department,
      severity,reason,requested_action,normal_policy_result,requested_by)
    values('reservation_modification','reservation_change_request',cid::text,r.id,'front_desk','normal',
      trim(p_reason),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',room_type_name,
        'guests',guest_count,'specialRequests',notes,'calculatedTotal',plan->'calculatedTotal',
        'paymentDifference',plan->'paymentDifference'),
      jsonb_build_object('requiresManagerApproval',true,'policyDays',policy_days),p_user_id)
    returning id into aid;
    update reservation_change_requests set manager_approval_id=aid where id=cid;
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_user_id,'customer_request_reservation_change','reservation_change_request',cid::text,
      jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'total',r.total),
      jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',room_type_name,'guests',guest_count,
        'calculatedTotal',plan->'calculatedTotal','paymentDifference',plan->'paymentDifference','managerApprovalId',aid));
  return jsonb_build_object('id',cid,'status',case when requires_review then 'pending' else 'executed' end,
    'executionStatus',case when requires_review then 'pending_review' else 'not_required' end,
    'calculatedTotal',plan->'calculatedTotal','paymentDifference',plan->'paymentDifference','managerApprovalId',aid);
end $$;

create or replace function public.customer_submit_guest_requests(p_user_id uuid,p_reservation_id text,p_request_types text[],p_description text,p_requested_action jsonb,p_idempotency_key uuid)
returns table(id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;reqtext text;key uuid;rt text;rid uuid;
 fingerprint text:=md5(jsonb_build_array(to_jsonb(p_request_types),trim(coalesce(p_description,'')),coalesce(p_requested_action,'{}'))::text);
begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if array_length(p_request_types,1)is null or array_length(p_request_types,1)>12 then raise exception'INVALID_REQUEST';end if;
 if length(coalesce(p_description,''))>500 or p_idempotency_key is null then raise exception'INVALID_REQUEST';end if;
 select * into r from reservations rr where rr.id=p_reservation_id and rr.user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 perform pg_advisory_xact_lock(hashtextextended('guest-request:'||p_idempotency_key,0));
 if exists(select 1 from guest_requests where batch_id=p_idempotency_key and
   (reservation_id is distinct from r.id or request_fingerprint is not null and request_fingerprint<>fingerprint)) then
   raise exception 'RETRY_PAYLOAD_CONFLICT';
 end if;
 foreach rt in array p_request_types loop
  if rt is null or char_length(trim(rt))=0 then continue;end if;
  key:=md5(p_idempotency_key::text||'|'||trim(rt))::uuid;
  select * into existing from guest_requests where idempotency_key=key;
  if trim(rt)='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
  select g.department,g.label into dept,label from public.guest_request_route(trim(rt)) g;
  reqtext:=case when nullif(trim(coalesce(p_description,'')),'')is null then label else label||': '||trim(p_description)end;
  if existing.id is not null then
   if existing.reservation_id is distinct from r.id or existing.request is distinct from reqtext
    or existing.requested_action is distinct from coalesce(p_requested_action,'{}') then
     raise exception 'RETRY_PAYLOAD_CONFLICT';
   end if;
   return query select existing.id,existing.status;continue;
  end if;
  insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,batch_id,approval_status,idempotency_key,request_fingerprint)
  values(r.id,r.guest_id,reqtext,trim(rt),coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key,'pending',key,fingerprint)returning guest_requests.id into rid;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_requests','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',trim(rt),'department',dept,'batchId',p_idempotency_key));
  return query select rid,'open'::text;
 end loop;end$$;

-- Stop new access to the retired manual write path while retaining its definition and history.
revoke execute on function public.customer_submit_stay_payment(uuid,text,numeric,text,text,uuid) from public,anon,authenticated,service_role;

create table public.booking_hold_attempts (
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  attempt_id uuid not null,
  fingerprint text not null,
  hold_token uuid not null references public.booking_holds(token) on delete cascade,
  primary key(user_id,attempt_id)
);
alter table public.booking_hold_attempts enable row level security;
revoke all on public.booking_hold_attempts from public,anon,authenticated,service_role;

create function public.create_booking_hold_attempt(p_user uuid,p_attempt uuid,p_details jsonb,p_breakfast_enabled boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old_attempt booking_hold_attempts%rowtype; old_hold booking_holds%rowtype; created_token uuid;
  fingerprint text:=md5(p_details::text); details jsonb:=p_details;
begin
  if p_attempt is null or jsonb_typeof(details)<>'object'
    or not exists(select 1 from user_accounts where id=p_user and active and role='guest' and not recovery_required) then
    raise exception 'CUSTOMER_ACCESS_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('booking-attempt:'||p_user||':'||p_attempt,0));
  select a.* into old_attempt from booking_hold_attempts a where a.user_id=p_user and a.attempt_id=p_attempt;
  if found then
    if old_attempt.fingerprint<>fingerprint then raise exception 'RETRY_PAYLOAD_CONFLICT'; end if;
    select h.* into old_hold from booking_holds h where h.token=old_attempt.hold_token and h.user_id=p_user;
    if not found or old_hold.status in ('cancelled','expired') or (old_hold.reservation_id is null and old_hold.expires_at<=now()) then
      raise exception 'HOLD_ATTEMPT_EXPIRED';
    end if;
    return jsonb_build_object('token',old_hold.token,'expiresAt',old_hold.expires_at,'replayed',true,'roomType',old_hold.room_type);
  end if;
  if p_breakfast_enabled then
    created_token:=hotel_create_breakfast_booking_hold(p_user,details->>'roomId',details,(details->>'breakfastOfferId')::uuid,
      case when details ? 'roomId' then (details->>'holdToken')::uuid end);
  elsif details ? 'roomId' then
    created_token:=create_exact_booking_hold(p_user,details->>'roomId',details,(details->>'holdToken')::uuid);
  else
    created_token:=create_booking_hold(p_user,details->>'roomType',(details->>'checkIn')::date,(details->>'checkOut')::date,
      (details->>'guests')::integer,details->>'firstName',details->>'lastName',details->>'email',details->>'mobile',
      details->>'address',details->>'nationality',details->>'expectedArrival',details->>'specialRequests',
      coalesce(details->'requestOptions','[]'), '[]', nullif(details->'transportationPreferences','null'));
  end if;
  insert into booking_hold_attempts values(p_user,p_attempt,fingerprint,created_token);
  select h.* into strict old_hold from booking_holds h where h.token=created_token and h.user_id=p_user;
  return jsonb_build_object('token',created_token,'expiresAt',old_hold.expires_at,'replayed',false,'roomType',old_hold.room_type);
end $$;
revoke all on function public.create_booking_hold_attempt(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.create_booking_hold_attempt(uuid,uuid,jsonb,boolean) to service_role;

commit;
