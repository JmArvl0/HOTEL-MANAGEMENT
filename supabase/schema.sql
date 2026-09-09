


-- Haven Hotel Management System — fresh-install schema snapshot.
-- Generated 2026-09-06 by `supabase db dump` from the linked production database
-- (captures everything deployed, including function bodies that exist only live).
-- The authoritative migration path is `supabase db push` with supabase/migrations/;
-- regenerate this snapshot after each feature block ships.
-- To use: paste this entire file into Supabase > SQL Editor and select Run.
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accounting_close_cash_shift"("p_shift_id" "uuid", "p_actual_cash" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;s cash_shifts%rowtype;existing cash_shifts%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select * into existing from cash_shifts where close_idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('shiftId',existing.id,'status',existing.status,'expectedCash',existing.expected_cash,'actualCash',existing.actual_cash,'variance',existing.variance);end if;
 if p_actual_cash is null or p_actual_cash<0 then raise exception'INVALID_COUNTED_CASH';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status<>'open'then raise exception'CASH_SHIFT_NOT_OPEN';end if;
 if s.staff_user_id<>p_staff_user_id and actor<>'accounting'then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select coalesce(sum(amount),0)into v_in from payments where cash_shift_id=s.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_out from payments where cash_shift_id=s.id and status='paid'and purpose='refund';
 v_expected:=round(s.opening_amount+v_in-v_out,2);v_variance:=round(round(p_actual_cash,2)-v_expected,2);
 update cash_shifts set status='closed',closed_at=now(),expected_cash=v_expected,actual_cash=round(p_actual_cash,2),variance=v_variance,close_notes=nullif(trim(p_notes),''),close_idempotency_key=p_idempotency_key where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'close_cash_shift','cash_shift',s.id::text,jsonb_build_object('expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out));
 return jsonb_build_object('shiftId',s.id,'status','closed','expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out);end$$;


ALTER FUNCTION "public"."accounting_close_cash_shift"("p_shift_id" "uuid", "p_actual_cash" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_execute_manager_financial_approval"("p_approval_id" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;a manager_approval_requests%rowtype;i invoices%rowtype;amount numeric;result jsonb;adjustment_id uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'ACCOUNTING_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'or a.request_type<>'guest_compensation'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into i from invoices where reservation_id=a.reservation_id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;amount:=coalesce((a.requested_action->>'amount')::numeric,0);if amount<=0 or amount>i.amount then raise exception'COMPENSATION_EXCEEDS_FOLIO';end if;
result:=accounting_record_adjustment(a.reservation_id,'credit','credit',amount,'Manager-approved service recovery: '||a.reason,a.id,p_staff_user_id);adjustment_id:=(result->>'adjustmentId')::uuid;
update financial_adjustments set manager_approval_id=a.id where id=adjustment_id and manager_approval_id is null;update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_financial_approval','manager_approval',a.id::text,jsonb_build_object('adjustmentId',adjustment_id,'amount',amount,'reservationId',a.reservation_id));return result||jsonb_build_object('status','executed','approvalId',a.id);end$$;


ALTER FUNCTION "public"."accounting_execute_manager_financial_approval"("p_approval_id" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_fail_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;rr refund_requests%rowtype;v_attempts integer;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'REFUND_FAILURE_REASON_REQUIRED';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 if rr.status='processed'then raise exception'REFUND_ALREADY_PROCESSED';end if;if rr.status='cancelled'then raise exception'REFUND_NOT_PENDING';end if;
 insert into refund_attempts(refund_request_id,status,reason,attempted_by)values(rr.id,'failed',trim(p_reason),p_staff_user_id);
 update refund_requests set status='failed'where id=rr.id;
 select count(*)into v_attempts from refund_attempts where refund_request_id=rr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'fail_refund','refund_request',rr.id::text,jsonb_build_object('status',rr.status),jsonb_build_object('status','failed','reason',trim(p_reason),'attempts',v_attempts));
 return jsonb_build_object('refundStatus','failed','eligibleAmount',rr.eligible_amount,'attempts',v_attempts,'retryable',true);end$$;


ALTER FUNCTION "public"."accounting_fail_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_generate_document"("p_document_type" "text", "p_reservation_id" "text", "p_payment_id" "uuid", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;existing financial_documents%rowtype;r reservations%rowtype;i invoices%rowtype;p payments%rowtype;v_number text;v_snapshot jsonb;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'DOCUMENT_FORBIDDEN';end if;
 select * into existing from financial_documents where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('documentId',existing.id,'documentNumber',existing.document_number,'documentType',existing.document_type,'snapshot',existing.snapshot);end if;
 if p_document_type not in('receipt','folio')then raise exception'UNSUPPORTED_DOCUMENT_TYPE';end if;
 if p_document_type='receipt'then
  select * into p from payments where id=p_payment_id;if not found or p.status<>'paid'then raise exception'PAYMENT_NOT_SETTLED';end if;
  select * into r from reservations where id=p.reservation_id;select * into i from invoices where id=p.invoice_id;
 else select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;select * into i from invoices where reservation_id=r.id;end if;
 if i.id is null then raise exception'FOLIO_NOT_FOUND';end if;
 v_number:=case p_document_type when'receipt'then'RCP-'else'FOL-'end||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 v_snapshot:=jsonb_build_object('documentType',p_document_type,'documentNumber',v_number,'reservationId',r.id,'confirmationNumber',r.confirmation_number,'guestName',r.guest_name,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,
  'currency',i.currency,'folioAmount',i.amount,'paid',i.paid,'balance',i.balance,'creditBalance',i.credit_balance,'folioStatus',i.status,'generatedAt',now(),
  'charges',(select coalesce(jsonb_agg(jsonb_build_object('description',fc.description,'category',fc.category,'amount',fc.amount,'status',fc.status,'postedAt',fc.created_at)order by fc.created_at),'[]'::jsonb)from folio_charges fc where fc.invoice_id=i.id),
  'adjustments',(select coalesce(jsonb_agg(jsonb_build_object('transactionType',fa.transaction_type,'direction',fa.direction,'amount',fa.amount,'reason',fa.reason,'createdAt',fa.created_at)order by fa.created_at),'[]'::jsonb)from financial_adjustments fa where fa.invoice_id=i.id),
  'payments',case when p_document_type='receipt'then jsonb_build_array(jsonb_build_object('purpose',p.purpose,'method',p.method,'reference',p.reference,'amount',p.amount,'receivedAt',coalesce(p.verified_at,p.created_at)))
   else(select coalesce(jsonb_agg(jsonb_build_object('purpose',pp.purpose,'method',pp.method,'reference',pp.reference,'amount',pp.amount,'receivedAt',coalesce(pp.verified_at,pp.created_at))order by pp.created_at),'[]'::jsonb)from payments pp where pp.invoice_id=i.id and pp.status='paid')end);
 insert into financial_documents(document_number,document_type,reservation_id,payment_id,snapshot,generated_by,idempotency_key)
 values(v_number,p_document_type,r.id,case when p_document_type='receipt'then p.id else null end,v_snapshot,p_staff_user_id,p_idempotency_key)returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'generate_financial_document','financial_document',v_id::text,jsonb_build_object('documentNumber',v_number,'documentType',p_document_type,'reservationId',r.id));
 return jsonb_build_object('documentId',v_id,'documentNumber',v_number,'documentType',p_document_type,'snapshot',v_snapshot);end$$;


ALTER FUNCTION "public"."accounting_generate_document"("p_document_type" "text", "p_reservation_id" "text", "p_payment_id" "uuid", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_open_cash_shift"("p_staff_user_id" "uuid", "p_location" "text", "p_opening_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 if exists(select 1 from cash_shifts where staff_user_id=p_staff_user_id and status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$$;


ALTER FUNCTION "public"."accounting_open_cash_shift"("p_staff_user_id" "uuid", "p_location" "text", "p_opening_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_reconcile_cash_shift"("p_shift_id" "uuid", "p_staff_user_id" "uuid", "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;s cash_shifts%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'RECONCILIATION_FORBIDDEN';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status='reconciled'then return jsonb_build_object('shiftId',s.id,'status',s.status,'variance',s.variance);end if;
 if s.status<>'closed'then raise exception'CASH_SHIFT_NOT_CLOSED';end if;
 if coalesce(s.variance,0)<>0 and nullif(trim(p_notes),'')is null then raise exception'VARIANCE_EXPLANATION_REQUIRED';end if;
 update cash_shifts set status='reconciled',reconciled_by=p_staff_user_id,reconciled_at=now(),reconciliation_notes=nullif(trim(p_notes),'')where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reconcile_cash_shift','cash_shift',s.id::text,jsonb_build_object('status',s.status,'variance',s.variance),jsonb_build_object('status','reconciled','variance',s.variance,'notes',nullif(trim(p_notes),'')));
 return jsonb_build_object('shiftId',s.id,'status','reconciled','variance',s.variance);end$$;


ALTER FUNCTION "public"."accounting_reconcile_cash_shift"("p_shift_id" "uuid", "p_staff_user_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_reconcile_payments"("p_period_start" "date", "p_period_end" "date", "p_method" "text", "p_settled_amount" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;existing payment_reconciliations%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;v_status text;v_id uuid;v_method text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'RECONCILIATION_FORBIDDEN';end if;
 select * into existing from payment_reconciliations where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('reconciliationId',existing.id,'expectedAmount',existing.expected_amount,'settledAmount',existing.settled_amount,'variance',existing.variance,'status',existing.status);end if;
 v_method:=lower(nullif(trim(p_method),''));if v_method is null then raise exception'PAYMENT_METHOD_REQUIRED';end if;
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception'INVALID_RECONCILIATION_PERIOD';end if;
 if p_settled_amount is null or p_settled_amount<0 then raise exception'INVALID_SETTLED_AMOUNT';end if;
 select coalesce(sum(amount),0)into v_in from payments where lower(method)=v_method and status='paid'and purpose<>'refund'and coalesce(verified_at,created_at)::date between p_period_start and p_period_end;
 select coalesce(sum(amount),0)into v_out from payments where lower(method)=v_method and status='paid'and purpose='refund'and coalesce(verified_at,created_at)::date between p_period_start and p_period_end;
 v_expected:=round(v_in-v_out,2);v_variance:=round(round(p_settled_amount,2)-v_expected,2);v_status:=case when v_variance=0 then'balanced'else'variance'end;
 if v_status='variance'and nullif(trim(p_notes),'')is null then raise exception'VARIANCE_EXPLANATION_REQUIRED';end if;
 insert into payment_reconciliations(period_start,period_end,payment_method,expected_amount,settled_amount,variance,status,notes,reconciled_by,idempotency_key)
 values(p_period_start,p_period_end,v_method,v_expected,round(p_settled_amount,2),v_variance,v_status,nullif(trim(p_notes),''),p_staff_user_id,p_idempotency_key)returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'reconcile_payments','payment_reconciliation',v_id::text,jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end,'method',v_method,'expectedAmount',v_expected,'settledAmount',round(p_settled_amount,2),'variance',v_variance,'status',v_status));
 return jsonb_build_object('reconciliationId',v_id,'expectedAmount',v_expected,'settledAmount',round(p_settled_amount,2),'variance',v_variance,'status',v_status);end$$;


ALTER FUNCTION "public"."accounting_reconcile_payments"("p_period_start" "date", "p_period_end" "date", "p_method" "text", "p_settled_amount" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_record_adjustment"("p_reservation_id" "text", "p_transaction_type" "text", "p_direction" "text", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing financial_adjustments%rowtype;v_aid uuid;v_amount numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'ADJUSTMENT_FORBIDDEN';end if;
 select * into existing from financial_adjustments where idempotency_key=p_idempotency_key;
 if found then select * into i from invoices where id=existing.invoice_id;return jsonb_build_object('adjustmentId',existing.id,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status,'folioCredit',i.credit_balance);end if;
 if p_transaction_type not in('adjustment','credit','write_off')then raise exception'UNSUPPORTED_ADJUSTMENT_TYPE';end if;
 if p_direction not in('debit','credit')then raise exception'UNSUPPORTED_ADJUSTMENT_DIRECTION';end if;
 if p_transaction_type in('credit','write_off')and p_direction<>'credit'then raise exception'UNSUPPORTED_ADJUSTMENT_DIRECTION';end if;
 if nullif(trim(p_reason),'')is null then raise exception'ADJUSTMENT_REASON_REQUIRED';end if;
 v_amount:=round(p_amount,2);if v_amount<=0 then raise exception'INVALID_ADJUSTMENT_AMOUNT';end if;
 select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if i.status='cancelled'then raise exception'FOLIO_CLOSED';end if;
 if p_direction='credit'and v_amount>round(i.amount,2)then raise exception'ADJUSTMENT_EXCEEDS_FOLIO';end if;
 if p_transaction_type='write_off'and v_amount>round(i.balance,2)then raise exception'WRITE_OFF_EXCEEDS_BALANCE';end if;
 insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,created_by,idempotency_key)
 values(i.id,r.id,p_transaction_type,p_direction,v_amount,trim(p_reason),p_staff_user_id,p_idempotency_key)returning id into v_aid;
 update invoices set amount=greatest(round(i.amount+case when p_direction='debit'then v_amount else-v_amount end,2),0)where id=i.id;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'record_financial_adjustment','invoice',i.id,jsonb_build_object('folioAmount',round(i.amount+case when p_direction='debit'then-v_amount else v_amount end,2)),jsonb_build_object('adjustmentId',v_aid,'transactionType',p_transaction_type,'direction',p_direction,'amount',v_amount,'reason',trim(p_reason),'folioAmount',i.amount,'folioBalance',i.balance));
 return jsonb_build_object('adjustmentId',v_aid,'transactionType',p_transaction_type,'direction',p_direction,'amount',v_amount,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status,'folioCredit',i.credit_balance);end$$;


ALTER FUNCTION "public"."accounting_record_adjustment"("p_reservation_id" "text", "p_transaction_type" "text", "p_direction" "text", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_reject_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;p payments%rowtype;r reservations%rowtype;i invoices%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'REJECTION_REASON_REQUIRED';end if;
 select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 if p.status='failed'then return jsonb_build_object('paymentStatus',p.status,'reservationId',p.reservation_id,'reason',p.decision_reason);end if;
 if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;
 update payments set status='failed',reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=trim(p_reason),notes=coalesce(notes,'Deposit proof rejected by financial review')where id=p.id;
 update booking_holds set status='expired'where reservation_id=r.id and status in('active','payment_submitted');
 if r.status='pending'then update reservations set status='cancelled',payment_status='failed',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Reservation deposit could not be verified')where id=r.id;
  update invoices set balance=0,credit_balance=0,status='cancelled'where id=i.id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reject_reservation_deposit','payment',p.id::text,jsonb_build_object('status',p.status),jsonb_build_object('status','failed','reservationId',r.id,'reason',trim(p_reason)));
 return jsonb_build_object('paymentStatus','failed','reservationId',r.id,'reservationStatus',case when r.status='pending'then'cancelled'else r.status end,'reason',trim(p_reason));end$$;


ALTER FUNCTION "public"."accounting_reject_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accounting_reverse_charge"("p_charge_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;c folio_charges%rowtype;i invoices%rowtype;existing financial_adjustments%rowtype;v_reversed numeric;v_amount numeric;v_aid uuid;v_status text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'CHARGE_REVERSAL_FORBIDDEN';end if;
 select * into existing from financial_adjustments where idempotency_key=p_idempotency_key;
 if found then select * into i from invoices where id=existing.invoice_id;select status into v_status from folio_charges where id=existing.source_charge_id;
  return jsonb_build_object('adjustmentId',existing.id,'chargeStatus',v_status,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status);end if;
 if nullif(trim(p_reason),'')is null then raise exception'REVERSAL_REASON_REQUIRED';end if;
 select * into c from folio_charges where id=p_charge_id for update;if not found then raise exception'CHARGE_NOT_FOUND';end if;
 select coalesce(sum(amount),0)into v_reversed from financial_adjustments where source_charge_id=c.id and transaction_type='reversal';
 v_amount:=round(coalesce(nullif(p_amount,0),round(c.amount-v_reversed,2)),2);
 if v_amount<=0 or v_amount>round(c.amount-v_reversed,2)then raise exception'REVERSAL_EXCEEDS_CHARGE';end if;
 select * into i from invoices where id=c.invoice_id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,source_charge_id,created_by,idempotency_key)
 values(i.id,c.reservation_id,'reversal','credit',v_amount,trim(p_reason),c.id,p_staff_user_id,p_idempotency_key)returning id into v_aid;
 v_status:=case when round(v_reversed+v_amount,2)>=round(c.amount,2)then'reversed'else'partially_reversed'end;
 update folio_charges set status=v_status where id=c.id;
 update invoices set amount=greatest(round(i.amount-v_amount,2),0)where id=i.id;select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reverse_folio_charge','folio_charge',c.id::text,jsonb_build_object('chargeAmount',c.amount,'alreadyReversed',v_reversed,'chargeStatus',c.status),jsonb_build_object('adjustmentId',v_aid,'reversedAmount',v_amount,'chargeStatus',v_status,'reason',trim(p_reason)));
 return jsonb_build_object('adjustmentId',v_aid,'chargeStatus',v_status,'reversedAmount',v_amount,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status,'folioCredit',i.credit_balance);end$$;


ALTER FUNCTION "public"."accounting_reverse_charge"("p_charge_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_change_account_status"("p_target_user_id" "uuid", "p_status" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t user_accounts%rowtype;active_owners integer;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if p_status not in('active','inactive','suspended')or nullif(trim(p_reason),'')is null then raise exception'INVALID_ACCOUNT_STATUS';end if;
 select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;
 if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;if t.id=p_actor_user_id then raise exception'SELF_LIFECYCLE_CHANGE_FORBIDDEN';end if;
 if actor='admin'and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;
 if p_status='active'and t.recovery_required then raise exception'ACCOUNT_RECOVERY_REQUIRED';end if;
 if t.role='owner'and p_status<>'active'then select count(*)into active_owners from user_accounts where role='owner'and active and id<>t.id;if active_owners=0 then raise exception'LAST_ACTIVE_OWNER_PROTECTED';end if;end if;
 update user_accounts set account_status=p_status,active=p_status='active',auth_version=auth_version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_change_account_status','user_account',t.id::text,jsonb_build_object('status',t.account_status,'active',t.active),jsonb_build_object('status',p_status,'active',p_status='active','reason',trim(p_reason)));return jsonb_build_object('id',t.id,'status',p_status,'version',t.auth_version+1);end$$;


ALTER FUNCTION "public"."admin_change_account_status"("p_target_user_id" "uuid", "p_status" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_change_user_role"("p_target_user_id" "uuid", "p_role" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t user_accounts%rowtype;allowed boolean;active_owners integer;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;if t.id=p_actor_user_id then raise exception'SELF_ROLE_CHANGE_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'ROLE_CHANGE_REASON_REQUIRED';end if;
 allowed:=case when actor='owner'then p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting','guest')else p_role in('manager','front_desk','housekeeping','maintenance','accounting')and t.role not in('owner','admin')end;if not allowed then raise exception'PROTECTED_ROLE_FORBIDDEN';end if;
 if t.role='owner'and p_role<>'owner'then select count(*)into active_owners from user_accounts where role='owner'and active and id<>t.id;if active_owners=0 then raise exception'LAST_ACTIVE_OWNER_PROTECTED';end if;end if;
 update user_accounts set role=p_role,auth_version=auth_version+1,updated_at=now()where id=t.id;update staff set role=p_role,department=case when p_role='front_desk'then'Front Desk'else initcap(replace(p_role,'_',' '))end where user_id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_change_user_role','user_account',t.id::text,jsonb_build_object('role',t.role),jsonb_build_object('role',p_role,'reason',trim(p_reason)));return jsonb_build_object('id',t.id,'role',p_role,'version',t.auth_version+1);end$$;


ALTER FUNCTION "public"."admin_change_user_role"("p_target_user_id" "uuid", "p_role" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_staff"("p_name" "text", "p_email" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_role" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_actor_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;uid uuid;allowed boolean;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;
 if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 allowed:=case when actor='owner'then p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting')else p_role in('manager','front_desk','housekeeping','maintenance','accounting')end;
 if not allowed then raise exception'PROTECTED_ROLE_FORBIDDEN';end if;
 if nullif(trim(p_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_reason),'')is null then raise exception'INVALID_STAFF_ACCOUNT';end if;
 insert into user_accounts(email,name,role,password_hash,active,account_status,recovery_required,phone,department,employee_reference,creation_idempotency_key)
 values(lower(trim(p_email)),trim(p_name),p_role,'recovery-required',false,'inactive',true,nullif(trim(p_phone),''),nullif(trim(p_department),''),nullif(trim(p_employee_reference),''),p_idempotency_key)returning id into uid;
 insert into staff(user_id,name,role,department,status)values(uid,trim(p_name),p_role,nullif(trim(p_department),''),'off_duty');
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'admin_create_staff','user_account',uid::text,jsonb_build_object('email',lower(trim(p_email)),'role',p_role,'reason',trim(p_reason),'active',false));return uid;
exception when unique_violation then select id into uid from user_accounts where creation_idempotency_key=p_idempotency_key;if uid is null then raise;end if;return uid;end$$;


ALTER FUNCTION "public"."admin_create_staff"("p_name" "text", "p_email" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_role" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_initiate_account_recovery"("p_target_user_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone, "p_reason" "text", "p_actor_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare actor text;t user_accounts%rowtype;token_id uuid;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;if actor='admin'and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;if t.id=p_actor_user_id then raise exception'SELF_RECOVERY_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null or p_expires_at<=now()or length(p_token_hash)<32 then raise exception'INVALID_RECOVERY_REQUEST';end if;
 update account_recovery_tokens set used_at=now()where user_id=t.id and used_at is null;insert into account_recovery_tokens(user_id,token_hash,created_by,expires_at)values(t.id,p_token_hash,p_actor_user_id,p_expires_at)returning id into token_id;update user_accounts set recovery_required=true,active=false,account_status='inactive',auth_version=auth_version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'admin_initiate_account_recovery','user_account',t.id::text,jsonb_build_object('reason',trim(p_reason),'expiresAt',p_expires_at));return token_id;end$$;


ALTER FUNCTION "public"."admin_initiate_account_recovery"("p_target_user_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone, "p_reason" "text", "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_operational_policy"("p_hotel_timezone" "text", "p_check_in_time" time without time zone, "p_check_out_time" time without time zone, "p_no_show_cutoff_time" time without time zone, "p_valid_id_required" boolean, "p_minimum_booking_age" integer, "p_cancellation_full_refund_days" integer, "p_cancellation_partial_refund_days" integer, "p_cancellation_partial_refund_basis_points" integer, "p_self_service_modification_days" integer, "p_early_check_in_allowed" boolean, "p_housekeeping_inspection_required" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare actor text;p hotel_operational_policies%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into p from hotel_operational_policies where key='default'for update;if not found then raise exception'POLICY_NOT_FOUND';end if;if p.version<>p_expected_version then raise exception'POLICY_STALE';end if;if p_hotel_timezone<>p.hotel_timezone and actor<>'owner'then raise exception'TIMEZONE_OWNER_ONLY';end if;if not exists(select 1 from pg_timezone_names where name=p_hotel_timezone)or p_minimum_booking_age not between 1 and 120 or p_cancellation_full_refund_days<0 or p_cancellation_partial_refund_days<0 or p_cancellation_full_refund_days<p_cancellation_partial_refund_days or p_cancellation_partial_refund_basis_points not between 0 and 10000 or p_self_service_modification_days<0 or nullif(trim(p_reason),'')is null then raise exception'INVALID_OPERATIONAL_POLICY';end if;
 update hotel_operational_policies set hotel_timezone=p_hotel_timezone,check_in_time=p_check_in_time,check_out_time=p_check_out_time,no_show_cutoff_time=p_no_show_cutoff_time,valid_id_required=p_valid_id_required,minimum_booking_age=p_minimum_booking_age,cancellation_full_refund_days=p_cancellation_full_refund_days,cancellation_partial_refund_days=p_cancellation_partial_refund_days,cancellation_partial_refund_basis_points=p_cancellation_partial_refund_basis_points,self_service_modification_days=p_self_service_modification_days,early_check_in_allowed=p_early_check_in_allowed,housekeeping_inspection_required=p_housekeeping_inspection_required,version=version+1,updated_at=now()where key='default';insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_operational_policy','hotel_operational_policy','default',to_jsonb(p),jsonb_build_object('hotelTimezone',p_hotel_timezone,'checkInTime',p_check_in_time,'checkOutTime',p_check_out_time,'noShowCutoffTime',p_no_show_cutoff_time,'validIdRequired',p_valid_id_required,'minimumBookingAge',p_minimum_booking_age,'cancellationFullRefundDays',p_cancellation_full_refund_days,'cancellationPartialRefundDays',p_cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',p_cancellation_partial_refund_basis_points,'selfServiceModificationDays',p_self_service_modification_days,'earlyCheckInAllowed',p_early_check_in_allowed,'housekeepingInspectionRequired',p_housekeeping_inspection_required,'reason',trim(p_reason),'version',p.version+1));return jsonb_build_object('version',p.version+1);end$$;


ALTER FUNCTION "public"."admin_update_operational_policy"("p_hotel_timezone" "text", "p_check_in_time" time without time zone, "p_check_out_time" time without time zone, "p_no_show_cutoff_time" time without time zone, "p_valid_id_required" boolean, "p_minimum_booking_age" integer, "p_cancellation_full_refund_days" integer, "p_cancellation_partial_refund_days" integer, "p_cancellation_partial_refund_basis_points" integer, "p_self_service_modification_days" integer, "p_early_check_in_allowed" boolean, "p_housekeeping_inspection_required" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_room_metadata"("p_room_id" "text", "p_floor" integer, "p_type" "text", "p_wing" "text", "p_designation" "text", "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare actor text;r rooms%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;if p_floor<0 or nullif(trim(p_type),'')is null or nullif(trim(p_reason),'')is null or not exists(select 1 from room_types where name=p_type)then raise exception'INVALID_ROOM_CONFIGURATION';end if;select * into r from rooms where id=p_room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if r.configuration_version<>p_expected_version then raise exception'ROOM_CONFIGURATION_STALE';end if;
 if p_type is distinct from r.type and(exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_FUTURE_COMMITMENT';end if;
 if not p_active and(r.status in('occupied','reserved')or exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_ACTIVE_ASSIGNMENT';end if;
 update rooms set floor=p_floor,type=p_type,wing=nullif(trim(p_wing),''),administrative_designation=nullif(trim(p_designation),''),administratively_active=p_active,deactivated_at=case when p_active then null when r.administratively_active then now() else r.deactivated_at end,deactivation_reason=case when p_active then null else trim(p_reason) end,configuration_version=configuration_version+1,updated_at=now()where id=r.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_room_metadata','room',r.id,jsonb_build_object('floor',r.floor,'type',r.type,'active',r.administratively_active),jsonb_build_object('floor',p_floor,'type',p_type,'active',p_active,'wing',nullif(trim(p_wing),''),'designation',nullif(trim(p_designation),''),'reason',trim(p_reason)));return jsonb_build_object('id',r.id,'version',r.configuration_version+1);end$$;


ALTER FUNCTION "public"."admin_update_room_metadata"("p_room_id" "text", "p_floor" integer, "p_type" "text", "p_wing" "text", "p_designation" "text", "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_room_type"("p_room_type_id" "uuid", "p_description" "text", "p_max_guests" integer, "p_beds" "text", "p_size_sqm" integer, "p_amenities" "jsonb", "p_base_rate" numeric, "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid", "p_photo_urls" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t room_types%rowtype;photos text[];
begin
 select role into actor from user_accounts where id=p_actor_user_id and active;
 if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if nullif(trim(p_description),'')is null or p_max_guests<=0 or nullif(trim(p_beds),'')is null
    or(p_size_sqm is not null and p_size_sqm<=0)or p_base_rate<0
    or jsonb_typeof(coalesce(p_amenities,'[]'))<>'array' or nullif(trim(p_reason),'')is null
    or(p_photo_urls is not null and array_length(p_photo_urls,1)>24)
    or(p_photo_urls is not null and exists(select 1 from unnest(p_photo_urls) u where length(coalesce(u,''))>500))
   then raise exception'INVALID_ROOM_TYPE_CONFIGURATION';end if;
 photos:=coalesce(p_photo_urls, (select photo_urls from room_types where id=p_room_type_id));
 select * into t from room_types where id=p_room_type_id for update;
 if not found then raise exception'ROOM_TYPE_NOT_FOUND';end if;
 if t.version<>p_expected_version then raise exception'ROOM_TYPE_STALE';end if;
 update room_types set description=trim(p_description),max_guests=p_max_guests,beds=trim(p_beds),
   size_sqm=p_size_sqm,amenities=coalesce(p_amenities,'[]'),base_rate=round(p_base_rate,2),
   active=p_active,photo_urls=photos,version=version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor_user_id,'admin_update_room_type','room_type',t.id::text,to_jsonb(t)-'id',
   jsonb_build_object('name',t.name,'description',trim(p_description),'maxGuests',p_max_guests,
     'beds',trim(p_beds),'sizeSqm',p_size_sqm,'amenities',coalesce(p_amenities,'[]'),
     'baseRate',round(p_base_rate,2),'active',p_active,'photoUrls',photos,
     'reason',trim(p_reason)));
 return jsonb_build_object('id',t.id,'version',t.version+1);
end$$;


ALTER FUNCTION "public"."admin_update_room_type"("p_room_type_id" "uuid", "p_description" "text", "p_max_guests" integer, "p_beds" "text", "p_size_sqm" integer, "p_amenities" "jsonb", "p_base_rate" numeric, "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid", "p_photo_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_user_metadata"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare actor text;t user_accounts%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;if actor='admin'and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;if nullif(trim(p_name),'')is null then raise exception'INVALID_ACCOUNT_METADATA';end if;
 update user_accounts set name=trim(p_name),phone=nullif(trim(p_phone),''),department=nullif(trim(p_department),''),employee_reference=nullif(trim(p_employee_reference),''),auth_version=auth_version+1,updated_at=now()where id=t.id;update staff set name=trim(p_name),department=nullif(trim(p_department),'')where user_id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_user_metadata','user_account',t.id::text,jsonb_build_object('name',t.name,'department',t.department,'employeeReference',t.employee_reference),jsonb_build_object('name',trim(p_name),'department',nullif(trim(p_department),''),'employeeReference',nullif(trim(p_employee_reference),'')));return jsonb_build_object('id',t.id,'version',t.auth_version+1);end$$;


ALTER FUNCTION "public"."admin_update_user_metadata"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_operational_policy_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$begin if new.operational_policy_snapshot is null then new.operational_policy_snapshot:=current_operational_policy_snapshot();end if;return new;end$$;


ALTER FUNCTION "public"."apply_operational_policy_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_reservation"("p_reservation_id" "text", "p_actor_user_id" "uuid", "p_reason" "text") RETURNS TABLE("reservation_status" "text", "refund_request_id" "uuid", "eligible_refund" numeric, "refund_basis_points" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;i invoices%rowtype;policy jsonb;tz text;today date;days_before int;full_days int;partial_days int;partial_bp int;deposit_paid numeric;basis int;eligible numeric;refund_id uuid;existing refund_requests%rowtype;begin
select role into actor from user_accounts where id=p_actor_user_id and active;select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
if actor='guest'and r.user_id<>p_actor_user_id then raise exception'RESERVATION_OWNERSHIP_REQUIRED';end if;if actor is null or actor not in('guest','owner','admin','manager','front_desk')then raise exception'CANCELLATION_FORBIDDEN';end if;
select * into existing from refund_requests where reservation_id=r.id and status in('pending','processed')order by created_at desc limit 1;
if r.status='cancelled'then return query select r.status,existing.id,coalesce(existing.eligible_amount,0),coalesce(existing.refund_basis_points,0);return;end if;
if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CANCELLABLE';end if;if nullif(trim(p_reason),'')is null then raise exception'CANCELLATION_REASON_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');today:=(now()at time zone tz)::date;days_before:=r.check_in-today;
full_days:=coalesce((policy->>'cancellationFullRefundDays')::int,14);partial_days:=coalesce((policy->>'cancellationPartialRefundDays')::int,7);partial_bp:=coalesce((policy->>'cancellationPartialRefundBasisPoints')::int,5000);
select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
basis:=case when days_before>=full_days then 10000 when days_before>=partial_days then partial_bp else 0 end;eligible:=round(deposit_paid*basis/10000.0,2);
select * into i from invoices where reservation_id=r.id for update;update reservations set status='cancelled',cancellation_reason=trim(p_reason)where id=r.id;
update invoices set balance=0,status=case when eligible>0 then'refund_pending'else'cancelled'end where id=i.id;
if eligible>0 then insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount)values(r.id,i.id,p_actor_user_id,trim(p_reason),deposit_paid,basis,eligible)returning id into refund_id;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'cancel_reservation','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled','reason',p_reason,'eligibleRefund',eligible,'refundBasisPoints',basis));
return query select'cancelled'::text,refund_id,eligible,basis;end$$;


ALTER FUNCTION "public"."cancel_reservation"("p_reservation_id" "text", "p_actor_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_account_recovery"("p_token_hash" "text", "p_password_hash" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare tok account_recovery_tokens%rowtype;begin
 select * into tok from account_recovery_tokens where token_hash=p_token_hash and used_at is null and expires_at>now()for update;if not found then raise exception'RECOVERY_TOKEN_INVALID';end if;if length(p_password_hash)<50 then raise exception'INVALID_PASSWORD_HASH';end if;update account_recovery_tokens set used_at=now()where id=tok.id;update user_accounts set password_hash=p_password_hash,recovery_required=false,account_status='active',active=true,auth_version=auth_version+1,updated_at=now()where id=tok.user_id;insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(tok.user_id,'account_recovery_completed','user_account',tok.user_id::text,jsonb_build_object('recoveryTokenId',tok.id));return tok.user_id;end$$;


ALTER FUNCTION "public"."complete_account_recovery"("p_token_hash" "text", "p_password_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_housekeeping_task"("p_task_id" "text", "p_staff_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$begin perform housekeeping_complete_task(p_task_id,'{}'::jsonb,null,p_staff_user_id);end$$;


ALTER FUNCTION "public"."complete_housekeeping_task"("p_task_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_hold"("p_user_id" "uuid", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text" DEFAULT NULL::"text", "p_nationality" "text" DEFAULT NULL::"text", "p_expected_arrival" "text" DEFAULT NULL::"text", "p_special_requests" "text" DEFAULT NULL::"text", "p_request_options" "jsonb" DEFAULT '[]'::"jsonb", "p_transport_lines" "jsonb" DEFAULT '[]'::"jsonb", "p_transportation_preferences" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);v_transport numeric(12,2):=0;combined numeric(12,2);required numeric(12,2);result uuid;
 v_pref jsonb;v_service text;v_pickup text;v_dropoff_pref text;v_return_location text;v_pickup_date date;v_pickup_time text;v_return_date date;v_return_time text;v_passengers int;
begin
 perform expire_booking_holds();
 if p_check_in<current_date or p_check_out<=p_check_in then raise exception 'INVALID_DATES';end if;
 if p_guest_count<1 then raise exception 'INVALID_GUEST_COUNT';end if;
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_mobile),'')is null then raise exception 'INVALID_GUEST_DETAILS';end if;
 if coalesce(p_request_options,'[]'::jsonb)::text<>'[]'and (jsonb_typeof(coalesce(p_request_options,'[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_request_options,'[]'::jsonb))e where jsonb_typeof(e.value)<>'string' or coalesce(e.value#>>'{}','')='' or char_length(e.value#>>'{}')>40))then raise exception 'INVALID_REQUEST_OPTIONS';end if;
 if coalesce(p_transport_lines,'[]'::jsonb)::text<>'[]'and(jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))<>'array' or (select count(*)from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb)))>12 or exists(select 1 from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln where jsonb_typeof(ln.value)<>'object' or nullif(trim(coalesce(ln.value->>'name','')),'')is null or char_length(ln.value->>'name')>120 or coalesce(ln.value->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' or (ln.value->>'price')::numeric<=0))then raise exception 'INVALID_TRANSPORT_LINE';end if;
 -- Transportation preferences: strict, service-type-conditional. The client never supplies
 -- the hotel side of the route — the filer fills it from hotel_operational_policies.
 if p_transportation_preferences is not null then
  if jsonb_typeof(p_transportation_preferences)<>'object' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  v_pref:=p_transportation_preferences;
  v_service:=lower(coalesce(v_pref->>'serviceType',''));
  v_pickup:=nullif(trim(coalesce(v_pref->>'pickupLocation','')),'');
  v_dropoff_pref:=nullif(trim(coalesce(v_pref->>'dropoffLocation','')),'');
  v_return_location:=nullif(trim(coalesce(v_pref->>'returnLocation','')),'');
  v_pickup_date:=nullif(v_pref->>'pickupDate','')::date;
  v_pickup_time:=v_pref->>'pickupTime';
  v_return_date:=nullif(v_pref->>'returnDate','')::date;
  v_return_time:=v_pref->>'returnTime';
  v_passengers:=nullif(v_pref->>'passengerCount','')::int;
  if v_service not in('pickup','dropoff','round_trip') then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_pickup is null or char_length(v_pickup)>200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service='pickup' and v_dropoff_pref is not null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service in('dropoff','round_trip') then
   if v_dropoff_pref is null or char_length(v_dropoff_pref)>200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_service='round_trip' then
   if v_return_location is null or char_length(v_return_location)>200 or v_return_date is null or v_return_time is null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_date<v_pickup_date or v_return_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_pickup_date is null or v_pickup_time is null or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_pickup_date<p_check_in or v_pickup_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_passengers is null or v_passengers<1 or v_passengers>20 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if char_length(coalesce(v_pref->>'specialInstructions',''))>500 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
 end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select count(*)into inventory from rooms r where r.type=p_room_type and room_is_sellable(r.id,p_check_in,null);
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 nights:=p_check_out-p_check_in;total:=round(t.base_rate*nights,2);
 if jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))='array'then select coalesce(sum(round((ln.value->>'price')::numeric,2)),0)into v_transport from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln;end if;
 combined:=round(total+v_transport,2);required:=case p.calculation_type when'percentage'then round(combined*p.percentage_basis_points/10000.0,2)else least(combined,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,transport_lines,transportation_preferences,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,t.base_rate,total,combined,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),coalesce(p_transport_lines,'[]'::jsonb),p_transportation_preferences,now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end$_$;


ALTER FUNCTION "public"."create_booking_hold"("p_user_id" "uuid", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_nationality" "text", "p_expected_arrival" "text", "p_special_requests" "text", "p_request_options" "jsonb", "p_transport_lines" "jsonb", "p_transportation_preferences" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_housekeeping_task_for_guest_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin perform public.ensure_housekeeping_task_for_guest_request(new.id);return new;end$$;


ALTER FUNCTION "public"."create_housekeeping_task_for_guest_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_maintenance_for_guest_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r reservations%rowtype;begin if new.department<>'maintenance'then return new;end if;if new.reservation_id is not null then select * into r from reservations where id=new.reservation_id;end if;insert into maintenance_orders(room_id,room_number,reservation_id,guest_request_id,target_type,target_label,issue,category,priority,status,serviceability_impact,source_type,source_id)values(r.room_id,r.room_number,new.reservation_id,new.id,'room',r.room_number,new.request,'Guest request',case when new.priority in('low','normal','high','urgent','critical')then new.priority else'normal'end,'open','serviceable','guest_request',new.id::text)on conflict(guest_request_id)where guest_request_id is not null do nothing;return new;end$$;


ALTER FUNCTION "public"."create_maintenance_for_guest_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_operational_policy_snapshot"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
select jsonb_build_object('hotelTimezone',hotel_timezone,'checkInTime',check_in_time::text,'checkOutTime',check_out_time::text,'noShowCutoffTime',no_show_cutoff_time::text,'validIdRequired',valid_id_required,'minimumBookingAge',minimum_booking_age,'cancellationFullRefundDays',cancellation_full_refund_days,'cancellationPartialRefundDays',cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',cancellation_partial_refund_basis_points,'selfServiceModificationDays',self_service_modification_days,'incidentalsDue',incidentals_due,'petsAllowed',pets_allowed,'smokingAllowed',smoking_allowed,'specialRequestsGuaranteed',special_requests_guaranteed,'emailVerificationRequired',email_verification_required,'earlyCheckInAllowed',early_check_in_allowed)from hotel_operational_policies where key='default'$$;


ALTER FUNCTION "public"."current_operational_policy_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_cancel_transportation_request"("p_user_id" "uuid", "p_request_id" "uuid", "p_reason" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t transportation_requests%rowtype;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select tr.* into t from transportation_requests tr join reservations r on r.id=tr.reservation_id where tr.id=p_request_id and r.user_id=p_user_id for update of tr;
 if not found then raise exception'TRANSPORTATION_REQUEST_NOT_FOUND';end if;
 if t.status not in('REQUESTED','REVIEWED') then raise exception'CANCELLATION_NOT_PERMITTED';end if;
 if t.version<>p_expected_version then raise exception'TRANSPORTATION_REQUEST_STALE';end if;
 update transportation_requests set status='CANCELLED',cancelled_at=now(),cancellation_reason=nullif(trim(coalesce(p_reason,'')),'Customer cancelled the transportation request.'),version=t.version+1,updated_at=now() where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_cancel_transportation_request','transportation_request',t.id::text,jsonb_build_object('status',t.status,'version',t.version),jsonb_build_object('status','CANCELLED','version',t.version+1));
 return jsonb_build_object('id',t.id,'status','CANCELLED');end$$;


ALTER FUNCTION "public"."customer_cancel_transportation_request"("p_user_id" "uuid", "p_request_id" "uuid", "p_reason" "text", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_request_reservation_change"("p_user_id" "uuid", "p_reservation_id" "text", "p_check_in" "date", "p_check_out" "date", "p_room_type" "text", "p_guests" integer, "p_special_requests" "text", "p_reason" "text", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;t room_types%rowtype;i invoices%rowtype;existing reservation_change_requests%rowtype;policy jsonb;today date;cin date;cout date;rtype text;gcount int;inventory int;reserved int;held int;new_total numeric;diff numeric;days_before int;cid uuid;aid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status);end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_MODIFIABLE';end if;
 if jsonb_typeof(r.transport_lines)='array'and exists(select 1 from jsonb_array_elements(r.transport_lines)as l where coalesce((l->>'price')::numeric,0)>0)then raise exception'TRANSPORT_REQUIRES_STAFF';end if;
 if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in('pending','approved'))then raise exception'CHANGE_ALREADY_OPEN';end if;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());today:=hotel_today(policy);
 cin:=coalesce(p_check_in,r.check_in);cout:=coalesce(p_check_out,r.check_out);rtype:=coalesce(nullif(trim(p_room_type),''),r.room_type);gcount:=coalesce(p_guests,r.guests);
 if cin<today or cout<=cin or gcount<1 or nullif(trim(p_reason),'')is null then raise exception'INVALID_MODIFICATION';end if;
 select * into t from room_types where name=rtype and active for update;if not found or gcount>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,cin,policy);
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=t.name and x.status in('pending','confirmed','checked_in')and x.check_in<cout and x.check_out>cin;
 select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<cout and h.check_out>cin;
 if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 new_total:=round(t.base_rate*(cout-cin),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;diff:=round(new_total-i.amount,2);
 days_before:=r.check_in-today;
 insert into reservation_change_requests(reservation_id,requested_by,requested_check_in,requested_check_out,requested_room_type,requested_guests,requested_special_requests,reason,status,calculated_total,payment_difference,idempotency_key,execution_status)
 values(r.id,p_user_id,cin,cout,rtype,gcount,nullif(trim(p_special_requests),''),trim(p_reason),case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'executed'else'pending'end,new_total,diff,p_idempotency_key,case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'not_required'else'pending_review'end)returning id into cid;
 if days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then
  update reservations set check_in=cin,check_out=cout,room_type=rtype,guests=gcount,special_requests=coalesce(nullif(trim(p_special_requests),''),special_requests),total=new_total,room_id=null,room_number=null where id=r.id;
  update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id);update reservation_room_assignments set status='cancelled',released_at=now(),reason='Customer self-service reservation modification'where reservation_id=r.id and status='active';
 else
  insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
  values('reservation_modification','reservation_change_request',cid::text,r.id,'front_desk','normal',trim(p_reason),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'specialRequests',nullif(trim(p_special_requests),''),'calculatedTotal',new_total,'paymentDifference',diff),jsonb_build_object('requiresManagerApproval',true,'policyDays',coalesce((policy->>'selfServiceModificationDays')::int,3)),p_user_id)returning id into aid;
  update reservation_change_requests set manager_approval_id=aid where id=cid;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_request_reservation_change','reservation_change_request',cid::text,jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'total',r.total),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid));
 return jsonb_build_object('id',cid,'status',case when aid is null then'executed'else'pending'end,'executionStatus',case when aid is null then'not_required'else'pending_review'end,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid);end$$;


ALTER FUNCTION "public"."customer_request_reservation_change"("p_user_id" "uuid", "p_reservation_id" "text", "p_check_in" "date", "p_check_out" "date", "p_room_type" "text", "p_guests" integer, "p_special_requests" "text", "p_reason" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_submit_guest_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_type" "text", "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") RETURNS TABLE("id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;rid uuid;begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if nullif(trim(p_description),'')is null or length(trim(p_description))>500 then raise exception'INVALID_REQUEST';end if;
 select * into existing from guest_requests where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations rr where rr.id=p_reservation_id and rr.user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 select g.department,g.label into dept,label from public.guest_request_route(p_request_type) g;
 if p_request_type='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
 insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,idempotency_key)
 values(r.id,r.guest_id,label||': '||trim(p_description),p_request_type,coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key)returning guest_requests.id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_request','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',p_request_type,'department',dept));
 return query select rid,'open'::text;end$_$;


ALTER FUNCTION "public"."customer_submit_guest_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_type" "text", "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_submit_guest_requests"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_types" "text"[], "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") RETURNS TABLE("id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;reqtext text;key uuid;rt text;rid uuid;begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if array_length(p_request_types,1)is null or array_length(p_request_types,1)>12 then raise exception'INVALID_REQUEST';end if;
 if length(coalesce(p_description,''))>500 or p_idempotency_key is null then raise exception'INVALID_REQUEST';end if;
 select * into r from reservations rr where rr.id=p_reservation_id and rr.user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 foreach rt in array p_request_types loop
  if rt is null or char_length(trim(rt))=0 then continue;end if;
  key:=md5(p_idempotency_key::text||'|'||trim(rt))::uuid;
  select * into existing from guest_requests where idempotency_key=key;if found then return query select existing.id,existing.status;continue;end if;
  if trim(rt)='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
  select g.department,g.label into dept,label from public.guest_request_route(trim(rt)) g;
  reqtext:=case when nullif(trim(coalesce(p_description,'')),'')is null then label else label||': '||trim(p_description)end;
  insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,batch_id,approval_status,idempotency_key)
  values(r.id,r.guest_id,reqtext,trim(rt),coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key,'pending',key)returning guest_requests.id into rid;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_requests','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',trim(rt),'department',dept,'batchId',p_idempotency_key));
  return query select rid,'open'::text;
 end loop;end$_$;


ALTER FUNCTION "public"."customer_submit_guest_requests"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_types" "text"[], "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_submit_stay_payment"("p_user_id" "uuid", "p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid") RETURNS TABLE("payment_id" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;pid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_amount<=0 or p_method not in('manual_bank_transfer','manual_gcash')or nullif(trim(p_reference),'')is null then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,submitted_at)
 values(i.id,r.id,round(p_amount,2),'PHP',p_method,trim(p_reference),'stay_payment','pending_verification',p_idempotency_key,now())returning id into pid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_stay_payment','payment',pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',p_method));
 return query select pid,'pending_verification'::text;end$$;


ALTER FUNCTION "public"."customer_submit_stay_payment"("p_user_id" "uuid", "p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_submit_transportation_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_service_type" "text", "p_pickup_location" "text", "p_dropoff_location" "text", "p_pickup_date" "date", "p_pickup_time" "text", "p_return_location" "text", "p_return_date" "date", "p_return_time" "text", "p_passenger_count" integer, "p_special_instructions" "text", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare actor text;r reservations%rowtype;hotel_label text;existing transportation_requests%rowtype;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;today date;rid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_idempotency_key is null then raise exception'INVALID_TRANSPORTATION_REQUEST';end if;
 select * into existing from transportation_requests where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('id',existing.id,'status',existing.status);end if;
 if p_service_type not in('PICKUP','DROPOFF','ROUND_TRIP') then raise exception'INVALID_SERVICE_TYPE';end if;
 if p_passenger_count is null or p_passenger_count<1 or p_passenger_count>20 then raise exception'INVALID_PASSENGER_COUNT';end if;
 if p_pickup_date is null or p_pickup_time is null or p_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 select coalesce(nullif(trim(transfer_hotel_label),''),'HAVEN Hotel & Residences') into hotel_label from hotel_operational_policies where key='default';
 v_pickup:=nullif(trim(coalesce(p_pickup_location,'')),'');
 v_dropoff:=nullif(trim(coalesce(p_dropoff_location,'')),'');
 v_return_location:=nullif(trim(coalesce(p_return_location,'')),'');
 if p_service_type='PICKUP' then
  if v_pickup is null or char_length(v_pickup)>200 then raise exception'INVALID_PICKUP_LOCATION';end if;
  v_dropoff:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
 elsif p_service_type='DROPOFF' then
  if v_dropoff is null or char_length(v_dropoff)>200 then raise exception'INVALID_DROPOFF_LOCATION';end if;
  v_pickup:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
 else
  if v_pickup is null or char_length(v_pickup)>200 then raise exception'INVALID_PICKUP_LOCATION';end if;
  if v_return_location is null or char_length(v_return_location)>200 then raise exception'INVALID_RETURN_LOCATION';end if;
  if p_return_date is null or p_return_time is null or p_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception'INVALID_RETURN_SCHEDULE';end if;
  v_dropoff:=hotel_label;v_return_date:=p_return_date;v_return_time:=p_return_time;
  if v_return_date<p_pickup_date then raise exception'INVALID_RETURN_SCHEDULE';end if;
 end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;
 if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in') then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 today:=hotel_today(coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot()));
 if p_pickup_date<today then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if p_pickup_date>r.check_out then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if exists(select 1 from transportation_requests where reservation_id=r.id and service_type=p_service_type and pickup_date=p_pickup_date and pickup_location=v_pickup and status in('REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS'))then raise exception'TRANSPORTATION_REQUEST_DUPLICATE';end if;
 insert into transportation_requests(reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,idempotency_key)
 values(r.id,p_user_id,p_service_type,v_pickup,v_dropoff,p_pickup_date,p_pickup_time,v_return_location,v_return_date,v_return_time,p_passenger_count,nullif(trim(coalesce(p_special_instructions,'')),''),'REQUESTED',p_idempotency_key)
 returning id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_transportation_request','transportation_request',rid::text,jsonb_build_object('reservationId',r.id,'serviceType',p_service_type,'pickupDate',p_pickup_date,'pickupTime',p_pickup_time,'passengerCount',p_passenger_count));
 return jsonb_build_object('id',rid,'status','REQUESTED');end$_$;


ALTER FUNCTION "public"."customer_submit_transportation_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_service_type" "text", "p_pickup_location" "text", "p_dropoff_location" "text", "p_pickup_date" "date", "p_pickup_time" "text", "p_return_location" "text", "p_return_date" "date", "p_return_time" "text", "p_passenger_count" integer, "p_special_instructions" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_transportation_stay_window"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_check_in date;
  v_check_out date;
begin
  select check_in, check_out
    into v_check_in, v_check_out
    from public.reservations
   where id = new.reservation_id;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if new.pickup_date < v_check_in
     or new.pickup_date > v_check_out
     or (new.return_date is not null and (
       new.return_date < v_check_in or new.return_date > v_check_out
     )) then
    raise exception 'TRANSPORTATION_OUTSIDE_STAY_WINDOW';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_transportation_stay_window"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_housekeeping_task_for_guest_request"("p_guest_request_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare gr guest_requests%rowtype;r reservations%rowtype;task_id text;begin
 select * into gr from guest_requests where id=p_guest_request_id;if not found or gr.department<>'housekeeping'then return null;end if;
 select rv.* into r from reservations rv where rv.id=gr.reservation_id;if r.room_number is null then return null;end if;
 insert into housekeeping_tasks(room_id,room_number,reservation_id,guest_request_id,task,task_type,priority,status,due,notes,source_type,source_id)
 values(r.room_id,r.room_number,r.id,gr.id,gr.request,'guest_request',case when gr.priority in('high','urgent')then gr.priority else'normal'end,'pending','Guest requested service','Created from authoritative Guest Request','guest_request',gr.id::text)
 on conflict do nothing returning id into task_id;
 if task_id is not null then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'create_housekeeping_task_from_guest_request','housekeeping_task',task_id,jsonb_build_object('guestRequestId',gr.id,'reservationId',r.id,'roomId',r.room_id));end if;
 return task_id;end$$;


ALTER FUNCTION "public"."ensure_housekeeping_task_for_guest_request"("p_guest_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."escalate_manager_approval_to_owner"("p_approval_id" "uuid", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;a manager_approval_requests%rowtype;begin
  select role into actor from user_accounts where id=p_manager_user_id and active;
  if actor is null or actor<>'manager' then raise exception'MANAGER_ESCALATION_FORBIDDEN';end if;
  if nullif(trim(p_reason),'')is null then raise exception'OWNER_ESCALATION_REASON_REQUIRED';end if;
  select * into a from manager_approval_requests where id=p_approval_id for update;
  if not found then raise exception'APPROVAL_NOT_FOUND';end if;
  if a.status<>'pending' or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;
  if a.authority_level='owner' then raise exception'ALREADY_ESCALATED_TO_OWNER';end if;
  if a.severity not in('high','critical') then raise exception'OWNER_ESCALATION_REQUIRES_HIGH_RISK';end if;
  update manager_approval_requests set authority_level='owner',owner_escalated_by=p_manager_user_id,
    owner_escalated_at=now(),owner_escalation_reason=trim(p_reason),version=version+1,updated_at=now()
  where id=a.id;
  insert into manager_notes(approval_id,note,created_by)values(a.id,'Escalated to Owner: '||trim(p_reason),p_manager_user_id);
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_manager_user_id,'manager_escalate_to_owner','manager_approval',a.id::text,
    jsonb_build_object('authorityLevel',a.authority_level,'version',a.version),
    jsonb_build_object('authorityLevel','owner','reason',trim(p_reason),'version',a.version+1));
  return jsonb_build_object('id',a.id,'authorityLevel','owner','version',a.version+1);
end$$;


ALTER FUNCTION "public"."escalate_manager_approval_to_owner"("p_approval_id" "uuid", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_booking_holds"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare n integer;begin
 -- Only holds the guest never submitted payment for expire by time. A payment_submitted
 -- hold is waiting on staff, and staff verification has no deadline.
 update booking_holds set status='expired' where status='active' and expires_at<=now();get diagnostics n=row_count;
 -- Legacy backstop for rows already broken by the pre-20260907 expiry cascade; unreachable
 -- for new data (a website pending reservation is only ever created together with its
 -- payment_submitted hold, which no longer expires by time).
 update reservations r set status='cancelled',payment_status='failed',cancellation_reason=coalesce(cancellation_reason,'Reservation hold expired before deposit verification')
 where lower(coalesce(source,''))='website' and status='pending' and payment_due_at<=now() and exists(select 1 from booking_holds h where h.reservation_id=r.id and h.status='expired');
 update payments p set status='expired',notes=coalesce(notes,'Reservation hold expired before payment verification') where status='pending_verification' and exists(select 1 from reservations r where r.id=p.reservation_id and r.status='cancelled' and r.cancellation_reason='Reservation hold expired before deposit verification');
 return n;end$$;


ALTER FUNCTION "public"."expire_booking_holds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."file_booking_guest_requests"("p_reservation_id" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare r reservations%rowtype;opt text;dept text;label text;key uuid;b uuid;n int:=0;begin
 select * into r from reservations where id=p_reservation_id;if not found then return 0;end if;
 b:=md5(r.id||'|checkout')::uuid;
 if jsonb_typeof(coalesce(r.request_options,'[]'::jsonb))='array'then
  for opt in select e.value#>>'{}' from jsonb_array_elements(coalesce(r.request_options,'[]'::jsonb))e loop
   if opt is null or char_length(opt)=0 or char_length(opt)>40 then continue;end if;
   key:=md5(r.id||'|'||opt)::uuid;
   if exists(select 1 from guest_requests where idempotency_key=key)then continue;end if;
   select g.department,g.label into dept,label from public.guest_request_route(opt) g;
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,batch_id,idempotency_key)
   values(r.id,r.guest_id,label,opt,dept,'normal','open','{}'::jsonb,b,key);n:=n+1;
  end loop;
 end if;
 if nullif(trim(coalesce(r.special_requests,'')),'')is not null then
  key:=md5(r.id||'|general')::uuid;
  if not exists(select 1 from guest_requests where idempotency_key=key)then
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,batch_id,idempotency_key)
   values(r.id,r.guest_id,trim(r.special_requests),'general','front_desk','normal','open','{}'::jsonb,b,key);n:=n+1;
  end if;
 end if;
 if n>0 then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_guest_requests','reservation',r.id,jsonb_build_object('requestCount',n));end if;
 return n;end$$;


ALTER FUNCTION "public"."file_booking_guest_requests"("p_reservation_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."file_booking_transportation_request"("p_reservation_id" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare r reservations%rowtype;pref jsonb;service text;hotel_label text;
 v_pickup text;v_dropoff text;v_return_location text;v_return_date date;v_return_time text;
 v_pickup_date date;v_pickup_time text;v_passengers int;v_instructions text;key uuid;rid uuid;today date;
begin
 select * into r from reservations where id=p_reservation_id;if not found then return null;end if;
 pref:=r.transportation_preferences;
 if pref is null or jsonb_typeof(pref)<>'object' then return null;end if;
 key:=md5(r.id||'|transportation')::uuid;
 select id into rid from transportation_requests where idempotency_key=key;if found then return rid;end if;
 begin
  service:=upper(coalesce(pref->>'serviceType',''));
  v_pickup:=nullif(trim(coalesce(pref->>'pickupLocation','')),'');
  v_dropoff:=nullif(trim(coalesce(pref->>'dropoffLocation','')),'');
  v_return_location:=nullif(trim(coalesce(pref->>'returnLocation','')),'');
  v_pickup_date:=nullif(pref->>'pickupDate','')::date;
  v_pickup_time:=pref->>'pickupTime';
  v_return_date:=nullif(pref->>'returnDate','')::date;
  v_return_time:=pref->>'returnTime';
  v_passengers:=nullif(pref->>'passengerCount','')::int;
  v_instructions:=nullif(trim(coalesce(pref->>'specialInstructions','')),'');
  select coalesce(nullif(trim(transfer_hotel_label),''),'HAVEN Hotel & Residences')into hotel_label from hotel_operational_policies where key='default';
  today:=hotel_today(coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot()));
  if service not in('PICKUP','DROPOFF','ROUND_TRIP')then return null;end if;
  if v_pickup is null or char_length(v_pickup)>200 or v_pickup_date is null or v_pickup_time is null
   or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_passengers is null or v_passengers<1 or v_passengers>20
   or char_length(coalesce(v_instructions,''))>500 then return null;end if;
  if v_pickup_date<today or v_pickup_date>r.check_out then return null;end if;
  if service='PICKUP' then v_dropoff:=hotel_label;v_return_location:=null;v_return_date:=null;v_return_time:=null;
  elsif service='DROPOFF' then v_pickup:=hotel_label;v_dropoff:=coalesce(v_dropoff,'');v_return_location:=null;v_return_date:=null;v_return_time:=null;
   if nullif(v_dropoff,'')is null or char_length(v_dropoff)>200 then return null;end if;
  else
   v_dropoff:=hotel_label;
   if v_return_location is null or char_length(v_return_location)>200 or v_return_date is null or v_return_time is null
    or v_return_date<v_pickup_date or v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null;end if;
  end if;
  begin
   insert into transportation_requests(reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,idempotency_key)
   values(r.id,r.user_id,service,v_pickup,v_dropoff,v_pickup_date,v_pickup_time,v_return_location,v_return_date,v_return_time,v_passengers,v_instructions,'REQUESTED',key)
   returning id into rid;
  exception when unique_violation then
   insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_transportation_skipped','reservation',r.id,jsonb_build_object('reason','duplicate'));
   return null;
  end;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(r.user_id,'file_booking_transportation_request','transportation_request',rid::text,jsonb_build_object('reservationId',r.id,'serviceType',service,'pickupDate',v_pickup_date,'pickupTime',v_pickup_time,'passengerCount',v_passengers));
  return rid;
 exception when others then
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_transportation_skipped','reservation',r.id,jsonb_build_object('reason',sqlerrm));
  return null;
 end;
end$_$;


ALTER FUNCTION "public"."file_booking_transportation_request"("p_reservation_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_assign_room"("p_reservation_id" "text", "p_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;room rooms%rowtype;old reservation_room_assignments%rowtype;aid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'ROOM_ASSIGNMENT_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_ASSIGNABLE';end if;select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;
if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into old from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and old.room_id=room.id then return old.id;elsif found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=coalesce(nullif(trim(p_reason),''),'Pre-arrival reassignment')where id=old.id;end if;
insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,nullif(trim(p_reason),''))returning id into aid;update reservations set room_id=room.id,room_number=room.number where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'assign_room','reservation',r.id,jsonb_build_object('roomId',old.room_id),jsonb_build_object('roomId',room.id,'roomNumber',room.number,'reason',p_reason));return aid;end$$;


ALTER FUNCTION "public"."front_desk_assign_room"("p_reservation_id" "text", "p_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_change_room"("p_reservation_id" "text", "p_new_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;aid uuid;upgrade boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'ROOM_CHANGE_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'ROOM_CHANGE_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where id=p_new_room_id or number=p_new_room_id limit 1 for update;
if not found or newroom.id=oldroom.id then raise exception'INVALID_REPLACEMENT_ROOM';end if;upgrade:=newroom.type<>r.room_type;if upgrade and actor not in('owner','admin','manager')then raise exception'UPGRADE_AUTHORIZATION_REQUIRED';end if;if newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;update reservation_room_assignments set status='reassigned',released_at=now(),reason=trim(p_reason)where id=assignment.id;
insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,trim(p_reason),upgrade,case when upgrade then p_staff_user_id end)returning id into aid;
update rooms set status=case when exists(select 1 from maintenance_orders where room_id=oldroom.id and status in('open','in_progress'))then'maintenance'else'dirty'end,housekeeping='dirty'where id=oldroom.id;update rooms set status='occupied'where id=newroom.id;update reservations set room_id=newroom.id,room_number=newroom.number where id=r.id;
if not exists(select 1 from housekeeping_tasks where room_id=oldroom.id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Room-change turnover','high','pending','Before next assignment','Guest transferred: '||trim(p_reason));end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'change_room','reservation',r.id,jsonb_build_object('roomId',oldroom.id,'room',oldroom.number),jsonb_build_object('roomId',newroom.id,'room',newroom.number,'upgrade',upgrade,'reason',p_reason));return aid;end$$;


ALTER FUNCTION "public"."front_desk_change_room"("p_reservation_id" "text", "p_new_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_check_in"("p_reservation_id" "text", "p_room_id" "text", "p_staff_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;early_approved boolean;type_mismatch boolean;appr manager_approval_requests%rowtype;t room_types%rowtype;new_total numeric;new_paid numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;perform expire_booking_holds();
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;if r.guest_id is null or nullif(trim(r.guest_name),'')is null then raise exception'GUEST_DETAILS_REQUIRED';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid','credit'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_now:=now()at time zone tz;early_approved:=coalesce(r.early_check_in_approved_until>now(),false);
if local_now::date<r.check_in or local_now::date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;if local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time))and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false)and not early_approved then raise exception'EARLY_CHECKIN_NOT_ALLOWED';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found then raise exception'ROOM_TYPE_MISMATCH';end if;type_mismatch:=(room.type<>r.room_type);if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
if type_mismatch then
 select * into appr from manager_approval_requests where reservation_id=r.id and request_type='room_type_exception' and status='approved' and execution_status='awaiting_execution' and requested_action->>'roomType'=room.type order by requested_at desc limit 1;
 if appr.id is null then raise exception'ROOM_TYPE_MISMATCH';end if;
 select * into t from room_types where name=room.type and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 new_total:=round(t.base_rate*(r.check_out-r.check_in),2);new_paid:=i.paid;
 if new_total>new_paid then raise exception'ROOM_TYPE_EXCEPTION_BALANCE_DUE';end if;
end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,room_type=room.type,status='checked_in',checked_in_at=coalesce(checked_in_at,now()),total=case when appr.id is null then r.total else new_total end where id=r.id;update rooms set status='occupied'where id=room.id;
if appr.id is not null then
 update invoices set amount=new_total,balance=round(greatest(new_total-new_paid,0),2),credit_balance=round(greatest(new_paid-new_total,0),2),status=case when new_paid>new_total then'credit'when new_paid=new_total then'paid'when new_paid>0 then'partial'else'unpaid'end where id=i.id;
 update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=appr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_room_type_exception','manager_approval',appr.id::text,jsonb_build_object('reservationId',r.id,'previousRoomType',r.room_type,'roomType',room.type,'room',room.number,'newTotal',new_total));
end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number,'managerEarlyApproval',early_approved));end$$;


ALTER FUNCTION "public"."front_desk_check_in"("p_reservation_id" "text", "p_room_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_checkout"("p_reservation_id" "text", "p_staff_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;task_id text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'front_desk'then raise exception'CHECKOUT_FORBIDDEN';end if;
 select rv.* into r from reservations rv where rv.id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_CHECKOUT_READY';end if;select inv.* into i from invoices inv where inv.reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'FOLIO_BALANCE_REQUIRED';end if;
 select ra.* into a from reservation_room_assignments ra where ra.reservation_id=r.id and ra.status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
 update reservation_room_assignments set status='completed',released_at=now()where id=a.id;update reservations set status='checked_out',checked_out_at=coalesce(checked_out_at,now())where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=a.room_id;
 insert into housekeeping_tasks(room_id,room_number,reservation_id,task,task_type,priority,status,due,notes,source_type,source_id)
 values(a.room_id,r.room_number,r.id,'Post-checkout room turnover','checkout_cleaning','high','pending','Before next arrival','Automatically created at checkout','checkout',r.id)
 on conflict do nothing returning id into task_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_checkout','reservation',r.id,jsonb_build_object('status',r.status,'room',r.room_number),jsonb_build_object('status','checked_out','roomStatus','dirty','assignmentStatus','completed','housekeepingTaskId',task_id));end$$;


ALTER FUNCTION "public"."front_desk_checkout"("p_reservation_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_create_reservation"("p_guest_name" "text", "p_email" "text", "p_phone" "text", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_source" "text", "p_special_requests" "text", "p_expected_arrival" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS TABLE("reservation_id" "text", "confirmation_number" "text", "total" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t room_types%rowtype;inventory int;reserved int;guest text;rid text;confirmation text;amount numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'STAFF_RESERVATION_FORBIDDEN';end if;
if p_check_in<(now()at time zone'Asia/Manila')::date or p_check_out<=p_check_in then raise exception'INVALID_DATES';end if;if p_guest_count<1 then raise exception'INVALID_GUEST_COUNT';end if;
if nullif(trim(p_guest_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_phone),'')is null then raise exception'INVALID_GUEST_DETAILS';end if;if p_source not in('Front Desk','Walk-In','Phone')then raise exception'INVALID_BOOKING_SOURCE';end if;
select id into rid from reservations where idempotency_key=p_idempotency_key;if found then return query select r.id,r.confirmation_number,r.total from reservations r where r.id=rid;return;end if;
perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select count(*)into inventory from rooms r where r.type=p_room_type and room_is_sellable(r.id,p_check_in,null);select count(*)into reserved from reservations where room_type=p_room_type and status in('pending','confirmed','checked_in')and check_in<p_check_out and check_out>p_check_in;
if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;amount:=round(t.base_rate*(p_check_out-p_check_in),2);
select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;if guest is null then insert into guests(name,email,phone)values(trim(p_guest_name),lower(trim(p_email)),trim(p_phone))returning id into guest;else update guests set name=trim(p_guest_name),phone=trim(p_phone)where id=guest;end if;
confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into reservations(guest_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,special_requests,expected_arrival,payment_status,confirmation_number,idempotency_key)
values(guest,trim(p_guest_name),lower(trim(p_email)),p_room_type,p_check_in,p_check_out,p_guest_count,'confirmed',p_source,amount,0,0,nullif(trim(p_special_requests),''),nullif(trim(p_expected_arrival),''),'unpaid',confirmation,p_idempotency_key)returning id into rid;
insert into invoices(reservation_id,guest_name,amount,paid,balance,status,due_date)values(rid,trim(p_guest_name),amount,0,amount,'unpaid',p_check_in);
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'create_staff_reservation','reservation',rid,jsonb_build_object('source',p_source,'roomType',p_room_type,'checkIn',p_check_in,'checkOut',p_check_out,'total',amount));return query select rid,confirmation,amount;end$$;


ALTER FUNCTION "public"."front_desk_create_reservation"("p_guest_name" "text", "p_email" "text", "p_phone" "text", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_source" "text", "p_special_requests" "text", "p_expected_arrival" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_execute_manager_approval"("p_approval_id" "uuid", "p_room_id" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;new_paid numeric;available_same int;inventory int;reserved int;held int;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'FRONT_DESK_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into r from reservations where id=a.reservation_id for update;if not found or r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if a.request_type='room_upgrade'then
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);if available_same>0 then raise exception'APPROVAL_STALE';end if;
 select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
 if not found or newroom.type<>(a.requested_action->>'requestedRoomType')or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'UPGRADE_ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
 select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=a.reason where id=assignment.id;end if;
 insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,a.reason,true,a.reviewed_by);
 update reservations set room_id=newroom.id,room_number=newroom.number,room_type=newroom.type where id=r.id;update rooms set status=case when r.status='checked_in'then'occupied'else'reserved'end where id=newroom.id;if not coalesce((a.requested_action->>'waived')::boolean,false)and coalesce((a.requested_action->>'priceDifference')::numeric,0)>0 then select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Manager-approved room upgrade to '||newroom.type,'upgrade',round((a.requested_action->>'priceDifference')::numeric,2),p_staff_user_id,a.id,'manager_approval',a.id::text);update invoices set amount=round(amount+round((a.requested_action->>'priceDifference')::numeric,2),2)where id=i.id;perform sync_invoice_financials(i.id);end if;
 if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Manager-approved room-change turnover','high','pending','Before next arrival',a.reason);end if;
elsif a.request_type='reservation_modification'then
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;select * into t from room_types where name=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type)and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=t.name and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 if r.room_id is not null then select * into oldroom from rooms where id=r.room_id for update;end if;new_total:=round(t.base_rate*((a.requested_action->>'checkOut')::date-(a.requested_action->>'checkIn')::date),2);select * into i from invoices where reservation_id=r.id for update;new_paid:=i.paid;
 update reservations set check_in=(a.requested_action->>'checkIn')::date,check_out=(a.requested_action->>'checkOut')::date,room_type=t.name,total=new_total,room_id=null,room_number=null where id=r.id;
 update invoices set amount=new_total,balance=greatest(new_total-new_paid,0),credit_balance=greatest(new_paid-new_total,0),status=case when new_paid>new_total then'credit'when new_paid=new_total then'paid'when new_paid>0 then'partial'else'unpaid'end where id=i.id;
 update reservation_room_assignments set status='cancelled',released_at=now(),reason='Reservation modification requires reassignment'where reservation_id=r.id and status='active';if oldroom.id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=oldroom.id and status='reserved';end if;
elsif a.request_type='early_check_in'then update reservations set early_check_in_approved_until=now()+interval'8 hours'where id=r.id;
elsif a.request_type='late_checkout'then if r.status<>'checked_in'or exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'APPROVAL_STALE';end if;update reservations set late_checkout_until=(a.requested_action->>'requestedUntil')::timestamptz where id=r.id;
elsif a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'APPROVAL_STALE';end if;select * into oldroom from rooms where id=r.room_id for update;update reservations set status='checked_out',checked_out_at=now()where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=r.room_id;update reservation_room_assignments set status='released',released_at=now(),reason='Manager-approved checkout exception; balance remains collectible'where reservation_id=r.id and status='active';if not exists(select 1 from housekeeping_tasks where room_id=r.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(r.room_id,oldroom.number,'Checkout turnover','high','pending','Before next arrival','Checkout exception executed; folio balance retained: '||(a.requested_action->>'arrangement'));end if;
else raise exception'APPROVAL_REQUIRES_OTHER_DEPARTMENT';end if;
update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_approval','manager_approval',a.id::text,jsonb_build_object('requestType',a.request_type,'reservationId',r.id,'roomId',p_room_id));
return jsonb_build_object('status','executed','requestType',a.request_type,'reservationId',r.id);end$$;


ALTER FUNCTION "public"."front_desk_execute_manager_approval"("p_approval_id" "uuid", "p_room_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_extend_stay"("p_reservation_id" "text", "p_new_check_out" "date", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS TABLE("new_check_out" "date", "additional_amount" numeric, "new_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;added numeric;cid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'EXTENSION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'EXTENSION_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select id into cid from folio_charges where idempotency_key=p_idempotency_key;if found then select * into i from invoices where reservation_id=r.id;return query select r.check_out,(select amount from folio_charges where id=cid),i.balance;return;end if;
select * into room from rooms where id=r.room_id for update;select * into a from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)then raise exception'EXTENSION_REQUIRES_ROOM_CHANGE';end if;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;added:=round(t.base_rate*(p_new_check_out-r.check_out),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Stay extension through '||p_new_check_out,'extension',added,p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into cid;
update invoices set amount=round(amount+added,2)where id=i.id;update reservations set check_out=p_new_check_out,total=round(total+added,2)where id=r.id;update reservation_room_assignments set check_out=p_new_check_out where id=a.id;select * into i from sync_invoice_financials(i.id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'extend_stay','reservation',r.id,jsonb_build_object('checkOut',r.check_out,'total',r.total),jsonb_build_object('checkOut',p_new_check_out,'additionalAmount',added,'reason',trim(p_reason)));return query select p_new_check_out,added,i.balance;end$$;


ALTER FUNCTION "public"."front_desk_extend_stay"("p_reservation_id" "text", "p_new_check_out" "date", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_review_guest_request_batch"("p_staff_user_id" "uuid", "p_batch_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;count int;begin
 select role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'front_desk'then raise exception'FRONT_DESK_ACCESS_REQUIRED';end if;
 if p_decision not in('approve','reject')then raise exception'INVALID_DECISION';end if;
 if length(coalesce(p_note,''))>500 then raise exception'INVALID_NOTE';end if;
 select count(*)into count from(select 1 from guest_requests where batch_id=p_batch_id and approval_status='pending' for update)locked;
 if count=0 then raise exception'ALREADY_REVIEWED';end if;
 if p_decision='approve' then
  update guest_requests set approval_status='approved',approved_by=p_staff_user_id,approved_at=now(),approval_note=nullif(trim(coalesce(p_note,'')),'')
   where batch_id=p_batch_id and approval_status='pending';
 else
  update guest_requests set approval_status='rejected',approved_by=p_staff_user_id,approved_at=now(),approval_note=nullif(trim(coalesce(p_note,'')),''),status='cancelled'
   where batch_id=p_batch_id and approval_status='pending';
  update housekeeping_tasks h set status='cancelled',updated_at=now(),version=version+1
   where h.source_type='guest_request' and h.status in('pending','assigned','deferred')
    and exists(select 1 from guest_requests g where g.batch_id=p_batch_id and g.id::text=h.source_id);
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_staff_user_id,'front_desk_review_guest_request_batch','guest_request',p_batch_id::text,jsonb_build_object('decision',p_decision,'note',nullif(trim(coalesce(p_note,'')),''),'requestCount',count));
 return count;end$$;


ALTER FUNCTION "public"."front_desk_review_guest_request_batch"("p_staff_user_id" "uuid", "p_batch_id" "uuid", "p_decision" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."front_desk_update_guest"("p_reservation_id" "text", "p_phone" "text", "p_expected_arrival" "text", "p_operational_notes" "text", "p_staff_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;g guests%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'GUEST_UPDATE_FORBIDDEN';end if;select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('pending','confirmed','checked_in')then raise exception'RESERVATION_NOT_EDITABLE';end if;select * into g from guests where id=r.guest_id for update;if not found then raise exception'GUEST_NOT_FOUND';end if;
update guests set phone=coalesce(nullif(trim(p_phone),''),phone),special_requests=coalesce(nullif(trim(p_operational_notes),''),special_requests)where id=g.id;update reservations set expected_arrival=coalesce(nullif(trim(p_expected_arrival),''),expected_arrival),special_requests=coalesce(nullif(trim(p_operational_notes),''),special_requests)where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'update_guest_operations','guest',g.id,jsonb_build_object('phone',g.phone,'expectedArrival',r.expected_arrival,'notes',r.special_requests),jsonb_build_object('phone',coalesce(nullif(trim(p_phone),''),g.phone),'expectedArrival',coalesce(nullif(trim(p_expected_arrival),''),r.expected_arrival),'notes',coalesce(nullif(trim(p_operational_notes),''),r.special_requests)));end$$;


ALTER FUNCTION "public"."front_desk_update_guest"("p_reservation_id" "text", "p_phone" "text", "p_expected_arrival" "text", "p_operational_notes" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guest_request_route"("p_request_type" "text") RETURNS TABLE("department" "text", "label" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
select
 case p_request_type
  when'extra_towels'then 'housekeeping' when'extra_pillows'then 'housekeeping'
  when'toiletries'then 'housekeeping' when'baby_crib'then 'housekeeping'
  when'housekeeping'then 'housekeeping' when'maintenance'then 'maintenance'
  else 'front_desk' end,
 case p_request_type
  when'extra_towels'then 'Extra towels' when'extra_pillows'then 'Extra pillows'
  when'toiletries'then 'Toiletries' when'baby_crib'then 'Baby crib'
  when'housekeeping'then 'Housekeeping request' when'maintenance'then 'Maintenance concern'
  when'room_assistance'then 'Room assistance' when'room_change'then 'Room change request'
  when'stay_extension'then 'Stay extension request' when'general'then 'General hotel assistance'
  when'high_floor_quiet'then 'High floor / quiet room request'
  when'early_check_in'then 'Early check-in request' when'late_check_out'then 'Late check-out request'
  when'celebration'then 'Celebration arrangement request'
  else replace(p_request_type,'_',' ') end;$$;


ALTER FUNCTION "public"."guest_request_route"("p_request_type" "text") OWNER TO "postgres";


CREATE PROCEDURE "public"."haven_replace_functions"(IN "p_names" "text"[], IN "p_old" "text", IN "p_new" "text", IN "p_expected_min" integer DEFAULT 1)
    LANGUAGE "plpgsql"
    AS $$
        declare f record;definition text;changed integer:=0;begin
          for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=any(p_names) loop
            definition:=pg_get_functiondef(f.oid);
            if strpos(definition,p_old)>0 then execute replace(definition,p_old,p_new);changed:=changed+1;end if;
          end loop;
          if changed<p_expected_min then raise exception 'HARDENING_PATTERN_NOT_FOUND: % in %',p_old,p_names;end if;
        end$$;


ALTER PROCEDURE "public"."haven_replace_functions"(IN "p_names" "text"[], IN "p_old" "text", IN "p_new" "text", IN "p_expected_min" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hotel_today"("p_policy" "jsonb" DEFAULT NULL::"jsonb") RETURNS "date"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select (now() at time zone coalesce(
    p_policy->>'hotelTimezone',
    (select hotel_timezone from hotel_operational_policies where key='default'),
    'Asia/Manila'))::date
$$;


ALTER FUNCTION "public"."hotel_today"("p_policy" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."housekeeping_assign_task"("p_task_id" "text", "p_assigned_user_id" "uuid", "p_reason" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;target_role text;t housekeeping_tasks%rowtype;action_name text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'housekeeping'then raise exception'HOUSEKEEPING_ASSIGNMENT_FORBIDDEN';end if;
 if actor='housekeeping'and p_assigned_user_id<>p_staff_user_id then raise exception'SELF_ASSIGNMENT_ONLY';end if;
 select ua.role into target_role from user_accounts ua where ua.id=p_assigned_user_id and ua.active;if target_role is null or target_role<>'housekeeping'then raise exception'INVALID_HOUSEKEEPING_ASSIGNEE';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;if t.status not in('pending','assigned','deferred')or t.task_type='inspection'then raise exception'TASK_NOT_ASSIGNABLE';end if;
 if actor='housekeeping'and t.assigned_user_id is not null and t.assigned_user_id<>p_staff_user_id then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 if t.assigned_user_id=p_assigned_user_id then return jsonb_build_object('taskId',t.id,'status','assigned','assignedUserId',p_assigned_user_id);end if;
 action_name:=case when t.assigned_user_id is null then'housekeeping_assign_task'else'housekeeping_reassign_task'end;
 insert into housekeeping_task_assignments(task_id,previous_user_id,assigned_user_id,assigned_by,reason)values(t.id,t.assigned_user_id,p_assigned_user_id,p_staff_user_id,nullif(trim(p_reason),''));
 update housekeeping_tasks set status='assigned',assigned_user_id=p_assigned_user_id,assigned_by=p_staff_user_id,assigned_at=now(),version=version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,action_name,'housekeeping_task',t.id,jsonb_build_object('assignedUserId',t.assigned_user_id,'status',t.status),jsonb_build_object('assignedUserId',p_assigned_user_id,'status','assigned','reason',nullif(trim(p_reason),'')));
 return jsonb_build_object('taskId',t.id,'status','assigned','assignedUserId',p_assigned_user_id);end$$;


ALTER FUNCTION "public"."housekeeping_assign_task"("p_task_id" "text", "p_assigned_user_id" "uuid", "p_reason" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."housekeeping_complete_task"("p_task_id" "text", "p_checklist" "jsonb", "p_notes" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;inspection_required boolean;blocked boolean;next_state text;next_room_status text;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'housekeeping'then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;if t.status<>'in_progress'then raise exception'TASK_NOT_COMPLETABLE';end if;if t.started_by is distinct from p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;select * into room from rooms where id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if t.task_type in('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')and room.status in('occupied','reserved')then raise exception'ROOM_STATE_CHANGED';end if;select coalesce((select housekeeping_inspection_required from hotel_operational_policies where key='default'),true)into inspection_required;blocked:=maintenance_room_is_blocked(room.id);next_state:=case when room.status='occupied'then'clean'when inspection_required then'inspection'else'clean'end;next_room_status:=case when room.status='occupied'then'occupied'when blocked then'maintenance'when room.status in('dirty','maintenance')then'available'else room.status end;update housekeeping_tasks set status='completed',completed_at=now(),completed_by=p_staff_user_id,checklist=coalesce(p_checklist,'{}'),notes=concat_ws(E'\n',notes,nullif(trim(p_notes),'')),inspection_status=case when room.status<>'occupied'and inspection_required then'pending'else'not_required'end,version=version+1,updated_at=now()where id=t.id;update rooms set housekeeping=next_state,status=next_room_status where id=room.id;if t.guest_request_id is not null then update guest_requests set status='completed'where id=t.guest_request_id and status<>'completed';end if;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_complete_task','housekeeping_task',t.id,jsonb_build_object('status',t.status),jsonb_build_object('status','completed','maintenanceBlocked',blocked));return jsonb_build_object('taskId',t.id,'status','completed','roomState',next_state,'maintenanceBlocked',blocked);end$$;


ALTER FUNCTION "public"."housekeeping_complete_task"("p_task_id" "text", "p_checklist" "jsonb", "p_notes" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."housekeeping_defer_task"("p_task_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'housekeeping'then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'DEFERRAL_REASON_REQUIRED';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found or t.status not in('assigned','in_progress')then raise exception'TASK_NOT_DEFERRABLE';end if;if t.task_type not in('stayover_cleaning','guest_request')then raise exception'CHECKOUT_CLEANING_NOT_DEFERRABLE';end if;
 if t.assigned_user_id is distinct from p_staff_user_id and t.started_by is distinct from p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 select r.* into room from rooms r where r.id=t.room_id for update;update housekeeping_tasks set status='deferred',deferred_by=p_staff_user_id,deferred_at=now(),deferred_reason=trim(p_reason),version=version+1,updated_at=now()where id=t.id;
 if room.status='occupied'then update rooms set housekeeping='clean'where id=room.id and housekeeping='cleaning';end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_defer_task','housekeeping_task',t.id,jsonb_build_object('status',t.status),jsonb_build_object('status','deferred','reason',trim(p_reason)));
 return jsonb_build_object('taskId',t.id,'status','deferred');end$$;


ALTER FUNCTION "public"."housekeeping_defer_task"("p_task_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."housekeeping_inspect_task"("p_task_id" "text", "p_result" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;blocked boolean;reclean_id text;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'housekeeping'then raise exception'HOUSEKEEPING_INSPECTION_FORBIDDEN';end if;
 if p_result not in('passed','failed')or(p_result='failed'and nullif(trim(p_reason),'')is null)then raise exception'INVALID_INSPECTION_RESULT';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;
 if t.inspection_status<>'pending'or not((t.status='completed')or(t.task_type='inspection'and t.status in('assigned','in_progress')))then raise exception'INSPECTION_ALREADY_RECORDED';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.room_id,0));select r.* into room from rooms r where r.id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if room.status in('occupied','reserved')then raise exception'ROOM_NOT_VACANT_FOR_READINESS';end if;
 select exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))into blocked;
 update housekeeping_tasks set status=case when task_type='inspection'then'completed'else status end,completed_at=case when task_type='inspection'then coalesce(completed_at,now())else completed_at end,completed_by=case when task_type='inspection'then p_staff_user_id else completed_by end,inspection_status=p_result,inspected_by=p_staff_user_id,inspected_at=now(),inspection_reason=nullif(trim(p_reason),''),version=version+1,updated_at=now()where id=t.id;
 if p_result='failed'then
  update rooms set housekeeping='reclean_required',status=case when status='maintenance'then'maintenance'else'dirty'end where id=room.id;
  insert into housekeeping_tasks(room_id,room_number,task,task_type,priority,status,due,notes,source_type,source_id,parent_task_id,idempotency_key)
  values(room.id,room.number,'Reclean after failed inspection','reclean','high','pending','Before next arrival','Inspection failed: '||trim(p_reason),'inspection',t.id,t.id,p_idempotency_key)returning id into reclean_id;
 else
  update rooms set housekeeping='clean',status=case when blocked then'maintenance'when status in('dirty','maintenance')then'available'else status end where id=room.id;
  if not blocked then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_room_ready','room',room.id,jsonb_build_object('taskId',t.id,'inspectionStatus','passed'));end if;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_inspect_task','housekeeping_task',t.id,jsonb_build_object('inspectionStatus',t.inspection_status,'roomState',room.housekeeping),jsonb_build_object('inspectionStatus',p_result,'reason',nullif(trim(p_reason),''),'maintenanceBlocked',blocked,'recleanTaskId',reclean_id));
 return jsonb_build_object('taskId',t.id,'inspectionStatus',p_result,'roomState',case when p_result='failed'then'reclean_required'else'clean'end,'maintenanceBlocked',blocked,'recleanTaskId',reclean_id);exception when unique_violation then raise exception'INSPECTION_ALREADY_RECORDED';end$$;


ALTER FUNCTION "public"."housekeeping_inspect_task"("p_task_id" "text", "p_result" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."housekeeping_report_maintenance"("p_task_id" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;order_id text;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'housekeeping'then raise exception'MAINTENANCE_REPORT_FORBIDDEN';end if;if nullif(trim(p_description),'')is null or p_priority not in('normal','high','urgent')then raise exception'INVALID_MAINTENANCE_REPORT';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found or t.room_id is null then raise exception'TASK_NOT_FOUND';end if;select * into room from rooms where id=t.room_id for update;insert into maintenance_orders(room_id,room_number,issue,category,priority,status,serviceability_impact,notes,reported_by,housekeeping_task_id,source_type,source_id,idempotency_key)values(room.id,room.number,trim(p_description),nullif(trim(p_category),''),p_priority,'open','serviceable','Reported during Housekeeping task '||t.id,p_staff_user_id,t.id,'housekeeping_task',p_idempotency_key::text,p_idempotency_key)returning id into order_id;insert into maintenance_order_events(order_id,event_type,to_status,note,actor_user_id,metadata)values(order_id,'reported','open',trim(p_description),p_staff_user_id,jsonb_build_object('housekeepingTaskId',t.id,'roomId',room.id));insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_report_maintenance','maintenance_order',order_id,jsonb_build_object('taskId',t.id,'roomId',room.id,'priority',p_priority));return order_id;exception when unique_violation then select id into order_id from maintenance_orders where idempotency_key=p_idempotency_key limit 1;if order_id is null then raise;end if;return order_id;end$$;


ALTER FUNCTION "public"."housekeeping_report_maintenance"("p_task_id" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."housekeeping_start_task"("p_task_id" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;begin
 select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;if actor is null or actor<>'housekeeping'then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;
 select h.* into t from housekeeping_tasks h where h.id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;
 if t.task_type='inspection'or t.status not in('pending','assigned','deferred')then raise exception'TASK_ALREADY_STARTED';end if;
 if t.assigned_user_id is not null and t.assigned_user_id<>p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 if t.assigned_user_id is null then insert into housekeeping_task_assignments(task_id,assigned_user_id,assigned_by,reason)values(t.id,p_staff_user_id,p_staff_user_id,'Self-assigned when work started');insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'housekeeping_assign_task','housekeeping_task',t.id,jsonb_build_object('assignedUserId',p_staff_user_id,'status','assigned','reason','Self-assigned when work started'));end if;
 if t.room_id is null then raise exception'TASK_ROOM_REQUIRED';end if;perform pg_advisory_xact_lock(hashtextextended(t.room_id,0));select r.* into room from rooms r where r.id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;
 if t.task_type in('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')and room.status in('occupied','reserved')then raise exception'ROOM_OCCUPIED_FOR_CHECKOUT_CLEANING';end if;
 if t.task_type='stayover_cleaning'and room.status<>'occupied'then raise exception'STAYOVER_REQUIRES_OCCUPIED_ROOM';end if;
 update housekeeping_tasks set status='in_progress',assigned_user_id=coalesce(assigned_user_id,p_staff_user_id),assigned_at=coalesce(assigned_at,now()),started_by=p_staff_user_id,started_at=now(),deferred_by=null,deferred_at=null,deferred_reason=null,version=version+1,updated_at=now()where id=t.id;
 update rooms set housekeeping='cleaning'where id=room.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_start_task','housekeeping_task',t.id,jsonb_build_object('status',t.status,'roomState',room.housekeeping),jsonb_build_object('status','in_progress','roomState','cleaning','roomId',room.id));
 return jsonb_build_object('taskId',t.id,'status','in_progress','roomState','cleaning');exception when unique_violation then raise exception'TASK_ALREADY_STARTED';end$$;


ALTER FUNCTION "public"."housekeeping_start_task"("p_task_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_housekeeping_tasks_to_assigned_room"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare gr guest_requests%rowtype;begin
 if new.room_id is not null and new.room_id is distinct from old.room_id then
  update housekeeping_tasks set room_id=new.room_id,room_number=new.room_number,updated_at=now(),version=version+1 where reservation_id=new.id and room_id is null and status in('pending','assigned','deferred');
  for gr in select g.* from guest_requests g where g.reservation_id=new.id and g.department='housekeeping' and g.status in('open','in_progress') and not exists(select 1 from housekeeping_tasks h where h.source_type='guest_request' and h.source_id=g.id::text and h.status<>'cancelled')loop
   perform public.ensure_housekeeping_task_for_guest_request(gr.id);
  end loop;
 end if;return new;end$$;


ALTER FUNCTION "public"."link_housekeeping_tasks_to_assigned_room"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_add_progress"("p_order_id" "text", "p_note" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;if nullif(trim(p_note),'')is null or p_parts_status not in('none','required','ordered','available')then raise exception'INVALID_PROGRESS_UPDATE';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('in_progress','waiting_parts','deferred')then raise exception'WORK_ORDER_NOT_ACTIVE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;update maintenance_orders set notes=concat_ws(E'\n',notes,trim(p_note)),parts_status=p_parts_status,estimated_completion=coalesce(p_estimated_completion,estimated_completion),version=version+1,updated_at=now()where id=m.id;insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'progress',m.status,m.status,trim(p_note),p_staff_user_id,jsonb_build_object('partsStatus',p_parts_status,'estimatedCompletion',p_estimated_completion));return jsonb_build_object('id',m.id,'status',m.status);end$$;


ALTER FUNCTION "public"."maintenance_add_progress"("p_order_id" "text", "p_note" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_assign_work_order"("p_order_id" "text", "p_assigned_user_id" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;target_role text;m maintenance_orders%rowtype;target uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;
 target:=coalesce(p_assigned_user_id,p_staff_user_id);select role into target_role from user_accounts where id=target and active;if target_role is null or(target_role<>'maintenance'and target_role not in('owner','admin'))then raise exception'INVALID_MAINTENANCE_ASSIGNEE';end if;if actor='maintenance'and target<>p_staff_user_id then raise exception'CANNOT_ASSIGN_ANOTHER_TECHNICIAN';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('open','assigned','deferred','waiting_parts')then raise exception'WORK_ORDER_NOT_ASSIGNABLE';end if;
 update maintenance_order_assignments set released_at=now(),release_reason='Reassigned'where order_id=m.id and released_at is null and assigned_user_id<>target;
 insert into maintenance_order_assignments(order_id,assigned_user_id,assigned_by)values(m.id,target,p_staff_user_id)on conflict do nothing;
 update maintenance_orders set assigned_user_id=target,assigned_by=p_staff_user_id,assigned_at=now(),assignee=(select name from user_accounts where id=target),status=case when status='open'then'assigned'else status end,version=version+1,updated_at=now()where id=m.id;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,actor_user_id,metadata)values(m.id,'assigned',m.status,case when m.status='open'then'assigned'else m.status end,p_staff_user_id,jsonb_build_object('assignedUserId',target));
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_assign_work_order','maintenance_order',m.id,jsonb_build_object('assignedUserId',m.assigned_user_id),jsonb_build_object('assignedUserId',target));return jsonb_build_object('id',m.id,'status',case when m.status='open'then'assigned'else m.status end,'assignedUserId',target);
end$$;


ALTER FUNCTION "public"."maintenance_assign_work_order"("p_order_id" "text", "p_assigned_user_id" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_cancel_work_order"("p_order_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'CANCELLATION_REASON_REQUIRED';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('open','assigned','deferred','waiting_parts')then raise exception'WORK_ORDER_NOT_CANCELLABLE';end if;if actor='maintenance'and m.assigned_user_id is not null and m.assigned_user_id<>p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;update maintenance_orders set status='cancelled',cancelled_by=p_staff_user_id,cancelled_at=now(),cancellation_reason=trim(p_reason),version=version+1,updated_at=now()where id=m.id;update maintenance_order_assignments set released_at=now(),release_reason='Work order cancelled'where order_id=m.id and released_at is null;perform maintenance_restore_room_state(m.room_id);insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id)values(m.id,'cancelled',m.status,'cancelled',trim(p_reason),p_staff_user_id);insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_cancel_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status','cancelled','reason',trim(p_reason)));return jsonb_build_object('id',m.id,'status','cancelled');end$$;


ALTER FUNCTION "public"."maintenance_cancel_work_order"("p_order_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_close_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status<>'resolved'then raise exception'WORK_ORDER_NOT_CLOSABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;update maintenance_orders set status='completed',completed_by=p_staff_user_id,completed_at=now(),version=version+1,updated_at=now()where id=m.id;insert into maintenance_order_events(order_id,event_type,from_status,to_status,actor_user_id)values(m.id,'closed','resolved','completed',p_staff_user_id);insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_close_work_order','maintenance_order',m.id,jsonb_build_object('status','resolved'),jsonb_build_object('status','completed'));return jsonb_build_object('id',m.id,'status','completed');end$$;


ALTER FUNCTION "public"."maintenance_close_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_create_work_order"("p_room_id" "text", "p_target_type" "text", "p_target_label" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_source_type" "text", "p_source_id" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;room rooms%rowtype;order_id text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor not in('front_desk','maintenance')then raise exception'MAINTENANCE_REPORT_FORBIDDEN';end if;
 if nullif(trim(p_description),'')is null or p_priority not in('low','normal','high','urgent','critical')or coalesce(p_target_type,'room')not in('room','equipment','facility')then raise exception'INVALID_MAINTENANCE_REPORT';end if;
 if p_room_id is not null then select * into room from rooms where id=p_room_id or number=p_room_id limit 1;if not found then raise exception'ROOM_NOT_FOUND';end if;end if;
 if p_guest_request_id is not null and not exists(select 1 from guest_requests where id=p_guest_request_id and department='maintenance')then raise exception'INVALID_GUEST_REQUEST';end if;
 insert into maintenance_orders(room_id,room_number,reservation_id,guest_request_id,target_type,target_label,issue,category,priority,status,serviceability_impact,reported_by,source_type,source_id,idempotency_key)
 values(room.id,room.number,p_reservation_id,p_guest_request_id,coalesce(p_target_type,'room'),coalesce(nullif(trim(p_target_label),''),room.number),trim(p_description),nullif(trim(p_category),''),p_priority,'open','serviceable',p_staff_user_id,coalesce(nullif(trim(p_source_type),''),'manual'),nullif(trim(p_source_id),''),p_idempotency_key)returning id into order_id;
 insert into maintenance_order_events(order_id,event_type,to_status,note,actor_user_id,metadata)values(order_id,'reported','open',trim(p_description),p_staff_user_id,jsonb_build_object('sourceType',coalesce(p_source_type,'manual'),'roomId',room.id));
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'maintenance_create_work_order','maintenance_order',order_id,jsonb_build_object('roomId',room.id,'priority',p_priority,'sourceType',coalesce(p_source_type,'manual')));
 return order_id;
exception when unique_violation then
 select id into order_id from maintenance_orders where idempotency_key=p_idempotency_key or(p_guest_request_id is not null and guest_request_id=p_guest_request_id)or(p_source_id is not null and source_type=p_source_type and source_id=p_source_id)limit 1;
 if order_id is null then raise;end if;return order_id;
end$$;


ALTER FUNCTION "public"."maintenance_create_work_order"("p_room_id" "text", "p_target_type" "text", "p_target_label" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_source_type" "text", "p_source_id" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_defer_work_order"("p_order_id" "text", "p_status" "text", "p_reason" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;m maintenance_orders%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;if p_status not in('waiting_parts','deferred')or nullif(trim(p_reason),'')is null or p_parts_status not in('none','required','ordered','available')then raise exception'INVALID_DEFERMENT';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status<>'in_progress'then raise exception'WORK_ORDER_NOT_DEFERABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;
 update maintenance_orders set status=p_status,waiting_reason=trim(p_reason),parts_status=p_parts_status,parts_required=parts_required or p_status='waiting_parts',estimated_completion=p_estimated_completion,notes=concat_ws(E'\n',notes,trim(p_reason)),version=version+1,updated_at=now()where id=m.id;insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'deferred',m.status,p_status,trim(p_reason),p_staff_user_id,jsonb_build_object('partsStatus',p_parts_status,'estimatedCompletion',p_estimated_completion));insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_defer_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status',p_status,'reason',trim(p_reason)));return jsonb_build_object('id',m.id,'status',p_status);
end$$;


ALTER FUNCTION "public"."maintenance_defer_work_order"("p_order_id" "text", "p_status" "text", "p_reason" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_record_diagnosis"("p_order_id" "text", "p_diagnosis" "text", "p_severity" "text", "p_serviceability_impact" "text", "p_serviceability_reason" "text", "p_parts_required" boolean, "p_parts_status" "text", "p_external_service_required" boolean, "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;m maintenance_orders%rowtype;room rooms%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;
 if nullif(trim(p_diagnosis),'')is null or p_severity not in('low','normal','high','critical')or p_serviceability_impact not in('serviceable','blocked','out_of_service')or(p_serviceability_impact<>'serviceable'and nullif(trim(p_serviceability_reason),'')is null)or p_parts_status not in('none','required','ordered','available')then raise exception'INVALID_DIAGNOSIS';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('assigned','in_progress','waiting_parts','deferred')then raise exception'WORK_ORDER_NOT_DIAGNOSABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;
 if m.room_id is not null then perform pg_advisory_xact_lock(hashtextextended(m.room_id,0));select * into room from rooms where id=m.room_id for update;end if;
 update maintenance_orders set diagnosis=trim(p_diagnosis),severity=p_severity,serviceability_impact=p_serviceability_impact,serviceability_reason=nullif(trim(p_serviceability_reason),''),serviceability_decided_by=p_staff_user_id,serviceability_decided_at=now(),parts_required=coalesce(p_parts_required,false),parts_status=p_parts_status,external_service_required=coalesce(p_external_service_required,false),estimated_completion=p_estimated_completion,version=version+1,updated_at=now()where id=m.id;
 if m.room_id is not null and p_serviceability_impact in('blocked','out_of_service')and room.status not in('occupied','reserved')then update rooms set status='maintenance'where id=room.id;elsif m.room_id is not null and p_serviceability_impact='serviceable'then perform maintenance_restore_room_state(m.room_id);end if;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'diagnosis',m.status,m.status,trim(p_diagnosis),p_staff_user_id,jsonb_build_object('severity',p_severity,'serviceabilityImpact',p_serviceability_impact,'partsStatus',p_parts_status));insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_record_diagnosis','maintenance_order',m.id,jsonb_build_object('serviceabilityImpact',m.serviceability_impact),jsonb_build_object('serviceabilityImpact',p_serviceability_impact,'severity',p_severity));return jsonb_build_object('id',m.id,'status',m.status,'serviceabilityImpact',p_serviceability_impact);
end$$;


ALTER FUNCTION "public"."maintenance_record_diagnosis"("p_order_id" "text", "p_diagnosis" "text", "p_severity" "text", "p_serviceability_impact" "text", "p_serviceability_reason" "text", "p_parts_required" boolean, "p_parts_status" "text", "p_external_service_required" boolean, "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_resolve_work_order"("p_order_id" "text", "p_resolution" "text", "p_cleanup_required" boolean, "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;m maintenance_orders%rowtype;room rooms%rowtype;cleanup_id text;cleanup_type text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_RESOLUTION_FORBIDDEN';end if;if nullif(trim(p_resolution),'')is null then raise exception'RESOLUTION_REQUIRED';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('in_progress','waiting_parts','deferred')then raise exception'WORK_ORDER_NOT_RESOLVABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;if nullif(trim(m.diagnosis),'')is null then raise exception'DIAGNOSIS_REQUIRED';end if;
 if m.room_id is not null then perform pg_advisory_xact_lock(hashtextextended(m.room_id,0));select * into room from rooms where id=m.room_id for update;end if;
 update maintenance_orders set status='resolved',resolution=trim(p_resolution),resolved_by=p_staff_user_id,resolved_at=now(),cleanup_required=coalesce(p_cleanup_required,false),serviceability_impact='serviceable',serviceability_reason='Technical repair resolved',version=version+1,updated_at=now()where id=m.id;
 if m.guest_request_id is not null then update guest_requests set status='completed'where id=m.guest_request_id and status<>'completed';end if;
 if m.room_id is not null and coalesce(p_cleanup_required,false)then cleanup_type:=case when room.status='occupied'then'stayover_cleaning'else'maintenance_cleanup'end;insert into housekeeping_tasks(room_id,room_number,task,task_type,priority,status,due,notes,reservation_id,guest_request_id,source_type,source_id)values(room.id,room.number,'Post-maintenance cleanup',cleanup_type,case when m.priority in('urgent','critical')then'high'else'normal'end,'pending','Before room readiness','Repair resolved: '||trim(p_resolution),m.reservation_id,null,'maintenance_order',m.id)returning id into cleanup_id;update rooms set housekeeping='dirty',status=case when status='occupied'then'occupied'when status='reserved'then'reserved'else'dirty'end where id=room.id;elsif m.room_id is not null then perform maintenance_restore_room_state(m.room_id);end if;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,note,actor_user_id,metadata)values(m.id,'resolved',m.status,'resolved',trim(p_resolution),p_staff_user_id,jsonb_build_object('cleanupRequired',coalesce(p_cleanup_required,false),'cleanupTaskId',cleanup_id));insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_resolve_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status,'serviceabilityImpact',m.serviceability_impact),jsonb_build_object('status','resolved','cleanupRequired',coalesce(p_cleanup_required,false),'cleanupTaskId',cleanup_id));return jsonb_build_object('id',m.id,'status','resolved','cleanupRequired',coalesce(p_cleanup_required,false),'cleanupTaskId',cleanup_id);
end$$;


ALTER FUNCTION "public"."maintenance_resolve_work_order"("p_order_id" "text", "p_resolution" "text", "p_cleanup_required" boolean, "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_restore_room_state"("p_room_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
 if p_room_id is null or public.maintenance_room_is_blocked(p_room_id) then return;end if;
 update rooms set status=case when status='maintenance' then case when housekeeping='clean'then'available'else'dirty'end else status end where id=p_room_id;
end$$;


ALTER FUNCTION "public"."maintenance_restore_room_state"("p_room_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_room_is_blocked"("p_room_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 select exists(select 1 from public.maintenance_orders m where m.room_id=p_room_id and m.status in('open','assigned','in_progress','waiting_parts','deferred') and m.serviceability_impact in('blocked','out_of_service'))
$$;


ALTER FUNCTION "public"."maintenance_room_is_blocked"("p_room_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."maintenance_start_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;m maintenance_orders%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'maintenance'then raise exception'MAINTENANCE_ACTION_FORBIDDEN';end if;
 select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;if m.status not in('assigned','deferred','waiting_parts')then raise exception'WORK_ORDER_NOT_STARTABLE';end if;if actor='maintenance'and m.assigned_user_id is distinct from p_staff_user_id then raise exception'WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN';end if;
 update maintenance_orders set status='in_progress',started_by=coalesce(started_by,p_staff_user_id),started_at=coalesce(started_at,now()),waiting_reason=null,version=version+1,updated_at=now()where id=m.id;
 insert into maintenance_order_events(order_id,event_type,from_status,to_status,actor_user_id)values(m.id,'started',m.status,'in_progress',p_staff_user_id);insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'maintenance_start_work_order','maintenance_order',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status','in_progress'));return jsonb_build_object('id',m.id,'status','in_progress');
end$$;


ALTER FUNCTION "public"."maintenance_start_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manager_escalate_maintenance"("p_order_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor<>'manager'then raise exception'MANAGER_COORDINATION_FORBIDDEN';end if;
if p_priority not in('high','urgent')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MAINTENANCE_ESCALATION';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found or m.status='resolved'then raise exception'WORK_ORDER_NOT_ESCALATABLE';end if;
update maintenance_orders set priority=p_priority,notes=concat_ws(E'\n',notes,'Manager escalation: '||trim(p_reason))where id=m.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_escalate_maintenance','maintenance_order',m.id,jsonb_build_object('priority',m.priority),jsonb_build_object('priority',p_priority,'reason',trim(p_reason)));end$$;


ALTER FUNCTION "public"."manager_escalate_maintenance"("p_order_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manager_prioritize_housekeeping"("p_task_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;t housekeeping_tasks%rowtype;begin select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor<>'manager'then raise exception'MANAGER_COORDINATION_FORBIDDEN';end if;
if p_priority not in('normal','high','urgent')or nullif(trim(p_reason),'')is null then raise exception'INVALID_PRIORITY_COORDINATION';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found or t.status='completed'then raise exception'TASK_NOT_COORDINATABLE';end if;
update housekeeping_tasks set priority=p_priority,notes=concat_ws(E'\n',notes,'Manager priority: '||trim(p_reason))where id=t.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_prioritize_housekeeping','housekeeping_task',t.id,jsonb_build_object('priority',t.priority),jsonb_build_object('priority',p_priority,'reason',trim(p_reason)));end$$;


ALTER FUNCTION "public"."manager_prioritize_housekeeping"("p_task_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_reservation_no_show"("p_reservation_id" "text", "p_staff_user_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;policy jsonb;tz text;cutoff time;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'NO_SHOW_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_NO_SHOW_READY';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');cutoff:=coalesce((policy->>'noShowCutoffTime')::time,'23:59'::time);
if(now()at time zone tz)<(r.check_in+cutoff)then raise exception'NO_SHOW_CUTOFF_NOT_REACHED';end if;
update reservations set status='no_show',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Guest did not arrive by no-show cutoff')where id=r.id;
if r.room_id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=r.room_id and status='reserved';end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_no_show','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','no_show','depositRetained',r.deposit));end$$;


ALTER FUNCTION "public"."mark_reservation_no_show"("p_reservation_id" "text", "p_staff_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_folio_charge"("p_reservation_id" "text", "p_description" "text", "p_category" "text", "p_amount" numeric, "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;i invoices%rowtype;v_cid uuid;v_existing uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'CHARGE_POSTING_FORBIDDEN';end if;
 if p_amount<=0 or nullif(trim(p_description),'')is null then raise exception'INVALID_CHARGE';end if;select id into v_existing from folio_charges where idempotency_key=p_idempotency_key;if found then return v_existing;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_IN_HOUSE';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)
 values(i.id,r.id,trim(p_description),coalesce(nullif(trim(p_category),''),'incidental'),round(p_amount,2),p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into v_cid;
 update invoices set amount=round(amount+round(p_amount,2),2)where id=i.id;perform sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'post_folio_charge','folio_charge',v_cid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'description',trim(p_description)));return v_cid;end$$;


ALTER FUNCTION "public"."post_folio_charge"("p_reservation_id" "text", "p_description" "text", "p_category" "text", "p_amount" numeric, "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reference" "text") RETURNS TABLE("refund_status" "text", "refund_amount" numeric, "net_paid" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;rr refund_requests%rowtype;i invoices%rowtype;r reservations%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 select * into i from invoices where id=rr.invoice_id for update;select * into r from reservations where id=rr.reservation_id for update;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 if rr.status='processed'then return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0);return;end if;
 if rr.status not in('pending','failed')or rr.eligible_amount<=0 then raise exception'REFUND_NOT_PENDING';end if;
 if nullif(trim(p_reference),'')is null then raise exception'REFUND_REFERENCE_REQUIRED';end if;
 if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then raise exception'REFUND_EXCEEDS_RECEIVED';end if;
 perform 1 from payments where idempotency_key=rr.id;
 if not found then insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now());end if;
 insert into refund_attempts(refund_request_id,status,reference,attempted_by)values(rr.id,'processed',trim(p_reference),p_staff_user_id);
 update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference)where id=rr.id;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';v_net:=greatest(round(v_gross-v_refunded,2),0);
 update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then'refunded'else'partial_refund'end where id=i.id;
 update reservations set payment_status=case when v_net=0 then'refunded'else'partial_refund'end where id=r.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'process_refund','refund_request',rr.id::text,jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference)));
 return query select'processed'::text,rr.eligible_amount,v_net;end$$;


ALTER FUNCTION "public"."process_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_audit_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin raise exception'AUDIT_HISTORY_IMMUTABLE';end$$;


ALTER FUNCTION "public"."protect_audit_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_owner_exception_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare reviewer_role text;begin
  if old.authority_level='owner' and old.status='pending' and new.status is distinct from old.status then
    select role into reviewer_role from user_accounts where id=new.reviewed_by and active;
    if reviewer_role is null or reviewer_role<>'owner' then raise exception'OWNER_REVIEW_REQUIRED';end if;
  end if;
  return new;
end$$;


ALTER FUNCTION "public"."protect_owner_exception_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_settled_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin if tg_op='DELETE'and old.status='paid'then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
if tg_op='UPDATE'and old.status='paid'and(old.amount is distinct from new.amount or old.currency is distinct from new.currency or old.method is distinct from new.method or old.reference is distinct from new.reference or old.purpose is distinct from new.purpose or old.invoice_id is distinct from new.invoice_id or old.reservation_id is distinct from new.reservation_id or new.status is distinct from old.status)then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
return case when tg_op='DELETE'then old else new end;end$$;


ALTER FUNCTION "public"."protect_settled_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_staff_payment"("p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid", "p_allow_overpayment" boolean DEFAULT false) RETURNS TABLE("payment_id" "uuid", "paid" numeric, "balance" numeric, "payment_status" "text", "folio_credit" numeric, "reference" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_staff_payment"("p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid", "p_allow_overpayment" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_guest_account"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_password_hash" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare uid uuid;gid text;email_value text:=lower(trim(p_email));full_name text:=trim(p_first_name||' '||p_last_name);begin
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or email_value!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'or length(coalesce(p_password_hash,''))<40 then raise exception'INVALID_REGISTRATION';end if;
 if exists(select 1 from user_accounts where lower(email)=email_value)then raise exception'ACCOUNT_EXISTS';end if;
 if exists(select 1 from guests where lower(email)=email_value and user_account_id is not null)then raise exception'ACCOUNT_EXISTS';end if;
 insert into user_accounts(email,name,role,password_hash,active)values(email_value,full_name,'guest',p_password_hash,true)returning id into uid;
 select id into gid from guests where lower(email)=email_value and user_account_id is null for update;
 if gid is null then insert into guests(name,first_name,last_name,email,phone,user_account_id)values(full_name,trim(p_first_name),trim(p_last_name),email_value,nullif(trim(p_phone),''),uid)returning id into gid;
 else update guests set name=full_name,first_name=trim(p_first_name),last_name=trim(p_last_name),phone=coalesce(nullif(trim(p_phone),''),phone),user_account_id=uid where id=gid;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(uid,'register_guest_account','user_account',uid::text,jsonb_build_object('guestId',gid,'role','guest'));
 return uid;end$_$;


ALTER FUNCTION "public"."register_guest_account"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_password_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_terminal_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$begin if new.status in('cancelled','no_show')and old.status is distinct from new.status then update reservation_room_assignments set status=case new.status when'cancelled'then'cancelled'else'no_show'end,released_at=now(),reason=coalesce(new.cancellation_reason,reason)where reservation_id=new.id and status='active';end if;return new;end$$;


ALTER FUNCTION "public"."release_terminal_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_manager_approval"("p_request_type" "text", "p_related_entity_type" "text", "p_related_entity_id" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_department" "text", "p_severity" "text", "p_reason" "text", "p_requested_action" "jsonb", "p_staff_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
if p_severity not in('normal','high','critical')then raise exception'INVALID_SEVERITY';end if;
if p_request_type<>'guest_escalation'and p_reservation_id is null then raise exception'RESERVATION_REQUIRED';end if;
if p_reservation_id is not null then select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
 normal_result:=jsonb_build_object('reservationStatus',r.status,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,'policySnapshot',policy);end if;
if p_request_type='guest_escalation'then select * into g from guest_requests where id=p_guest_request_id for update;if not found or g.status='completed'then raise exception'GUEST_REQUEST_NOT_ESCALATABLE';end if;
 update guest_requests set severity=p_severity,escalation_status='escalated',escalated_by=p_staff_user_id,escalated_at=now()where id=g.id;end if;
if p_request_type='refund_exception'then
 if r.status not in('cancelled','no_show')then raise exception'REFUND_EXCEPTION_REQUIRES_CLOSURE';end if;
 select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(max(eligible_amount),0)into normal_refund from refund_requests where reservation_id=r.id and exception_approval_id is null;
 normal_result:=normal_result||jsonb_build_object('settledDeposit',deposit_paid,'normalPolicyRefund',normal_refund);
end if;
if p_request_type='room_type_exception'then
 if nullif(p_requested_action->>'roomType','')is null then raise exception'ROOM_TYPE_EXCEPTION_TYPE_REQUIRED';end if;
 if(p_requested_action->>'roomType')=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=(p_requested_action->>'roomType')and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
end if;
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;


ALTER FUNCTION "public"."request_manager_approval"("p_request_type" "text", "p_related_entity_type" "text", "p_related_entity_id" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_department" "text", "p_severity" "text", "p_reason" "text", "p_requested_action" "jsonb", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_maintenance_order"("p_order_id" "text", "p_staff_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$begin raise exception'USE_MAINTENANCE_RESOLUTION_WORKFLOW';end$$;


ALTER FUNCTION "public"."resolve_maintenance_order"("p_order_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_reservation_transport"("p_reservation_id" "text") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare c folio_charges%rowtype;v_sum numeric(12,2):=0;v_invoice text;begin
 select id into v_invoice from invoices where reservation_id=p_reservation_id;if v_invoice is null then return 0;end if;
 for c in select * from folio_charges where reservation_id=p_reservation_id and source='transport' and status<>'reversed' for update loop
  update folio_charges set status='reversed'where id=c.id;v_sum:=round(v_sum+c.amount,2);
 end loop;
 if v_sum>0 then
  update invoices set amount=greatest(round(amount-v_sum,2),0)where id=v_invoice;
  update reservations set total=greatest(round(total-v_sum,2),0)where id=p_reservation_id;
  perform public.sync_invoice_financials(v_invoice);
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'reverse_reservation_transport','reservation',p_reservation_id,jsonb_build_object('transportTotal',v_sum));
 end if;
 return v_sum;end$$;


ALTER FUNCTION "public"."reverse_reservation_transport"("p_reservation_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_front_desk_report"("p_report_id" "uuid", "p_decision" "text", "p_note" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor text;
  r public.front_desk_reports%rowtype;
begin
  select role into actor from public.user_accounts where id=p_manager_user_id;
  if actor is null or actor<>'manager' then raise exception'REPORT_REVIEW_FORBIDDEN'; end if;
  if p_decision not in('acknowledge','return') then raise exception'REPORT_DECISION_INVALID'; end if;
  if p_decision='return' and coalesce(btrim(p_note),'')='' then raise exception'REPORT_NOTE_REQUIRED'; end if;
  select * into r from public.front_desk_reports where id=p_report_id for update;
  if r.id is null then raise exception'REPORT_NOT_FOUND'; end if;
  if r.status<>'submitted' or r.version<>p_expected_version then raise exception'REPORT_ALREADY_REVIEWED'; end if;
  update public.front_desk_reports set
    status=case when p_decision='acknowledge' then 'acknowledged' else 'returned' end,
    reviewed_by=p_manager_user_id,
    reviewed_at=now(),
    review_note=case when p_decision='return' then btrim(p_note) else null end,
    version=r.version+1,
    updated_at=now()
  where id=r.id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(
    p_manager_user_id,'review_front_desk_report','front_desk_report',r.id::text,
    jsonb_build_object('status',r.status,'version',r.version),
    jsonb_build_object('status',case when p_decision='acknowledge' then 'acknowledged' else 'returned' end,'note',btrim(coalesce(p_note,''))));
  return jsonb_build_object('id',r.id,'status',case when p_decision='acknowledge' then 'acknowledged' else 'returned' end,'version',r.version+1);
end$$;


ALTER FUNCTION "public"."review_front_desk_report"("p_report_id" "uuid", "p_decision" "text", "p_note" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_manager_approval"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;available_same int;available_target int;inventory int;reserved int;held int;target_type text;requested_amount numeric;deposit_paid numeric;already_refunded numeric;i invoices%rowtype;rid uuid;begin
select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'MANAGER_REVIEW_FORBIDDEN';end if;
if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MANAGER_DECISION';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found then raise exception'APPROVAL_NOT_FOUND';end if;
if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;if a.requested_by=p_manager_user_id then raise exception'SELF_APPROVAL_FORBIDDEN';end if;
if a.reservation_id is not null then select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;end if;
if a.request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','checkout_exception')and r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if p_decision='approve'and a.request_type='room_upgrade'then
 target_type:=nullif(a.requested_action->>'requestedRoomType','');if target_type is null or target_type=r.room_type then raise exception'INVALID_UPGRADE_REQUEST';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'SAME_TYPE_ROOM_AVAILABLE';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='room_type_exception'then
 target_type:=nullif(a.requested_action->>'roomType','');if target_type is null or target_type=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=target_type and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'ROOM_TYPE_EXCEPTION_NOT_NEEDED';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'ROOM_TYPE_EXCEPTION_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='reservation_modification'then
 if nullif(a.requested_action->>'checkIn','')is null or nullif(a.requested_action->>'checkOut','')is null or(a.requested_action->>'checkOut')::date<=(a.requested_action->>'checkIn')::date then raise exception'INVALID_MODIFICATION_REQUEST';end if;
 target_type:=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type);
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;perform pg_advisory_xact_lock(hashtextextended(target_type,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=target_type and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);
 select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=target_type and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;
 select count(*)into held from booking_holds h where h.room_type=target_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;available_target:=inventory-reserved-held;
 if available_target<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='early_check_in'then
 if r.status<>'confirmed'or r.room_id is null or not exists(select 1 from rooms x where x.id=r.room_id and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress')))then raise exception'EARLY_CHECKIN_NOT_SAFE';end if;
end if;
if p_decision='approve'and a.request_type='late_checkout'then
 if r.status<>'checked_in'or nullif(a.requested_action->>'requestedUntil','')is null then raise exception'INVALID_LATE_CHECKOUT';end if;
 if exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'LATE_CHECKOUT_CONFLICT';end if;
end if;
if p_decision='approve'and a.request_type='guest_compensation'then requested_amount:=coalesce((a.requested_action->>'amount')::numeric,0);select * into i from invoices where reservation_id=r.id for update;if not found or requested_amount<=0 or requested_amount>i.amount then raise exception'COMPENSATION_EXCEEDS_FOLIO';end if;end if;
if p_decision='approve'and a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'INVALID_CHECKOUT_EXCEPTION';end if;end if;
if p_decision='approve'and a.request_type='refund_exception'then
 requested_amount:=coalesce((a.requested_action->>'amount')::numeric,0);select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(sum(amount),0)into already_refunded from payments where reservation_id=r.id and purpose='refund'and status='paid';if requested_amount<=0 or requested_amount>deposit_paid-already_refunded then raise exception'REFUND_EXCEPTION_EXCEEDS_SETTLED_PAYMENT';end if;
 select * into i from invoices where reservation_id=r.id for update;insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount,status,exception_approval_id,normal_policy_amount)
 values(r.id,i.id,a.requested_by,a.reason,deposit_paid,0,round(requested_amount,2),'pending',a.id,coalesce((a.normal_policy_result->>'normalPolicyRefund')::numeric,0))returning id into rid;
end if;
update manager_approval_requests set status=case when p_decision='approve'then'approved'else'rejected'end,reviewed_by=p_manager_user_id,reviewed_at=now(),decision_reason=trim(p_reason),
 execution_status=case when p_decision='reject'then'not_required'when request_type='guest_escalation'then'executed'else'awaiting_execution'end,executed_by=case when p_decision='approve'and request_type='guest_escalation'then p_manager_user_id else null end,executed_at=case when p_decision='approve'and request_type='guest_escalation'then now()else null end,version=version+1,updated_at=now()where id=a.id;
if a.request_type='guest_escalation'and p_decision='approve'then update guest_requests set escalation_status='coordinated',manager_resolution=trim(p_reason)where id=a.guest_request_id;end if;
insert into manager_notes(approval_id,note,created_by)values(a.id,trim(p_reason),p_manager_user_id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_'||p_decision,'manager_approval',a.id::text,jsonb_build_object('status',a.status,'version',a.version),jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'reason',trim(p_reason),'refundRequestId',rid));
return jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'executionStatus',case when p_decision='reject'then'not_required'when a.request_type='guest_escalation'then'executed'else'awaiting_execution'end,'refundRequestId',rid);end$$;


ALTER FUNCTION "public"."review_manager_approval"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_owner_exception"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_owner_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;a manager_approval_requests%rowtype;result jsonb;begin
  select role into actor from user_accounts where id=p_owner_user_id and active;
  if actor is null or actor<>'owner' then raise exception'OWNER_AUTHORITY_REQUIRED';end if;
  if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_OWNER_DECISION';end if;
  select * into a from manager_approval_requests where id=p_approval_id for update;
  if not found then raise exception'APPROVAL_NOT_FOUND';end if;
  if a.authority_level<>'owner' then raise exception'OWNER_REVIEW_NOT_REQUIRED';end if;
  if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;
  result:=review_manager_approval(a.id,p_decision,trim(p_reason),p_expected_version,p_owner_user_id);
  update manager_approval_requests set owner_reviewed_by=p_owner_user_id,owner_reviewed_at=now(),updated_at=now()where id=a.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_owner_user_id,'owner_'||p_decision||'_exception','manager_approval',a.id::text,
    jsonb_build_object('status',a.status,'authorityLevel',a.authority_level,'version',a.version),
    jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'reason',trim(p_reason),'departmentExecutes',p_decision='approve'));
  return result||jsonb_build_object('authorityLevel','owner','ownerReviewed',true);
end$$;


ALTER FUNCTION "public"."review_owner_exception"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_owner_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."room_is_sellable"("p_room_id" "text", "p_check_in" "date", "p_policy" "jsonb" DEFAULT NULL::"jsonb") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists(
    select 1 from rooms r
    where r.id=p_room_id
      and coalesce(r.administratively_active,true)
      and r.status<>'maintenance'
      and (p_check_in>hotel_today(p_policy) or r.housekeeping='clean')
      and not maintenance_room_is_blocked(r.id)
  )
$$;


ALTER FUNCTION "public"."room_is_sellable"("p_room_id" "text", "p_check_in" "date", "p_policy" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_transition_transportation_request"("p_request_id" "uuid", "p_action" "text", "p_details" "jsonb", "p_staff_user_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare actor text;t transportation_requests%rowtype;new_status text;allowed_from text[];
 v_driver text;v_vehicle uuid;v_date date;v_time text;v_notes text;v_visible text;v_reason text;audit_action text;
 v_vt transport_vehicle_types%rowtype;v_res reservations%rowtype;v_inv invoices%rowtype;v_fare numeric(12,2);v_fare_key uuid;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','manager') then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED';end if;
 if p_action in('REVIEW','SCHEDULE','ASSIGN','START','COMPLETE') and actor<>'front_desk' then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED';end if;
 select * into t from transportation_requests where id=p_request_id for update;
 if not found then raise exception'TRANSPORTATION_REQUEST_NOT_FOUND';end if;
 if t.version<>p_expected_version then raise exception'TRANSPORTATION_REQUEST_STALE';end if;
 v_driver:=nullif(trim(coalesce(p_details->>'driverName','')),'');
 v_vehicle:=nullif(p_details->>'vehicleTypeId','');
 v_date:=nullif(p_details->>'pickupDate','');
 v_time:=nullif(p_details->>'pickupTime','');
 v_notes:=nullif(trim(coalesce(p_details->>'staffNotes','')),'');
 v_visible:=nullif(trim(coalesce(p_details->>'customerVisibleNotes','')),'');
 v_reason:=nullif(trim(coalesce(p_details->>'reason','')),'');
 case p_action
  when'REVIEW'then allowed_from:=array['REQUESTED'];new_status:='REVIEWED';audit_action:='transportation_review';
  when'SCHEDULE'then allowed_from:=array['REVIEWED'];new_status:='SCHEDULED';audit_action:='transportation_schedule';
  when'ASSIGN'then allowed_from:=array['SCHEDULED'];new_status:='ASSIGNED';audit_action:='transportation_assign';
  when'START'then allowed_from:=array['ASSIGNED'];new_status:='IN_PROGRESS';audit_action:='transportation_start';
  when'COMPLETE'then allowed_from:=array['IN_PROGRESS'];new_status:='COMPLETED';audit_action:='transportation_complete';
  when'CANCEL'then allowed_from:=array['REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS'];new_status:='CANCELLED';audit_action:='transportation_cancel';
  when'REJECT'then allowed_from:=array['REQUESTED','REVIEWED'];new_status:='REJECTED';audit_action:='transportation_reject';
  else raise exception'TRANSPORTATION_TRANSITION_INVALID';end case;
 if not(t.status=any(allowed_from)) then raise exception'TRANSPORTATION_TRANSITION_INVALID';end if;
 if p_action in('CANCEL','REJECT') and v_reason is null then raise exception'TRANSPORTATION_REASON_REQUIRED';end if;
 if p_action='ASSIGN' then
  if v_driver is null or char_length(v_driver)>120 then raise exception'INVALID_DRIVER_ASSIGNMENT';end if;
  if v_vehicle is null then raise exception'INVALID_VEHICLE_TYPE';end if;
  select * into v_vt from transport_vehicle_types where id=v_vehicle and active;if not found then raise exception'INVALID_VEHICLE_TYPE';end if;
 end if;
 if p_action='SCHEDULE' and v_date is not null and (v_time is null or v_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$')then raise exception'INVALID_TRANSPORTATION_SCHEDULE';end if;
 if p_action='ASSIGN' then
  v_fare:=round((v_vt.base_fare+v_vt.booking_fee)*(case t.service_type when'ROUND_TRIP'then 2 else 1 end),2);
 end if;
 update transportation_requests set
  status=new_status,
  driver_name=case when p_action='ASSIGN' then v_driver else coalesce(v_driver,t.driver_name) end,
  vehicle_type_id=case when p_action='ASSIGN' then v_vehicle else coalesce(v_vehicle,t.vehicle_type_id) end,
  pickup_date=case when p_action='SCHEDULE' and v_date is not null then v_date else t.pickup_date end,
  pickup_time=case when p_action='SCHEDULE' and v_time is not null then v_time else t.pickup_time end,
  staff_notes=case when v_notes is not null then v_notes else t.staff_notes end,
  customer_visible_notes=case when v_visible is not null then v_visible else t.customer_visible_notes end,
  cancellation_reason=case when p_action in('CANCEL','REJECT') then v_reason else t.cancellation_reason end,
  reviewed_at=case when p_action='REVIEW' then now() else t.reviewed_at end,
  scheduled_at=case when p_action='SCHEDULE' then now() else t.scheduled_at end,
  assigned_at=case when p_action='ASSIGN' then now() else t.assigned_at end,
  started_at=case when p_action='START' then now() else t.started_at end,
  completed_at=case when p_action='COMPLETE' then now() else t.completed_at end,
  cancelled_at=case when p_action='CANCEL' then now() else t.cancelled_at end,
  fare_amount=case when p_action='ASSIGN' then v_fare else t.fare_amount end,
  fare_posted_at=case when p_action='ASSIGN' then now() else t.fare_posted_at end,
  version=t.version+1,updated_at=now()
 where id=t.id;
 if p_action='ASSIGN' then
  v_fare_key:=md5(t.id||'|transport-fare')::uuid;
  select * into v_res from reservations where id=t.reservation_id for update;
  if v_res.status not in('confirmed','checked_in')then raise exception'TRANSPORTATION_RESERVATION_NOT_READY';end if;
  select * into v_inv from invoices where reservation_id=v_res.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
  if not exists(select 1 from folio_charges where idempotency_key=v_fare_key)then
   insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key)
   values(v_inv.id,v_res.id,(case t.service_type when'PICKUP'then'Pickup'when'DROPOFF'then'Drop-off'else'Round trip'end)||' - '||v_vt.name,'transportation',v_fare,p_staff_user_id,v_fare_key);
   update invoices set amount=amount+v_fare,balance=balance+v_fare,status=case when paid>0 then'partial'else'unpaid'end where id=v_inv.id;
   update reservations set payment_status=case when deposit>0 then'partial'else'unpaid'end where id=v_res.id;
  end if;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,audit_action,'transportation_request',t.id::text,
  jsonb_build_object('status',t.status,'version',t.version,'driverName',t.driver_name,'vehicleTypeId',t.vehicle_type_id,'pickupDate',t.pickup_date,'pickupTime',t.pickup_time),
  jsonb_build_object('status',new_status,'version',t.version+1,'reason',v_reason,'customerVisibleNotes',v_visible,'fareAmount',v_fare));
 return jsonb_build_object('id',t.id,'status',new_status,'version',t.version+1,'fareAmount',v_fare);end$_$;


ALTER FUNCTION "public"."staff_transition_transportation_request"("p_request_id" "uuid", "p_action" "text", "p_details" "jsonb", "p_staff_user_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_front_desk_report"("p_report_date" "date", "p_snapshot" "jsonb", "p_supersedes" "uuid", "p_staff_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor text;
  prior public.front_desk_reports%rowtype;
  report_id uuid;
begin
  select role into actor from public.user_accounts where id=p_staff_user_id;
  if actor is null or actor<>'front_desk' then raise exception'REPORT_SUBMIT_FORBIDDEN'; end if;
  if p_report_date is null or p_snapshot is null or p_report_date>public.hotel_today() then raise exception'REPORT_DATE_INVALID'; end if;
  if p_supersedes is not null then
    select * into prior from public.front_desk_reports where id=p_supersedes for update;
    if prior.id is null or prior.status<>'returned' or prior.report_date<>p_report_date then raise exception'REPORT_SUPERSEDES_INVALID'; end if;
  end if;
  insert into public.front_desk_reports(report_date,snapshot,submitted_by,supersedes)
    values(p_report_date,p_snapshot,p_staff_user_id,p_supersedes)
    returning id into report_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)values(
    p_staff_user_id,
    case when p_supersedes is null then 'submit_front_desk_report' else 'resubmit_front_desk_report' end,
    'front_desk_report',report_id::text,
    jsonb_build_object('reportDate',p_report_date,'supersedes',p_supersedes));
  return jsonb_build_object('id',report_id,'reportDate',p_report_date,'status','submitted');
end$$;


ALTER FUNCTION "public"."submit_front_desk_report"("p_report_date" "date", "p_snapshot" "jsonb", "p_supersedes" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_reservation_deposit"("p_token" "uuid", "p_user_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") RETURNS TABLE("reservation_id" "text", "confirmation_number" "text", "reservation_status" "text", "payment_status" "text", "deposit_required" numeric, "remaining_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare h booking_holds%rowtype;t room_types%rowtype;inventory int;reserved int;guest text;rid text;iid text;confirmation text;
begin
 perform expire_booking_holds();select * into h from booking_holds where token=p_token and user_id=p_user_id for update;if not found then raise exception'HOLD_NOT_FOUND';end if;
 if h.reservation_id is not null then return query select r.id,r.confirmation_number,r.status,r.payment_status,r.deposit_required,greatest(r.total-coalesce(i.paid,0),0)from reservations r left join invoices i on i.reservation_id=r.id where r.id=h.reservation_id;return;end if;
 if h.status<>'active'or h.expires_at<=now()then raise exception'HOLD_EXPIRED';end if;
 if p_payment_method not in('manual_bank_transfer','manual_gcash')then raise exception'UNSUPPORTED_PAYMENT_METHOD';end if;
 if nullif(trim(p_payment_reference),'')is null or length(trim(p_payment_reference))>120 then raise exception'INVALID_PAYMENT_REFERENCE';end if;
 if h.deposit_required<=0 then raise exception'INVALID_DEPOSIT_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));select * into t from room_types where name=h.room_type and active;
 if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;if round(t.base_rate,2)<>round(h.nightly_rate,2)then raise exception'RATE_CHANGED';end if;
 select count(*)into inventory from rooms r where r.type=h.room_type and room_is_sellable(r.id,h.check_in,h.operational_policy_snapshot);
 select count(*)into reserved from reservations r where r.room_type=h.room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<h.check_out and r.check_out>h.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select g.id into guest from guests g where g.user_account_id=p_user_id or lower(g.email)=lower(h.email)order by(g.user_account_id=p_user_id)desc limit 1 for update;
 if guest is null then insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)values(trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,p_user_id,h.address,h.nationality,h.special_requests)returning id into guest;
 else update guests set user_account_id=coalesce(user_account_id,p_user_id),name=trim(h.first_name||' '||h.last_name),first_name=h.first_name,last_name=h.last_name,phone=h.mobile,address=coalesce(h.address,address),nationality=coalesce(h.nationality,nationality),special_requests=coalesce(h.special_requests,special_requests)where id=guest;end if;
 confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,request_options,transport_lines,transportation_preferences,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,h.transport_lines,h.transportation_preferences,h.expected_arrival,'unpaid',p_payment_method,null,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$$;


ALTER FUNCTION "public"."submit_reservation_deposit"("p_token" "uuid", "p_user_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_customer_change_request_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$begin
 update reservation_change_requests set status=case when new.status='rejected'then'rejected'when new.status='cancelled'then'cancelled'when new.execution_status='executed'then'executed'when new.status='approved'then'approved'else status end,execution_status=case when new.execution_status='executed'then'executed'when new.status='approved'then'awaiting_execution'when new.status in('rejected','cancelled')then'cancelled'else execution_status end,reviewed_by=new.reviewed_by,reviewed_at=new.reviewed_at where manager_approval_id=new.id;
 if new.execution_status='executed'and new.request_type='reservation_modification'then update reservations r set guests=coalesce(c.requested_guests,r.guests),special_requests=coalesce(c.requested_special_requests,r.special_requests)from reservation_change_requests c where c.manager_approval_id=new.id and r.id=c.reservation_id;end if;return new;end$$;


ALTER FUNCTION "public"."sync_customer_change_request_status"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "text" DEFAULT ('INV-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "reservation_id" "text",
    "guest_name" "text" NOT NULL,
    "currency" character(3) DEFAULT 'PHP'::"bpchar" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid" numeric(12,2) DEFAULT 0 NOT NULL,
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'unpaid'::"text",
    "method" "text",
    "corporate_account" "text",
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "credit_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "invoices_credit_balance_check" CHECK (("credit_balance" >= (0)::numeric)),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['unpaid'::"text", 'deposit'::"text", 'partial'::"text", 'paid'::"text", 'credit'::"text", 'refund_pending'::"text", 'partial_refund'::"text", 'refunded'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_invoice_financials"("p_invoice_id" "text") RETURNS "public"."invoices"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare i invoices%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;v_applied numeric;v_credit numeric;begin
 select * into i from invoices where id=p_invoice_id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 v_net:=greatest(round(v_gross-v_refunded,2),0);v_applied:=least(v_net,round(i.amount,2));v_credit:=greatest(round(v_net-i.amount,2),0);
 update invoices set paid=v_applied,balance=greatest(round(i.amount-v_applied,2),0),credit_balance=v_credit,
  status=case when i.status in('cancelled','refund_pending')then i.status when v_credit>0 then'credit'when v_refunded>0 and v_applied=0 then'refunded'when v_refunded>0 then'partial_refund'when i.amount>0 and v_applied>=round(i.amount,2)then'paid'when v_applied>0 then'partial'else'unpaid'end
  where id=i.id returning * into i;
 if i.reservation_id is not null and i.status not in('cancelled','refund_pending')then update reservations set payment_status=i.status where id=i.reservation_id;end if;
 return i;end$$;


ALTER FUNCTION "public"."sync_invoice_financials"("p_invoice_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_manager_financial_execution"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin if new.status='processed'and old.status is distinct from new.status and new.exception_approval_id is not null then update manager_approval_requests set execution_status='executed',executed_by=new.processed_by,executed_at=new.processed_at,version=version+1,updated_at=now()where id=new.exception_approval_id and execution_status='awaiting_execution';end if;return new;end$$;


ALTER FUNCTION "public"."sync_manager_financial_execution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_account_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$begin
 if tg_op='INSERT'and not new.active then new.account_status:='inactive';
 elsif tg_op='UPDATE'and new.active is distinct from old.active and new.account_status=old.account_status then new.account_status:=case when new.active then'active'else'inactive'end;end if;
 new.active:=new.account_status='active';new.updated_at:=now();return new;
end$$;


ALTER FUNCTION "public"."sync_user_account_lifecycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_file_booking_requests"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
 if lower(coalesce(new.source,''))='website'and new.status='confirmed'and(old is null or old.status is distinct from'confirmed')then
  perform public.file_booking_guest_requests(new.id);
 end if;
 return new;end$$;


ALTER FUNCTION "public"."trigger_file_booking_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_file_booking_transportation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
 if lower(coalesce(new.source,''))='website'and new.status='confirmed'and(old is null or old.status is distinct from'confirmed')then
  perform public.file_booking_transportation_request(new.id);
 end if;
 return new;end$$;


ALTER FUNCTION "public"."trigger_file_booking_transportation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_reverse_transport_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
 if old.status='confirmed'and new.status in('cancelled','no_show')then perform public.reverse_reservation_transport(new.id);end if;
 return new;end$$;


ALTER FUNCTION "public"."trigger_reverse_transport_on_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_transport_vehicle_type"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_seats" integer, "p_base_fare" numeric, "p_per_km" numeric, "p_per_minute" numeric, "p_booking_fee" numeric, "p_active" boolean, "p_sort" integer, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;existing record;new_id uuid;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if nullif(trim(p_name),'')is null or length(trim(p_name))>120 or length(trim(coalesce(p_description,'')))>500 or p_seats is null or p_seats<1 or p_seats>20 or p_base_fare is null or p_base_fare<0 or p_per_km is null or p_per_km<0 or p_per_minute is null or p_per_minute<0 or p_booking_fee is null or p_booking_fee<0 then raise exception'INVALID_TRANSPORT_VEHICLE_TYPE';end if;
 if p_id is null then
  if exists(select 1 from transport_vehicle_types where lower(name)=lower(trim(p_name)))then raise exception'TRANSPORT_VEHICLE_TYPE_NAME_TAKEN';end if;
  insert into transport_vehicle_types(name,description,seats,base_fare,per_km,per_minute,booking_fee,active,sort,version)
  values(trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_seats,round(p_base_fare,2),round(p_per_km,2),round(p_per_minute,2),round(p_booking_fee,2),coalesce(p_active,true),coalesce(p_sort,0),1)returning id into new_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'create_transport_vehicle_type','transport_vehicle_type',new_id::text,jsonb_build_object('name',trim(p_name),'seats',p_seats,'baseFare',round(p_base_fare,2),'perKm',round(p_per_km,2),'perMinute',round(p_per_minute,2),'bookingFee',round(p_booking_fee,2)));
  return new_id;
 end if;
 select * into existing from transport_vehicle_types where id=p_id for update;if not found then raise exception'TRANSPORT_VEHICLE_TYPE_NOT_FOUND';end if;
 if existing.version<>p_expected_version then raise exception'TRANSPORT_VEHICLE_TYPE_STALE';end if;
 if exists(select 1 from transport_vehicle_types where id<>p_id and lower(name)=lower(trim(p_name)))then raise exception'TRANSPORT_VEHICLE_TYPE_NAME_TAKEN';end if;
 update transport_vehicle_types set name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),seats=p_seats,base_fare=round(p_base_fare,2),per_km=round(p_per_km,2),per_minute=round(p_per_minute,2),booking_fee=round(p_booking_fee,2),active=coalesce(p_active,true),sort=coalesce(p_sort,0),version=existing.version+1,updated_at=now()where id=p_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'update_transport_vehicle_type','transport_vehicle_type',p_id::text,jsonb_build_object('name',trim(p_name),'seats',p_seats,'baseFare',round(p_base_fare,2),'perKm',round(p_per_km,2),'perMinute',round(p_per_minute,2),'bookingFee',round(p_booking_fee,2),'active',coalesce(p_active,true),'reason',nullif(trim(coalesce(p_reason,'')),''),'version',existing.version+1));
 return p_id;end$$;


ALTER FUNCTION "public"."upsert_transport_vehicle_type"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_seats" integer, "p_base_fare" numeric, "p_per_km" numeric, "p_per_minute" numeric, "p_booking_fee" numeric, "p_active" boolean, "p_sort" integer, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_customer_stay_payment"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_approve" boolean, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;p payments%rowtype;i invoices%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'stay_payment'then raise exception'PAYMENT_NOT_FOUND';end if;
 if p.status in('paid','failed')then return jsonb_build_object('paymentId',p.id,'status',p.status);end if;if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if not p_approve and nullif(trim(p_reason),'')is null then raise exception'REJECTION_REASON_REQUIRED';end if;
 if p_approve then update payments set status='paid',received_by=p_staff_user_id,verified_at=now(),reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=null where id=p.id;select * into i from sync_invoice_financials(p.invoice_id);
 else update payments set status='failed',reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=trim(p_reason)where id=p.id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,case when p_approve then'verify_customer_stay_payment'else'reject_customer_stay_payment'end,'payment',p.id::text,jsonb_build_object('status',p.status),jsonb_build_object('status',case when p_approve then'paid'else'failed'end,'reason',nullif(trim(p_reason),'')));
 return jsonb_build_object('paymentId',p.id,'status',case when p_approve then'paid'::text else'failed'::text end);end$$;


ALTER FUNCTION "public"."verify_customer_stay_payment"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_approve" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_guest_identity"("p_reservation_id" "text", "p_staff_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text;r reservations%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'IDENTITY_VERIFICATION_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_IDENTITY_READY';end if;
update reservations set identity_status='verified',identity_verified_by=p_staff_user_id,identity_verified_at=now()where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'verify_guest_identity','reservation',r.id,jsonb_build_object('identityStatus',r.identity_status),jsonb_build_object('identityStatus','verified'));end$$;


ALTER FUNCTION "public"."verify_guest_identity"("p_reservation_id" "text", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_reservation_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid") RETURNS TABLE("reservation_id" "text", "reservation_status" "text", "payment_status" "text", "deposit_paid" numeric, "remaining_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;actor text;inventory int;reserved int;paid_total numeric(12,2);ln jsonb;lname text;lprice numeric;v_posted numeric:=0;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 perform expire_booking_holds();select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;select bh.* into h from booking_holds bh where bh.reservation_id=r.id for update;
 if p.status='paid'then return query select r.id,r.status,r.payment_status,coalesce(r.deposit,0),greatest(i.balance,0);return;end if;
 if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if h.status<>'payment_submitted'or r.status<>'pending'then raise exception'HOLD_EXPIRED';end if;
 if round(p.amount,2)<>round(r.deposit_required,2)or round(i.amount,2)<>round(r.total,2)then raise exception'PAYMENT_AMOUNT_MISMATCH';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(r.room_type),0));
 select count(*)into inventory from rooms x where x.type=r.room_type and room_is_sellable(x.id,r.check_in,r.operational_policy_snapshot);
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=r.room_type and(x.status in('confirmed','checked_in')or(x.status='pending'and(lower(coalesce(x.source,''))<>'website'or x.payment_due_at is null or x.payment_due_at>now())))and x.check_in<r.check_out and x.check_out>r.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 update payments set status='paid',verified_at=now(),received_by=p_staff_user_id where id=p.id;
 select coalesce(sum(amount),0)into paid_total from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 update invoices set paid=least(paid_total,amount),balance=greatest(amount-paid_total,0),status=case when paid_total>=amount then'paid'else'partial'end where id=i.id;
 update reservations set status='confirmed',deposit=p.amount,payment_status=case when paid_total>=total then'paid'else'partial'end where id=r.id;
 update booking_holds set status='completed'where token=h.token;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit','payment',p.id::text,jsonb_build_object('reservationId',r.id,'amount',p.amount,'reference',p.reference));
 -- Transport booked at checkout is posted here, as its own folio lines, once. The total
 -- already includes transport (create_booking_hold folds it in), so these inserts are
 -- itemization only -- no invoice.amount / reservation.total bump (that would double-count).
 if jsonb_typeof(coalesce(r.transport_lines,'[]'::jsonb))='array'and jsonb_array_length(coalesce(r.transport_lines,'[]'::jsonb))>0 then
  for ln in select e.value from jsonb_array_elements(coalesce(r.transport_lines,'[]'::jsonb))e loop
   lname:=coalesce(ln->>'name','');lprice:=coalesce((ln->>'price')::numeric,0);
   if nullif(trim(lname),'')is null or lprice<=0 then continue;end if;
   if not exists(select 1 from folio_charges where idempotency_key=md5(r.id||'|transport|'||lower(trim(lname)))::uuid)then
    insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,status)
    values(i.id,r.id,trim(lname),'transport',round(lprice,2),p_staff_user_id,md5(r.id||'|transport|'||lower(trim(lname)))::uuid,'transport','posted');
    v_posted:=round(v_posted+lprice,2);
   end if;
  end loop;
  if v_posted>0 then
   perform public.sync_invoice_financials(i.id);
   insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit_transport','reservation',r.id,jsonb_build_object('transportTotal',v_posted));
  end if;
 end if;
 return query select r.id,'confirmed'::text,case when paid_total>=r.total then'paid'::text else'partial'::text end,p.amount,greatest(i.amount-paid_total,0);
end$$;


ALTER FUNCTION "public"."verify_reservation_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_recovery_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_by" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_recovery_tokens_check" CHECK (("expires_at" > "created_at"))
);


ALTER TABLE "public"."account_recovery_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'front_desk'::"text", 'housekeeping'::"text", 'maintenance'::"text", 'accounting'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "ip_address" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


ALTER TABLE "public"."audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."booking_holds" (
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "room_type" "text" NOT NULL,
    "check_in" "date" NOT NULL,
    "check_out" "date" NOT NULL,
    "guest_count" integer NOT NULL,
    "nightly_rate" numeric(12,2) NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "taxes" numeric(12,2) DEFAULT 0 NOT NULL,
    "service_charge" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "mobile" "text" NOT NULL,
    "address" "text",
    "nationality" "text",
    "expected_arrival" "text",
    "special_requests" "text",
    "guarantee_method" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deposit_required" numeric(12,2) DEFAULT 0 NOT NULL,
    "deposit_policy_snapshot" "jsonb",
    "reservation_id" "text",
    "submitted_at" timestamp with time zone,
    "operational_policy_snapshot" "jsonb",
    "request_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "transport_lines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "transportation_preferences" "jsonb",
    CONSTRAINT "booking_holds_check" CHECK (("check_out" > "check_in")),
    CONSTRAINT "booking_holds_guest_count_check" CHECK (("guest_count" > 0)),
    CONSTRAINT "booking_holds_nightly_rate_check" CHECK (("nightly_rate" >= (0)::numeric)),
    CONSTRAINT "booking_holds_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'payment_submitted'::"text", 'completed'::"text", 'expired'::"text"]))),
    CONSTRAINT "booking_holds_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "booking_holds_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."booking_holds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_user_id" "uuid" NOT NULL,
    "location" "text" DEFAULT 'Front Desk'::"text" NOT NULL,
    "opening_amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "expected_cash" numeric(12,2),
    "actual_cash" numeric(12,2),
    "variance" numeric(12,2),
    "close_notes" "text",
    "close_idempotency_key" "uuid",
    "reconciled_by" "uuid",
    "reconciled_at" timestamp with time zone,
    "reconciliation_notes" "text",
    CONSTRAINT "cash_shifts_opening_amount_check" CHECK (("opening_amount" >= (0)::numeric)),
    CONSTRAINT "cash_shifts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'reconciled'::"text"])))
);


ALTER TABLE "public"."cash_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "text" NOT NULL,
    "reservation_id" "text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "reason" "text" NOT NULL,
    "source_charge_id" "uuid",
    "created_by" "uuid",
    "idempotency_key" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manager_approval_id" "uuid",
    CONSTRAINT "financial_adjustments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "financial_adjustments_direction_check" CHECK (("direction" = ANY (ARRAY['debit'::"text", 'credit'::"text"]))),
    CONSTRAINT "financial_adjustments_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['adjustment'::"text", 'credit'::"text", 'reversal'::"text", 'write_off'::"text"])))
);


ALTER TABLE "public"."financial_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_number" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "reservation_id" "text",
    "payment_id" "uuid",
    "snapshot" "jsonb" NOT NULL,
    "generated_by" "uuid",
    "idempotency_key" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financial_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['receipt'::"text", 'folio'::"text"])))
);


ALTER TABLE "public"."financial_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folio_charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "text" NOT NULL,
    "reservation_id" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" DEFAULT 'incidental'::"text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "posted_by" "uuid",
    "idempotency_key" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'hotel_operations'::"text" NOT NULL,
    "source_record_id" "text",
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    CONSTRAINT "folio_charges_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "folio_charges_status_check" CHECK (("status" = ANY (ARRAY['posted'::"text", 'partially_reversed'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."folio_charges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."front_desk_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_date" "date" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "supersedes" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "front_desk_reports_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'acknowledged'::"text", 'returned'::"text"])))
);


ALTER TABLE "public"."front_desk_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reservation_id" "text",
    "guest_id" "text",
    "request" "text" NOT NULL,
    "department" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'open'::"text",
    "assigned_to" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "escalation_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "escalated_by" "uuid",
    "escalated_at" timestamp with time zone,
    "manager_resolution" "text",
    "request_type" "text" DEFAULT 'general'::"text" NOT NULL,
    "requested_action" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "idempotency_key" "uuid",
    "batch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approval_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "approval_note" "text",
    CONSTRAINT "guest_requests_escalation_status_check" CHECK (("escalation_status" = ANY (ARRAY['none'::"text", 'escalated'::"text", 'coordinated'::"text", 'resolved'::"text"]))),
    CONSTRAINT "guest_requests_severity_check" CHECK (("severity" = ANY (ARRAY['normal'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."guest_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guests" (
    "id" "text" DEFAULT ('GST-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "loyalty_tier" "text" DEFAULT 'Member'::"text",
    "loyalty_points" integer DEFAULT 0,
    "stays" integer DEFAULT 0,
    "preferences" "text",
    "special_requests" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_account_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "address" "text",
    "nationality" "text"
);


ALTER TABLE "public"."guests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hotel_operational_policies" (
    "key" "text" NOT NULL,
    "hotel_timezone" "text" DEFAULT 'Asia/Manila'::"text" NOT NULL,
    "check_in_time" time without time zone DEFAULT '15:00:00'::time without time zone NOT NULL,
    "check_out_time" time without time zone DEFAULT '12:00:00'::time without time zone NOT NULL,
    "no_show_cutoff_time" time without time zone DEFAULT '23:59:00'::time without time zone NOT NULL,
    "valid_id_required" boolean DEFAULT true NOT NULL,
    "minimum_booking_age" integer DEFAULT 18 NOT NULL,
    "cancellation_full_refund_days" integer DEFAULT 14 NOT NULL,
    "cancellation_partial_refund_days" integer DEFAULT 7 NOT NULL,
    "cancellation_partial_refund_basis_points" integer DEFAULT 5000 NOT NULL,
    "self_service_modification_days" integer DEFAULT 3 NOT NULL,
    "incidentals_due" "text" DEFAULT 'At checkout'::"text" NOT NULL,
    "pets_allowed" boolean DEFAULT false NOT NULL,
    "smoking_allowed" boolean DEFAULT false NOT NULL,
    "special_requests_guaranteed" boolean DEFAULT false NOT NULL,
    "email_verification_required" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "early_check_in_allowed" boolean DEFAULT false NOT NULL,
    "manager_arrival_risk_minutes" integer DEFAULT 120 NOT NULL,
    "guest_request_overdue_minutes" integer DEFAULT 60 NOT NULL,
    "housekeeping_turnover_overdue_minutes" integer DEFAULT 180 NOT NULL,
    "housekeeping_inspection_required" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "transfer_hotel_lat" numeric(9,6),
    "transfer_hotel_lon" numeric(9,6),
    "transfer_hotel_label" "text",
    CONSTRAINT "hotel_operational_policies_cancellation_full_refund_days_check" CHECK (("cancellation_full_refund_days" >= 0)),
    CONSTRAINT "hotel_operational_policies_cancellation_partial_refund_ba_check" CHECK ((("cancellation_partial_refund_basis_points" >= 0) AND ("cancellation_partial_refund_basis_points" <= 10000))),
    CONSTRAINT "hotel_operational_policies_cancellation_partial_refund_da_check" CHECK (("cancellation_partial_refund_days" >= 0)),
    CONSTRAINT "hotel_operational_policies_check" CHECK (("cancellation_full_refund_days" >= "cancellation_partial_refund_days")),
    CONSTRAINT "hotel_operational_policies_guest_request_overdue_minutes_check" CHECK ((("guest_request_overdue_minutes" >= 15) AND ("guest_request_overdue_minutes" <= 10080))),
    CONSTRAINT "hotel_operational_policies_housekeeping_turnover_overdue__check" CHECK ((("housekeeping_turnover_overdue_minutes" >= 15) AND ("housekeeping_turnover_overdue_minutes" <= 10080))),
    CONSTRAINT "hotel_operational_policies_manager_arrival_risk_minutes_check" CHECK ((("manager_arrival_risk_minutes" >= 15) AND ("manager_arrival_risk_minutes" <= 1440))),
    CONSTRAINT "hotel_operational_policies_minimum_booking_age_check" CHECK ((("minimum_booking_age" >= 1) AND ("minimum_booking_age" <= 120))),
    CONSTRAINT "hotel_operational_policies_self_service_modification_days_check" CHECK (("self_service_modification_days" >= 0)),
    CONSTRAINT "hotel_policy_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."hotel_operational_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."housekeeping_task_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "text" NOT NULL,
    "previous_user_id" "uuid",
    "assigned_user_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "reason" "text",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."housekeeping_task_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."housekeeping_tasks" (
    "id" "text" DEFAULT ('HKT-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "room_id" "text",
    "room_number" "text" NOT NULL,
    "task" "text" NOT NULL,
    "assignee" "text",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "due" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "task_type" "text" DEFAULT 'room_preparation'::"text" NOT NULL,
    "reservation_id" "text",
    "guest_request_id" "uuid",
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_id" "text",
    "assigned_user_id" "uuid",
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone,
    "started_by" "uuid",
    "started_at" timestamp with time zone,
    "completed_by" "uuid",
    "deferred_by" "uuid",
    "deferred_at" timestamp with time zone,
    "deferred_reason" "text",
    "checklist" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "inspection_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "inspected_by" "uuid",
    "inspected_at" timestamp with time zone,
    "inspection_reason" "text",
    "parent_task_id" "text",
    "idempotency_key" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "housekeeping_tasks_inspection_check" CHECK (("inspection_status" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'passed'::"text", 'failed'::"text"]))),
    CONSTRAINT "housekeeping_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'assigned'::"text", 'in_progress'::"text", 'completed'::"text", 'deferred'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "housekeeping_tasks_type_check" CHECK (("task_type" = ANY (ARRAY['checkout_cleaning'::"text", 'stayover_cleaning'::"text", 'guest_request'::"text", 'reclean'::"text", 'inspection'::"text", 'maintenance_cleanup'::"text", 'room_preparation'::"text"]))),
    CONSTRAINT "housekeeping_tasks_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."housekeeping_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "text" DEFAULT ('ITM-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "quantity" numeric(12,2) DEFAULT 0 NOT NULL,
    "reorder_point" numeric(12,2) DEFAULT 0 NOT NULL,
    "unit" "text" NOT NULL,
    "status" "text" DEFAULT 'healthy'::"text",
    "unit_cost" numeric(12,2) DEFAULT 0,
    "vendor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_status_check" CHECK (("status" = ANY (ARRAY['healthy'::"text", 'low'::"text", 'out'::"text"])))
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_order_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text" NOT NULL,
    "assigned_user_id" "uuid" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "release_reason" "text"
);


ALTER TABLE "public"."maintenance_order_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_order_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actor_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."maintenance_order_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."maintenance_orders" (
    "id" "text" DEFAULT ('MWO-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "room_id" "text",
    "room_number" "text" NOT NULL,
    "issue" "text" NOT NULL,
    "category" "text",
    "assignee" "text",
    "priority" "text" DEFAULT 'normal'::"text",
    "status" "text" DEFAULT 'open'::"text",
    "cost" numeric(12,2) DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "reported_by" "uuid",
    "housekeeping_task_id" "text",
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_id" "text",
    "idempotency_key" "uuid",
    "reservation_id" "text",
    "guest_request_id" "uuid",
    "target_type" "text" DEFAULT 'room'::"text" NOT NULL,
    "target_label" "text",
    "assigned_user_id" "uuid",
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone,
    "started_by" "uuid",
    "started_at" timestamp with time zone,
    "diagnosis" "text",
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "serviceability_impact" "text" DEFAULT 'serviceable'::"text" NOT NULL,
    "serviceability_reason" "text",
    "serviceability_decided_by" "uuid",
    "serviceability_decided_at" timestamp with time zone,
    "parts_required" boolean DEFAULT false NOT NULL,
    "parts_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "external_service_required" boolean DEFAULT false NOT NULL,
    "estimated_completion" timestamp with time zone,
    "waiting_reason" "text",
    "resolution" "text",
    "resolved_by" "uuid",
    "cleanup_required" boolean DEFAULT false NOT NULL,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_orders_parts_status_check" CHECK (("parts_status" = ANY (ARRAY['none'::"text", 'required'::"text", 'ordered'::"text", 'available'::"text"]))),
    CONSTRAINT "maintenance_orders_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text", 'critical'::"text"]))),
    CONSTRAINT "maintenance_orders_serviceability_check" CHECK (("serviceability_impact" = ANY (ARRAY['serviceable'::"text", 'blocked'::"text", 'out_of_service'::"text"]))),
    CONSTRAINT "maintenance_orders_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "maintenance_orders_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'assigned'::"text", 'in_progress'::"text", 'waiting_parts'::"text", 'deferred'::"text", 'resolved'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "maintenance_orders_target_type_check" CHECK (("target_type" = ANY (ARRAY['room'::"text", 'equipment'::"text", 'facility'::"text"]))),
    CONSTRAINT "maintenance_orders_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."maintenance_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manager_approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_type" "text" NOT NULL,
    "related_entity_type" "text" NOT NULL,
    "related_entity_id" "text" NOT NULL,
    "reservation_id" "text",
    "guest_request_id" "uuid",
    "department" "text" NOT NULL,
    "severity" "text" DEFAULT 'normal'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "requested_action" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normal_policy_result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "decision_reason" "text",
    "execution_status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "executed_by" "uuid",
    "executed_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "authority_level" "text" DEFAULT 'manager'::"text" NOT NULL,
    "owner_escalated_by" "uuid",
    "owner_escalated_at" timestamp with time zone,
    "owner_escalation_reason" "text",
    "owner_reviewed_by" "uuid",
    "owner_reviewed_at" timestamp with time zone,
    CONSTRAINT "manager_approval_authority_check" CHECK (("authority_level" = ANY (ARRAY['manager'::"text", 'owner'::"text"]))),
    CONSTRAINT "manager_approval_requests_execution_status_check" CHECK (("execution_status" = ANY (ARRAY['pending_review'::"text", 'awaiting_execution'::"text", 'executed'::"text", 'not_required'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "manager_approval_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['room_upgrade'::"text", 'room_type_exception'::"text", 'reservation_modification'::"text", 'early_check_in'::"text", 'late_checkout'::"text", 'guest_compensation'::"text", 'refund_exception'::"text", 'checkout_exception'::"text", 'guest_escalation'::"text"]))),
    CONSTRAINT "manager_approval_requests_severity_check" CHECK (("severity" = ANY (ARRAY['normal'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "manager_approval_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."manager_approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manager_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approval_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."manager_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_reconciliations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "payment_method" "text" NOT NULL,
    "expected_amount" numeric(12,2) NOT NULL,
    "settled_amount" numeric(12,2) NOT NULL,
    "variance" numeric(12,2) NOT NULL,
    "status" "text" NOT NULL,
    "notes" "text",
    "reconciled_by" "uuid",
    "reconciled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    CONSTRAINT "payment_reconciliations_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "payment_reconciliations_settled_amount_check" CHECK (("settled_amount" >= (0)::numeric)),
    CONSTRAINT "payment_reconciliations_status_check" CHECK (("status" = ANY (ARRAY['balanced'::"text", 'variance'::"text"])))
);


ALTER TABLE "public"."payment_reconciliations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" character(3) DEFAULT 'PHP'::"bpchar" NOT NULL,
    "method" "text" NOT NULL,
    "reference" "text",
    "received_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reservation_id" "text",
    "purpose" "text" DEFAULT 'stay_payment'::"text" NOT NULL,
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "idempotency_key" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone,
    "notes" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "decision_reason" "text",
    "cash_shift_id" "uuid",
    CONSTRAINT "payments_purpose_check" CHECK (("purpose" = ANY (ARRAY['reservation_deposit'::"text", 'stay_payment'::"text", 'refund'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending_verification'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text",
    "total" numeric(12,2) DEFAULT 0,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ordered_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refund_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "refund_request_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "reference" "text",
    "reason" "text",
    "attempted_by" "uuid",
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refund_attempts_status_check" CHECK (("status" = ANY (ARRAY['processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."refund_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refund_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reservation_id" "text" NOT NULL,
    "invoice_id" "text" NOT NULL,
    "requested_by" "uuid",
    "reason" "text" NOT NULL,
    "paid_deposit" numeric(12,2) DEFAULT 0 NOT NULL,
    "refund_basis_points" integer DEFAULT 0 NOT NULL,
    "eligible_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "processed_by" "uuid",
    "processed_at" timestamp with time zone,
    "reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exception_approval_id" "uuid",
    "normal_policy_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "refund_requests_eligible_amount_check" CHECK (("eligible_amount" >= (0)::numeric)),
    CONSTRAINT "refund_requests_normal_policy_amount_check" CHECK (("normal_policy_amount" >= (0)::numeric)),
    CONSTRAINT "refund_requests_paid_deposit_check" CHECK (("paid_deposit" >= (0)::numeric)),
    CONSTRAINT "refund_requests_refund_basis_points_check" CHECK ((("refund_basis_points" >= 0) AND ("refund_basis_points" <= 10000))),
    CONSTRAINT "refund_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."refund_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reservation_id" "text" NOT NULL,
    "requested_by" "uuid",
    "requested_check_in" "date",
    "requested_check_out" "date",
    "requested_room_type" "text",
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requested_guests" integer,
    "requested_special_requests" "text",
    "calculated_total" numeric(12,2),
    "payment_difference" numeric(12,2),
    "manager_approval_id" "uuid",
    "idempotency_key" "uuid",
    "execution_status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    CONSTRAINT "reservation_change_execution_status_check" CHECK (("execution_status" = ANY (ARRAY['pending_review'::"text", 'awaiting_execution'::"text", 'executed'::"text", 'not_required'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "reservation_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text", 'executed'::"text"])))
);


ALTER TABLE "public"."reservation_change_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_deposit_policies" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "calculation_type" "text" NOT NULL,
    "percentage_basis_points" integer DEFAULT 3000 NOT NULL,
    "fixed_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "hold_minutes" integer DEFAULT 15 NOT NULL,
    "remaining_balance_due" "text" DEFAULT 'At hotel / check-in according to hotel policy'::"text" NOT NULL,
    "active_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reservation_deposit_policies_calculation_type_check" CHECK (("calculation_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "reservation_deposit_policies_fixed_amount_check" CHECK (("fixed_amount" >= (0)::numeric)),
    CONSTRAINT "reservation_deposit_policies_hold_minutes_check" CHECK ((("hold_minutes" >= 1) AND ("hold_minutes" <= 1440))),
    CONSTRAINT "reservation_deposit_policies_percentage_basis_points_check" CHECK ((("percentage_basis_points" >= 0) AND ("percentage_basis_points" <= 10000)))
);


ALTER TABLE "public"."reservation_deposit_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservation_room_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reservation_id" "text" NOT NULL,
    "room_id" "text" NOT NULL,
    "check_in" "date" NOT NULL,
    "check_out" "date" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "reason" "text",
    "is_upgrade" boolean DEFAULT false NOT NULL,
    "authorized_by" "uuid",
    CONSTRAINT "reservation_room_assignments_check" CHECK (("check_out" > "check_in")),
    CONSTRAINT "reservation_room_assignments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'reassigned'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."reservation_room_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "text" DEFAULT ('RSV-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "guest_id" "text",
    "guest_name" "text" NOT NULL,
    "room_id" "text",
    "room_number" "text",
    "room_type" "text" NOT NULL,
    "check_in" "date" NOT NULL,
    "check_out" "date" NOT NULL,
    "guests" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source" "text" DEFAULT 'Direct'::"text",
    "total" numeric(12,2) DEFAULT 0,
    "deposit" numeric(12,2) DEFAULT 0,
    "group_code" "text",
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "confirmation_number" "text",
    "guest_email" "text",
    "special_requests" "text",
    "expected_arrival" "text",
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "payment_method" "text",
    "idempotency_key" "uuid",
    "deposit_required" numeric(12,2) DEFAULT 0 NOT NULL,
    "deposit_policy_snapshot" "jsonb",
    "payment_due_at" timestamp with time zone,
    "operational_policy_snapshot" "jsonb",
    "identity_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "identity_verified_by" "uuid",
    "identity_verified_at" timestamp with time zone,
    "checked_in_at" timestamp with time zone,
    "checked_out_at" timestamp with time zone,
    "early_check_in_approved_until" timestamp with time zone,
    "late_checkout_until" timestamp with time zone,
    "request_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "transport_lines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "transportation_preferences" "jsonb",
    CONSTRAINT "reservations_check" CHECK (("check_out" > "check_in")),
    CONSTRAINT "reservations_identity_status_check" CHECK (("identity_status" = ANY (ARRAY['unverified'::"text", 'verified'::"text"]))),
    CONSTRAINT "reservations_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'deposit'::"text", 'partial'::"text", 'paid'::"text", 'credit'::"text", 'failed'::"text", 'partial_refund'::"text", 'refunded'::"text"]))),
    CONSTRAINT "reservations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'checked_in'::"text", 'checked_out'::"text", 'cancelled'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "max_guests" integer NOT NULL,
    "beds" "text" NOT NULL,
    "size_sqm" integer,
    "amenities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "base_rate" numeric(12,2) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "room_types_base_rate_check" CHECK (("base_rate" >= (0)::numeric)),
    CONSTRAINT "room_types_max_guests_check" CHECK (("max_guests" > 0)),
    CONSTRAINT "room_types_size_sqm_check" CHECK ((("size_sqm" IS NULL) OR ("size_sqm" > 0))),
    CONSTRAINT "room_types_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."room_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "text" DEFAULT ('RM-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "number" "text" NOT NULL,
    "floor" integer NOT NULL,
    "type" "text" NOT NULL,
    "rate" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "housekeeping" "text" DEFAULT 'clean'::"text" NOT NULL,
    "qr_code" "text",
    "amenities" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "administratively_active" boolean DEFAULT true NOT NULL,
    "wing" "text",
    "administrative_designation" "text",
    "configuration_version" integer DEFAULT 1 NOT NULL,
    "deactivated_at" timestamp with time zone,
    "deactivation_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rooms_configuration_version_check" CHECK (("configuration_version" > 0)),
    CONSTRAINT "rooms_housekeeping_check" CHECK (("housekeeping" = ANY (ARRAY['dirty'::"text", 'cleaning'::"text", 'clean'::"text", 'inspection'::"text", 'reclean_required'::"text"]))),
    CONSTRAINT "rooms_status_check" CHECK (("status" = ANY (ARRAY['available'::"text", 'reserved'::"text", 'occupied'::"text", 'dirty'::"text", 'maintenance'::"text"])))
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "text" DEFAULT ('STF-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "department" "text",
    "shift" "text",
    "attendance" "text" DEFAULT 'Scheduled'::"text",
    "status" "text" DEFAULT 'off_duty'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_status_check" CHECK (("status" = ANY (ARRAY['off_duty'::"text", 'on_duty'::"text", 'on_leave'::"text"])))
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transport_vehicle_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "seats" integer DEFAULT 4 NOT NULL,
    "base_fare" numeric(12,2) DEFAULT 0 NOT NULL,
    "per_km" numeric(12,2) DEFAULT 0 NOT NULL,
    "per_minute" numeric(12,2) DEFAULT 0 NOT NULL,
    "booking_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transport_vehicle_types_base_fare_check" CHECK (("base_fare" >= (0)::numeric)),
    CONSTRAINT "transport_vehicle_types_booking_fee_check" CHECK (("booking_fee" >= (0)::numeric)),
    CONSTRAINT "transport_vehicle_types_per_km_check" CHECK (("per_km" >= (0)::numeric)),
    CONSTRAINT "transport_vehicle_types_per_minute_check" CHECK (("per_minute" >= (0)::numeric)),
    CONSTRAINT "transport_vehicle_types_seats_check" CHECK ((("seats" >= 1) AND ("seats" <= 20)))
);


ALTER TABLE "public"."transport_vehicle_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transportation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reservation_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service_type" "text" NOT NULL,
    "pickup_location" "text" NOT NULL,
    "dropoff_location" "text" NOT NULL,
    "pickup_date" "date" NOT NULL,
    "pickup_time" "text" NOT NULL,
    "return_location" "text",
    "return_date" "date",
    "return_time" "text",
    "passenger_count" integer NOT NULL,
    "special_instructions" "text",
    "status" "text" DEFAULT 'REQUESTED'::"text" NOT NULL,
    "driver_name" "text",
    "vehicle_type_id" "uuid",
    "staff_notes" "text",
    "customer_visible_notes" "text",
    "cancellation_reason" "text",
    "reviewed_at" timestamp with time zone,
    "scheduled_at" timestamp with time zone,
    "assigned_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    "pickup_latitude" numeric(9,6),
    "pickup_longitude" numeric(9,6),
    "dropoff_latitude" numeric(9,6),
    "dropoff_longitude" numeric(9,6),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fare_amount" numeric(12,2),
    "fare_posted_at" timestamp with time zone,
    CONSTRAINT "transportation_requests_check" CHECK ((("service_type" <> 'ROUND_TRIP'::"text") OR (("return_location" IS NOT NULL) AND ("return_date" IS NOT NULL) AND ("return_time" IS NOT NULL)))),
    CONSTRAINT "transportation_requests_driver_name_check" CHECK ((("driver_name" IS NULL) OR (("char_length"("driver_name") >= 2) AND ("char_length"("driver_name") <= 120)))),
    CONSTRAINT "transportation_requests_dropoff_location_check" CHECK ((("char_length"("dropoff_location") >= 2) AND ("char_length"("dropoff_location") <= 200))),
    CONSTRAINT "transportation_requests_passenger_count_check" CHECK ((("passenger_count" >= 1) AND ("passenger_count" <= 20))),
    CONSTRAINT "transportation_requests_pickup_location_check" CHECK ((("char_length"("pickup_location") >= 5) AND ("char_length"("pickup_location") <= 200))),
    CONSTRAINT "transportation_requests_pickup_time_check" CHECK (("pickup_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::"text")),
    CONSTRAINT "transportation_requests_return_location_check" CHECK ((("return_location" IS NULL) OR (("char_length"("return_location") >= 5) AND ("char_length"("return_location") <= 200)))),
    CONSTRAINT "transportation_requests_return_time_check" CHECK ((("return_time" IS NULL) OR ("return_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::"text"))),
    CONSTRAINT "transportation_requests_service_type_check" CHECK (("service_type" = ANY (ARRAY['PICKUP'::"text", 'DROPOFF'::"text", 'ROUND_TRIP'::"text"]))),
    CONSTRAINT "transportation_requests_special_instructions_check" CHECK (("char_length"(COALESCE("special_instructions", ''::"text")) <= 500)),
    CONSTRAINT "transportation_requests_status_check" CHECK (("status" = ANY (ARRAY['REQUESTED'::"text", 'REVIEWED'::"text", 'SCHEDULED'::"text", 'ASSIGNED'::"text", 'IN_PROGRESS'::"text", 'COMPLETED'::"text", 'CANCELLED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."transportation_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "department" "text",
    "employee_reference" "text",
    "account_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "auth_version" integer DEFAULT 1 NOT NULL,
    "recovery_required" boolean DEFAULT false NOT NULL,
    "creation_idempotency_key" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_accounts_auth_version_check" CHECK (("auth_version" > 0)),
    CONSTRAINT "user_accounts_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'front_desk'::"text", 'housekeeping'::"text", 'maintenance'::"text", 'accounting'::"text", 'guest'::"text"]))),
    CONSTRAINT "user_accounts_status_check" CHECK (("account_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."user_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "category" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_recovery_tokens"
    ADD CONSTRAINT "account_recovery_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."account_recovery_tokens"
    ADD CONSTRAINT "account_recovery_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_close_idempotency_key_key" UNIQUE ("close_idempotency_key");



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_document_number_key" UNIQUE ("document_number");



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folio_charges"
    ADD CONSTRAINT "folio_charges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."front_desk_reports"
    ADD CONSTRAINT "front_desk_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_approval_status_chk" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotel_operational_policies"
    ADD CONSTRAINT "hotel_operational_policies_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."housekeeping_task_assignments"
    ADD CONSTRAINT "housekeeping_task_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_order_assignments"
    ADD CONSTRAINT "maintenance_order_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_order_events"
    ADD CONSTRAINT "maintenance_order_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manager_notes"
    ADD CONSTRAINT "manager_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_reconciliations"
    ADD CONSTRAINT "payment_reconciliations_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."payment_reconciliations"
    ADD CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refund_attempts"
    ADD CONSTRAINT "refund_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_change_requests"
    ADD CONSTRAINT "reservation_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_deposit_policies"
    ADD CONSTRAINT "reservation_deposit_policies_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."reservation_room_assignments"
    ADD CONSTRAINT "reservation_room_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reservation_room_assignments"
    ADD CONSTRAINT "room_assignment_no_overlap" EXCLUDE USING "gist" ("room_id" WITH =, "daterange"("check_in", "check_out", '[)'::"text") WITH &&) WHERE (("status" = 'active'::"text"));



ALTER TABLE ONLY "public"."room_types"
    ADD CONSTRAINT "room_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."room_types"
    ADD CONSTRAINT "room_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_qr_code_key" UNIQUE ("qr_code");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transport_vehicle_types"
    ADD CONSTRAINT "transport_vehicle_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."transport_vehicle_types"
    ADD CONSTRAINT "transport_vehicle_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transportation_requests"
    ADD CONSTRAINT "transportation_requests_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."transportation_requests"
    ADD CONSTRAINT "transportation_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_accounts"
    ADD CONSTRAINT "user_accounts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."user_accounts"
    ADD CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



CREATE INDEX "account_recovery_active_idx" ON "public"."account_recovery_tokens" USING "btree" ("user_id", "expires_at") WHERE ("used_at" IS NULL);



CREATE INDEX "booking_holds_inventory_idx" ON "public"."booking_holds" USING "btree" ("room_type", "check_in", "check_out", "expires_at") WHERE ("status" = ANY (ARRAY['active'::"text", 'payment_submitted'::"text"]));



CREATE INDEX "booking_holds_user_idx" ON "public"."booking_holds" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "cash_shift_one_open_per_staff" ON "public"."cash_shifts" USING "btree" ("staff_user_id") WHERE ("status" = 'open'::"text");



CREATE UNIQUE INDEX "financial_adjustments_manager_approval_unique" ON "public"."financial_adjustments" USING "btree" ("manager_approval_id") WHERE ("manager_approval_id" IS NOT NULL);



CREATE INDEX "financial_adjustments_reservation_idx" ON "public"."financial_adjustments" USING "btree" ("reservation_id", "created_at" DESC);



CREATE INDEX "financial_documents_reservation_idx" ON "public"."financial_documents" USING "btree" ("reservation_id", "created_at" DESC);



CREATE UNIQUE INDEX "folio_charges_idempotency_unique" ON "public"."folio_charges" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "front_desk_reports_one_live_per_date" ON "public"."front_desk_reports" USING "btree" ("report_date") WHERE ("status" = 'submitted'::"text");



CREATE INDEX "front_desk_reports_status_date_idx" ON "public"."front_desk_reports" USING "btree" ("status", "report_date" DESC);



CREATE INDEX "guest_requests_batch_idx" ON "public"."guest_requests" USING "btree" ("batch_id");



CREATE UNIQUE INDEX "guest_requests_customer_idempotency_unique" ON "public"."guest_requests" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "guests_user_account_unique" ON "public"."guests" USING "btree" ("user_account_id") WHERE ("user_account_id" IS NOT NULL);



CREATE INDEX "housekeeping_assignment_history_idx" ON "public"."housekeeping_task_assignments" USING "btree" ("task_id", "assigned_at" DESC);



CREATE UNIQUE INDEX "housekeeping_one_exclusive_active_per_room" ON "public"."housekeeping_tasks" USING "btree" ("room_id") WHERE ("status" = 'in_progress'::"text");



CREATE INDEX "housekeeping_status_idx" ON "public"."housekeeping_tasks" USING "btree" ("status");



CREATE UNIQUE INDEX "housekeeping_task_idempotency_unique" ON "public"."housekeeping_tasks" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "housekeeping_task_queue_idx" ON "public"."housekeeping_tasks" USING "btree" ("status", "priority", "created_at");



CREATE INDEX "housekeeping_task_room_history_idx" ON "public"."housekeeping_tasks" USING "btree" ("room_id", "created_at" DESC);



CREATE UNIQUE INDEX "housekeeping_task_source_unique" ON "public"."housekeeping_tasks" USING "btree" ("source_type", "source_id", "task_type") WHERE (("source_id" IS NOT NULL) AND ("status" <> 'cancelled'::"text"));



CREATE INDEX "invoice_status_idx" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "maintenance_event_history_idx" ON "public"."maintenance_order_events" USING "btree" ("order_id", "created_at" DESC);



CREATE UNIQUE INDEX "maintenance_guest_request_unique" ON "public"."maintenance_orders" USING "btree" ("guest_request_id") WHERE ("guest_request_id" IS NOT NULL);



CREATE UNIQUE INDEX "maintenance_one_active_assignment" ON "public"."maintenance_order_assignments" USING "btree" ("order_id") WHERE ("released_at" IS NULL);



CREATE UNIQUE INDEX "maintenance_order_idempotency_unique" ON "public"."maintenance_orders" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "maintenance_order_source_unique" ON "public"."maintenance_orders" USING "btree" ("source_type", "source_id") WHERE (("source_id" IS NOT NULL) AND ("status" <> 'resolved'::"text"));



CREATE INDEX "maintenance_queue_idx" ON "public"."maintenance_orders" USING "btree" ("status", "priority", "created_at");



CREATE INDEX "maintenance_room_history_idx" ON "public"."maintenance_orders" USING "btree" ("room_id", "created_at" DESC);



CREATE INDEX "maintenance_serviceability_idx" ON "public"."maintenance_orders" USING "btree" ("room_id", "serviceability_impact", "status");



CREATE INDEX "maintenance_status_idx" ON "public"."maintenance_orders" USING "btree" ("status");



CREATE UNIQUE INDEX "manager_approval_one_pending" ON "public"."manager_approval_requests" USING "btree" ("request_type", "related_entity_type", "related_entity_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "manager_approval_owner_queue_idx" ON "public"."manager_approval_requests" USING "btree" ("authority_level", "status", "severity", "requested_at" DESC);



CREATE INDEX "manager_approval_queue_idx" ON "public"."manager_approval_requests" USING "btree" ("status", "severity", "requested_at" DESC);



CREATE INDEX "payments_cash_shift_idx" ON "public"."payments" USING "btree" ("cash_shift_id") WHERE ("cash_shift_id" IS NOT NULL);



CREATE UNIQUE INDEX "payments_idempotency_unique" ON "public"."payments" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "payments_manual_reference_unique" ON "public"."payments" USING "btree" ("method", "lower"("reference")) WHERE (("reference" IS NOT NULL) AND ("status" = ANY (ARRAY['pending_verification'::"text", 'paid'::"text"])) AND ("purpose" = ANY (ARRAY['reservation_deposit'::"text", 'stay_payment'::"text"])));



CREATE INDEX "refund_attempts_request_idx" ON "public"."refund_attempts" USING "btree" ("refund_request_id", "attempted_at" DESC);



CREATE UNIQUE INDEX "refund_requests_exception_unique" ON "public"."refund_requests" USING "btree" ("exception_approval_id") WHERE ("exception_approval_id" IS NOT NULL);



CREATE UNIQUE INDEX "refund_requests_normal_open_unique" ON "public"."refund_requests" USING "btree" ("reservation_id") WHERE (("status" = 'pending'::"text") AND ("exception_approval_id" IS NULL));



CREATE UNIQUE INDEX "reservation_active_room_unique" ON "public"."reservation_room_assignments" USING "btree" ("reservation_id") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "reservation_change_idempotency_unique" ON "public"."reservation_change_requests" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "reservation_change_manager_approval_unique" ON "public"."reservation_change_requests" USING "btree" ("manager_approval_id") WHERE ("manager_approval_id" IS NOT NULL);



CREATE UNIQUE INDEX "reservation_change_open_unique" ON "public"."reservation_change_requests" USING "btree" ("reservation_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "reservations_availability_idx" ON "public"."reservations" USING "btree" ("room_type", "check_in", "check_out") WHERE ("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'checked_in'::"text"]));



CREATE UNIQUE INDEX "reservations_confirmation_unique" ON "public"."reservations" USING "btree" ("confirmation_number") WHERE ("confirmation_number" IS NOT NULL);



CREATE INDEX "reservations_dates_idx" ON "public"."reservations" USING "btree" ("check_in", "check_out");



CREATE UNIQUE INDEX "reservations_idempotency_unique" ON "public"."reservations" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "reservations_source_created_idx" ON "public"."reservations" USING "btree" ("source", "created_at" DESC);



CREATE INDEX "reservations_staff_queue_idx" ON "public"."reservations" USING "btree" ("status", "check_in", "check_out", "created_at" DESC);



CREATE INDEX "reservations_status_idx" ON "public"."reservations" USING "btree" ("status");



CREATE INDEX "reservations_user_dates_idx" ON "public"."reservations" USING "btree" ("user_id", "check_in" DESC);



CREATE INDEX "room_assignment_history_idx" ON "public"."reservation_room_assignments" USING "btree" ("reservation_id", "assigned_at" DESC);



CREATE INDEX "rooms_status_idx" ON "public"."rooms" USING "btree" ("status");



CREATE UNIQUE INDEX "transportation_requests_active_unique" ON "public"."transportation_requests" USING "btree" ("reservation_id", "service_type", "pickup_date", "pickup_location") WHERE ("status" = ANY (ARRAY['REQUESTED'::"text", 'REVIEWED'::"text", 'SCHEDULED'::"text", 'ASSIGNED'::"text", 'IN_PROGRESS'::"text"]));



CREATE INDEX "transportation_requests_pickup_date_idx" ON "public"."transportation_requests" USING "btree" ("pickup_date");



CREATE INDEX "transportation_requests_reservation_idx" ON "public"."transportation_requests" USING "btree" ("reservation_id");



CREATE INDEX "transportation_requests_status_idx" ON "public"."transportation_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "user_accounts_creation_idempotency_unique" ON "public"."user_accounts" USING "btree" ("creation_idempotency_key") WHERE ("creation_idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "user_accounts_employee_reference_unique" ON "public"."user_accounts" USING "btree" ("employee_reference") WHERE ("employee_reference" IS NOT NULL);



CREATE INDEX "user_accounts_governance_idx" ON "public"."user_accounts" USING "btree" ("role", "account_status", "created_at");



CREATE OR REPLACE TRIGGER "audit_logs_immutable" BEFORE DELETE OR UPDATE ON "public"."audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."protect_audit_history"();



CREATE OR REPLACE TRIGGER "booking_holds_policy_snapshot" BEFORE INSERT ON "public"."booking_holds" FOR EACH ROW EXECUTE FUNCTION "public"."apply_operational_policy_snapshot"();



CREATE OR REPLACE TRIGGER "enforce_transportation_stay_window" BEFORE INSERT OR UPDATE OF "reservation_id", "pickup_date", "return_date" ON "public"."transportation_requests" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_transportation_stay_window"();



CREATE OR REPLACE TRIGGER "file_booking_requests_on_confirm" AFTER INSERT OR UPDATE OF "status" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_file_booking_requests"();



CREATE OR REPLACE TRIGGER "file_booking_transportation_on_confirm" AFTER INSERT OR UPDATE OF "status" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_file_booking_transportation"();



CREATE OR REPLACE TRIGGER "guest_request_create_housekeeping_task" AFTER INSERT ON "public"."guest_requests" FOR EACH ROW EXECUTE FUNCTION "public"."create_housekeeping_task_for_guest_request"();



CREATE OR REPLACE TRIGGER "guest_request_create_maintenance" AFTER INSERT OR UPDATE OF "department" ON "public"."guest_requests" FOR EACH ROW WHEN (("new"."department" = 'maintenance'::"text")) EXECUTE FUNCTION "public"."create_maintenance_for_guest_request"();



CREATE OR REPLACE TRIGGER "manager_approval_sync_customer_change" AFTER UPDATE OF "status", "execution_status" ON "public"."manager_approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."sync_customer_change_request_status"();



CREATE OR REPLACE TRIGGER "owner_exception_review_guard" BEFORE UPDATE ON "public"."manager_approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."protect_owner_exception_review"();



CREATE OR REPLACE TRIGGER "payments_preserve_settled_history" BEFORE DELETE OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."protect_settled_payment"();



CREATE OR REPLACE TRIGGER "refund_completes_manager_approval" AFTER UPDATE ON "public"."refund_requests" FOR EACH ROW EXECUTE FUNCTION "public"."sync_manager_financial_execution"();



CREATE OR REPLACE TRIGGER "reservation_link_housekeeping_tasks" AFTER UPDATE OF "room_id" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."link_housekeeping_tasks_to_assigned_room"();



CREATE OR REPLACE TRIGGER "reservations_policy_snapshot" BEFORE INSERT ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."apply_operational_policy_snapshot"();



CREATE OR REPLACE TRIGGER "reservations_release_terminal_assignment" AFTER UPDATE OF "status" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."release_terminal_assignment"();



CREATE OR REPLACE TRIGGER "reverse_transport_on_cancel" AFTER UPDATE OF "status" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_reverse_transport_on_cancel"();



CREATE OR REPLACE TRIGGER "user_account_lifecycle_sync" BEFORE INSERT OR UPDATE OF "active", "account_status" ON "public"."user_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_account_lifecycle"();



ALTER TABLE ONLY "public"."account_recovery_tokens"
    ADD CONSTRAINT "account_recovery_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."account_recovery_tokens"
    ADD CONSTRAINT "account_recovery_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_room_type_fkey" FOREIGN KEY ("room_type") REFERENCES "public"."room_types"("name");



ALTER TABLE ONLY "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_shifts"
    ADD CONSTRAINT "cash_shifts_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_manager_approval_id_fkey" FOREIGN KEY ("manager_approval_id") REFERENCES "public"."manager_approval_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_adjustments"
    ADD CONSTRAINT "financial_adjustments_source_charge_id_fkey" FOREIGN KEY ("source_charge_id") REFERENCES "public"."folio_charges"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_documents"
    ADD CONSTRAINT "financial_documents_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."folio_charges"
    ADD CONSTRAINT "folio_charges_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."folio_charges"
    ADD CONSTRAINT "folio_charges_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."folio_charges"
    ADD CONSTRAINT "folio_charges_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."front_desk_reports"
    ADD CONSTRAINT "front_desk_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."front_desk_reports"
    ADD CONSTRAINT "front_desk_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."front_desk_reports"
    ADD CONSTRAINT "front_desk_reports_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "public"."front_desk_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."user_accounts"("id");



ALTER TABLE ONLY "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_escalated_by_fkey" FOREIGN KEY ("escalated_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guest_requests"
    ADD CONSTRAINT "guest_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_task_assignments"
    ADD CONSTRAINT "housekeeping_task_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."housekeeping_task_assignments"
    ADD CONSTRAINT "housekeeping_task_assignments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."housekeeping_task_assignments"
    ADD CONSTRAINT "housekeeping_task_assignments_previous_user_id_fkey" FOREIGN KEY ("previous_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_task_assignments"
    ADD CONSTRAINT "housekeeping_task_assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."housekeeping_tasks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_deferred_by_fkey" FOREIGN KEY ("deferred_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_guest_request_id_fkey" FOREIGN KEY ("guest_request_id") REFERENCES "public"."guest_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_inspected_by_fkey" FOREIGN KEY ("inspected_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."housekeeping_tasks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."housekeeping_tasks"
    ADD CONSTRAINT "housekeeping_tasks_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_order_assignments"
    ADD CONSTRAINT "maintenance_order_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_order_assignments"
    ADD CONSTRAINT "maintenance_order_assignments_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."maintenance_order_assignments"
    ADD CONSTRAINT "maintenance_order_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."maintenance_order_events"
    ADD CONSTRAINT "maintenance_order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_order_events"
    ADD CONSTRAINT "maintenance_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_guest_request_id_fkey" FOREIGN KEY ("guest_request_id") REFERENCES "public"."guest_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_housekeeping_task_id_fkey" FOREIGN KEY ("housekeeping_task_id") REFERENCES "public"."housekeeping_tasks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_serviceability_decided_by_fkey" FOREIGN KEY ("serviceability_decided_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."maintenance_orders"
    ADD CONSTRAINT "maintenance_orders_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_guest_request_id_fkey" FOREIGN KEY ("guest_request_id") REFERENCES "public"."guest_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_owner_escalated_by_fkey" FOREIGN KEY ("owner_escalated_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_owner_reviewed_by_fkey" FOREIGN KEY ("owner_reviewed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manager_approval_requests"
    ADD CONSTRAINT "manager_approval_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."manager_notes"
    ADD CONSTRAINT "manager_notes_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "public"."manager_approval_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."manager_notes"
    ADD CONSTRAINT "manager_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_reconciliations"
    ADD CONSTRAINT "payment_reconciliations_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_cash_shift_id_fkey" FOREIGN KEY ("cash_shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."user_accounts"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_ordered_by_fkey" FOREIGN KEY ("ordered_by") REFERENCES "public"."user_accounts"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."refund_attempts"
    ADD CONSTRAINT "refund_attempts_attempted_by_fkey" FOREIGN KEY ("attempted_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refund_attempts"
    ADD CONSTRAINT "refund_attempts_refund_request_id_fkey" FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_exception_approval_id_fkey" FOREIGN KEY ("exception_approval_id") REFERENCES "public"."manager_approval_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservation_change_requests"
    ADD CONSTRAINT "reservation_change_requests_manager_approval_id_fkey" FOREIGN KEY ("manager_approval_id") REFERENCES "public"."manager_approval_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservation_change_requests"
    ADD CONSTRAINT "reservation_change_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservation_change_requests"
    ADD CONSTRAINT "reservation_change_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservation_change_requests"
    ADD CONSTRAINT "reservation_change_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservation_room_assignments"
    ADD CONSTRAINT "reservation_room_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservation_room_assignments"
    ADD CONSTRAINT "reservation_room_assignments_authorized_by_fkey" FOREIGN KEY ("authorized_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservation_room_assignments"
    ADD CONSTRAINT "reservation_room_assignments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservation_room_assignments"
    ADD CONSTRAINT "reservation_room_assignments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_identity_verified_by_fkey" FOREIGN KEY ("identity_verified_by") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transportation_requests"
    ADD CONSTRAINT "transportation_requests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transportation_requests"
    ADD CONSTRAINT "transportation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transportation_requests"
    ADD CONSTRAINT "transportation_requests_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "public"."transport_vehicle_types"("id");



ALTER TABLE "public"."account_recovery_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_holds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_shifts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folio_charges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."front_desk_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotel_operational_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."housekeeping_task_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."housekeeping_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_order_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_order_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."maintenance_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manager_approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manager_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refund_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refund_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_deposit_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservation_room_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transport_vehicle_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transportation_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."accounting_close_cash_shift"("p_shift_id" "uuid", "p_actual_cash" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_close_cash_shift"("p_shift_id" "uuid", "p_actual_cash" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_execute_manager_financial_approval"("p_approval_id" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_execute_manager_financial_approval"("p_approval_id" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_fail_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_fail_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_generate_document"("p_document_type" "text", "p_reservation_id" "text", "p_payment_id" "uuid", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_generate_document"("p_document_type" "text", "p_reservation_id" "text", "p_payment_id" "uuid", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_open_cash_shift"("p_staff_user_id" "uuid", "p_location" "text", "p_opening_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_open_cash_shift"("p_staff_user_id" "uuid", "p_location" "text", "p_opening_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_reconcile_cash_shift"("p_shift_id" "uuid", "p_staff_user_id" "uuid", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_reconcile_cash_shift"("p_shift_id" "uuid", "p_staff_user_id" "uuid", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_reconcile_payments"("p_period_start" "date", "p_period_end" "date", "p_method" "text", "p_settled_amount" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_reconcile_payments"("p_period_start" "date", "p_period_end" "date", "p_method" "text", "p_settled_amount" numeric, "p_notes" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_record_adjustment"("p_reservation_id" "text", "p_transaction_type" "text", "p_direction" "text", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_record_adjustment"("p_reservation_id" "text", "p_transaction_type" "text", "p_direction" "text", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_reject_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_reject_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accounting_reverse_charge"("p_charge_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accounting_reverse_charge"("p_charge_id" "uuid", "p_amount" numeric, "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_change_account_status"("p_target_user_id" "uuid", "p_status" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_change_account_status"("p_target_user_id" "uuid", "p_status" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_change_user_role"("p_target_user_id" "uuid", "p_role" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_change_user_role"("p_target_user_id" "uuid", "p_role" "text", "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_staff"("p_name" "text", "p_email" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_role" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_staff"("p_name" "text", "p_email" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_role" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_initiate_account_recovery"("p_target_user_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone, "p_reason" "text", "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_initiate_account_recovery"("p_target_user_id" "uuid", "p_token_hash" "text", "p_expires_at" timestamp with time zone, "p_reason" "text", "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_operational_policy"("p_hotel_timezone" "text", "p_check_in_time" time without time zone, "p_check_out_time" time without time zone, "p_no_show_cutoff_time" time without time zone, "p_valid_id_required" boolean, "p_minimum_booking_age" integer, "p_cancellation_full_refund_days" integer, "p_cancellation_partial_refund_days" integer, "p_cancellation_partial_refund_basis_points" integer, "p_self_service_modification_days" integer, "p_early_check_in_allowed" boolean, "p_housekeeping_inspection_required" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_operational_policy"("p_hotel_timezone" "text", "p_check_in_time" time without time zone, "p_check_out_time" time without time zone, "p_no_show_cutoff_time" time without time zone, "p_valid_id_required" boolean, "p_minimum_booking_age" integer, "p_cancellation_full_refund_days" integer, "p_cancellation_partial_refund_days" integer, "p_cancellation_partial_refund_basis_points" integer, "p_self_service_modification_days" integer, "p_early_check_in_allowed" boolean, "p_housekeeping_inspection_required" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_room_metadata"("p_room_id" "text", "p_floor" integer, "p_type" "text", "p_wing" "text", "p_designation" "text", "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_room_metadata"("p_room_id" "text", "p_floor" integer, "p_type" "text", "p_wing" "text", "p_designation" "text", "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_room_type"("p_room_type_id" "uuid", "p_description" "text", "p_max_guests" integer, "p_beds" "text", "p_size_sqm" integer, "p_amenities" "jsonb", "p_base_rate" numeric, "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid", "p_photo_urls" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_room_type"("p_room_type_id" "uuid", "p_description" "text", "p_max_guests" integer, "p_beds" "text", "p_size_sqm" integer, "p_amenities" "jsonb", "p_base_rate" numeric, "p_active" boolean, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid", "p_photo_urls" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_user_metadata"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_user_metadata"("p_target_user_id" "uuid", "p_name" "text", "p_phone" "text", "p_department" "text", "p_employee_reference" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_operational_policy_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_operational_policy_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_reservation"("p_reservation_id" "text", "p_actor_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_reservation"("p_reservation_id" "text", "p_actor_user_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_account_recovery"("p_token_hash" "text", "p_password_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_account_recovery"("p_token_hash" "text", "p_password_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_housekeeping_task"("p_task_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_housekeeping_task"("p_task_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_booking_hold"("p_user_id" "uuid", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_nationality" "text", "p_expected_arrival" "text", "p_special_requests" "text", "p_request_options" "jsonb", "p_transport_lines" "jsonb", "p_transportation_preferences" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_booking_hold"("p_user_id" "uuid", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_nationality" "text", "p_expected_arrival" "text", "p_special_requests" "text", "p_request_options" "jsonb", "p_transport_lines" "jsonb", "p_transportation_preferences" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_housekeeping_task_for_guest_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_housekeeping_task_for_guest_request"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_maintenance_for_guest_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_maintenance_for_guest_request"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_operational_policy_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_operational_policy_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_cancel_transportation_request"("p_user_id" "uuid", "p_request_id" "uuid", "p_reason" "text", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_cancel_transportation_request"("p_user_id" "uuid", "p_request_id" "uuid", "p_reason" "text", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_request_reservation_change"("p_user_id" "uuid", "p_reservation_id" "text", "p_check_in" "date", "p_check_out" "date", "p_room_type" "text", "p_guests" integer, "p_special_requests" "text", "p_reason" "text", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_request_reservation_change"("p_user_id" "uuid", "p_reservation_id" "text", "p_check_in" "date", "p_check_out" "date", "p_room_type" "text", "p_guests" integer, "p_special_requests" "text", "p_reason" "text", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_submit_guest_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_type" "text", "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_submit_guest_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_type" "text", "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_submit_guest_requests"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_types" "text"[], "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_submit_guest_requests"("p_user_id" "uuid", "p_reservation_id" "text", "p_request_types" "text"[], "p_description" "text", "p_requested_action" "jsonb", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_submit_stay_payment"("p_user_id" "uuid", "p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_submit_stay_payment"("p_user_id" "uuid", "p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_submit_transportation_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_service_type" "text", "p_pickup_location" "text", "p_dropoff_location" "text", "p_pickup_date" "date", "p_pickup_time" "text", "p_return_location" "text", "p_return_date" "date", "p_return_time" "text", "p_passenger_count" integer, "p_special_instructions" "text", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_submit_transportation_request"("p_user_id" "uuid", "p_reservation_id" "text", "p_service_type" "text", "p_pickup_location" "text", "p_dropoff_location" "text", "p_pickup_date" "date", "p_pickup_time" "text", "p_return_location" "text", "p_return_date" "date", "p_return_time" "text", "p_passenger_count" integer, "p_special_instructions" "text", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_transportation_stay_window"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_transportation_stay_window"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_housekeeping_task_for_guest_request"("p_guest_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_housekeeping_task_for_guest_request"("p_guest_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."escalate_manager_approval_to_owner"("p_approval_id" "uuid", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."escalate_manager_approval_to_owner"("p_approval_id" "uuid", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_booking_holds"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_booking_holds"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."file_booking_guest_requests"("p_reservation_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."file_booking_guest_requests"("p_reservation_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."file_booking_transportation_request"("p_reservation_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."file_booking_transportation_request"("p_reservation_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_assign_room"("p_reservation_id" "text", "p_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_assign_room"("p_reservation_id" "text", "p_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_change_room"("p_reservation_id" "text", "p_new_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_change_room"("p_reservation_id" "text", "p_new_room_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_check_in"("p_reservation_id" "text", "p_room_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_check_in"("p_reservation_id" "text", "p_room_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_checkout"("p_reservation_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_checkout"("p_reservation_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_create_reservation"("p_guest_name" "text", "p_email" "text", "p_phone" "text", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_source" "text", "p_special_requests" "text", "p_expected_arrival" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_create_reservation"("p_guest_name" "text", "p_email" "text", "p_phone" "text", "p_room_type" "text", "p_check_in" "date", "p_check_out" "date", "p_guest_count" integer, "p_source" "text", "p_special_requests" "text", "p_expected_arrival" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_execute_manager_approval"("p_approval_id" "uuid", "p_room_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_execute_manager_approval"("p_approval_id" "uuid", "p_room_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_extend_stay"("p_reservation_id" "text", "p_new_check_out" "date", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_extend_stay"("p_reservation_id" "text", "p_new_check_out" "date", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_review_guest_request_batch"("p_staff_user_id" "uuid", "p_batch_id" "uuid", "p_decision" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_review_guest_request_batch"("p_staff_user_id" "uuid", "p_batch_id" "uuid", "p_decision" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."front_desk_update_guest"("p_reservation_id" "text", "p_phone" "text", "p_expected_arrival" "text", "p_operational_notes" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."front_desk_update_guest"("p_reservation_id" "text", "p_phone" "text", "p_expected_arrival" "text", "p_operational_notes" "text", "p_staff_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."guest_request_route"("p_request_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guest_request_route"("p_request_type" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."haven_replace_functions"(IN "p_names" "text"[], IN "p_old" "text", IN "p_new" "text", IN "p_expected_min" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."hotel_today"("p_policy" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hotel_today"("p_policy" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."housekeeping_assign_task"("p_task_id" "text", "p_assigned_user_id" "uuid", "p_reason" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."housekeeping_assign_task"("p_task_id" "text", "p_assigned_user_id" "uuid", "p_reason" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."housekeeping_complete_task"("p_task_id" "text", "p_checklist" "jsonb", "p_notes" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."housekeeping_complete_task"("p_task_id" "text", "p_checklist" "jsonb", "p_notes" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."housekeeping_defer_task"("p_task_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."housekeeping_defer_task"("p_task_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."housekeeping_inspect_task"("p_task_id" "text", "p_result" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."housekeeping_inspect_task"("p_task_id" "text", "p_result" "text", "p_reason" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."housekeeping_report_maintenance"("p_task_id" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."housekeeping_report_maintenance"("p_task_id" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."housekeeping_start_task"("p_task_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."housekeeping_start_task"("p_task_id" "text", "p_staff_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_housekeeping_tasks_to_assigned_room"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_housekeeping_tasks_to_assigned_room"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_add_progress"("p_order_id" "text", "p_note" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_add_progress"("p_order_id" "text", "p_note" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_assign_work_order"("p_order_id" "text", "p_assigned_user_id" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_assign_work_order"("p_order_id" "text", "p_assigned_user_id" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_cancel_work_order"("p_order_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_cancel_work_order"("p_order_id" "text", "p_reason" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_close_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_close_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_create_work_order"("p_room_id" "text", "p_target_type" "text", "p_target_label" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_source_type" "text", "p_source_id" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_create_work_order"("p_room_id" "text", "p_target_type" "text", "p_target_label" "text", "p_category" "text", "p_description" "text", "p_priority" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_source_type" "text", "p_source_id" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_defer_work_order"("p_order_id" "text", "p_status" "text", "p_reason" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_defer_work_order"("p_order_id" "text", "p_status" "text", "p_reason" "text", "p_parts_status" "text", "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_record_diagnosis"("p_order_id" "text", "p_diagnosis" "text", "p_severity" "text", "p_serviceability_impact" "text", "p_serviceability_reason" "text", "p_parts_required" boolean, "p_parts_status" "text", "p_external_service_required" boolean, "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_record_diagnosis"("p_order_id" "text", "p_diagnosis" "text", "p_severity" "text", "p_serviceability_impact" "text", "p_serviceability_reason" "text", "p_parts_required" boolean, "p_parts_status" "text", "p_external_service_required" boolean, "p_estimated_completion" timestamp with time zone, "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_resolve_work_order"("p_order_id" "text", "p_resolution" "text", "p_cleanup_required" boolean, "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_resolve_work_order"("p_order_id" "text", "p_resolution" "text", "p_cleanup_required" boolean, "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_restore_room_state"("p_room_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_restore_room_state"("p_room_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_room_is_blocked"("p_room_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_room_is_blocked"("p_room_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."maintenance_start_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."maintenance_start_work_order"("p_order_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."manager_escalate_maintenance"("p_order_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manager_escalate_maintenance"("p_order_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."manager_prioritize_housekeeping"("p_task_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manager_prioritize_housekeeping"("p_task_id" "text", "p_priority" "text", "p_reason" "text", "p_manager_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_reservation_no_show"("p_reservation_id" "text", "p_staff_user_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_reservation_no_show"("p_reservation_id" "text", "p_staff_user_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_folio_charge"("p_reservation_id" "text", "p_description" "text", "p_category" "text", "p_amount" numeric, "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_folio_charge"("p_reservation_id" "text", "p_description" "text", "p_category" "text", "p_amount" numeric, "p_idempotency_key" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_refund"("p_refund_id" "uuid", "p_staff_user_id" "uuid", "p_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_audit_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_audit_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_owner_exception_review"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_owner_exception_review"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_settled_payment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_settled_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_staff_payment"("p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid", "p_allow_overpayment" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_staff_payment"("p_reservation_id" "text", "p_amount" numeric, "p_method" "text", "p_reference" "text", "p_idempotency_key" "uuid", "p_staff_user_id" "uuid", "p_allow_overpayment" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_guest_account"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_password_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_guest_account"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_phone" "text", "p_password_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_terminal_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_terminal_assignment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_manager_approval"("p_request_type" "text", "p_related_entity_type" "text", "p_related_entity_id" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_department" "text", "p_severity" "text", "p_reason" "text", "p_requested_action" "jsonb", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_manager_approval"("p_request_type" "text", "p_related_entity_type" "text", "p_related_entity_id" "text", "p_reservation_id" "text", "p_guest_request_id" "uuid", "p_department" "text", "p_severity" "text", "p_reason" "text", "p_requested_action" "jsonb", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_maintenance_order"("p_order_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_maintenance_order"("p_order_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_reservation_transport"("p_reservation_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_reservation_transport"("p_reservation_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_front_desk_report"("p_report_id" "uuid", "p_decision" "text", "p_note" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_front_desk_report"("p_report_id" "uuid", "p_decision" "text", "p_note" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_manager_approval"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_manager_approval"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_manager_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_owner_exception"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_owner_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_owner_exception"("p_approval_id" "uuid", "p_decision" "text", "p_reason" "text", "p_expected_version" integer, "p_owner_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."room_is_sellable"("p_room_id" "text", "p_check_in" "date", "p_policy" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."room_is_sellable"("p_room_id" "text", "p_check_in" "date", "p_policy" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."staff_transition_transportation_request"("p_request_id" "uuid", "p_action" "text", "p_details" "jsonb", "p_staff_user_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."staff_transition_transportation_request"("p_request_id" "uuid", "p_action" "text", "p_details" "jsonb", "p_staff_user_id" "uuid", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_front_desk_report"("p_report_date" "date", "p_snapshot" "jsonb", "p_supersedes" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_front_desk_report"("p_report_date" "date", "p_snapshot" "jsonb", "p_supersedes" "uuid", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_reservation_deposit"("p_token" "uuid", "p_user_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_reservation_deposit"("p_token" "uuid", "p_user_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_customer_change_request_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_customer_change_request_status"() TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_invoice_financials"("p_invoice_id" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."sync_manager_financial_execution"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_manager_financial_execution"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_user_account_lifecycle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_user_account_lifecycle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_file_booking_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_file_booking_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_file_booking_transportation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_file_booking_transportation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_reverse_transport_on_cancel"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_reverse_transport_on_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_transport_vehicle_type"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_seats" integer, "p_base_fare" numeric, "p_per_km" numeric, "p_per_minute" numeric, "p_booking_fee" numeric, "p_active" boolean, "p_sort" integer, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_transport_vehicle_type"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_seats" integer, "p_base_fare" numeric, "p_per_km" numeric, "p_per_minute" numeric, "p_booking_fee" numeric, "p_active" boolean, "p_sort" integer, "p_reason" "text", "p_expected_version" integer, "p_actor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_customer_stay_payment"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_approve" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_customer_stay_payment"("p_payment_id" "uuid", "p_staff_user_id" "uuid", "p_approve" boolean, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_guest_identity"("p_reservation_id" "text", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_guest_identity"("p_reservation_id" "text", "p_staff_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_reservation_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_reservation_deposit"("p_payment_id" "uuid", "p_staff_user_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."account_recovery_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."booking_holds" TO "service_role";



GRANT ALL ON TABLE "public"."cash_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."financial_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."financial_documents" TO "service_role";



GRANT ALL ON TABLE "public"."folio_charges" TO "service_role";



GRANT ALL ON TABLE "public"."front_desk_reports" TO "service_role";



GRANT ALL ON TABLE "public"."guest_requests" TO "service_role";



GRANT ALL ON TABLE "public"."guests" TO "service_role";



GRANT ALL ON TABLE "public"."hotel_operational_policies" TO "service_role";



GRANT ALL ON TABLE "public"."housekeeping_task_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."housekeeping_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_order_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_order_events" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_orders" TO "service_role";



GRANT ALL ON TABLE "public"."manager_approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."manager_notes" TO "service_role";



GRANT ALL ON TABLE "public"."payment_reconciliations" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."refund_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."refund_requests" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_change_requests" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_deposit_policies" TO "service_role";



GRANT ALL ON TABLE "public"."reservation_room_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."reservations" TO "service_role";



GRANT ALL ON TABLE "public"."room_types" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."transport_vehicle_types" TO "service_role";



GRANT ALL ON TABLE "public"."transportation_requests" TO "service_role";



GRANT ALL ON TABLE "public"."user_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































-- =============================================================================
-- 20260915010000_room_type_governance (appended after the dump snapshot)
-- Room-type governance: manager rate changes are propose-then-approve. See
-- supabase/migrations/20260915010000_room_type_governance.sql for the annotated
-- source; this appended block brings a fresh install to the same final state.

CREATE TABLE IF NOT EXISTS "public"."room_rate_proposals" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "room_type_id" uuid NOT NULL,
    "proposed_rate" numeric(12,2) NOT NULL,
    "reason" text NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "proposed_by" uuid,
    "decided_by" uuid,
    "decision_reason" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decided_at" timestamp with time zone,
    CONSTRAINT "room_rate_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_rate_proposals_proposed_rate_check" CHECK (("proposed_rate" >= (0)::numeric)),
    CONSTRAINT "room_rate_proposals_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id"),
    CONSTRAINT "room_rate_proposals_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "public"."user_accounts"("id"),
    CONSTRAINT "room_rate_proposals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."user_accounts"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "room_rate_proposals_one_pending" ON "public"."room_rate_proposals" ("room_type_id") WHERE ("status" = 'pending'::text);
ALTER TABLE "public"."room_rate_proposals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."room_rate_proposals" FROM PUBLIC;
GRANT ALL ON TABLE "public"."room_rate_proposals" TO "service_role";

-- Create a room type (owner/admin/manager). Manager creations start inactive with
-- base_rate 0 and the desired rate filed as a pending proposal; owner/admin creations
-- apply the rate directly and may activate immediately.
create or replace function public.admin_create_room_type(
  p_name text, p_description text, p_max_guests integer, p_beds text, p_size_sqm integer,
  p_amenities jsonb, p_base_rate numeric, p_active boolean, p_reason text,
  p_photo_urls text[] default null, p_actor_user_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor text; new_id uuid; is_manager boolean; photos text[]; desired_rate numeric;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin', 'manager') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120
     or nullif(trim(p_description), '') is null or p_max_guests is null or p_max_guests <= 0
     or nullif(trim(p_beds), '') is null or (p_size_sqm is not null and p_size_sqm <= 0)
     or p_base_rate is null or p_base_rate < 0
     or jsonb_typeof(coalesce(p_amenities, '[]')) <> 'array'
     or nullif(trim(p_reason), '') is null
     or (p_photo_urls is not null and array_length(p_photo_urls, 1) > 24)
     or (p_photo_urls is not null and exists (select 1 from unnest(p_photo_urls) u where length(coalesce(u, '')) > 500))
    then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  if exists (select 1 from room_types where lower(name) = lower(trim(p_name))) then raise exception 'ROOM_TYPE_NAME_TAKEN'; end if;
  is_manager := actor = 'manager';
  desired_rate := round(p_base_rate, 2);
  photos := coalesce(p_photo_urls, '{}');
  if not is_manager and coalesce(p_active, false) and desired_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
  insert into room_types (name, description, max_guests, beds, size_sqm, amenities, base_rate, active, photo_urls, version)
  values (trim(p_name), trim(p_description), p_max_guests, trim(p_beds), p_size_sqm, coalesce(p_amenities, '[]'),
    case when is_manager then 0 else desired_rate end,
    case when is_manager then false else coalesce(p_active, false) end,
    photos, 1)
  returning id into new_id;
  if is_manager then
    insert into room_rate_proposals (room_type_id, proposed_rate, reason, status, proposed_by)
    values (new_id, desired_rate, trim(p_reason), 'pending', p_actor_user_id);
  end if;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
  values (p_actor_user_id, 'admin_create_room_type', 'room_type', new_id::text,
    jsonb_build_object('name', trim(p_name), 'maxGuests', p_max_guests, 'beds', trim(p_beds),
      'sizeSqm', p_size_sqm, 'baseRate', case when is_manager then 0 else desired_rate end,
      'active', case when is_manager then false else coalesce(p_active, false) end,
      'rateProposal', is_manager, 'photoUrls', photos, 'reason', trim(p_reason)));
  return new_id;
end $$;

-- Manager proposes a new base rate for an existing room type. Bumps the room-type
-- version so concurrent editors hit ROOM_TYPE_STALE instead of silently racing.
create or replace function public.admin_propose_room_type_rate(
  p_room_type_id uuid, p_rate numeric, p_reason text, p_expected_version integer, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; t room_types%rowtype; new_version integer;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor <> 'manager' then raise exception 'MANAGER_AUTHORITY_REQUIRED'; end if;
  if p_rate is null or p_rate < 0 or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into t from room_types where id = p_room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'ROOM_TYPE_STALE'; end if;
  if round(p_rate, 2) = t.base_rate then raise exception 'RATE_PROPOSAL_SAME_AS_CURRENT'; end if;
  if exists (select 1 from room_rate_proposals where room_type_id = t.id and status = 'pending') then raise exception 'RATE_PROPOSAL_ALREADY_PENDING'; end if;
  update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  insert into room_rate_proposals (room_type_id, proposed_rate, reason, status, proposed_by)
  values (t.id, round(p_rate, 2), trim(p_reason), 'pending', p_actor_user_id);
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'propose_room_type_rate', 'room_type', t.id::text,
    jsonb_build_object('baseRate', t.base_rate, 'version', t.version),
    jsonb_build_object('proposedRate', round(p_rate, 2), 'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version);
end $$;

-- Owner/admin decide a pending rate proposal. Approve writes the rate onto the room
-- type (version bump); both decisions close the proposal and are audited.
create or replace function public.admin_review_room_type_rate_proposal(
  p_proposal_id uuid, p_decision text, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_proposals%rowtype; t room_types%rowtype; new_version integer;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if p_decision not in ('approve', 'reject') or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into p from room_rate_proposals where id = p_proposal_id for update;
  if not found then raise exception 'RATE_PROPOSAL_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'RATE_PROPOSAL_ALREADY_REVIEWED'; end if;
  select * into t from room_types where id = p.room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if p_decision = 'approve' then
    update room_types set base_rate = p.proposed_rate, version = version + 1, updated_at = now()
      where id = t.id returning version into new_version;
  else
    update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  end if;
  update room_rate_proposals set status = p_decision, decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'review_room_type_rate_proposal', 'room_type', t.id::text,
    jsonb_build_object('baseRate', t.base_rate, 'proposedRate', p.proposed_rate, 'status', 'pending', 'version', t.version),
    jsonb_build_object('decision', p_decision, 'baseRate', case when p_decision = 'approve' then p.proposed_rate else t.base_rate end,
      'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version, 'status', p_decision);
end $$;

-- admin_update_room_type: same signature, two manager guards added. A manager can no
-- longer change the base rate directly or activate a type whose rate is still pending;
-- anyone activating a rate-0 type is refused. (Live body verified identical to
-- 20260904010000 before this replace.)
create or replace function public.admin_update_room_type(
  p_room_type_id uuid, p_description text, p_max_guests integer, p_beds text,
  p_size_sqm integer, p_amenities jsonb, p_base_rate numeric, p_active boolean,
  p_reason text, p_expected_version integer, p_actor_user_id uuid,
  p_photo_urls text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; t room_types%rowtype; photos text[]; new_rate numeric;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin', 'manager') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if nullif(trim(p_description), '') is null or p_max_guests <= 0 or nullif(trim(p_beds), '') is null
     or (p_size_sqm is not null and p_size_sqm <= 0) or p_base_rate < 0
     or jsonb_typeof(coalesce(p_amenities, '[]')) <> 'array' or nullif(trim(p_reason), '') is null
     or (p_photo_urls is not null and array_length(p_photo_urls, 1) > 24)
     or (p_photo_urls is not null and exists (select 1 from unnest(p_photo_urls) u where length(coalesce(u, '')) > 500))
    then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  photos := coalesce(p_photo_urls, (select photo_urls from room_types where id = p_room_type_id));
  select * into t from room_types where id = p_room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'ROOM_TYPE_STALE'; end if;
  new_rate := case when actor = 'manager' then t.base_rate else round(p_base_rate, 2) end;
  if actor = 'manager' and round(p_base_rate, 2) <> t.base_rate then raise exception 'RATE_CHANGE_APPROVAL_REQUIRED'; end if;
  if coalesce(p_active, t.active) and new_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
  if actor = 'manager' and p_active and exists (select 1 from room_rate_proposals where room_type_id = t.id and status = 'pending')
    then raise exception 'RATE_APPROVAL_PENDING'; end if;
  update room_types set description = trim(p_description), max_guests = p_max_guests, beds = trim(p_beds),
    size_sqm = p_size_sqm, amenities = coalesce(p_amenities, '[]'), base_rate = new_rate,
    active = p_active, photo_urls = photos, version = version + 1, updated_at = now() where id = t.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'admin_update_room_type', 'room_type', t.id::text, to_jsonb(t) - 'id',
    jsonb_build_object('name', t.name, 'description', trim(p_description), 'maxGuests', p_max_guests,
      'beds', trim(p_beds), 'sizeSqm', p_size_sqm, 'amenities', coalesce(p_amenities, '[]'),
      'baseRate', new_rate, 'active', p_active, 'photoUrls', photos,
      'reason', trim(p_reason)));
  return jsonb_build_object('id', t.id, 'version', t.version + 1);
end $$;

-- Only the service role may call the SECURITY DEFINER functions.
revoke all on function public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid) to service_role;
revoke all on function public.admin_propose_room_type_rate(uuid, numeric, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.admin_propose_room_type_rate(uuid, numeric, text, integer, uuid) to service_role;
revoke all on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) to service_role;
revoke all on function public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[]) to service_role;

-- Follow-up to 20260915010000: admin_review_room_type_rate_proposal stored the raw
-- decision verb ('approve'/'reject') into room_rate_proposals.status, violating the
-- ('pending','approved','rejected') check. Map the verb to the status noun.

create or replace function public.admin_review_room_type_rate_proposal(
  p_proposal_id uuid, p_decision text, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_proposals%rowtype; t room_types%rowtype; new_version integer; new_status text;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if p_decision not in ('approve', 'reject') or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into p from room_rate_proposals where id = p_proposal_id for update;
  if not found then raise exception 'RATE_PROPOSAL_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'RATE_PROPOSAL_ALREADY_REVIEWED'; end if;
  select * into t from room_types where id = p.room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  new_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  if p_decision = 'approve' then
    update room_types set base_rate = p.proposed_rate, version = version + 1, updated_at = now()
      where id = t.id returning version into new_version;
  else
    update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  end if;
  update room_rate_proposals set status = new_status, decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'review_room_type_rate_proposal', 'room_type', t.id::text,
    jsonb_build_object('baseRate', t.base_rate, 'proposedRate', p.proposed_rate, 'status', 'pending', 'version', t.version),
    jsonb_build_object('decision', p_decision, 'baseRate', case when p_decision = 'approve' then p.proposed_rate else t.base_rate end,
      'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version, 'status', new_status);
end $$;

revoke all on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) to service_role;

-- 20260916010000: physical-room creation. Configuration only — status and
-- housekeeping take their column defaults because those states belong to the
-- front-desk, housekeeping, and maintenance workflows. rate satisfies a NOT NULL
-- column from room_types.base_rate rather than exposing a second place to price
-- a room. Room number is set here once and never edited: it is denormalized into
-- reservations, housekeeping_tasks, and maintenance_orders.
create or replace function public.admin_create_room(
  p_number text, p_type text, p_floor integer, p_wing text, p_designation text,
  p_active boolean, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; v_number text; v_rate numeric(12,2); r rooms%rowtype;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin', 'manager') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  v_number := nullif(trim(p_number), '');
  if v_number is null or p_floor is null or p_floor < 0 or nullif(trim(p_type), '') is null
     or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_CONFIGURATION'; end if;
  select base_rate into v_rate from room_types where name = p_type;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if exists (select 1 from rooms where number = v_number) then raise exception 'ROOM_NUMBER_TAKEN'; end if;
  begin
    insert into rooms (number, floor, type, rate, wing, administrative_designation, administratively_active, configuration_version)
    values (v_number, p_floor, p_type, v_rate, nullif(trim(p_wing), ''), nullif(trim(p_designation), ''), coalesce(p_active, true), 1)
    returning * into r;
  exception when unique_violation then raise exception 'ROOM_NUMBER_TAKEN';
  end;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'admin_create_room', 'room', r.id, null,
    to_jsonb(r) - 'id' || jsonb_build_object('reason', trim(p_reason)));
  return jsonb_build_object('id', r.id, 'number', r.number, 'version', r.configuration_version);
end $$;

revoke all on function public.admin_create_room(text, text, integer, text, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_room(text, text, integer, text, text, boolean, text, uuid) to service_role;
