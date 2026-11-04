begin;

create or replace function public.process_refund(
  p_refund_id uuid, p_staff_user_id uuid, p_reference text,
  p_payout_method text, p_cash_shift_id uuid
) returns table(refund_status text, refund_amount numeric, net_paid numeric)
language plpgsql security definer set search_path=public as $$
declare
  actor text;
  rr refund_requests%rowtype;
  i invoices%rowtype;
  r reservations%rowtype;
  saved_payment payments%rowtype;
  cash_payout boolean := coalesce(p_payout_method='cash',false);
  v_gross numeric;
  v_refunded numeric;
  v_net numeric;
begin
  perform hotel_lock_operating_day();
  select role into actor from user_accounts where id=p_staff_user_id and active;
  if actor is null or actor not in ('owner','admin','accounting') then
    raise exception 'REFUND_PROCESSING_FORBIDDEN';
  end if;
  if (p_payout_method is not null and p_payout_method not in ('cash','noncash'))
     or (not cash_payout and p_cash_shift_id is not null) then
    raise exception 'INVALID_REFUND_PAYOUT';
  end if;
  if cash_payout then
    if p_cash_shift_id is null then raise exception 'REFUND_DRAWER_REQUIRED'; end if;
    -- Same lock order as cash collection: operating day, shared drawer, then folio.
    perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
  end if;

  select * into rr from refund_requests where id=p_refund_id;
  perform 1 from reservations where id=rr.reservation_id for update;
  perform 1 from invoices where id=rr.invoice_id for update;
  select * into rr from refund_requests where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  select * into i from invoices where id=rr.invoice_id;
  select * into r from reservations where id=rr.reservation_id;
  select coalesce(sum(amount),0) into v_gross from payments where invoice_id=i.id and status='paid' and purpose<>'refund';
  select coalesce(sum(amount),0) into v_refunded from payments where invoice_id=i.id and status='paid' and purpose='refund';
  select * into saved_payment from payments where idempotency_key=rr.id;

  if saved_payment.id is not null and (saved_payment.invoice_id is distinct from i.id
     or saved_payment.purpose is distinct from 'refund' or saved_payment.status is distinct from 'paid') then
    raise exception 'REFUND_PAYOUT_CONFLICT';
  end if;
  if (saved_payment.id is not null or rr.status='processed') and p_payout_method is not null and
     (saved_payment.reference is distinct from trim(p_reference)
      or saved_payment.cash_shift_id is distinct from p_cash_shift_id) then
    raise exception 'REFUND_PAYOUT_CONFLICT';
  end if;
  if rr.status='processed' then
    return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0);
    return;
  end if;
  if rr.status not in ('pending','failed') or rr.eligible_amount<=0 then raise exception 'REFUND_NOT_PENDING'; end if;
  if nullif(trim(p_reference),'') is null then raise exception 'REFUND_REFERENCE_REQUIRED'; end if;
  if cash_payout then
    perform 1 from cash_shifts where id=p_cash_shift_id and status='open' for update;
    if not found then raise exception 'REFUND_DRAWER_CHANGED'; end if;
  end if;

  if i.terminal_settlement is not null then
    if rr.eligible_amount>i.credit_balance and rr.exception_approval_id is not null then
      perform 1 from manager_approval_requests
      where id=rr.exception_approval_id and status='approved' and execution_status='awaiting_execution'
        and reservation_id=r.id and request_type='refund_exception'
        and round((requested_action->>'amount')::numeric,2)=rr.eligible_amount;
      if not found then raise exception 'REFUND_EXCEPTION_NOT_APPROVED'; end if;
      -- The approved fee waiver increases the folio credit before the payout.
      declare c folio_charges%rowtype; waiver numeric; reversed numeric;
      begin
        select * into c from folio_charges where id=(i.terminal_settlement->>'chargeId')::uuid for update;
        select coalesce(sum(amount),0) into reversed from financial_adjustments
        where source_charge_id=c.id and transaction_type='reversal';
        waiver:=round(rr.eligible_amount-i.credit_balance,2);
        if c.id is null or waiver>c.amount-reversed then raise exception 'REFUND_EXCEEDS_FOLIO_CREDIT'; end if;
        insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,source_charge_id,created_by,idempotency_key,manager_approval_id)
        values(i.id,r.id,'reversal','credit',waiver,'Manager-approved policy fee waiver: '||rr.reason,c.id,p_staff_user_id,rr.id,rr.exception_approval_id);
        update folio_charges set status=case when reversed+waiver=c.amount then 'reversed' else 'partially_reversed' end where id=c.id;
        update invoices set amount=amount-waiver where id=i.id;
      end;
      select * into i from sync_invoice_financials(i.id);
    end if;
    if rr.eligible_amount>i.credit_balance then raise exception 'REFUND_EXCEEDS_FOLIO_CREDIT'; end if;
  end if;
  if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2) then raise exception 'REFUND_EXCEEDS_RECEIVED'; end if;

  if saved_payment.id is null then
    insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
    values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now(),p_cash_shift_id);
  end if;
  insert into refund_attempts(refund_request_id,status,reference,attempted_by)
  values(rr.id,'processed',trim(p_reference),p_staff_user_id);
  update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference) where id=rr.id;
  select coalesce(sum(amount),0) into v_refunded from payments where invoice_id=i.id and status='paid' and purpose='refund';
  v_net:=greatest(round(v_gross-v_refunded,2),0);
  if i.terminal_settlement is not null then
    perform sync_invoice_financials(i.id);
    update invoices set status=case when credit_balance>0 then 'refund_pending' when amount=0 then 'refunded' else 'partial_refund' end where id=i.id;
  else
    update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then 'refunded' else 'partial_refund' end where id=i.id;
  end if;
  update reservations set payment_status=case when v_net=0 then 'refunded' else 'partial_refund' end where id=r.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_staff_user_id,'process_refund','refund_request',rr.id::text,
    jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference),
      'payoutMethod',coalesce(p_payout_method,'noncash'),'cashShiftId',p_cash_shift_id));
  return query select 'processed'::text,rr.eligible_amount,v_net;
end;
$$;

-- Existing callers record the same unlinked manual refund during rollout.
create or replace function public.process_refund(p_refund_id uuid,p_staff_user_id uuid,p_reference text)
returns table(refund_status text,refund_amount numeric,net_paid numeric)
language sql security definer set search_path=public as $$
  select * from public.process_refund(p_refund_id,p_staff_user_id,p_reference,null,null);
$$;

create or replace function public.protect_settled_payment() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' and old.status='paid' then raise exception 'SETTLED_PAYMENT_IMMUTABLE'; end if;
  if tg_op='UPDATE' and old.status='paid' and (
    old.amount is distinct from new.amount or old.currency is distinct from new.currency or
    old.method is distinct from new.method or old.reference is distinct from new.reference or
    old.purpose is distinct from new.purpose or old.invoice_id is distinct from new.invoice_id or
    old.reservation_id is distinct from new.reservation_id or new.status is distinct from old.status or
    (old.purpose='refund' and old.cash_shift_id is distinct from new.cash_shift_id)
  ) then raise exception 'SETTLED_PAYMENT_IMMUTABLE'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function public.process_refund(uuid,uuid,text,text,uuid), public.process_refund(uuid,uuid,text),
  public.protect_settled_payment() from public,anon,authenticated;
grant execute on function public.process_refund(uuid,uuid,text,text,uuid), public.process_refund(uuid,uuid,text) to service_role;

commit;
