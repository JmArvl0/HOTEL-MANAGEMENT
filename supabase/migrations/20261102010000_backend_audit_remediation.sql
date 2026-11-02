-- Backend audit remediation, excluding B-005 (webhook envelopes).
-- Version assigned after the linked live ledger matched all 100 local versions.
-- Tested by scripts/backend-remediation-db-test.mjs against isolated PostgreSQL.
-- Live bodies compared 2026-11-02: all replaced RPC bodies match their latest
-- migration; room_is_sellable matches the live snapshot-only helper. The live
-- housekeeping_complete_task role restriction differs and is left untouched.

-- B-007: legacy display rate is absent when nights have different prices.
alter table public.booking_holds alter column nightly_rate drop not null;

-- B-008: migrate the helper previously present only in the snapshot.
create or replace function public.room_is_sellable(p_room_id text,p_check_in date,p_policy jsonb default null)
returns boolean language sql stable set search_path=public as $$
 select exists(select 1 from rooms r where r.id=p_room_id
  and coalesce(r.administratively_active,true) and r.status<>'maintenance'
  and (p_check_in>hotel_today(p_policy) or r.housekeeping='clean')
  and not maintenance_room_is_blocked(r.id))
$$;
revoke all on function public.room_is_sellable(text,date,jsonb) from public,anon,authenticated;
grant execute on function public.room_is_sellable(text,date,jsonb) to service_role;

-- B-001: null-safe actor and ownership authorization.
create or replace function public.cancel_reservation(p_reservation_id text,p_actor_user_id uuid,p_reason text)
returns table(reservation_status text,refund_request_id uuid,eligible_refund numeric,refund_basis_points integer)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;policy jsonb;tz text;today date;days_before int;full_days int;partial_days int;partial_bp int;deposit_paid numeric;basis int;eligible numeric;refund_id uuid;existing refund_requests%rowtype;begin
select role into actor from user_accounts where id=p_actor_user_id and active;select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
if actor='guest'and r.user_id is distinct from p_actor_user_id then raise exception'RESERVATION_OWNERSHIP_REQUIRED';end if;if actor is null or actor not in('guest','owner','admin','manager','front_desk')then raise exception'CANCELLATION_FORBIDDEN';end if;
select * into existing from refund_requests where reservation_id=r.id and status in('pending','processed')order by created_at desc limit 1;
if r.status='cancelled'then return query select r.status,existing.id,coalesce(existing.eligible_amount,0),coalesce(existing.refund_basis_points,0);return;end if;
if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CANCELLABLE';end if;if nullif(trim(p_reason),'')is null then raise exception'CANCELLATION_REASON_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');today:=(now()at time zone tz)::date;days_before:=r.check_in-today;
full_days:=coalesce((policy->>'cancellationFullRefundDays')::int,14);partial_days:=coalesce((policy->>'cancellationPartialRefundDays')::int,7);partial_bp:=coalesce((policy->>'cancellationPartialRefundBasisPoints')::int,5000);
select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
basis:=case when days_before>=full_days then 10000 when days_before>=partial_days then partial_bp else 0 end;eligible:=round(deposit_paid*basis/10000.0,2);
select * into i from invoices where reservation_id=r.id for update;update reservations set status='cancelled',payment_status=case when eligible>0 then payment_status else'failed'end,cancellation_reason=trim(p_reason)where id=r.id;
update invoices set balance=0,status=case when eligible>0 then'refund_pending'else'cancelled'end where id=i.id;
update payments set status='expired',notes=coalesce(notes,'Reservation cancelled before deposit verification') where reservation_id=r.id and purpose='reservation_deposit' and status='pending_verification';
if eligible>0 then insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount)values(r.id,i.id,p_actor_user_id,trim(p_reason),deposit_paid,basis,eligible)returning id into refund_id;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'cancel_reservation','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled','reason',p_reason,'eligibleRefund',eligible,'refundBasisPoints',basis));
return query select'cancelled'::text,refund_id,eligible,basis;end$$;

