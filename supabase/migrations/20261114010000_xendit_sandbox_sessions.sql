-- Ledger checked read-only 2026-11-14: 122 versions, latest 20261113020000.
-- Additive: existing manual/PayMongo records and policy selection are retained.
begin;
alter table public.payments
  add column provider_reference_id text,
  add column gateway_checkout_url text,
  add column gateway_expires_at timestamptz,
  add column gateway_creation_started_at timestamptz,
  add column gateway_payment_id text,
  add column gateway_channel text,
  add column gateway_requested_channel text,
  add column gateway_updated_at timestamptz;
create unique index payments_provider_reference_unique on public.payments(payment_gateway,provider_reference_id) where provider_reference_id is not null;
create unique index payments_provider_transaction_unique on public.payments(payment_gateway,gateway_payment_id) where gateway_payment_id is not null;
alter table public.hotel_operational_policies drop constraint hotel_operational_policies_deposit_method_check;
alter table public.hotel_operational_policies add constraint hotel_operational_policies_deposit_method_check check(deposit_method in('manual','paymongo','xendit','off'));

-- Preserve the current inventory, DNR, frozen rates, exact-room and breakfast
-- rules. Clone only the settlement boundary; fail closed if its shape drifts.
do $$declare body text;patched text;begin
  select pg_get_functiondef('public.admin_update_deposit_method(text,text,integer,uuid)'::regprocedure) into body;
  patched:=replace(body,'''paymongo'', ''manual'', ''off''','''paymongo'', ''xendit'', ''manual'', ''off''');
  if patched=body then raise exception 'XENDIT_POLICY_PATCH_UNEXPECTED';end if;execute patched;
  select pg_get_functiondef('public.confirm_gateway_payment(uuid,text,text)'::regprocedure) into body;
  patched:=replace(body,'public.confirm_gateway_payment(', 'public.hotel_confirm_xendit_payment(');
  if patched=body then raise exception 'XENDIT_SETTLEMENT_PATCH_UNEXPECTED';end if;execute patched;
  -- Other providers and manual reviewers cannot bless a Xendit payment.
  patched:=replace(body,'if not found or p.purpose <> ''reservation_deposit'' then',
    'if p.payment_gateway=''xendit'' then raise exception ''XENDIT_WEBHOOK_REQUIRED'';end if; if not found or p.purpose <> ''reservation_deposit'' then');
  if patched=body then raise exception 'XENDIT_PROVIDER_GUARD_UNEXPECTED';end if;execute patched;
  select pg_get_functiondef('public.verify_reservation_deposit(uuid,uuid)'::regprocedure) into body;
  patched:=replace(body,'if p.method=''gateway_paymongo''', 'if p.method in(''gateway_paymongo'',''gateway_xendit'')');
  if patched=body then raise exception 'XENDIT_MANUAL_GUARD_UNEXPECTED';end if;execute patched;
end$$;

