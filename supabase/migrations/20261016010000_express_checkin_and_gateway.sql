-- Express QR self-check-in + payment gateway webhooks (PayMongo/Xendit).
-- Approved reversals: 9A manual-only (a real provider is now selected) and the
-- no-self-check-in identity rule (pre-verified + zero-balance + ready-room stays
-- may self-check-in). Manual GCash proof flow is untouched and stays available.
--
-- Reuse notes (no redundant columns):
-- * Identity assurance reuses reservations.identity_status ('verified') plus the
--   existing identity_verified_by/at columns — no parallel id_verified boolean.
-- * QR hashing reuses the SHA-256 hex scheme in lib/qr/tokens.ts: callers hash
--   client-side and pass the hash; only hashes are compared/stored.
-- Also extends ai_interactions.feature with 'guest_concierge' (shipped by the
-- concierge feature without its DB enum update — inserts would fail live).

alter table public.payments add column if not exists payment_gateway text;
alter table public.payments add column if not exists gateway_reference_id text;
alter table public.payments add column if not exists webhook_event_id text;
create unique index if not exists payments_gateway_reference_unique
  on public.payments(gateway_reference_id) where gateway_reference_id is not null;
create unique index if not exists payments_webhook_event_unique
  on public.payments(webhook_event_id) where webhook_event_id is not null;

alter table public.reservations add column if not exists digital_key_hash text;

-- Pre-arrival ID uploads: private bucket + review queue. Front Desk reviews;
-- an upload alone never verifies identity (verify_guest_identity stays
-- front-desk-guarded and is the only writer of identity_status).
create table if not exists public.guest_id_documents (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null references public.reservations(id) on delete cascade,
  user_id uuid references public.user_accounts(id) on delete set null,
  storage_path text not null,
  status text not null default 'pending_review' check (status in ('pending_review','verified','rejected')),
  reviewed_by uuid references public.user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists guest_id_documents_reservation_idx
  on public.guest_id_documents(reservation_id, created_at desc);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-ids', 'guest-ids', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- ai_interactions.feature: add the shipped-but-unmigrated guest_concierge value.
alter table public.ai_interactions drop constraint if exists ai_interactions_feature_check;
alter table public.ai_interactions add constraint ai_interactions_feature_check
  check (feature in ('brief','ask','explain','report_summary','guest_concierge'));

-- Gateway confirmation: the webhook route verifies the HMAC signature BEFORE
-- calling this; the RPC owns idempotency + the money movement. No staff actor:
-- the provider signature is the authority, and the guest owner is recorded.
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
  if p.status = 'paid' then raise exception 'GATEWAY_REFERENCE_CONFLICT'; end if;
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
    where x.type = r.room_type and x.status <> 'maintenance'
    and (r.check_in > current_date or x.housekeeping = 'clean');
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

-- Express self-check-in: guest actor only (role re-checked inside), hashed QR
-- lookup, all five eligibility gates, digital key issuance, guest audit row.
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
  select * into i from invoices where reservation_id = r.id for update;
  if not found then raise exception 'FOLIO_NOT_FOUND'; end if;
  if coalesce(i.balance,0) > 0 then raise exception 'SELF_CHECKIN_BALANCE_DUE'; end if;
  policy := coalesce(r.operational_policy_snapshot, current_operational_policy_snapshot());
  tz := coalesce(policy->>'hotelTimezone','Asia/Manila');
  local_now := now() at time zone tz;
  if local_now::date < r.check_in or local_now::date >= r.check_out then
    raise exception 'SELF_CHECKIN_OUTSIDE_WINDOW';
  end if;
  if local_now < (r.check_in + coalesce((policy->>'checkInTime')::time,'15:00'::time))
    and r.early_check_in_approved_until is null
    and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false) then
    raise exception 'SELF_CHECKIN_TOO_EARLY';
  end if;
  if r.room_id is null then raise exception 'SELF_CHECKIN_NO_ROOM'; end if;
  select * into room from rooms where id = r.room_id for update;
  if not found or room.status <> 'available' or room.housekeeping <> 'clean' then
    raise exception 'SELF_CHECKIN_ROOM_NOT_READY';
  end if;
  if exists(select 1 from maintenance_orders
    where room_id = room.id and status in ('open','in_progress')) then
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

-- Gateway submit: mirrors submit_reservation_deposit (same pricing, inventory,
-- guest, reservation, invoice, hold-transition logic) but records a gateway
-- payment with NO proof requirement — the provider webhook is the verifier.
-- p_gateway_ref is the provider checkout-session id, stored as reference and
-- gateway_reference_id so the webhook can locate the payment row.
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
  if round(t.base_rate,2) <> round(h.nightly_rate,2) then raise exception 'RATE_CHANGED'; end if;
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
    payment_due_at,confirmation_number,idempotency_key)
  values (guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,
    h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,
    h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,
    h.transport_lines,h.transportation_preferences,h.expected_arrival,'unpaid','gateway_paymongo',
    null,confirmation,p_token) returning id into rid;
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

revoke all on function public.submit_gateway_deposit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.submit_gateway_deposit(uuid,uuid,text) to service_role;

revoke all on function public.confirm_gateway_payment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_gateway_payment(uuid,text,text) to service_role;
revoke all on function public.express_qr_self_check_in(text,uuid) from public, anon, authenticated;
grant execute on function public.express_qr_self_check_in(text,uuid) to service_role;
revoke all on table public.guest_id_documents from anon, authenticated;
grant all on table public.guest_id_documents to service_role;
alter table public.guest_id_documents enable row level security;
