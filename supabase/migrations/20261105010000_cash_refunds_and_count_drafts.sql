-- Linked ledger read on 2026-11-05 before numbering. Local implementation only.
-- Cash payouts share collection/close's lock; historical paid records are untouched.
create or replace function public.process_refund(
 p_refund_id uuid,p_staff_user_id uuid,p_reference text,p_method text,p_cash_shift_id uuid
) returns table(refund_status text,refund_amount numeric,net_paid numeric)
language plpgsql security definer set search_path=public as $$
declare actor text; rr refund_requests%rowtype; i invoices%rowtype; r reservations%rowtype;
 existing payments%rowtype; v_gross numeric; v_refunded numeric; v_net numeric;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is distinct from 'accounting' then raise exception 'REFUND_PROCESSING_FORBIDDEN'; end if;
 if p_method is null or p_method not in('cash','bank_transfer','gcash','card')
  or (p_method='cash')<>(p_cash_shift_id is not null) then raise exception 'REFUND_PAYOUT_INVALID'; end if;
 if length(trim(coalesce(p_reference,''))) not between 2 and 120 then raise exception 'REFUND_REFERENCE_REQUIRED'; end if;
 -- ponytail: property-wide drawer lock matches existing collection/close; split
 -- by cash point only if multiple simultaneously open drawers are introduced.
 if p_method='cash' then perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0)); end if;
 select * into rr from refund_requests where id=p_refund_id;
 if not found then raise exception 'REFUND_NOT_FOUND'; end if;
 select * into r from reservations where id=rr.reservation_id for update;
 select * into i from invoices where id=rr.invoice_id for update;
 select * into rr from refund_requests where id=p_refund_id for update;
 select * into existing from payments where idempotency_key=rr.id;
 select coalesce(sum(amount),0) into v_gross from payments where invoice_id=i.id and status='paid' and purpose<>'refund';
 select coalesce(sum(amount),0) into v_refunded from payments where invoice_id=i.id and status='paid' and purpose='refund';
 if rr.status='processed' then
  if existing.id is null or existing.method<>p_method or existing.cash_shift_id is distinct from p_cash_shift_id
   or existing.reference<>trim(p_reference) then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0); return;
 end if;
 if rr.status not in('pending','failed') or rr.eligible_amount<=0 then raise exception 'REFUND_NOT_PENDING'; end if;
 if existing.id is not null then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
 if p_method='cash' then
  perform 1 from cash_shifts where id=p_cash_shift_id and status='open' for update;
  if not found then raise exception 'CASH_SHIFT_REQUIRED'; end if;
 end if;
 -- Preserve the cancellation settlement's approved fee-waiver execution.
 if i.terminal_settlement is not null then
  if rr.eligible_amount>i.credit_balance and rr.exception_approval_id is not null then
   perform 1 from manager_approval_requests where id=rr.exception_approval_id and status='approved'
    and execution_status='awaiting_execution' and reservation_id=r.id and request_type='refund_exception'
    and round((requested_action->>'amount')::numeric,2)=rr.eligible_amount;
   if not found then raise exception 'REFUND_EXCEPTION_NOT_APPROVED'; end if;
   declare c folio_charges%rowtype; waiver numeric; reversed numeric; begin
    select * into c from folio_charges where id=(i.terminal_settlement->>'chargeId')::uuid for update;
    select coalesce(sum(amount),0) into reversed from financial_adjustments where source_charge_id=c.id and transaction_type='reversal';
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
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
 values(i.id,r.id,rr.eligible_amount,'PHP',p_method,trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now(),p_cash_shift_id);
 insert into refund_attempts(refund_request_id,status,reference,attempted_by) values(rr.id,'processed',trim(p_reference),p_staff_user_id);
 update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference) where id=rr.id;
 v_net:=greatest(round(v_gross-v_refunded-rr.eligible_amount,2),0);
 if i.terminal_settlement is not null then
  perform sync_invoice_financials(i.id);
  update invoices set status=case when credit_balance>0 then 'refund_pending' when amount=0 then 'refunded' else 'partial_refund' end where id=i.id;
 else
  update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then 'refunded' else 'partial_refund' end where id=i.id;
 end if;
 update reservations set payment_status=case when v_net=0 then 'refunded' else 'partial_refund' end where id=r.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_staff_user_id,'process_refund','refund_request',rr.id::text,
  jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference),'method',p_method,'cashShiftId',p_cash_shift_id));
 return query select 'processed'::text,rr.eligible_amount,v_net;
