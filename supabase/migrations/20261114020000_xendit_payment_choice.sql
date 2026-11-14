-- Hosted ledger checked read-only 2026-11-14, latest version 20261113020000.
begin;

-- A checkout can charge more than the deposit recorded on the booking ledger.
-- A null amount identifies older deposit-only Xendit attempts.
alter table public.payments add column gateway_checkout_amount numeric(12,2)
  check (gateway_checkout_amount is null or (payment_gateway = 'xendit' and gateway_checkout_amount >= amount));

create function public.hotel_begin_xendit_checkout(p_token uuid,p_user_id uuid,p_channel text,p_payment_choice text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  h booking_holds%rowtype;
  p payments%rowtype;
  r reservations%rowtype;
  ref text;
  charge_amount numeric;
  may_create boolean;
begin
  if p_channel is not null and p_channel not in ('GCASH','PAYMAYA') then raise exception 'INVALID_XENDIT_CHANNEL';end if;
  if p_payment_choice is not null and p_payment_choice not in ('deposit','full') then raise exception 'INVALID_XENDIT_PAYMENT_CHOICE';end if;
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

  charge_amount:=case p_payment_choice
    when 'full' then r.total
    when 'deposit' then p.amount
    else coalesce(p.gateway_checkout_amount,p.amount)
  end;
  may_create:=p.status='pending_verification' and r.status='pending' and p.gateway_reference_id is null
    and p.gateway_creation_started_at is null and p.gateway_expires_at>now()+interval '11 minutes';
  if may_create then
    update payments set gateway_checkout_amount=charge_amount,gateway_creation_started_at=now(),
      gateway_requested_channel=p_channel,gateway_updated_at=now() where id=p.id returning * into p;
  elsif charge_amount is distinct from coalesce(p.gateway_checkout_amount,p.amount) then
    raise exception 'XENDIT_AMOUNT_ALREADY_SELECTED';
  end if;

  return jsonb_build_object('paymentId',p.id,'reservationId',r.id,'status',p.status,'reference',p.provider_reference_id,
    'checkoutUrl',case when p.status='pending_verification' and r.status='pending' and p.gateway_expires_at>now() then p.gateway_checkout_url end,
    'sessionId',p.gateway_reference_id,'expiresAt',p.gateway_expires_at,'amount',charge_amount,'create',may_create,
    'paymentChoice',case when charge_amount=r.total then 'full' else 'deposit' end,
    'firstName',h.first_name,'lastName',h.last_name,'channel',p.gateway_requested_channel);
end$$;

-- Older clients and retry calls keep the amount already claimed for the hold.
create or replace function public.hotel_begin_xendit_checkout(p_token uuid,p_user_id uuid,p_channel text default null)
returns jsonb language sql security definer set search_path=public as $$
  select public.hotel_begin_xendit_checkout(p_token,p_user_id,p_channel,null::text);
$$;

do $$
declare body text; patched text;
begin
  select pg_get_functiondef('public.hotel_attach_xendit_session(text,text,text,timestamptz,numeric)'::regprocedure) into body;
  patched:=replace(body,'p_amount is distinct from p.amount','p_amount is distinct from coalesce(p.gateway_checkout_amount,p.amount)');
  if patched=body then raise exception 'XENDIT_ATTACH_AMOUNT_PATCH_UNEXPECTED';end if;
  execute patched;

  select pg_get_functiondef('public.hotel_process_xendit_event(text,text,text,numeric,text,text,text)'::regprocedure) into body;
  patched:=replace(body,'p.amount is distinct from p_amount',
    'coalesce(p.gateway_checkout_amount,p.amount) is distinct from p_amount');
  if patched=body then raise exception 'XENDIT_EVENT_AMOUNT_PATCH_UNEXPECTED';end if;
  body:=patched;
  patched:=replace(body,'r.deposit_required is distinct from p_amount',
    '(p.status=''pending_verification'' and r.status=''pending'' and (r.deposit_required is distinct from p.amount
      or (p_amount is distinct from p.amount and p_amount is distinct from r.total)))');
  if patched=body then raise exception 'XENDIT_EVENT_RESERVATION_PATCH_UNEXPECTED';end if;
  body:=patched;
  patched:=replace(body,'perform * from hotel_confirm_xendit_payment', $allocation$
      -- The provider charged once. Allocate the part above the deposit to the
      -- same invoice so the existing deposit-based refund rules stay correct.
      if p_amount>p.amount then
        insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,
          payment_gateway,gateway_channel,submitted_at,verified_at,notes)
        values(p.invoice_id,p.reservation_id,p_amount-p.amount,p.currency,p.method,p_transaction||':balance','stay_payment','paid',
          'xendit',p_channel,p.submitted_at,now(),'Balance portion of the Xendit payment');
      end if;
      perform * from hotel_confirm_xendit_payment$allocation$);
  if patched=body then raise exception 'XENDIT_BALANCE_ALLOCATION_PATCH_UNEXPECTED';end if;
  execute patched;
end$$;

revoke all on function public.hotel_begin_xendit_checkout(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.hotel_begin_xendit_checkout(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