-- One local deposit and one external create claim per hold. A timed-out POST is
-- deliberately not retried: Payment Sessions does not document idempotency.
create function public.hotel_begin_xendit_checkout(p_token uuid,p_user_id uuid,p_channel text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h booking_holds%rowtype;p payments%rowtype;r reservations%rowtype;ref text;may_create boolean:=false;begin
  if p_channel is not null and p_channel not in('GCASH','PAYMAYA') then raise exception 'INVALID_XENDIT_CHANNEL';end if;
  if not exists(select 1 from user_accounts where id=p_user_id and role='guest' and active) then raise exception 'CUSTOMER_REQUIRED';end if;
  select * into h from booking_holds where token=p_token and user_id=p_user_id;
  if not found then raise exception 'HOLD_NOT_FOUND';end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));
  select * into h from booking_holds where token=p_token and user_id=p_user_id for update;
  if h.reservation_id is null then
    if not exists(select 1 from hotel_operational_policies where key='default' and deposit_method='xendit') then raise exception 'DEPOSIT_METHOD_INACTIVE';end if;
    ref:='haven-test-'||gen_random_uuid()::text;
    perform * from submit_gateway_deposit(p_token,p_user_id,ref);
    select * into h from booking_holds where token=p_token;
    update payments set method='gateway_xendit',payment_gateway='xendit',gateway_reference_id=null,
      provider_reference_id=ref,gateway_expires_at=now()+interval '16 minutes',gateway_updated_at=now()
      where reservation_id=h.reservation_id and purpose='reservation_deposit';
    update reservations set payment_method='gateway_xendit',payment_due_at=now()+interval '16 minutes' where id=h.reservation_id;
    update invoices set method='gateway_xendit' where reservation_id=h.reservation_id;
  end if;
  select * into r from reservations where id=h.reservation_id for update;
  select * into p from payments where reservation_id=h.reservation_id and purpose='reservation_deposit' and payment_gateway='xendit' for update;
  if not found then raise exception 'XENDIT_PAYMENT_NOT_FOUND';end if;
  if p.status='pending_verification' and r.status='pending' and p.gateway_reference_id is null
      and p.gateway_creation_started_at is null and p.gateway_expires_at>now()+interval '11 minutes' then
    may_create:=true;
    update payments set gateway_creation_started_at=now(),gateway_requested_channel=p_channel,gateway_updated_at=now() where id=p.id returning * into p;
  end if;
  return jsonb_build_object('paymentId',p.id,'reservationId',r.id,'status',p.status,'reference',p.provider_reference_id,
    'checkoutUrl',case when p.status='pending_verification' and r.status='pending' and p.gateway_expires_at>now() then p.gateway_checkout_url end,
    'sessionId',p.gateway_reference_id,'expiresAt',p.gateway_expires_at,'amount',p.amount,'create',may_create,
    'firstName',h.first_name,'lastName',h.last_name,'channel',p.gateway_requested_channel);
end$$;

-- Bind a provider response atomically. Also used by verified webhooks to
-- recover an accepted request whose HTTP response was lost.
create function public.hotel_attach_xendit_session(p_reference text,p_session text,p_url text,p_expires timestamptz,p_amount numeric)
returns void language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;begin
  select * into p from payments where payment_gateway='xendit' and provider_reference_id=p_reference for update;
  if not found then raise exception 'XENDIT_PAYMENT_NOT_FOUND';end if;
  if p_session !~ '^ps-[a-zA-Z0-9-]+$' or p_session is null or p_url is null or p_url !~ '^https://(dev[.]xen[.]to|checkout-staging[.]xendit[.]co)/'
      or p_expires is null or p_expires>p.gateway_expires_at+interval '1 second' or p_amount is distinct from p.amount
      or (p.gateway_reference_id is not null and p.gateway_reference_id<>p_session) then raise exception 'XENDIT_SESSION_MISMATCH';end if;
  update payments set gateway_reference_id=p_session,gateway_checkout_url=p_url,gateway_expires_at=p_expires,gateway_updated_at=now() where id=p.id;
  update reservations set payment_due_at=p_expires where id=p.reservation_id and status='pending';
end$$;

create function public.hotel_xendit_creation_rejected(p_payment uuid)
returns void language plpgsql security definer set search_path=public as $$begin
  update payments set gateway_creation_started_at=null,gateway_updated_at=now()
    where id=p_payment and payment_gateway='xendit' and status='pending_verification' and gateway_reference_id is null;
end$$;

