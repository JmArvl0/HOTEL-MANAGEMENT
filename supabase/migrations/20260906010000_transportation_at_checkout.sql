-- Transportation at checkout: an optional transport ride request collected during booking.
-- No pricing, no folio, no external APIs — the guest's PREFERENCES ride the hold -> reservation
-- as transportation_preferences jsonb (exactly like request_options from
-- 20260904020000_structured_guest_requests.sql) and are FILED as a REQUESTED
-- transportation_requests row by the trigger below the moment the website reservation is
-- first confirmed. Until then nothing exists in transportation_requests.
--
-- Trigger-safety rule: the filer runs inside the reservations status-update transaction
-- (verify_reservation_deposit). It NEVER raises — strict validation happens here in
-- create_booking_hold (where a 400 is cheap); the filer re-validates defensively and skips
-- (with an audit row) anything that no longer fits, e.g. a hold that sat past its pickup date.

alter table public.booking_holds add column if not exists transportation_preferences jsonb;
alter table public.reservations add column if not exists transportation_preferences jsonb;

-- create_booking_hold: 16-arg (adds p_transportation_preferences). Recreated from the LIVE
-- body (which had drifted: transport lines are folded into total/deposit via v_transport /
-- combined — that math is preserved). The dropped 15-arg overload is what the live database
-- has, so this drop/recreate matches the live sequence and stays additive.
drop function if exists public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb);
create or replace function public.create_booking_hold(p_user_id uuid,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_first_name text,p_last_name text,p_email text,p_mobile text,p_address text default null,p_nationality text default null,p_expected_arrival text default null,p_special_requests text default null,p_request_options jsonb default '[]'::jsonb,p_transport_lines jsonb default '[]'::jsonb,p_transportation_preferences jsonb default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);v_transport numeric(12,2):=0;combined numeric(12,2);required numeric(12,2);result uuid;
 v_pref jsonb;v_service text;v_pickup text;v_dropoff_pref text;v_return_location text;v_pickup_date date;v_pickup_time text;v_return_date date;v_return_time text;v_passengers int;
begin
 perform expire_booking_holds();
 if p_check_in<current_date or p_check_out<=p_check_in then raise exception 'INVALID_DATES';end if;
 if p_guest_count<1 then raise exception 'INVALID_GUEST_COUNT';end if;
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
  if v_pickup is null or char_length(v_pickup)>200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service='pickup' and v_dropoff_pref is not null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service in('dropoff','round_trip') then
   if v_dropoff_pref is null or char_length(v_dropoff_pref)>200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_service='round_trip' then
   if v_return_location is null or char_length(v_return_location)>200 or v_return_date is null or v_return_time is null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_date<v_pickup_date or v_return_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_pickup_date is null or v_pickup_time is null or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_pickup_date<p_check_in or v_pickup_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_passengers is null or v_passengers<1 or v_passengers>20 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if char_length(coalesce(v_pref->>'specialInstructions',''))>500 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
 end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select count(*)into inventory from rooms r where r.type=p_room_type and r.status<>'maintenance' and(p_check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 nights:=p_check_out-p_check_in;total:=round(t.base_rate*nights,2);
 if jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))='array'then select coalesce(sum(round((ln.value->>'price')::numeric,2)),0)into v_transport from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln;end if;
 combined:=round(total+v_transport,2);required:=case p.calculation_type when'percentage'then round(combined*p.percentage_basis_points/10000.0,2)else least(combined,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,transport_lines,transportation_preferences,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,t.base_rate,total,combined,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),coalesce(p_transport_lines,'[]'::jsonb),p_transportation_preferences,now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end$$;

