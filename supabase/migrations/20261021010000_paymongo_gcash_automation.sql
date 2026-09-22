-- PayMongo GCash automation: idempotent re-assertion + concurrent-delivery hardening.
--
-- 20261016010000 introduced the gateway columns, the unique idempotency
-- indexes on payments, submit_gateway_deposit, and confirm_gateway_payment.
-- This migration re-asserts that surface (safe on ledgers where the earlier
-- migration is already applied) with one hardening: when a payment is already
-- 'paid' under the SAME gateway reference — which happens when the provider
-- delivers both checkout_session.payment.paid and payment.paid for the same
-- money — the RPC now returns the existing state instead of raising
-- GATEWAY_REFERENCE_CONFLICT, so duplicate-channel webhooks settle as
-- idempotent replays. A different reference (or a non-gateway settlement)
-- still raises the conflict.
--
-- Deliverability note: register the endpoint in the PayMongo dashboard as
-- POST <NEXTAUTH_URL>/api/webhooks/payments subscribing to
-- checkout_session.payment.paid and payment.failed. The route verifies the
-- Paymongo-Signature header (HMAC-SHA256 over "<t>.<raw body>") BEFORE any
-- database read and never 5xx-es on replays.

alter table public.payments add column if not exists payment_gateway text;
alter table public.payments add column if not exists gateway_reference_id text;
alter table public.payments add column if not exists webhook_event_id text;
create unique index if not exists payments_gateway_reference_unique
  on public.payments(gateway_reference_id) where gateway_reference_id is not null;
create unique index if not exists payments_webhook_event_unique
  on public.payments(webhook_event_id) where webhook_event_id is not null;

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

revoke all on function public.confirm_gateway_payment(uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_gateway_payment(uuid,text,text) to service_role;
revoke all on function public.submit_gateway_deposit(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.submit_gateway_deposit(uuid,uuid,text) to service_role;