end$$;
revoke all on function public.process_refund(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.process_refund(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.process_refund(uuid,uuid,text,text,uuid) to service_role;

create or replace function public.require_open_cash_drawer() returns trigger language plpgsql set search_path=public as $$
declare drawer cash_shifts%rowtype; available numeric;
begin
 if new.status='paid' and (tg_op='INSERT' or old.status is distinct from new.status
  or old.cash_shift_id is distinct from new.cash_shift_id or old.method is distinct from new.method) then
  if new.purpose='refund' and (new.method not in('cash','bank_transfer','gcash','card')
   or (new.method='cash')<>(new.cash_shift_id is not null)) then raise exception 'REFUND_PAYOUT_INVALID'; end if;
  if lower(new.method)='cash' then
   perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
   select * into drawer from cash_shifts where id=new.cash_shift_id and status='open' for update;
   if not found then raise exception 'CASH_SHIFT_REQUIRED'; end if;
   if new.purpose='refund' then
    select drawer.opening_amount+coalesce(sum(case when purpose='refund' then -amount else amount end),0)
     into available from payments where cash_shift_id=drawer.id and status='paid';
    if new.amount>available then raise exception 'INSUFFICIENT_DRAWER_CASH'; end if;
   end if;
  end if;
 end if;
 return new;
end$$;
-- Prevent retroactive drawer reassignment, including through non-refund callers.
create or replace function public.protect_settled_payment() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' and old.status='paid' then raise exception 'SETTLED_PAYMENT_IMMUTABLE'; end if;
 if tg_op='UPDATE' and old.status='paid' and (old.amount is distinct from new.amount or old.currency is distinct from new.currency
  or old.method is distinct from new.method or old.reference is distinct from new.reference or old.purpose is distinct from new.purpose
  or old.invoice_id is distinct from new.invoice_id or old.reservation_id is distinct from new.reservation_id
  or old.cash_shift_id is distinct from new.cash_shift_id or old.received_by is distinct from new.received_by
  or new.status is distinct from old.status) then raise exception 'SETTLED_PAYMENT_IMMUTABLE'; end if;
 return case when tg_op='DELETE' then old else new end;
end$$;

create table public.cash_count_drafts (
 cash_shift_id uuid not null references public.cash_shifts(id),
 actor_id uuid not null references public.user_accounts(id), actor_role text not null check(actor_role in('front_desk','accounting')),
 actual_cash numeric(14,2) not null check(actual_cash>=0 and actual_cash<=10000000), notes text not null check(length(notes)<=400),
 basis text not null, version integer not null default 1, close_key uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(), invalidated_at timestamptz,
 primary key(cash_shift_id,actor_id,actor_role)
);
alter table public.cash_count_drafts enable row level security;
revoke all on public.cash_count_drafts from public,anon,authenticated,service_role;

create function public.cash_shift_count_basis(p_shift_id uuid) returns text
language sql stable security definer set search_path=public as $$
 select md5(cs.opening_amount::text||':'||coalesce((
  select string_agg(p.id::text||':'||p.amount::text||':'||p.purpose||':'||p.method,',' order by p.id)
  from payments p where p.cash_shift_id=cs.id and p.status='paid'
 ),'')) from cash_shifts cs where cs.id=p_shift_id
$$;

create function public.cash_count_context(p_shift_id uuid,p_staff_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor text; s cash_shifts%rowtype; d cash_count_drafts%rowtype; basis text; expected numeric;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor not in('front_desk','accounting') then raise exception 'CASH_SHIFT_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
 select * into s from cash_shifts where id=p_shift_id;
 if not found then raise exception 'CASH_SHIFT_NOT_FOUND'; end if;
 if actor<>'accounting' and s.staff_user_id<>p_staff_user_id then raise exception 'CASH_SHIFT_FORBIDDEN'; end if;
 basis:=cash_shift_count_basis(s.id);
 select * into d from cash_count_drafts where cash_shift_id=s.id and actor_id=p_staff_user_id and actor_role=actor;
 if s.status='open' then
  select s.opening_amount+coalesce(sum(case when purpose='refund' then -amount else amount end),0) into expected
   from payments where cash_shift_id=s.id and status='paid';
 else expected:=s.expected_cash; end if;
 return jsonb_build_object('status',s.status,'basis',basis,'expectedCash',expected,'draft',case when d.cash_shift_id is null then null else
  jsonb_build_object('actualCash',d.actual_cash,'notes',d.notes,'basis',d.basis,'version',d.version,'closeKey',d.close_key,
   'updatedAt',d.updated_at,'invalidatedAt',d.invalidated_at,'stale',d.basis is distinct from basis) end);
end$$;

create function public.save_cash_count_draft(p_shift_id uuid,p_staff_user_id uuid,p_actual_cash numeric,p_notes text,p_basis text,p_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; s cash_shifts%rowtype; d cash_count_drafts%rowtype;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor not in('front_desk','accounting') then raise exception 'CASH_SHIFT_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
 select * into s from cash_shifts where id=p_shift_id for update;
 if not found then raise exception 'CASH_SHIFT_NOT_FOUND'; end if;
 if actor<>'accounting' and s.staff_user_id<>p_staff_user_id then raise exception 'CASH_SHIFT_FORBIDDEN'; end if;
 if s.status<>'open' then raise exception 'CASH_SHIFT_NOT_OPEN'; end if;
 if p_actual_cash is null or p_actual_cash<0 or p_actual_cash>10000000 or p_actual_cash='NaN'::numeric
  or length(coalesce(p_notes,''))>400 or p_version is null or p_version<0 then raise exception 'INVALID_COUNTED_CASH'; end if;
 if p_basis is distinct from cash_shift_count_basis(s.id) then raise exception 'CASH_ACTIVITY_CHANGED'; end if;
 select * into d from cash_count_drafts where cash_shift_id=s.id and actor_id=p_staff_user_id and actor_role=actor for update;
 if coalesce(d.version,0)<>p_version then raise exception 'DRAFT_VERSION_CONFLICT'; end if;
 insert into cash_count_drafts(cash_shift_id,actor_id,actor_role,actual_cash,notes,basis,version)
 values(s.id,p_staff_user_id,actor,round(p_actual_cash,2),coalesce(p_notes,''),p_basis,1)
 on conflict(cash_shift_id,actor_id,actor_role) do update set actual_cash=excluded.actual_cash,notes=excluded.notes,basis=excluded.basis,
  version=cash_count_drafts.version+1,close_key=gen_random_uuid(),updated_at=now(),invalidated_at=null;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_staff_user_id,'save_cash_count_draft','cash_shift',s.id::text,jsonb_build_object('draftOnly',true));
 return cash_count_context(s.id,p_staff_user_id)->'draft';
end$$;

create function public.close_cash_count_draft(p_shift_id uuid,p_staff_user_id uuid,p_version integer,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; s cash_shifts%rowtype; d cash_count_drafts%rowtype; result jsonb;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor not in('front_desk','accounting') then raise exception 'CASH_SHIFT_FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
 select * into s from cash_shifts where id=p_shift_id for update;
 if not found then raise exception 'CASH_SHIFT_NOT_FOUND'; end if;
 if actor<>'accounting' and s.staff_user_id<>p_staff_user_id then raise exception 'CASH_SHIFT_FORBIDDEN'; end if;
 select * into d from cash_count_drafts where cash_shift_id=s.id and actor_id=p_staff_user_id and actor_role=actor for update;
 if d.cash_shift_id is null or d.version is distinct from p_version or d.close_key is distinct from p_idempotency_key then raise exception 'DRAFT_VERSION_CONFLICT'; end if;
 if s.status='open' and d.basis is distinct from cash_shift_count_basis(s.id) then raise exception 'CASH_ACTIVITY_CHANGED'; end if;
 result:=accounting_close_cash_shift(s.id,d.actual_cash,d.notes,p_idempotency_key,p_staff_user_id);
 update cash_count_drafts set invalidated_at=coalesce(invalidated_at,now()) where cash_shift_id=s.id;
 return result-'cashCollected'-'cashPaidOut';
end$$;
-- Only the checked count-draft entry point may close a drawer from the server API.
revoke all on function public.accounting_close_cash_shift(uuid,numeric,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.cash_shift_count_basis(uuid),public.cash_count_context(uuid,uuid),
 public.save_cash_count_draft(uuid,uuid,numeric,text,text,integer),public.close_cash_count_draft(uuid,uuid,integer,uuid)
 from public,anon,authenticated;
grant execute on function public.cash_count_context(uuid,uuid),public.save_cash_count_draft(uuid,uuid,numeric,text,text,integer),
 public.close_cash_count_draft(uuid,uuid,integer,uuid) to service_role;
revoke all on function public.cash_shift_count_basis(uuid),public.require_open_cash_drawer(),public.protect_settled_payment() from public,anon,authenticated,service_role;