-- submit_reservation_deposit: carry transportation_preferences from the hold onto the
-- reservation (same as request_options/transport_lines). Recreated from the LIVE body;
-- signature unchanged so existing grants survive.
create or replace function public.submit_reservation_deposit(p_token uuid,p_user_id uuid,p_payment_method text,p_payment_reference text)
returns table(reservation_id text,confirmation_number text,reservation_status text,payment_status text,deposit_required numeric,remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare h booking_holds%rowtype;t room_types%rowtype;inventory int;reserved int;guest text;rid text;iid text;confirmation text;
begin
 perform expire_booking_holds();select * into h from booking_holds where token=p_token and user_id=p_user_id for update;if not found then raise exception'HOLD_NOT_FOUND';end if;
 if h.reservation_id is not null then return query select r.id,r.confirmation_number,r.status,r.payment_status,r.deposit_required,greatest(r.total-coalesce(i.paid,0),0)from reservations r left join invoices i on i.reservation_id=r.id where r.id=h.reservation_id;return;end if;
 if h.status<>'active'or h.expires_at<=now()then raise exception'HOLD_EXPIRED';end if;
 if p_payment_method not in('manual_bank_transfer','manual_gcash')then raise exception'UNSUPPORTED_PAYMENT_METHOD';end if;
 if nullif(trim(p_payment_reference),'')is null or length(trim(p_payment_reference))>120 then raise exception'INVALID_PAYMENT_REFERENCE';end if;
 if h.deposit_required<=0 then raise exception'INVALID_DEPOSIT_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));select * into t from room_types where name=h.room_type and active;
 if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;if round(t.base_rate,2)<>round(h.nightly_rate,2)then raise exception'RATE_CHANGED';end if;
 select count(*)into inventory from rooms r where r.type=h.room_type and r.status<>'maintenance'and(h.check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=h.room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<h.check_out and r.check_out>h.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select g.id into guest from guests g where g.user_account_id=p_user_id or lower(g.email)=lower(h.email)order by(g.user_account_id=p_user_id)desc limit 1 for update;
 if guest is null then insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)values(trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,p_user_id,h.address,h.nationality,h.special_requests)returning id into guest;
 else update guests set user_account_id=coalesce(user_account_id,p_user_id),name=trim(h.first_name||' '||h.last_name),first_name=h.first_name,last_name=h.last_name,phone=h.mobile,address=coalesce(h.address,address),nationality=coalesce(h.nationality,nationality),special_requests=coalesce(h.special_requests,special_requests)where id=guest;end if;
 confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,request_options,transport_lines,transportation_preferences,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,h.transport_lines,h.transportation_preferences,h.expected_arrival,'unpaid',p_payment_method,h.expires_at,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$$;

-- Filer: turns stored transportation_preferences into a REQUESTED transportation_requests
-- row. NEVER raises (it runs inside the confirmation transaction): anything invalid by
-- filing time is skipped with an audit row. Deterministic idempotency key makes re-runs
-- no-ops; the partial unique index on (reservation_id,service_type,pickup_date,pickup_location)
-- is the backstop when the guest already filed an identical active portal request.
create or replace function public.file_booking_transportation_request(p_reservation_id text)returns uuid
language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;pref jsonb;service text;hotel_label text;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;
 v_pickup_date date;v_pickup_time text;v_passengers int;v_instructions text;key uuid;rid uuid;today date;
begin
 select * into r from reservations where id=p_reservation_id;if not found then return null;end if;
 pref:=r.transportation_preferences;
 if pref is null or jsonb_typeof(pref)<>'object' then return null;end if;
 key:=md5(r.id||'|transportation')::uuid;
 select id into rid from transportation_requests where idempotency_key=key;if found then return rid;end if;
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
  if v_pickup is null or char_length(v_pickup)>200 or v_pickup_date is null or v_pickup_time is null
   or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_passengers is null or v_passengers<1 or v_passengers>20
   or char_length(coalesce(v_instructions,''))>500 then return null;end if;
  if v_pickup_date<today or v_pickup_date>r.check_out then return null;end if;
  if service='PICKUP' then v_dropoff:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
  elsif service='DROPOFF' then v_pickup:=hotel_label;v_dropoff:=coalesce(v_dropoff,'');v_return_location:=null;v_return_date:=null;v_return_time:=null;
   if nullif(v_dropoff,'')is null or char_length(v_dropoff)>200 then return null;end if;
  else
   v_dropoff:=hotel_label;
   if v_return_location is null or char_length(v_return_location)>200 or v_return_date is null or v_return_time is null
    or v_return_date<v_pickup_date or v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null;end if;
  end if;
  begin
   insert into transportation_requests(reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,idempotency_key)
   values(r.id,r.user_id,service,v_pickup,v_dropoff,v_pickup_date,v_pickup_time,v_return_location,v_return_date,v_return_time,v_passengers,v_instructions,'REQUESTED',key)
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

-- Second trigger alongside file_booking_requests_on_confirm (kept untouched — the two
-- filers fail independently, and the guest-request path carries zero drift exposure).
create or replace function public.trigger_file_booking_transportation()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(new.source,''))='website'and new.status='confirmed'and(old is null or old.status is distinct from'confirmed')then
  perform public.file_booking_transportation_request(new.id);
 end if;
 return new;end$$;
drop trigger if exists file_booking_transportation_on_confirm on public.reservations;
create trigger file_booking_transportation_on_confirm after insert or update of status on public.reservations
 for each row execute function public.trigger_file_booking_transportation();

-- Only the service role may call the new/changed SECURITY DEFINER functions. The recreated
-- create_booking_hold (16-arg) lost its grants on drop; submit_reservation_deposit keeps its
-- grants (unchanged signature) but is revoked/granted here for uniform hygiene.
revoke all on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb),public.submit_reservation_deposit(uuid,uuid,text,text),public.file_booking_transportation_request(text),public.trigger_file_booking_transportation() from public,anon,authenticated;
grant execute on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb),public.submit_reservation_deposit(uuid,uuid,text,text),public.file_booking_transportation_request(text),public.trigger_file_booking_transportation() to service_role;
