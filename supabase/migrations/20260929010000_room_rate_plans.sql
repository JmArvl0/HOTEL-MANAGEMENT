-- 20260929010000_room_rate_plans.sql
-- Phase 3 of the post-audit roadmap: rate plans.
--
-- Adds manager-proposed / owner-approved dated rate overlays (weekday/weekend,
-- seasonal, holiday periods) on top of room_types.base_rate, with ONE authoritative
-- resolver (room_nightly_rates) that every booking price computation goes through,
-- and per-night rate freezing on booking_holds + reservations so later plan changes
-- never alter a confirmed booking, hold, or settled folio.
--
-- Overlap priority (documented, deterministic — never DB order):
--   specific dated plan (narrowest date range) > wider plan > base_rate fallback;
--   equal widths tie-break on decided_at desc, then id desc.
--
-- Governance reuses the room_rate_proposals pattern: Manager proposes, Owner/Admin
-- approve. Approving a plan never touches base_rate — plans are additive overlays.
--
-- All eight live pricing functions are recreated from their LIVE bodies (verified via
-- DIRECT_URL before this file was written) with only the pricing lines changed.

-- ---------------------------------------------------------------------------
-- 1. Rate plan registry
-- ---------------------------------------------------------------------------
create table if not exists public.room_rate_plans (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id),
  name text not null,
  start_date date not null,
  end_date date not null,
  -- ISO day-of-week bitmask: bit 0 = Monday ... bit 6 = Sunday. 127 = every day.
  days_of_week integer not null default 127,
  nightly_rate numeric(12,2) not null check (nightly_rate >= 0),
  status text not null default 'pending' check (status in ('pending','active','rejected','retired')),
  reason text,
  decision_reason text,
  proposed_by uuid references public.user_accounts(id),
  decided_by uuid references public.user_accounts(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint room_rate_plans_sane_range check (end_date >= start_date),
  constraint room_rate_plans_sane_days check (days_of_week between 1 and 127)
);

-- One pending proposal per (room type, plan name); names also stay unique while
-- active so a live plan is never shadowed by a same-named re-proposal.
create unique index if not exists room_rate_plans_one_open
  on public.room_rate_plans (room_type_id, name)
  where (status in ('pending','active'));
create index if not exists room_rate_plans_active_lookup
  on public.room_rate_plans (room_type_id, start_date, end_date)
  where (status = 'active');

alter table public.room_rate_plans enable row level security;
revoke all on public.room_rate_plans from public, anon, authenticated;
grant all on public.room_rate_plans to service_role;

-- ---------------------------------------------------------------------------
-- 2. Freeze columns — per-night agreed rates, written once at booking creation.
--    total stays the frozen monetary authority; nightly_rates is the breakdown.
--    Legacy rows keep null and fall back to base_rate for display; nothing is
--    recomputed for them.
-- ---------------------------------------------------------------------------
alter table public.booking_holds add column if not exists nightly_rates jsonb;
alter table public.reservations add column if not exists nightly_rates jsonb;

-- ---------------------------------------------------------------------------
-- 3. The ONE authoritative resolver.
--    Returns one row per night in [p_from, p_to) with the winning rate.
-- ---------------------------------------------------------------------------
create or replace function public.room_nightly_rates(p_room_type text, p_from date, p_to date)
returns table(night date, rate numeric)
language sql stable security definer set search_path = public as $$
  select d.night::date,
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
         generate_series(p_from::timestamp, p_to::timestamp - interval '1 day', interval '1 day') as d(night)
   where t.name = p_room_type
     and t.active
     and p_from is not null and p_to is not null and p_to > p_from;
$$;

