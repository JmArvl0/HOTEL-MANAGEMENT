-- Verified against live ledger 20261024130000 and live function bodies on 2026-11-03.
-- Fix the missing hashtextended function typo; serialize drawer transitions and payments.
-- Keep the old bypass argument for rolling compatibility, but never permit bypass.
CREATE OR REPLACE FUNCTION public.accounting_open_cash_shift(p_staff_user_id uuid, p_location text, p_opening_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
 if exists(select 1 from cash_shifts where status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$function$
;
CREATE OR REPLACE FUNCTION public.accounting_close_cash_shift(p_shift_id uuid, p_actual_cash numeric, p_notes text, p_idempotency_key uuid, p_staff_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;s cash_shifts%rowtype;existing cash_shifts%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0));
 select * into existing from cash_shifts where close_idempotency_key=p_idempotency_key;
 if found then if existing.id<>p_shift_id or existing.actual_cash<>round(p_actual_cash,2) or (existing.staff_user_id<>p_staff_user_id and actor<>'accounting') then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('shiftId',existing.id,'status',existing.status,'expectedCash',existing.expected_cash,'actualCash',existing.actual_cash,'variance',existing.variance);end if;
 if p_actual_cash is null or p_actual_cash<0 or p_idempotency_key is null then raise exception'INVALID_COUNTED_CASH';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status<>'open'then raise exception'CASH_SHIFT_NOT_OPEN';end if;
 if s.staff_user_id<>p_staff_user_id and actor<>'accounting'then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select coalesce(sum(amount),0)into v_in from payments where cash_shift_id=s.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_out from payments where cash_shift_id=s.id and status='paid'and purpose='refund';
 v_expected:=round(s.opening_amount+v_in-v_out,2);v_variance:=round(round(p_actual_cash,2)-v_expected,2);
 update cash_shifts set status='closed',closed_at=now(),expected_cash=v_expected,actual_cash=round(p_actual_cash,2),variance=v_variance,close_notes=nullif(trim(p_notes),''),close_idempotency_key=p_idempotency_key where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'close_cash_shift','cash_shift',s.id::text,jsonb_build_object('expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out));
 return jsonb_build_object('shiftId',s.id,'status','closed','expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out);end$function$
;
CREATE OR REPLACE FUNCTION public.record_staff_payment(p_reservation_id text, p_amount numeric, p_method text, p_reference text, p_idempotency_key uuid, p_staff_user_id uuid, p_allow_overpayment boolean DEFAULT false, p_allow_unattributed_cash boolean DEFAULT false)
 RETURNS TABLE(payment_id uuid, paid numeric, balance numeric, payment_status text, folio_credit numeric, reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;v_pid uuid;v_shift uuid;v_ref text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN';end if;
 if p_allow_overpayment and actor<>'accounting'then raise exception'OVERPAYMENT_FORBIDDEN';end if;
 if p_idempotency_key is null then raise exception 'INVALID_PAYMENT_DETAILS'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 if lower(trim(p_method))='cash' then perform pg_advisory_xact_lock(hashtextextended('cash_shift_open',0)); end if;
 if p_amount is null or round(p_amount,2)<=0 then raise exception'INVALID_PAYMENT_AMOUNT';end if;
 if nullif(trim(p_method),'')is null or(lower(trim(p_method))<>'cash'and nullif(trim(p_reference),'')is null)then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then if existing.reservation_id<>p_reservation_id or existing.amount<>round(p_amount,2) or existing.received_by<>p_staff_user_id or lower(existing.method)<>lower(trim(p_method)) then raise exception 'IDEMPOTENCY_CONFLICT'; end if; select * into i from invoices where id=existing.invoice_id;return query select existing.id,i.paid,i.balance,i.status,i.credit_balance,existing.reference;return;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)and not p_allow_overpayment then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 if lower(trim(p_method))='cash'then
  select cs.id into v_shift from cash_shifts cs where cs.status='open' order by cs.opened_at asc limit 1 for update;
  if v_shift is null then raise exception'CASH_SHIFT_REQUIRED';end if;
  v_ref:='CASH-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
 values(i.id,r.id,round(p_amount,2),'PHP',trim(p_method),coalesce(v_ref,trim(p_reference)),'stay_payment','paid',p_idempotency_key,p_staff_user_id,now(),v_shift)returning id into v_pid;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'collect_payment','payment',v_pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',trim(p_method),'reference',coalesce(v_ref,trim(p_reference)),'cashShiftId',v_shift,'unattributedCash',v_shift is null,'creditBalance',i.credit_balance));
 return query select v_pid,i.paid,i.balance,i.status,i.credit_balance,coalesce(v_ref,trim(p_reference));end$function$
;

-- Backstop other cash writers and serialize against drawer closure.
create function public.require_open_cash_drawer() returns trigger language plpgsql set search_path=public as $$
begin
 if lower(new.method)='cash' and new.status='paid' and
  (tg_op='INSERT' or old.cash_shift_id is distinct from new.cash_shift_id or old.status is distinct from new.status) then
  if new.cash_shift_id is null then raise exception 'CASH_SHIFT_REQUIRED'; end if;
  perform 1 from cash_shifts where id=new.cash_shift_id and status='open' for update;
  if not found then raise exception 'CASH_SHIFT_REQUIRED'; end if;
 end if;
 return new;
end$$;
create trigger payments_require_open_drawer before insert or update on public.payments for each row execute function public.require_open_cash_drawer();
