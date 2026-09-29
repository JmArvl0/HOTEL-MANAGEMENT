-- 20261024040000_restore_submit_gateway_deposit.sql
--
-- Restore the one object that 20261016010000 defines but the live database does
-- not have, while supabase_migrations.schema_migrations records that migration as
-- applied — so `supabase db push` would never re-run it.
--
-- Verified live 2026-09-29 (read-only probes over DIRECT_URL): pg_proc has no
-- submit_gateway_deposit in ANY schema, while every other object of that file is
-- present — the three payments columns, both unique idempotency indexes,
-- confirm_gateway_payment (with the 20261021010000 replay hardening),
-- express_qr_self_check_in, qr_tokens/qr_scan_events, guest_id_documents + RLS,
-- reservations.digital_key_hash, the ai_interactions feature constraint and the
-- service-role-only grants. Every dependency the function body touches
-- (booking_holds/reservations/invoices/payments/guests/room_types/rooms columns,
-- room_is_sellable, expire_booking_holds) exists.
--
-- Impact observed without it: POST /api/booking/payments/gateway created the
-- PayMongo checkout session, then the RPC call answered PGRST202 ("Could not find
-- the function ... in the schema cache"), which the route does not map, so the
-- guest saw the generic 500 "Unable to start online payment." and no payment row
-- was ever written.
--
-- Idempotent by construction, in the re-assertion style of 20261021010000: the
-- columns/indexes use IF NOT EXISTS (no-ops where already present) and the
-- function is CREATE OR REPLACE with a body taken VERBATIM from 20261016010000
-- lines 192-265. That file is the only definition — per KI-003 the live body was
-- read first, and none existed to preserve. No migration drops this function, so
-- this restores intended behavior; it does not revert a deliberate removal.
--
-- The payments columns and indexes are re-asserted here only so a fresh database
-- applying migrations in order reaches the same surface from this file alone.

alter table public.payments add column if not exists payment_gateway text;
alter table public.payments add column if not exists gateway_reference_id text;
alter table public.payments add column if not exists webhook_event_id text;
create unique index if not exists payments_gateway_reference_unique
  on public.payments(gateway_reference_id) where gateway_reference_id is not null;
create unique index if not exists payments_webhook_event_unique
  on public.payments(webhook_event_id) where webhook_event_id is not null;

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