-- ---------------------------------------------------------------------------
-- 4. Governance: propose / review / retire
-- ---------------------------------------------------------------------------
create or replace function public.manager_propose_room_rate_plan(
  p_room_type_id uuid, p_name text, p_start_date date, p_end_date date,
  p_days_of_week integer, p_nightly_rate numeric, p_reason text, p_actor_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor text; t room_types%rowtype; plan_id uuid; v_days integer;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor <> 'manager' then raise exception 'MANAGER_AUTHORITY_REQUIRED'; end if;
  if nullif(trim(p_name), '') is null or char_length(trim(p_name)) > 80
     or nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 500
     or p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date < current_date
     or p_nightly_rate is null or p_nightly_rate < 0 then raise exception 'INVALID_RATE_PLAN'; end if;
  v_days := coalesce(p_days_of_week, 127);
  if v_days < 1 or v_days > 127 then raise exception 'INVALID_RATE_PLAN'; end if;
  select * into t from room_types where id = p_room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if exists (select 1 from room_rate_plans where room_type_id = t.id and name = trim(p_name) and status in ('pending','active'))
    then raise exception 'RATE_PLAN_NAME_IN_USE'; end if;
  insert into room_rate_plans (room_type_id, name, start_date, end_date, days_of_week, nightly_rate, reason, status, proposed_by)
  values (t.id, trim(p_name), p_start_date, p_end_date, v_days, round(p_nightly_rate, 2), trim(p_reason), 'pending', p_actor_user_id)
  returning id into plan_id;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
  values (p_actor_user_id, 'propose_room_rate_plan', 'room_rate_plan', plan_id::text,
    jsonb_build_object('roomTypeId', t.id, 'roomType', t.name, 'name', trim(p_name),
      'startDate', p_start_date, 'endDate', p_end_date, 'daysOfWeek', v_days,
      'nightlyRate', round(p_nightly_rate, 2), 'reason', trim(p_reason)));
  return plan_id;
end $$;

create or replace function public.admin_review_room_rate_plan(
  p_plan_id uuid, p_decision text, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_plans%rowtype; new_status text;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if p_decision not in ('approve', 'reject') or nullif(trim(p_reason), '') is null then raise exception 'INVALID_RATE_PLAN_REVIEW'; end if;
  select * into p from room_rate_plans where id = p_plan_id for update;
  if not found then raise exception 'RATE_PLAN_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'RATE_PLAN_ALREADY_REVIEWED'; end if;
  new_status := case p_decision when 'approve' then 'active' else 'rejected' end;
  update room_rate_plans set status = new_status, decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'review_room_rate_plan', 'room_rate_plan', p.id::text,
    jsonb_build_object('name', p.name, 'status', 'pending', 'nightlyRate', p.nightly_rate),
    jsonb_build_object('decision', p_decision, 'status', new_status, 'reason', trim(p_reason)));
  return jsonb_build_object('id', p.id, 'status', new_status);
end $$;

-- Retire stops a plan from pricing future nights. Already-frozen bookings keep
-- their agreed rates; nothing is recomputed.
create or replace function public.manager_retire_room_rate_plan(
  p_plan_id uuid, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_plans%rowtype;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('manager', 'owner', 'admin') then raise exception 'RATE_PLAN_AUTHORITY_REQUIRED'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'INVALID_RATE_PLAN_REVIEW'; end if;
  select * into p from room_rate_plans where id = p_plan_id for update;
  if not found then raise exception 'RATE_PLAN_NOT_FOUND'; end if;
  if p.status not in ('pending', 'active') then raise exception 'RATE_PLAN_NOT_RETIRABLE'; end if;
  update room_rate_plans set status = 'retired', decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'retire_room_rate_plan', 'room_rate_plan', p.id::text,
    jsonb_build_object('name', p.name, 'status', p.status, 'nightlyRate', p.nightly_rate),
    jsonb_build_object('status', 'retired', 'reason', trim(p_reason)));
  return jsonb_build_object('id', p.id, 'status', 'retired');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Recreate the pricing functions from their LIVE bodies.
--    Only the pricing lines change: base_rate x nights -> resolver per-night sum,
--    with the per-night breakdown frozen at creation.
-- ---------------------------------------------------------------------------

-- create_booking_hold: resolver total + frozen breakdown; nightly_rate keeps a
-- display value only when every night prices the same (null otherwise).
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
 select count(*)into inventory from rooms r where r.type=p_room_type and room_is_sellable(r.id,p_check_in,null);
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 -- Rate resolution: ONE authoritative per-night sum, frozen onto the hold. A future
 -- plan change can never reprice a live hold.
 nights:=p_check_out-p_check_in;
 select coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb),round(coalesce(sum(rate),0),2),case when count(distinct rate)=1 then min(rate)else null end into v_rates,total,v_uniform from room_nightly_rates(p_room_type,p_check_in,p_check_out);
 if jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))='array'then select coalesce(sum(round((ln.value->>'price')::numeric,2)),0)into v_transport from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln;end if;
 combined:=round(total+v_transport,2);required:=case p.calculation_type when'percentage'then round(combined*p.percentage_basis_points/10000.0,2)else least(combined,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,transport_lines,transportation_preferences,nightly_rates,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,v_uniform,total,combined,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),coalesce(p_transport_lines,'[]'::jsonb),p_transportation_preferences,v_rates,now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end $$;