-- B-003: failure verdicts return normally so attempts and audit commit.
create or replace function public.auth_otp_verify(
  p_challenge_id uuid,
  p_code_verifier text,
  p_max_attempts integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge public.auth_otp_challenges%rowtype;
begin
  if p_challenge_id is null or nullif(trim(p_code_verifier), '') is null
    or p_max_attempts is null or p_max_attempts not in (3, 5, 10)
  then raise exception 'INVALID_OTP_VERIFY'; end if;

  select * into challenge from auth_otp_challenges where id = p_challenge_id for update;
  if not found then return jsonb_build_object('error','OTP_CHALLENGE_INVALID'); end if;
  if challenge.consumed_at is not null then return jsonb_build_object('error','OTP_ALREADY_USED'); end if;
  if challenge.invalidated_at is not null then return jsonb_build_object('error','OTP_INVALIDATED'); end if;
  if challenge.expires_at <= now() then
    insert into audit_logs (user_id, action, entity_type, entity_id)
      values (challenge.user_id, 'otp_challenge_expired', 'otp_challenge', challenge.id::text);
    return jsonb_build_object('error','OTP_EXPIRED');
  end if;
  if challenge.attempt_count >= p_max_attempts then
    update auth_otp_challenges set invalidated_at = now() where id = challenge.id;
    insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
      values (challenge.user_id, 'otp_verification_failed', 'otp_challenge', challenge.id::text,
              jsonb_build_object('reason', 'too_many_attempts'));
    return jsonb_build_object('error','OTP_TOO_MANY_ATTEMPTS');
  end if;

  if challenge.code_verifier <> trim(p_code_verifier) then
    update auth_otp_challenges
      set attempt_count = attempt_count + 1,
          invalidated_at = case when attempt_count + 1 >= p_max_attempts then now() else invalidated_at end
      where id = challenge.id;
    insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
      values (challenge.user_id, 'otp_verification_failed', 'otp_challenge', challenge.id::text,
              jsonb_build_object('reason', 'incorrect',
                                 'attemptsLeft', greatest(p_max_attempts - (challenge.attempt_count + 1), 0)));
    return jsonb_build_object('error','OTP_INCORRECT');
  end if;

  update auth_otp_challenges set consumed_at = now() where id = challenge.id;
  insert into audit_logs (user_id, action, entity_type, entity_id)
    values (challenge.user_id, 'otp_verification_succeeded', 'otp_challenge', challenge.id::text);

  return jsonb_build_object('userId', challenge.user_id);
end$$;

-- B-004/B-022: self-service cannot override suspension; proof is token-bound.
create or replace function public.complete_account_recovery(
  p_token_hash text,
  p_password_hash text,
  p_selfie_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare tok account_recovery_tokens%rowtype; account user_accounts%rowtype; begin
  select * into tok from account_recovery_tokens
    where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then raise exception 'RECOVERY_TOKEN_INVALID'; end if;
  select * into account from user_accounts where id=tok.user_id for update;
  if not found or (not account.active and (tok.created_by is null or not account.recovery_required or account.account_status='suspended')) then
    raise exception 'RECOVERY_ACCOUNT_INACTIVE';
  end if;
  if not exists(select 1 from password_reset_logs where token_id=tok.id and selfie_url=p_selfie_path) then
    raise exception 'SELFIE_REQUIRED';
  end if;
  if length(p_password_hash) < 50 then raise exception 'INVALID_PASSWORD_HASH'; end if;
  if nullif(trim(coalesce(p_selfie_path, '')), '') is null
    or p_selfie_path !~ '^recovery-selfies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  then raise exception 'SELFIE_REQUIRED'; end if;
  update account_recovery_tokens set used_at = now() where id = tok.id;
  update user_accounts set password_hash = p_password_hash, recovery_required = false,
    account_status = 'active', active = true, auth_version = auth_version + 1, updated_at = now()
    where id = tok.user_id;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (tok.user_id, 'account_recovery_completed', 'user_account', tok.user_id::text,
            jsonb_build_object('recoveryTokenId', tok.id, 'selfiePath', p_selfie_path));
  update public.password_reset_logs set status = 'completed', completed_at = now(), selfie_url = p_selfie_path
    where token_id = tok.id and status <> 'completed';
  return tok.user_id;
end$$;

-- B-006: use the real PostgreSQL text hash function.
create or replace function public.accounting_open_cash_shift(p_staff_user_id uuid,p_location text,p_opening_amount numeric)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
 if exists(select 1 from cash_shifts where status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$$;

-- B-011: the same authoritative rate resolver/snapshot as manual deposits.
create or replace function public.submit_gateway_deposit(
  p_token uuid, p_user_id uuid, p_gateway_ref text)
returns table(reservation_id text, confirmation_number text, reservation_status text,
  payment_status text, deposit_required numeric, remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare h booking_holds%rowtype;t room_types%rowtype;inventory int;reserved int;
  guest text;rid text;iid text;confirmation text;
begin
  perform expire_booking_holds();
  select * into h from booking_holds where token = p_token and user_id = p_user_id for update;
  if not found then raise exception 'HOLD_NOT_FOUND'; end if;
  if h.reservation_id is not null then
    return query select r.id, r.confirmation_number, r.status, r.payment_status,
      r.deposit_required, greatest(r.total - coalesce(i.paid,0),0)
      from reservations r left join invoices i on i.reservation_id = r.id
      where r.id = h.reservation_id;
    return;
  end if;
  if h.status <> 'active' or h.expires_at <= now() then raise exception 'HOLD_EXPIRED'; end if;
  if nullif(trim(coalesce(p_gateway_ref,'')),'') is null then raise exception 'INVALID_GATEWAY_PAYLOAD'; end if;
  if h.deposit_required <= 0 then raise exception 'INVALID_DEPOSIT_AMOUNT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));
  select * into t from room_types where name = h.room_type and active;
  if not found then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;
  if round((select coalesce(sum(rate),0) from room_nightly_rates(h.room_type,h.check_in,h.check_out)),2) <> round(h.subtotal,2) then raise exception 'RATE_CHANGED'; end if;
  select count(*) into inventory from rooms r
    where r.type = h.room_type and room_is_sellable(r.id, h.check_in, h.operational_policy_snapshot);
  select count(*) into reserved from reservations r
    where r.room_type = h.room_type
    and (r.status in ('confirmed','checked_in')
      or (r.status = 'pending' and (lower(coalesce(r.source,'')) <> 'website'
        or r.payment_due_at is null or r.payment_due_at > now())))
    and r.check_in < h.check_out and r.check_out > h.check_in;
  if inventory - reserved <= 0 then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;
  select g.id into guest from guests g
    where g.user_account_id = p_user_id or lower(g.email) = lower(h.email)
    order by (g.user_account_id = p_user_id) desc limit 1 for update;
  if guest is null then
    insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)
    values (trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,
      p_user_id,h.address,h.nationality,h.special_requests) returning id into guest;
  else
    update guests set user_account_id = coalesce(user_account_id,p_user_id),
      name = trim(h.first_name||' '||h.last_name), first_name = h.first_name,
      last_name = h.last_name, phone = h.mobile,
      address = coalesce(h.address,address), nationality = coalesce(h.nationality,nationality),
      special_requests = coalesce(h.special_requests,special_requests) where id = guest;
  end if;
  confirmation := 'HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,
    guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,
    operational_policy_snapshot,special_requests,request_options,transport_lines,
    transportation_preferences,expected_arrival,payment_status,payment_method,
    payment_due_at,confirmation_number,idempotency_key,nightly_rates)
  values (guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,
    h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,
    h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,
    h.transport_lines,h.transportation_preferences,h.expected_arrival,'unpaid','gateway_paymongo',
    null,confirmation,p_token,h.nightly_rates) returning id into rid;
  insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)
  values (rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid','gateway_paymongo',h.check_in)
  returning id into iid;
  insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,
    idempotency_key,payment_gateway,gateway_reference_id)
  values (iid,rid,h.deposit_required,'PHP','gateway_paymongo',trim(p_gateway_ref),
    'reservation_deposit','pending_verification',p_token,'paymongo',trim(p_gateway_ref));
  update booking_holds set status = 'payment_submitted', reservation_id = rid,
    guarantee_method = null, submitted_at = now() where token = p_token;
  return query select rid, confirmation, 'pending'::text, 'unpaid'::text,
    h.deposit_required, h.total - h.deposit_required;
end$$;

-- B-012: settlement counts the authoritative sellable inventory.
create or replace function public.confirm_gateway_payment(
  p_payment_id uuid, p_gateway_ref text, p_webhook_id text)
returns table(reservation_id text, reservation_status text, payment_status text,
  deposit_paid numeric, remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;
  paid_total numeric(12,2);inventory int;reserved int;
begin
  if nullif(trim(coalesce(p_gateway_ref,'')),'') is null
    or nullif(trim(coalesce(p_webhook_id,'')),'') is null then
    raise exception 'INVALID_GATEWAY_PAYLOAD';
  end if;
  -- Replay: the same webhook event returns existing state (provider retries OK).
  select * into p from payments where webhook_event_id = p_webhook_id;
  if found then
    select * into r from reservations where id = p.reservation_id;
    select * into i from invoices where id = p.invoice_id;
    return query select r.id, r.status, p.status, coalesce(r.deposit,0),
      greatest(coalesce(i.balance,0),0);
    return;
  end if;
  perform expire_booking_holds();
  select * into p from payments where id = p_payment_id for update;
  if not found or p.purpose <> 'reservation_deposit' then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status = 'paid' then
    if p.gateway_reference_id is not null and p.gateway_reference_id = p_gateway_ref then
      -- Already settled by this same gateway reference under a different event
      -- id (concurrent multi-channel delivery): idempotent return so the
      -- provider stops retrying — never double-confirm the same money.
      select * into r from reservations where id = p.reservation_id;
      select * into i from invoices where id = p.invoice_id;
      return query select r.id, r.status, p.status, coalesce(r.deposit,0),
        greatest(coalesce(i.balance,0),0);
      return;
    end if;
    raise exception 'GATEWAY_REFERENCE_CONFLICT';
  end if;
  if p.status <> 'pending_verification' then raise exception 'PAYMENT_NOT_PENDING'; end if;
  if p.gateway_reference_id is not null and p.gateway_reference_id <> p_gateway_ref then
    raise exception 'GATEWAY_REFERENCE_CONFLICT';
  end if;
  select * into r from reservations where id = p.reservation_id for update;
  select * into i from invoices where id = p.invoice_id for update;
  select bh.* into h from booking_holds bh where bh.reservation_id = r.id for update;
  if h.status <> 'payment_submitted' or r.status <> 'pending' then raise exception 'HOLD_EXPIRED'; end if;
  if round(p.amount,2) <> round(r.deposit_required,2)
    or round(i.amount,2) <> round(r.total,2) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(r.room_type),0));
  select count(*) into inventory from rooms x
    where x.type = r.room_type and room_is_sellable(x.id,r.check_in,r.operational_policy_snapshot);
  select count(*) into reserved from reservations x
    where x.id <> r.id and x.room_type = r.room_type
    and (x.status in ('confirmed','checked_in')
      or (x.status = 'pending' and (lower(coalesce(x.source,'')) <> 'website'
        or x.payment_due_at is null or x.payment_due_at > now())))
    and x.check_in < r.check_out and x.check_out > r.check_in;
  if inventory - reserved <= 0 then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;
  update payments set status = 'paid', verified_at = now(),
    gateway_reference_id = p_gateway_ref, webhook_event_id = p_webhook_id where id = p.id;
  select coalesce(sum(amount),0) into paid_total from payments
    where invoice_id = i.id and status = 'paid' and purpose <> 'refund';
  update invoices set paid = least(paid_total,amount), balance = greatest(amount-paid_total,0),
    status = case when paid_total >= amount then 'paid' else 'partial' end where id = i.id;
  update reservations set status = 'confirmed', deposit = p.amount,
    payment_status = case when paid_total >= total then 'paid' else 'partial' end where id = r.id;
  update booking_holds set status = 'completed' where token = h.token;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values (r.user_id,'confirm_gateway_payment','payment',p.id::text,
    jsonb_build_object('reservationId',r.id,'amount',p.amount,'gatewayRef',p_gateway_ref));
  -- Same transport itemization as verify_reservation_deposit (itemize only).
  if jsonb_typeof(coalesce(r.transport_lines,'[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(r.transport_lines,'[]'::jsonb)) > 0 then
    insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,status)
    select i.id, r.id, trim(e.value->>'name'), 'transport',
      round((e.value->>'price')::numeric,2), r.user_id,
      md5(r.id||'|transport|'||lower(trim(e.value->>'name')))::uuid, 'transport', 'posted'
    from jsonb_array_elements(coalesce(r.transport_lines,'[]'::jsonb)) e
    where nullif(trim(e.value->>'name'),'') is not null
      and coalesce((e.value->>'price')::numeric,0) > 0
    on conflict do nothing;
    perform public.sync_invoice_financials(i.id);
  end if;
  return query select r.id, 'confirmed'::text,
    case when paid_total >= r.total then 'paid'::text else 'partial'::text end,
    p.amount, greatest(i.amount - paid_total,0);
end$$;

-- B-012: execution cannot bypass inactive/serviceability checks.
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;early_approved boolean;type_mismatch boolean;appr manager_approval_requests%rowtype;t room_types%rowtype;new_total numeric;diff numeric;early_blocked boolean;eta_time time;eta_ok boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;perform expire_booking_holds();
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;if r.guest_id is null or nullif(trim(r.guest_name),'')is null then raise exception'GUEST_DETAILS_REQUIRED';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid','credit'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_now:=now()at time zone tz;early_approved:=coalesce(r.early_check_in_approved_until>now(),false);eta_time:=case when coalesce(trim(r.expected_arrival),'')~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then trim(r.expected_arrival)::time else null end;eta_ok:=eta_time is not null and local_now::date=r.check_in and local_now::time>=eta_time;early_blocked:=local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time))and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false)and not early_approved;
if local_now::date<r.check_in or local_now::date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;if early_blocked and not eta_ok then raise exception'EARLY_CHECKIN_NOT_ALLOWED';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found then raise exception'ROOM_TYPE_MISMATCH';end if;if not coalesce(room.administratively_active,true)then raise exception'ROOM_INACTIVE';end if;type_mismatch:=(room.type<>r.room_type);if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if maintenance_room_is_blocked(room.id)then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
if type_mismatch then
 select * into appr from manager_approval_requests where reservation_id=r.id and request_type='room_type_exception' and status='approved' and execution_status='awaiting_execution' and requested_action->>'roomType'=room.type order by requested_at desc limit 1;
 if appr.id is null then raise exception'ROOM_TYPE_MISMATCH';end if;
 if appr.requested_action->'financials'is null then raise exception'APPROVAL_STALE';end if;
 select * into t from room_types where name=room.type and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 -- The request-time snapshot governs (historically reproducible even if base rates later
 -- change); only the night count is re-derived so a date change cannot silently
 -- invalidate the approved numbers.
 if coalesce((appr.requested_action->'financials'->>'nights')::int,0)<>(r.check_out-r.check_in)then raise exception'APPROVAL_STALE';end if;
 diff:=round(coalesce((appr.requested_action->'financials'->>'difference')::numeric,0),2);
 if coalesce(appr.requested_action->'financials'->>'responsibility','')='guest'and diff>0 then
  if appr.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED';end if;
  new_total:=round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0),2);
 else
  new_total:=r.total;
 end if;
