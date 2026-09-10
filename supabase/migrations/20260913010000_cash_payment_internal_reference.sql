-- Cash collection hardening. Cash handed to Front Desk has no external transaction
-- reference, so record_staff_payment now generates an internal HAVEN reference
-- (CASH-YYMMDD-XXXXXX, same convention as RCP-/FOL- financial documents) and requires
-- an open cash shift so every physical payment is shift-accountable. Electronic
-- methods (card/bank_transfer/gcash) still require a typed external reference.
-- Bodies below start from the LIVE function definition, not the 20260829 file, which
-- had drifted (role gate already tightened to front_desk/accounting with a null guard).
drop function if exists public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean);
create or replace function public.record_staff_payment(p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid,p_staff_user_id uuid,p_allow_overpayment boolean default false)
returns table(payment_id uuid,paid numeric,balance numeric,payment_status text,folio_credit numeric,reference text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;v_pid uuid;v_shift uuid;v_ref text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN';end if;
 if p_allow_overpayment and actor<>'accounting'then raise exception'OVERPAYMENT_FORBIDDEN';end if;
 if p_amount<=0 then raise exception'INVALID_PAYMENT_AMOUNT';end if;
 if nullif(trim(p_method),'')is null or(lower(trim(p_method))<>'cash'and nullif(trim(p_reference),'')is null)then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then select * into i from invoices where id=existing.invoice_id;return query select existing.id,i.paid,i.balance,i.status,i.credit_balance,existing.reference;return;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)and not p_allow_overpayment then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 if lower(trim(p_method))='cash'then
  select cs.id into v_shift from cash_shifts cs where cs.staff_user_id=p_staff_user_id and cs.status='open'limit 1;
  if v_shift is null then raise exception'CASH_SHIFT_REQUIRED';end if;
  v_ref:='CASH-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
 values(i.id,r.id,round(p_amount,2),'PHP',trim(p_method),coalesce(v_ref,trim(p_reference)),'stay_payment','paid',p_idempotency_key,p_staff_user_id,now(),v_shift)returning id into v_pid;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'collect_payment','payment',v_pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',trim(p_method),'reference',coalesce(v_ref,trim(p_reference)),'cashShiftId',v_shift,'creditBalance',i.credit_balance));
 return query select v_pid,i.paid,i.balance,i.status,i.credit_balance,coalesce(v_ref,trim(p_reference));end$$;
revoke all on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)from public;
do $$declare v_role text;begin
 foreach v_role in array array['anon','authenticated'] loop
  if to_regrole(v_role) is not null then execute format('revoke all on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean) from %I',v_role);end if;
 end loop;
end$$;
grant execute on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)to service_role;