-- submit_reservation_deposit: RATE_CHANGED now compares the recomputed per-night
-- room total against the frozen hold subtotal (single-rate comparison could not
-- detect plan changes once nightly rates could vary). The frozen breakdown moves
-- onto the reservation.
create or replace function public.submit_reservation_deposit(
  p_token uuid, p_user_id uuid, p_payment_method text, p_payment_reference text,
  p_proof_storage_path text default null, p_proof_original_name text default null,
  p_proof_mime_type text default null, p_proof_size_bytes integer default null)
returns table(reservation_id text, confirmation_number text, reservation_status text, payment_status text, deposit_required numeric, remaining_balance numeric)
language plpgsql security definer set search_path = public as $$
declare h booking_holds%rowtype;t room_types%rowtype;inventory int;reserved int;guest text;rid text;iid text;confirmation text;
begin
 perform expire_booking_holds();select * into h from booking_holds where token=p_token and user_id=p_user_id for update;if not found then raise exception'HOLD_NOT_FOUND';end if;
 if h.reservation_id is not null then return query select r.id,r.confirmation_number,r.status,r.payment_status,r.deposit_required,greatest(r.total-coalesce(i.paid,0),0)from reservations r left join invoices i on i.reservation_id=r.id where r.id=h.reservation_id;return;end if;
 if h.status<>'active'or h.expires_at<=now()then raise exception'HOLD_EXPIRED';end if;
 if p_payment_method not in('manual_bank_transfer','manual_gcash')then raise exception'UNSUPPORTED_PAYMENT_METHOD';end if;
 if nullif(trim(p_payment_reference),'')is null or length(trim(p_payment_reference))>120 then raise exception'INVALID_PAYMENT_REFERENCE';end if;
 if nullif(trim(p_proof_storage_path),'')is null or nullif(trim(p_proof_mime_type),'')is null or p_proof_size_bytes is null or p_proof_size_bytes<=0 then raise exception'PROOF_REQUIRED';end if;
 if h.deposit_required<=0 then raise exception'INVALID_DEPOSIT_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));select * into t from room_types where name=h.room_type and active;
 if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;if round((select coalesce(sum(rate),0)from room_nightly_rates(h.room_type,h.check_in,h.check_out)),2)<>round(h.subtotal,2)then raise exception'RATE_CHANGED';end if;
 select count(*)into inventory from rooms r where r.type=h.room_type and room_is_sellable(r.id,h.check_in,h.operational_policy_snapshot);
 select count(*)into reserved from reservations r where r.room_type=h.room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<h.check_out and r.check_out>h.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select g.id into guest from guests g where g.user_account_id=p_user_id or lower(g.email)=lower(h.email)order by(g.user_account_id=p_user_id)desc limit 1 for update;
 if guest is null then insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)values(trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,p_user_id,h.address,h.nationality,h.special_requests)returning id into guest;
 else update guests set user_account_id=coalesce(user_account_id,p_user_id),name=trim(h.first_name||' '||h.last_name),first_name=h.first_name,last_name=h.last_name,phone=h.mobile,address=coalesce(h.address,address),nationality=coalesce(h.nationality,nationality),special_requests=coalesce(h.special_requests,special_requests)where id=guest;end if;
 confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,request_options,transport_lines,transportation_preferences,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key,nightly_rates)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,h.transport_lines,h.transportation_preferences,h.expected_arrival,'unpaid',p_payment_method,null,confirmation,p_token,h.nightly_rates)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,proof_storage_path,proof_original_name,proof_mime_type,proof_size_bytes,proof_uploaded_at)
 values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token,trim(p_proof_storage_path),nullif(trim(p_proof_original_name),''),p_proof_mime_type,p_proof_size_bytes,now());
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end $$;

-- front_desk_create_reservation: resolver total + frozen breakdown.
create or replace function public.front_desk_create_reservation(
  p_guest_name text, p_email text, p_phone text, p_room_type text, p_check_in date, p_check_out date,
  p_guest_count integer, p_source text, p_special_requests text, p_expected_arrival text,
  p_idempotency_key uuid, p_staff_user_id uuid)