create function public.hotel_process_xendit_event(p_event text,p_reference text,p_session text,p_amount numeric,p_currency text,p_transaction text default null,p_channel text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r reservations%rowtype;outcome text;begin
  if p_event is null or p_event not in('payment_session.completed','payment_session.expired') then raise exception 'INVALID_XENDIT_EVENT';end if;
  select * into p from payments where payment_gateway='xendit' and provider_reference_id=p_reference;
  if not found then raise exception 'XENDIT_PAYMENT_NOT_FOUND';end if;
  select * into r from reservations where id=p.reservation_id;
  perform pg_advisory_xact_lock(hashtextextended(lower(r.room_type),0));
  select * into r from reservations where id=p.reservation_id for update;
  select * into p from payments where id=p.id for update;
  if p.gateway_reference_id is null or p.gateway_reference_id is distinct from p_session or p.amount is distinct from p_amount
    or p.currency is distinct from p_currency or p_currency is distinct from 'PHP' or r.deposit_required is distinct from p_amount then raise exception 'XENDIT_SESSION_MISMATCH';end if;
  if p_event='payment_session.completed' and (p_transaction is null or p_transaction !~ '^py-[a-zA-Z0-9-]+$') then raise exception 'XENDIT_TRANSACTION_REQUIRED';end if;
  if p.status='paid' then
    if p_event='payment_session.completed' and p.gateway_payment_id is distinct from p_transaction then raise exception 'XENDIT_SESSION_MISMATCH';end if;
    outcome:='already_paid';
  elsif p_event='payment_session.completed' then
    if r.status='pending' and p.status='pending_verification' and p.gateway_expires_at>now() then
      update payments set gateway_payment_id=p_transaction,gateway_channel=p_channel,reference=p_transaction,gateway_updated_at=now() where id=p.id;
      perform * from hotel_confirm_xendit_payment(p.id,p_session,'xendit:completed:'||p_session);
      outcome:='confirmed';
    else
      -- Never revive released inventory. Preserve the transaction for Accounting.
      update payments set gateway_payment_id=p_transaction,gateway_channel=p_channel,
        notes='Xendit sandbox payment arrived after inventory release; Accounting review required',gateway_updated_at=now() where id=p.id;
      outcome:='review_required';
    end if;
  else
    if p.status='pending_verification' then
      update payments set status='expired',gateway_updated_at=now() where id=p.id;
      update booking_holds set status='expired' where reservation_id=r.id and status='payment_submitted';
      update reservations set status='cancelled',payment_status='failed',cancellation_reason='Xendit sandbox checkout expired' where id=r.id and status='pending';
    end if;
    outcome:='expired';
  end if;
  insert into audit_logs(action,entity_type,entity_id,after_data) values('xendit_webhook','payment',p.id::text,
    jsonb_build_object('event',p_event,'sessionId',p_session,'outcome',outcome));
  return jsonb_build_object('reservationId',r.id,'outcome',outcome);
end$$;

-- Expiry is also swept by existing inventory/status reads if a webhook is lost.
-- Keep the legacy sweep verbatim, adding only a Xendit branch.
do $$declare body text;patched text;begin
  select pg_get_functiondef('public.expire_booking_holds()'::regprocedure) into body;
  patched:=replace(body,'return n;', $patch$
    update payments set status='expired',gateway_updated_at=now()
      where payment_gateway='xendit' and status='pending_verification' and gateway_expires_at<=now();
    update booking_holds h set status='expired' where status='payment_submitted' and exists(
      select 1 from payments p where p.reservation_id=h.reservation_id and p.payment_gateway='xendit' and p.status='expired');
    update reservations r set status='cancelled',payment_status='failed',cancellation_reason='Xendit sandbox checkout expired'
      where status='pending' and exists(select 1 from payments p where p.reservation_id=r.id and p.payment_gateway='xendit' and p.status='expired');
    return n;$patch$);
  if patched=body then raise exception 'XENDIT_EXPIRY_PATCH_UNEXPECTED';end if;execute patched;
end$$;

revoke all on function public.hotel_confirm_xendit_payment(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.hotel_begin_xendit_checkout(uuid,uuid,text),public.hotel_attach_xendit_session(text,text,text,timestamptz,numeric),public.hotel_xendit_creation_rejected(uuid),public.hotel_process_xendit_event(text,text,text,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.hotel_begin_xendit_checkout(uuid,uuid,text),public.hotel_attach_xendit_session(text,text,text,timestamptz,numeric),public.hotel_xendit_creation_rejected(uuid),public.hotel_process_xendit_event(text,text,text,numeric,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