end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,room_type=room.type,status='checked_in',checked_in_at=coalesce(checked_in_at,now()),total=case when appr.id is null then r.total else new_total end where id=r.id;update rooms set status='occupied'where id=room.id;
if appr.id is not null then
 update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=appr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_room_type_exception','manager_approval',appr.id::text,jsonb_build_object('reservationId',r.id,'previousRoomType',r.room_type,'roomType',room.type,'room',room.number,'newTotal',new_total,'reasonCode',appr.requested_action->'financials'->>'reasonCode','responsibility',appr.requested_action->'financials'->>'responsibility','hotelAbsorbedAmount',case when coalesce(appr.requested_action->'financials'->>'responsibility','')='hotel'then round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0)-coalesce((appr.requested_action->'financials'->>'originalTotal')::numeric,0),2)else 0 end,'guestPaidDifference',case when coalesce(appr.requested_action->'financials'->>'responsibility','')='guest'then diff else 0 end));
end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number,'managerEarlyApproval',early_approved,'earlyCheckInViaEta',early_blocked and eta_ok));end$$;

create or replace function public.front_desk_assign_room(p_reservation_id text,p_room_id text,p_reason text,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;old reservation_room_assignments%rowtype;aid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'ROOM_ASSIGNMENT_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_ASSIGNABLE';end if;select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;
if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;
-- A retired room is never assignable, no matter how clean it looks (matches
-- front_desk_room_is_eligible and every availability count).
if not coalesce(room.administratively_active,true)then raise exception'ROOM_INACTIVE';end if;
if maintenance_room_is_blocked(room.id)then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into old from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and old.room_id=room.id then return old.id;elsif found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=coalesce(nullif(trim(p_reason),''),'Pre-arrival reassignment')where id=old.id;end if;
insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,nullif(trim(p_reason),''))returning id into aid;update reservations set room_id=room.id,room_number=room.number where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'assign_room','reservation',r.id,jsonb_build_object('roomId',old.room_id),jsonb_build_object('roomId',room.id,'roomNumber',room.number,'reason',p_reason));return aid;end$$;