returns table(reservation_id text, confirmation_number text, total numeric)
language plpgsql security definer set search_path = public as $$
declare actor text;t room_types%rowtype;inventory int;reserved int;guest text;rid text;confirmation text;amount numeric;v_rates jsonb;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'STAFF_RESERVATION_FORBIDDEN';end if;
if p_check_in<(now()at time zone'Asia/Manila')::date or p_check_out<=p_check_in then raise exception'INVALID_DATES';end if;if p_guest_count<1 then raise exception'INVALID_GUEST_COUNT';end if;
if nullif(trim(p_guest_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_phone),'')is null then raise exception'INVALID_GUEST_DETAILS';end if;if p_source not in('Front Desk','Walk-In','Phone')then raise exception'INVALID_BOOKING_SOURCE';end if;
select id into rid from reservations where idempotency_key=p_idempotency_key;if found then return query select r.id,r.confirmation_number,r.total from reservations r where r.id=rid;return;end if;
perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select count(*)into inventory from rooms r where r.type=p_room_type and room_is_sellable(r.id,p_check_in,null);select count(*)into reserved from reservations where room_type=p_room_type and status in('pending','confirmed','checked_in')and check_in<p_check_out and check_out>p_check_in;
if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select round(coalesce(sum(rate),0),2),coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into amount,v_rates from room_nightly_rates(p_room_type,p_check_in,p_check_out);
select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;if guest is null then insert into guests(name,email,phone)values(trim(p_guest_name),lower(trim(p_email)),trim(p_phone))returning id into guest;else update guests set name=trim(p_guest_name),phone=trim(p_phone)where id=guest;end if;
confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into reservations(guest_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,special_requests,expected_arrival,payment_status,confirmation_number,idempotency_key,nightly_rates)
values(guest,trim(p_guest_name),lower(trim(p_email)),p_room_type,p_check_in,p_check_out,p_guest_count,'confirmed',p_source,amount,0,0,nullif(trim(p_special_requests),''),nullif(trim(p_expected_arrival),''),'unpaid',confirmation,p_idempotency_key,v_rates)returning id into rid;
insert into invoices(reservation_id,guest_name,amount,paid,balance,status,due_date)values(rid,trim(p_guest_name),amount,0,amount,'unpaid',p_check_in);
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'create_staff_reservation','reservation',rid,jsonb_build_object('source',p_source,'roomType',p_room_type,'checkIn',p_check_in,'checkOut',p_check_out,'total',amount));return query select rid,confirmation,amount;end
$$;

-- front_desk_extend_stay: added nights price at the then-current resolver rates and
-- are appended to the frozen breakdown (idempotency via folio_charges key unchanged).
create or replace function public.front_desk_extend_stay(
  p_reservation_id text, p_new_check_out date, p_reason text, p_idempotency_key uuid, p_staff_user_id uuid)
returns table(new_check_out date, additional_amount numeric, new_balance numeric)
language plpgsql security definer set search_path = public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;added numeric;cid uuid;v_rates jsonb;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'EXTENSION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'EXTENSION_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select id into cid from folio_charges where idempotency_key=p_idempotency_key;if found then select * into i from invoices where reservation_id=r.id;return query select r.check_out,(select amount from folio_charges where id=cid),i.balance;return;end if;
select * into room from rooms where id=r.room_id for update;select * into a from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)then raise exception'EXTENSION_REQUIRES_ROOM_CHANGE';end if;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select round(coalesce(sum(rate),0),2),coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into added,v_rates from room_nightly_rates(r.room_type,r.check_out,p_new_check_out);
select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Stay extension through '||p_new_check_out,'extension',added,p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into cid;
update invoices set amount=round(amount+added,2)where id=i.id;update reservations set check_out=p_new_check_out,total=round(total+added,2),nightly_rates=coalesce(nightly_rates,'[]'::jsonb)||v_rates where id=r.id;update reservation_room_assignments set check_out=p_new_check_out where id=a.id;select * into i from sync_invoice_financials(i.id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'extend_stay','reservation',r.id,jsonb_build_object('checkOut',r.check_out,'total',r.total),jsonb_build_object('checkOut',p_new_check_out,'additionalAmount',added,'reason',trim(p_reason)));return query select p_new_check_out,added,i.balance;end
$$;

-- front_desk_extend_stay_preview: resolver sum for the added nights; rate stays a
-- single value only when the added nights price uniformly, plus the full breakdown.
create or replace function public.front_desk_extend_stay_preview(
  p_reservation_id text, p_new_check_out date, p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;v_nights int;v_added numeric;v_conflict boolean;v_rates jsonb;v_rate numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'EXTENSION_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
if r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;
if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select * into room from rooms where id=r.room_id;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select * into i from invoices where reservation_id=r.id;if not found then raise exception'FOLIO_NOT_FOUND';end if;
v_nights:=p_new_check_out-r.check_out;
select round(coalesce(sum(rate),0),2),coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb),case when count(distinct rate)=1 then min(rate)else null end into v_added,v_rates,v_rate from room_nightly_rates(r.room_type,r.check_out,p_new_check_out);
select exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)into v_conflict;
return jsonb_build_object('currentCheckOut',r.check_out,'requestedCheckOut',p_new_check_out,'nights',v_nights,'rate',v_rate,'nightlyRates',v_rates,'additionalAmount',v_added,'projectedTotal',round(i.amount+v_added,2),'balance',i.balance,'roomConflict',v_conflict,'roomNumber',room.number,'roomType',r.room_type);end
$$;

