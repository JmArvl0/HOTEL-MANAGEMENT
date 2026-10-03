-- 20261024110000_shared_cash_drawer.sql
--
-- Single shared cash drawer: complete the property-wide rule started in
-- 20261024090000. That migration fixed the open guard (refuse while ANY shift
-- is open) but left three per-staff remnants, so a second cashier saw
-- "Closed", could not open, and could not collect cash:
--
-- 1. Backstop index was still per-staff (cash_shift_one_open_per_staff).
--    Replace it with a property-wide partial unique index: at most one row
--    with status='open'. The function guard + advisory lock remains the
--    friendly CASH_SHIFT_ALREADY_OPEN path; the index is the race-proof
--    backstop. Safe: the 2026-10-02 census found zero open shifts, and the
--    global guard has prevented concurrent opens since.
-- 2. record_staff_payment looked up the collector's own open shift
--    (staff_user_id=p_staff_user_id). With one shared drawer, the second
--    cashier's cash collect wrongly raised CASH_SHIFT_REQUIRED. It now
--    attaches to ANY open shift. Audit still distinguishes the actors:
--    received_by=p_staff_user_id (who collected) vs cash_shift_id (the drawer).
-- 3. Re-assert accounting_open_cash_shift with the live-tightened
--    front_desk/accounting gate (per KI-003: live bodies drift from the
--    20260829 file). Close/reconcile bodies are intentionally untouched.
-- Grants survive CREATE OR REPLACE (live: service_role only); the
-- record_staff_payment grant block below mirrors 20260913010000.

-- 1. Property-wide backstop: one open shift for the whole property.
drop index if exists public.cash_shift_one_open_per_staff;
create unique index if not exists cash_shift_single_open on public.cash_shifts(status) where status='open';

-- 2. Re-assert the global open guard (idempotent, same body as 20261024090000).
create or replace function public.accounting_open_cash_shift(p_staff_user_id uuid,p_location text,p_opening_amount numeric)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextended('cash_shift_open',0));
 if exists(select 1 from cash_shifts where status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$$;

-- 3. Cash collection attaches to the shared drawer (any open shift).
-- Body starts from 20260913010000 (which itself started from the live body
-- with the tightened PAYMENT_COLLECTION_FORBIDDEN gate); only the shift
-- lookup line changes, from per-staff to property-wide.
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
  select cs.id into v_shift from cash_shifts cs where cs.status='open' order by cs.opened_at asc limit 1;
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