-- B-012/B-023: express check-in shares live room/approval validity.
create or replace function public.express_qr_self_check_in(p_qr_token_hash text, p_user_id uuid)
returns table(reservation_id text, room_number text, room_floor text, digital_key text)
language plpgsql security definer set search_path=public as $$
declare actor text; tok qr_tokens%rowtype; r reservations%rowtype;
  room rooms%rowtype; i invoices%rowtype; policy jsonb; tz text;
  local_now timestamp; key_plain text;
begin
  select role into actor from user_accounts where id = p_user_id and active;
  if actor is null or actor <> 'guest' then raise exception 'SELF_CHECKIN_FORBIDDEN'; end if;
  if nullif(trim(coalesce(p_qr_token_hash,'')),'') is null
    or length(p_qr_token_hash) <> 64 then raise exception 'SELF_CHECKIN_INVALID_QR'; end if;
  select * into tok from qr_tokens
    where token_hash = p_qr_token_hash and resource_type = 'reservation'
      and revoked_at is null;
  if not found then raise exception 'SELF_CHECKIN_INVALID_QR'; end if;
  select * into r from reservations where id = tok.resource_id for update;
  if not found or r.user_id is distinct from p_user_id then raise exception 'SELF_CHECKIN_FORBIDDEN'; end if;
  if r.status <> 'confirmed' then raise exception 'SELF_CHECKIN_NOT_CONFIRMED'; end if;
  if r.identity_status <> 'verified' then raise exception 'SELF_CHECKIN_ID_UNVERIFIED'; end if;
  select inv.* into i from invoices inv where inv.reservation_id = r.id for update;
  if not found then raise exception 'FOLIO_NOT_FOUND'; end if;
  if coalesce(i.balance,0) > 0 then raise exception 'SELF_CHECKIN_BALANCE_DUE'; end if;
  policy := coalesce(r.operational_policy_snapshot, current_operational_policy_snapshot());
  tz := coalesce(policy->>'hotelTimezone','Asia/Manila');
  local_now := now() at time zone tz;
  if local_now::date < r.check_in or local_now::date >= r.check_out then
    raise exception 'SELF_CHECKIN_OUTSIDE_WINDOW';
  end if;
  if local_now < (r.check_in + coalesce((policy->>'checkInTime')::time,'15:00'::time))
    and not coalesce(r.early_check_in_approved_until > now(),false)
    and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false) then
    raise exception 'SELF_CHECKIN_TOO_EARLY';
  end if;
  if r.room_id is null then raise exception 'SELF_CHECKIN_NO_ROOM'; end if;
  select * into room from rooms where id = r.room_id for update;
  if not found or not coalesce(room.administratively_active,true) or room.status <> 'available' or room.housekeeping <> 'clean' then
    raise exception 'SELF_CHECKIN_ROOM_NOT_READY';
  end if;
  if maintenance_room_is_blocked(room.id) then
    raise exception 'SELF_CHECKIN_ROOM_NOT_READY';
  end if;
  key_plain := encode(gen_random_bytes(24),'hex');
  update reservations set status = 'checked_in',
    checked_in_at = coalesce(checked_in_at, now()),
    digital_key_hash = encode(digest(key_plain,'sha256'),'hex')
    where id = r.id;
  update rooms set status = 'occupied' where id = room.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values (p_user_id,'express_self_check_in','reservation',r.id,
    jsonb_build_object('status','confirmed','room',room.number),
    jsonb_build_object('status','checked_in','room',room.number));
  insert into qr_scan_events(qr_token_id,scanner_user_id,scanner_role,resource_type,resource_id,action,result)
  values (tok.id,p_user_id,'guest','reservation',r.id,'express_check_in','authorized');
  return query select r.id, room.number, room.floor::text, key_plain;