-- customer_request_reservation_change: resolver total for the requested window
-- (room type may change, so resolve against the requested type); executed branch
-- freezes the new breakdown.
create or replace function public.customer_request_reservation_change(
  p_user_id uuid, p_reservation_id text, p_check_in date, p_check_out date, p_room_type text,
  p_guests integer, p_special_requests text, p_reason text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text;r reservations%rowtype;t room_types%rowtype;i invoices%rowtype;existing reservation_change_requests%rowtype;policy jsonb;today date;cin date;cout date;rtype text;gcount int;inventory int;reserved int;held int;new_total numeric;diff numeric;days_before int;cid uuid;aid uuid;v_rates jsonb;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status);end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_MODIFIABLE';end if;
 if jsonb_typeof(r.transport_lines)='array'and exists(select 1 from jsonb_array_elements(r.transport_lines)as l where coalesce((l->>'price')::numeric,0)>0)then raise exception'TRANSPORT_REQUIRES_STAFF';end if;
 if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in('pending','approved'))then raise exception'CHANGE_ALREADY_OPEN';end if;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());today:=hotel_today(policy);
 cin:=coalesce(p_check_in,r.check_in);cout:=coalesce(p_check_out,r.check_out);rtype:=coalesce(nullif(trim(p_room_type),''),r.room_type);gcount:=coalesce(p_guests,r.guests);
 if cin<today or cout<=cin or gcount<1 or nullif(trim(p_reason),'')is null then raise exception'INVALID_MODIFICATION';end if;
 select * into t from room_types where name=rtype and active for update;if not found or gcount>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,cin,policy);
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=t.name and x.status in('pending','confirmed','checked_in')and x.check_in<cout and x.check_out>cin;
 select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<cout and h.check_out>cin;
 if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 select round(coalesce(sum(rate),0),2),coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into new_total,v_rates from room_nightly_rates(rtype,cin,cout);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;diff:=round(new_total-i.amount,2);
 days_before:=r.check_in-today;
 insert into reservation_change_requests(reservation_id,requested_by,requested_check_in,requested_check_out,requested_room_type,requested_guests,requested_special_requests,reason,status,calculated_total,payment_difference,idempotency_key,execution_status)
 values(r.id,p_user_id,cin,cout,rtype,gcount,nullif(trim(p_special_requests),''),trim(p_reason),case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'executed'else'pending'end,new_total,diff,p_idempotency_key,case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'not_required'else'pending_review'end)returning id into cid;
 if days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then
  update reservations set check_in=cin,check_out=cout,room_type=rtype,guests=gcount,special_requests=coalesce(nullif(trim(p_special_requests),''),special_requests),total=new_total,room_id=null,room_number=null,nightly_rates=v_rates where id=r.id;
  update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id);update reservation_room_assignments set status='cancelled',released_at=now(),reason='Customer self-service reservation modification'where reservation_id=r.id and status='active';
 else
  insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
  values('reservation_modification','reservation_change_request',cid::text,r.id,'front_desk','normal',trim(p_reason),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'specialRequests',nullif(trim(p_special_requests),''),'calculatedTotal',new_total,'paymentDifference',diff),jsonb_build_object('requiresManagerApproval',true,'policyDays',coalesce((policy->>'selfServiceModificationDays')::int,3)),p_user_id)returning id into aid;
  update reservation_change_requests set manager_approval_id=aid where id=cid;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_request_reservation_change','reservation_change_request',cid::text,jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'total',r.total),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid));
 return jsonb_build_object('id',cid,'status',case when aid is null then'executed'else'pending'end,'executionStatus',case when aid is null then'not_required'else'pending_review'end,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid);end
$$;

-- front_desk_execute_manager_approval: reservation_modification reprices the ROOM
-- component via the resolver (per-night, requested type/dates) and keeps every
-- posted folio charge, freezing the new breakdown.
create or replace function public.front_desk_execute_manager_approval(
  p_approval_id uuid, p_room_id text, p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;available_same int;inventory int;reserved int;held int;v_new_out date;v_rates jsonb;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'FRONT_DESK_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into r from reservations where id=a.reservation_id for update;if not found or r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if a.request_type='room_upgrade'then
 if a.requested_action->'financials'is null then raise exception'APPROVAL_STALE';end if;
 if coalesce(a.requested_action->'financials'->>'responsibility','')='hotel'then
  select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);if available_same>0 then raise exception'APPROVAL_STALE';end if;
 end if;
 select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
 if not found or newroom.type<>(a.requested_action->>'requestedRoomType')or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'UPGRADE_ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
 select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=a.reason where id=assignment.id;end if;
 insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,a.reason,true,a.reviewed_by);
 update reservations set room_id=newroom.id,room_number=newroom.number,room_type=newroom.type where id=r.id;update rooms set status=case when r.status='checked_in'then'occupied'else'reserved'end where id=newroom.id;
 if coalesce(a.requested_action->'financials'->>'responsibility','')='guest'and coalesce((a.requested_action->'financials'->>'difference')::numeric,0)>0 then
  if a.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED';end if;
  select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
  insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Manager-approved room upgrade to '||newroom.type,'upgrade',round((a.requested_action->'financials'->>'difference')::numeric,2),p_staff_user_id,a.id,'manager_approval',a.id::text);update invoices set amount=round(amount+round((a.requested_action->'financials'->>'difference')::numeric,2),2)where id=i.id;perform sync_invoice_financials(i.id);
 end if;
 if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Manager-approved room-change turnover','high','pending','Before next arrival',a.reason);end if;
elsif a.request_type='reservation_modification'then
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;select * into t from room_types where name=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type)and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=t.name and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 if r.room_id is not null then select * into oldroom from rooms where id=r.room_id for update;end if;
 -- Reprice the ROOM component only: per-night resolver rates over the new window plus
 -- every posted folio charge (transport itemization, upgrade differences). The old
 -- code replaced invoices.amount with the bare reprice and silently dropped those charges.
 select round(coalesce(sum(rate),0),2),coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into new_total,v_rates from room_nightly_rates(t.name,(a.requested_action->>'checkIn')::date,(a.requested_action->>'checkOut')::date);
 new_total:=round(new_total+coalesce((select sum(amount)from folio_charges where reservation_id=r.id),0),2);
 select * into i from invoices where reservation_id=r.id for update;
 update reservations set check_in=(a.requested_action->>'checkIn')::date,check_out=(a.requested_action->>'checkOut')::date,room_type=t.name,total=new_total,room_id=null,room_number=null,nightly_rates=v_rates where id=r.id;
 update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id);
 update reservation_room_assignments set status='cancelled',released_at=now(),reason='Reservation modification requires reassignment'where reservation_id=r.id and status='active';if oldroom.id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=oldroom.id and status='reserved';end if;
elsif a.request_type='early_check_in'then
 -- Approve through the REQUESTED arrival time on the check-in date (policy-snapshot
 -- timezone), not a blanket 8h from execution. Legacy/unparseable requests, and
 -- requests whose time already passed at execution, keep the old window.
 if coalesce(a.requested_action->>'requestedTime','')~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' and ((r.check_in::text||' '||(a.requested_action->>'requestedTime'))::timestamp at time zone coalesce((coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot())->>'hotelTimezone'),'Asia/Manila'))>now() then
  update reservations set early_check_in_approved_until=((r.check_in::text||' '||(a.requested_action->>'requestedTime'))::timestamp at time zone coalesce((coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot())->>'hotelTimezone'),'Asia/Manila'))where id=r.id;
 else
  update reservations set early_check_in_approved_until=now()+interval'8 hours'where id=r.id;
 end if;