end$$;

-- B-014: evaluate the already-updated spend exactly once.
create or replace function public.award_stay_loyalty_points(p_reservation_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype; g guests%rowtype; mult numeric; earned integer; new_tier text;
begin
  select * into r from reservations where id=p_reservation_id for update;
  if not found or r.status <> 'checked_out' then raise exception 'LOYALTY_STAY_NOT_COMPLETED'; end if;
  if r.guest_id is null then raise exception 'LOYALTY_NO_GUEST'; end if;
  if exists (select 1 from guest_loyalty_ledger where reservation_id=r.id and transaction_type='earned') then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;
  select * into g from guests where id=r.guest_id for update;
  if not found then raise exception 'LOYALTY_NO_GUEST'; end if;
  mult := case g.loyalty_tier when 'gold' then 1.25 when 'platinum' then 1.5 else 1 end;
  earned := floor(coalesce(r.total,0) / 100 * mult);
  if earned <= 0 then return jsonb_build_object('awarded', false, 'reason', 'no_spend'); end if;
  insert into guest_loyalty_ledger(guest_id,reservation_id,points,transaction_type,notes)
    values(g.id,r.id,earned,'earned','Stay '||r.id||' x'||mult);
  update guests set loyalty_points=coalesce(loyalty_points,0)+earned, lifetime_spend=round(coalesce(lifetime_spend,0)+coalesce(r.total,0),2) where id=g.id;
  select case when coalesce(lifetime_spend,0) >= 50000 then 'platinum'
    when coalesce(lifetime_spend,0) >= 20000 then 'gold' else 'silver' end
    into new_tier from guests where id=g.id;
  -- Never downgrade: tier only moves up.
  update guests set loyalty_tier=new_tier where id=g.id and
    (case loyalty_tier when 'silver' then 0 when 'gold' then 1 else 2 end) < (case new_tier when 'silver' then 0 when 'gold' then 1 else 2 end);
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(null,'loyalty_points_awarded','guest',g.id,jsonb_build_object('reservationId',r.id,'points',earned,'tier',new_tier));
  return jsonb_build_object('awarded', true, 'points', earned, 'tier', new_tier);
end$$;

-- B-013/B-015: pending deposit prices stay fixed; points equal granted credit.
create or replace function public.redeem_loyalty_points(p_guest_id text, p_points integer, p_reservation_id text, p_user_id uuid, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; g guests%rowtype; r reservations%rowtype; i invoices%rowtype; v_amount numeric; v_aid uuid;
begin
  select role into actor from user_accounts where id=p_user_id and active;
  if actor is null or actor <> 'guest' then raise exception 'LOYALTY_REDEEM_FORBIDDEN'; end if;
  if p_points is null or p_points <= 0 then raise exception 'LOYALTY_INVALID_POINTS'; end if;
  if exists (select 1 from financial_adjustments where idempotency_key=p_idempotency_key) then raise exception 'LOYALTY_ALREADY_REDEEMED'; end if;
  select * into g from guests where id=p_guest_id for update;
  if not found then raise exception 'LOYALTY_NO_GUEST'; end if;
  if g.user_account_id is distinct from p_user_id then raise exception 'LOYALTY_NOT_YOUR_POINTS'; end if;
  if coalesce(g.loyalty_points,0) < p_points then raise exception 'LOYALTY_INSUFFICIENT_POINTS'; end if;
  select * into r from reservations where id=p_reservation_id for update;
  if not found or r.guest_id is distinct from p_guest_id then raise exception 'LOYALTY_RESERVATION_MISMATCH'; end if;
  if r.status not in ('confirmed','checked_in') then raise exception 'LOYALTY_FOLIO_CLOSED'; end if;
  select * into i from invoices where reservation_id=r.id for update;
  if not found or i.status = 'cancelled' then raise exception 'LOYALTY_FOLIO_CLOSED'; end if;
  if i.balance<=0 then raise exception 'LOYALTY_NOTHING_TO_DISCOUNT'; end if;
  if p_points::numeric>round(i.balance,2) then raise exception 'LOYALTY_EXCEEDS_BALANCE'; end if;
  v_amount := p_points::numeric;
  if v_amount <= 0 then raise exception 'LOYALTY_NOTHING_TO_DISCOUNT'; end if;
  update guests set loyalty_points=loyalty_points-p_points where id=g.id;
  insert into guest_loyalty_ledger(guest_id,reservation_id,points,transaction_type,notes,created_by)
    values(g.id,r.id,-p_points,'redeemed','Redeemed '||p_points||' pts = PHP '||v_amount||' folio credit',p_user_id);
  insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,created_by,idempotency_key)
    values(i.id,r.id,'credit','credit',v_amount,'Loyalty redemption: '||p_points||' pts',p_user_id,p_idempotency_key) returning id into v_aid;
  update invoices set amount=greatest(round(i.amount-v_amount,2),0) where id=i.id;
  select * into i from sync_invoice_financials(i.id);
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(p_user_id,'loyalty_points_redeemed','guest',g.id,jsonb_build_object('reservationId',r.id,'points',p_points,'creditAmount',v_amount,'adjustmentId',v_aid));
  return jsonb_build_object('pointsRedeemed',p_points,'creditAmount',v_amount,'folioBalance',i.balance,'remainingPoints',g.loyalty_points-p_points);
end$$;

-- B-010/B-017: finalized proof namespace and transactional method gate.
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
 if not exists(select 1 from hotel_operational_policies where key='default' and deposit_method='manual')then raise exception'DEPOSIT_METHOD_UNAVAILABLE';end if;
 if p_proof_storage_path !~ ('^submitted/'||p_token::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception'PROOF_REQUIRED';end if;
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

revoke all on function public.cancel_reservation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_reservation(text,uuid,text) to service_role;
revoke all on function public.auth_otp_verify(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.auth_otp_verify(uuid,text,integer) to service_role;
revoke all on function public.complete_account_recovery(text,text,text) from public,anon,authenticated;
grant execute on function public.complete_account_recovery(text,text,text) to service_role;
revoke all on function public.accounting_open_cash_shift(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.accounting_open_cash_shift(uuid,text,numeric) to service_role;
revoke all on function public.submit_gateway_deposit(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_gateway_deposit(uuid,uuid,text) to service_role;
revoke all on function public.confirm_gateway_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.confirm_gateway_payment(uuid,text,text) to service_role;
revoke all on function public.front_desk_check_in(text,text,uuid) from public,anon,authenticated;
grant execute on function public.front_desk_check_in(text,text,uuid) to service_role;
revoke all on function public.front_desk_assign_room(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.front_desk_assign_room(text,text,text,uuid) to service_role;
revoke all on function public.express_qr_self_check_in(text,uuid) from public,anon,authenticated;
grant execute on function public.express_qr_self_check_in(text,uuid) to service_role;
revoke all on function public.award_stay_loyalty_points(text) from public,anon,authenticated;
grant execute on function public.award_stay_loyalty_points(text) to service_role;
revoke all on function public.redeem_loyalty_points(text,integer,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.redeem_loyalty_points(text,integer,text,uuid,uuid) to service_role;
revoke all on function public.submit_reservation_deposit(uuid,uuid,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.submit_reservation_deposit(uuid,uuid,text,text,text,text,text,integer) to service_role;

-- B-016: every fulfillment path updates guest_requests; stock and its movement
-- commit with that transition. The request row lock serializes retries, and the
-- conditional decrement serializes different requests for the same inventory.
create or replace function public.consume_fulfilled_request_stock()
returns trigger language plpgsql security definer set search_path=public as $$
declare item_id text; qty numeric; worker uuid;
begin
 if new.status<>'completed' or old.status='completed' then return new;end if;
 if exists(select 1 from inventory_movements m where m.source_type='guest_request'
   and m.source_id=new.id::text and m.direction='consumption') then return new;end if;
 item_id:=new.inventory_item_id;qty:=1;
 if item_id is null then
   qty:=case new.request_type when 'extra_towels' then 2 when 'extra_pillows' then 1 when 'toiletries' then 1 else null end;
   if qty is null then return new;end if;
   select i.id into item_id from inventory i where
    case new.request_type when 'extra_towels' then i.name~*'towel'
     when 'extra_pillows' then i.name~*'pillow' else i.name~*'toiletr|shampoo|soap|amenit' end
    order by i.id limit 1;
   if item_id is null then return new;end if;
 end if;
 update inventory set quantity=quantity-qty,updated_at=now() where id=item_id and quantity>=qty;
 if not found then raise exception 'INVENTORY_INSUFFICIENT_STOCK';end if;
 worker:=coalesce(new.completed_by,(select t.completed_by from housekeeping_tasks t
   where t.guest_request_id=new.id and t.status='completed' order by t.completed_at desc limit 1));
 insert into inventory_movements(item_id,quantity,direction,source_type,source_id,recorded_by,note)
 values(item_id,qty,'consumption','guest_request',new.id::text,worker,'Consumed fulfilling guest request');
 return new;
end$$;
drop trigger if exists fulfilled_request_stock on public.guest_requests;
create trigger fulfilled_request_stock after update of status on public.guest_requests
 for each row execute function public.consume_fulfilled_request_stock();
revoke all on function public.consume_fulfilled_request_stock() from public,anon,authenticated;
grant execute on function public.consume_fulfilled_request_stock() to service_role;

create or replace function public.adjust_inventory_stock(p_item_id text,p_quantity numeric,p_status text,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;i inventory%rowtype;delta numeric;
begin
 select role into actor from user_accounts where id=p_actor_user_id and active and not recovery_required;
 if actor is null or actor not in('housekeeping','maintenance')then raise exception'INVENTORY_ADJUST_FORBIDDEN';end if;
 if (p_quantity is not null and (p_quantity<0 or p_quantity>10000000))
   or (p_status is not null and p_status not in('healthy','low','out'))then raise exception'INVALID_INVENTORY_ADJUSTMENT';end if;
 select * into i from inventory where id=p_item_id for update;
 if not found then raise exception'INVENTORY_ITEM_NOT_FOUND';end if;
 delta:=round(coalesce(p_quantity,i.quantity)-i.quantity,2);
 update inventory set quantity=coalesce(p_quantity,i.quantity),status=coalesce(p_status,i.status),updated_at=now()
 where id=i.id returning * into i;
 if delta<>0 then
  insert into inventory_movements(item_id,quantity,direction,recorded_by,note)
  values(i.id,abs(delta),case when delta>0 then 'restock' else 'adjustment' end,p_actor_user_id,'Staff stock count adjustment');
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
 values(p_actor_user_id,'adjust_inventory_stock','inventory',i.id,jsonb_build_object('delta',delta,'quantity',i.quantity,'status',i.status));
 return to_jsonb(i);
end$$;
revoke all on function public.adjust_inventory_stock(text,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.adjust_inventory_stock(text,numeric,text,uuid) to service_role;

-- B-021: one serialized claim and one transaction for every model's predictions.
-- An exception rolls back all partial snapshots; only a failed attempt remains.
create or replace function public.persist_analytics_generation(p_models jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare model jsonb; prediction jsonb;run_id uuid;failure_code text;
begin
 if jsonb_typeof(p_models) is distinct from 'array' or jsonb_array_length(p_models) not between 1 and 4 then
  raise exception'INVALID_ANALYTICS_GENERATION';end if;
 perform pg_advisory_xact_lock(hashtextextended('analytics_generation',0));
 if exists(select 1 from analytics_model_runs where status='completed' and generated_at>now()-interval'1 hour')then
  raise exception'ANALYTICS_COOLDOWN';end if;
 begin
  for model in select value from jsonb_array_elements(p_models) loop
   if model->>'modelType' not in('occupancy','housekeeping','inventory','maintenance_risk')
    or nullif(model->>'modelVersion','') is null
    or jsonb_typeof(model->'predictions') is distinct from 'array' then raise exception'INVALID_ANALYTICS_MODEL';end if;
   insert into analytics_model_runs(model_type,model_version,parameters,status)
   values(model->>'modelType',model->>'modelVersion',coalesce(model->'parameters','{}'::jsonb),'failed')returning id into run_id;
   for prediction in select value from jsonb_array_elements(model->'predictions') loop
    insert into analytics_predictions(model_run_id,prediction_type,target_date,target_resource_type,target_resource_id,predicted_value,risk_level,data_quality,metadata)
    values(run_id,prediction->>'prediction_type',(prediction->>'target_date')::date,prediction->>'target_resource_type',prediction->>'target_resource_id',
      (prediction->>'predicted_value')::numeric,prediction->>'risk_level',prediction->>'data_quality',coalesce(prediction->'metadata','{}'::jsonb));
   end loop;
   update analytics_model_runs set status='completed'where id=run_id;
  end loop;
 exception when others then
  get stacked diagnostics failure_code=returned_sqlstate;
  insert into analytics_model_runs(model_type,model_version,status,parameters)
  values('generation','backend-v1','failed',jsonb_build_object('errorCode',failure_code));
  return jsonb_build_object('error','ANALYTICS_PERSIST_FAILED');
 end;
 return jsonb_build_object('persisted',true);
end$$;
revoke all on function public.persist_analytics_generation(jsonb) from public,anon,authenticated;
grant execute on function public.persist_analytics_generation(jsonb) to service_role;

-- B-022: stage proof under the same token lock used by completion. A concurrent
-- upload cannot replace the accepted evidence after the token is consumed.
create or replace function public.stage_recovery_selfie(p_token_hash text,p_path text,p_ip_address text,p_user_agent text)
returns void language plpgsql security definer set search_path=public as $$
declare tok account_recovery_tokens%rowtype;log_id uuid;account_email text;
begin
 select * into tok from account_recovery_tokens where token_hash=p_token_hash
  and used_at is null and expires_at>now() for update;
 if not found then raise exception'RECOVERY_TOKEN_INVALID';end if;
 if p_path is null or p_path!~'^recovery-selfies/[0-9a-f-]{36}\.(jpg|png|webp)$'then raise exception'SELFIE_REQUIRED';end if;
 select id into log_id from password_reset_logs where token_id=tok.id and status<>'completed'
  order by created_at desc limit 1 for update;
 if found then
  update password_reset_logs set selfie_url=p_path where id=log_id;
 else
  select email into account_email from user_accounts where id=tok.user_id;
  insert into password_reset_logs(user_id,token_id,email,ip_address,user_agent,selfie_url,status)
  values(tok.user_id,tok.id,account_email,p_ip_address,left(p_user_agent,300),p_path,'requested');
 end if;
end$$;
revoke all on function public.stage_recovery_selfie(text,text,text,text) from public,anon,authenticated;
grant execute on function public.stage_recovery_selfie(text,text,text,text) to service_role;