elsif a.request_type='late_checkout'then if r.status<>'checked_in'or exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'APPROVAL_STALE';end if;update reservations set late_checkout_until=(a.requested_action->>'requestedUntil')::timestamptz where id=r.id;
elsif a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'APPROVAL_STALE';end if;select * into oldroom from rooms where id=r.room_id for update;update reservations set status='checked_out',checked_out_at=now()where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=r.room_id;update reservation_room_assignments set status='released',released_at=now(),reason='Manager-approved checkout exception; balance remains collectible'where reservation_id=r.id and status='active';if not exists(select 1 from housekeeping_tasks where room_id=r.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(r.room_id,oldroom.number,'Checkout turnover','high','pending','Before next arrival','Checkout exception executed; folio balance retained: '||(a.requested_action->>'arrangement'));end if;
elsif a.request_type='stay_extension'then
 if r.status<>'checked_in'or a.requested_action->'stayExtension'is null then raise exception'APPROVAL_STALE';end if;
 v_new_out:=(a.requested_action->'stayExtension'->>'requestedCheckOut')::date;
 if v_new_out<=r.check_out then raise exception'APPROVAL_STALE';end if;
 if nullif(trim(coalesce(p_room_id,'')),'')is not null then
  select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
  if not found or newroom.type<>r.room_type or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'EXTENSION_ROOM_NOT_READY';end if;
  if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<v_new_out and check_out>r.check_in)then raise exception'EXTENSION_ROOM_UNAVAILABLE';end if;
  select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Stay-extension room move: '||a.reason where id=assignment.id;end if;
  insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,v_new_out,p_staff_user_id,'Stay-extension room move: '||a.reason,false,a.reviewed_by);
  update reservations set room_id=newroom.id,room_number=newroom.number where id=r.id;update rooms set status='occupied'where id=newroom.id;
  if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Stay-extension room-move turnover','high','pending','Before next arrival',a.reason);end if;
 end if;
 -- The ONE extension implementation: charge, dates, assignment, and audit, with every
 -- guard re-running atomically (idempotency key = approval id).
 perform public.front_desk_extend_stay(r.id,v_new_out,a.reason,a.id,p_staff_user_id);
else raise exception'APPROVAL_REQUIRES_OTHER_DEPARTMENT';end if;
update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_approval','manager_approval',a.id::text,jsonb_build_object('requestType',a.request_type,'reservationId',r.id,'roomId',p_room_id,'financials',a.requested_action->'financials','stayExtension',a.requested_action->'stayExtension'));
return jsonb_build_object('status','executed','requestType',a.request_type,'reservationId',r.id);end
$$;

-- request_manager_approval: the financial snapshots the Manager reviews are stamped
-- from the resolver (per-night) for both room-type exceptions and stay extensions.
create or replace function public.request_manager_approval(
  p_request_type text, p_related_entity_type text, p_related_entity_id text, p_reservation_id text,
  p_guest_request_id uuid, p_department text, p_severity text, p_reason text,
  p_requested_action jsonb, p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;v_target text;v_type room_types%rowtype;v_new_out date;v_added numeric;v_conflict boolean;v_nightly jsonb;v_rate numeric;v_target_total numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation','stay_extension')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
if p_severity not in('normal','high','critical')then raise exception'INVALID_SEVERITY';end if;
if p_request_type<>'guest_escalation'and p_reservation_id is null then raise exception'RESERVATION_REQUIRED';end if;
if p_reservation_id is not null then select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
 normal_result:=jsonb_build_object('reservationStatus',r.status,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,'policySnapshot',policy);end if;
if p_request_type='guest_escalation'then select * into g from guest_requests where id=p_guest_request_id for update;if not found or g.status='completed'then raise exception'GUEST_REQUEST_NOT_ESCALATABLE';end if;
 update guest_requests set severity=p_severity,escalation_status='escalated',escalated_by=p_staff_user_id,escalated_at=now()where id=g.id;end if;
if p_request_type='refund_exception'then
 if r.status not in('cancelled','no_show')then raise exception'REFUND_EXCEPTION_REQUIRES_CLOSURE';end if;
 select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(max(eligible_amount),0)into normal_refund from refund_requests where reservation_id=r.id and exception_approval_id is null;
 normal_result:=normal_result||jsonb_build_object('settledDeposit',deposit_paid,'normalPolicyRefund',normal_refund);
end if;
if p_request_type='room_type_exception'then
 if nullif(p_requested_action->>'roomType','')is null then raise exception'ROOM_TYPE_EXCEPTION_TYPE_REQUIRED';end if;
 if(p_requested_action->>'roomType')=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=(p_requested_action->>'roomType')and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
end if;
if p_request_type in('room_type_exception','room_upgrade')then
 -- Financial responsibility derives from the reason code only. Strip any caller-supplied
 -- financial field, validate the code, then stamp the server-computed snapshot that the
 -- Manager reviews and that approval/execution consume verbatim.
 p_requested_action:=p_requested_action-'financials'-'priceDifference'-'waived'-'guest_charge'-'hotel_absorbed_amount'-'financial_responsibility';
 if nullif(p_requested_action->>'reasonCode','')is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_REQUIRED';end if;
 if public.room_type_change_responsibility(p_requested_action->>'reasonCode')is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_INVALID';end if;
 if(p_requested_action->>'reasonCode')='hotel_early_checkin_failure'and r.early_check_in_approved_until is null then raise exception'ROOM_TYPE_EXCEPTION_EARLY_CHECKIN_PRECONDITION';end if;
 v_target:=coalesce(nullif(p_requested_action->>'roomType',''),nullif(p_requested_action->>'requestedRoomType',''));
 select * into v_type from room_types where name=v_target and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 select round(coalesce(sum(rate),0),2),case when count(distinct rate)=1 then min(rate)else null end,coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into v_target_total,v_rate,v_nightly from room_nightly_rates(v_type.name,r.check_in,r.check_out);
 p_requested_action:=p_requested_action||jsonb_build_object('financials',jsonb_build_object('reasonCode',p_requested_action->>'reasonCode','responsibility',public.room_type_change_responsibility(p_requested_action->>'reasonCode'),'originalTotal',r.total,'targetRate',v_rate,'nights',(r.check_out-r.check_in),'targetTotal',v_target_total,'nightlyRates',v_nightly,'difference',round(v_target_total-r.total,2)));
end if;
if p_request_type='stay_extension'then
 -- In-house only, later checkout required; every derived figure is server-stamped.
 p_requested_action:=p_requested_action-'stayExtension';
 if r.status<>'checked_in'then raise exception'STAY_EXTENSION_REQUIRES_IN_HOUSE';end if;
 if nullif(p_requested_action->>'requestedCheckOut','')is null or(p_requested_action->>'requestedCheckOut')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out then raise exception'STAY_EXTENSION_INVALID_DATE';end if;
 v_new_out:=(p_requested_action->>'requestedCheckOut')::date;
 select * into v_type from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select round(coalesce(sum(rate),0),2),case when count(distinct rate)=1 then min(rate)else null end,coalesce(jsonb_agg(jsonb_build_object('date',night,'rate',rate)order by night),'[]'::jsonb)into v_added,v_rate,v_nightly from room_nightly_rates(r.room_type,r.check_out,v_new_out);
 select exists(select 1 from reservation_room_assignments where room_id=r.room_id and reservation_id<>r.id and status='active'and check_in<v_new_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=r.room_id and status in('confirmed','checked_in')and check_in<v_new_out and check_out>r.check_out)into v_conflict;
 p_requested_action:=p_requested_action||jsonb_build_object('stayExtension',jsonb_build_object('currentCheckOut',r.check_out,'requestedCheckOut',v_new_out,'nights',(v_new_out-r.check_out),'rate',v_rate,'nightlyRates',v_nightly,'additionalAmount',v_added,'projectedTotal',round(r.total+v_added,2),'roomConflict',v_conflict,'roomNumber',r.room_number,'roomType',r.room_type));
end if;
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end
$$;

-- ---------------------------------------------------------------------------
-- 6. Service-role-only execution
-- ---------------------------------------------------------------------------
revoke all on function public.room_nightly_rates(text, date, date) from public, anon, authenticated;
grant execute on function public.room_nightly_rates(text, date, date) to service_role;
revoke all on function public.manager_propose_room_rate_plan(uuid, text, date, date, integer, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.manager_propose_room_rate_plan(uuid, text, date, date, integer, numeric, text, uuid) to service_role;
revoke all on function public.admin_review_room_rate_plan(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_review_room_rate_plan(uuid, text, text, uuid) to service_role;
revoke all on function public.manager_retire_room_rate_plan(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.manager_retire_room_rate_plan(uuid, text, uuid) to service_role;
revoke all on function public.create_booking_hold(uuid, text, date, date, integer, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_booking_hold(uuid, text, date, date, integer, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.submit_reservation_deposit(uuid, uuid, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.submit_reservation_deposit(uuid, uuid, text, text, text, text, text, integer) to service_role;
revoke all on function public.front_desk_create_reservation(text, text, text, text, date, date, integer, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.front_desk_create_reservation(text, text, text, text, date, date, integer, text, text, text, uuid, uuid) to service_role;
revoke all on function public.front_desk_extend_stay(text, date, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.front_desk_extend_stay(text, date, text, uuid, uuid) to service_role;
revoke all on function public.front_desk_extend_stay_preview(text, date, uuid) from public, anon, authenticated;
grant execute on function public.front_desk_extend_stay_preview(text, date, uuid) to service_role;
revoke all on function public.customer_request_reservation_change(uuid, text, date, date, text, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.customer_request_reservation_change(uuid, text, date, date, text, integer, text, text, uuid) to service_role;
revoke all on function public.front_desk_execute_manager_approval(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.front_desk_execute_manager_approval(uuid, text, uuid) to service_role;
revoke all on function public.request_manager_approval(text, text, text, text, uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.request_manager_approval(text, text, text, text, uuid, text, text, text, jsonb, uuid) to service_role;
