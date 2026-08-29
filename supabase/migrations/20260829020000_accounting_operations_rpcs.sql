-- Accounting financial operations (server-authoritative). Additive only: reservations, invoices,
-- payments, folio_charges, refund_requests and audit_logs remain the single authoritative record.
-- Corrections are made by reversal/adjustment, never by editing or deleting settled history.

-- One authoritative folio recomputation. Every financial mutation routes through this so paid,
-- balance, credit_balance and status are derived from payments rather than hand-edited per caller.
create or replace function public.sync_invoice_financials(p_invoice_id text)returns invoices language plpgsql security definer set search_path=public as $$
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
revoke all on function public.sync_invoice_financials(text)from public;

-- Payment collection now records the owning cash shift and, for authorized financial roles only,
-- routes a documented overpayment into the folio credit balance instead of rejecting the money.
drop function if exists public.record_staff_payment(text,numeric,text,text,uuid,uuid);
create or replace function public.record_staff_payment(p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid,p_staff_user_id uuid,p_allow_overpayment boolean default false)
returns table(payment_id uuid,paid numeric,balance numeric,payment_status text,folio_credit numeric)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;v_pid uuid;v_shift uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN';end if;
 if p_allow_overpayment and actor not in('owner','admin','accounting')then raise exception'OVERPAYMENT_FORBIDDEN';end if;
 if p_amount<=0 then raise exception'INVALID_PAYMENT_AMOUNT';end if;if nullif(trim(p_method),'')is null or nullif(trim(p_reference),'')is null then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then select * into i from invoices where id=existing.invoice_id;return query select existing.id,i.paid,i.balance,i.status,i.credit_balance;return;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)and not p_allow_overpayment then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 if lower(trim(p_method))='cash'then select cs.id into v_shift from cash_shifts cs where cs.staff_user_id=p_staff_user_id and cs.status='open'limit 1;end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
 values(i.id,r.id,round(p_amount,2),'PHP',trim(p_method),trim(p_reference),'stay_payment','paid',p_idempotency_key,p_staff_user_id,now(),v_shift)returning id into v_pid;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'collect_payment','payment',v_pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',trim(p_method),'reference',trim(p_reference),'cashShiftId',v_shift,'creditBalance',i.credit_balance));
 return query select v_pid,i.paid,i.balance,i.status,i.credit_balance;end$$;

-- Operational charge posting stays with the operating departments (separation of duties).
-- Accounting corrects the folio through accounting_reverse_charge / accounting_record_adjustment.
create or replace function public.post_folio_charge(p_reservation_id text,p_description text,p_category text,p_amount numeric,p_idempotency_key uuid,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;v_cid uuid;v_existing uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk')then raise exception'CHARGE_POSTING_FORBIDDEN';end if;
 if p_amount<=0 or nullif(trim(p_description),'')is null then raise exception'INVALID_CHARGE';end if;select id into v_existing from folio_charges where idempotency_key=p_idempotency_key;if found then return v_existing;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_IN_HOUSE';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)
 values(i.id,r.id,trim(p_description),coalesce(nullif(trim(p_category),''),'incidental'),round(p_amount,2),p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into v_cid;
 update invoices set amount=round(amount+round(p_amount,2),2)where id=i.id;perform sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'post_folio_charge','folio_charge',v_cid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'description',trim(p_description)));return v_cid;end$$;

-- Extension charges reuse the same authoritative recomputation so folio credit is honoured.
create or replace function public.front_desk_extend_stay(p_reservation_id text,p_new_check_out date,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(new_check_out date,additional_amount numeric,new_balance numeric)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;added numeric;cid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'EXTENSION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'EXTENSION_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select id into cid from folio_charges where idempotency_key=p_idempotency_key;if found then select * into i from invoices where reservation_id=r.id;return query select r.check_out,(select amount from folio_charges where id=cid),i.balance;return;end if;
select * into room from rooms where id=r.room_id for update;select * into a from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)then raise exception'EXTENSION_REQUIRES_ROOM_CHANGE';end if;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;added:=round(t.base_rate*(p_new_check_out-r.check_out),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Stay extension through '||p_new_check_out,'extension',added,p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into cid;
update invoices set amount=round(amount+added,2)where id=i.id;update reservations set check_out=p_new_check_out,total=round(total+added,2)where id=r.id;update reservation_room_assignments set check_out=p_new_check_out where id=a.id;select * into i from sync_invoice_financials(i.id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'extend_stay','reservation',r.id,jsonb_build_object('checkOut',r.check_out,'total',r.total),jsonb_build_object('checkOut',p_new_check_out,'additionalAmount',added,'reason',trim(p_reason)));return query select p_new_check_out,added,i.balance;end$$;

-- Manual deposit rejection. The submitted proof is recorded as failed with the reviewer decision;
-- the payment row itself is preserved, never deleted.
create or replace function public.accounting_reject_deposit(p_payment_id uuid,p_staff_user_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;p payments%rowtype;r reservations%rowtype;i invoices%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
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

-- Charge reversal. The original charge row is preserved; the correction is a separate
-- financial_adjustments record that reduces the authoritative folio.
create or replace function public.accounting_reverse_charge(p_charge_id uuid,p_amount numeric,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;c folio_charges%rowtype;i invoices%rowtype;existing financial_adjustments%rowtype;v_reversed numeric;v_amount numeric;v_aid uuid;v_status text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'CHARGE_REVERSAL_FORBIDDEN';end if;
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

-- Adjustments, goodwill credits and write-offs. Debit increases the guest obligation, credit and
-- write_off reduce it. Settled payments are never touched.
create or replace function public.accounting_record_adjustment(p_reservation_id text,p_transaction_type text,p_direction text,p_amount numeric,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing financial_adjustments%rowtype;v_aid uuid;v_amount numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'ADJUSTMENT_FORBIDDEN';end if;
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

-- Refund settlement. Every attempt is recorded, a failed attempt stays retryable, and no refund
-- may exceed the eligible amount or the cash actually received.
create or replace function public.process_refund(p_refund_id uuid,p_staff_user_id uuid,p_reference text)
returns table(refund_status text,refund_amount numeric,net_paid numeric)language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;i invoices%rowtype;r reservations%rowtype;existing payments%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 select * into i from invoices where id=rr.invoice_id for update;select * into r from reservations where id=rr.reservation_id for update;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 if rr.status='processed'then return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0);return;end if;
 if rr.status not in('pending','failed')or rr.eligible_amount<=0 then raise exception'REFUND_NOT_PENDING';end if;
 if nullif(trim(p_reference),'')is null then raise exception'REFUND_REFERENCE_REQUIRED';end if;
 if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then raise exception'REFUND_EXCEEDS_RECEIVED';end if;
 select * into existing from payments where idempotency_key=rr.id;
 if not found then insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now());end if;
 insert into refund_attempts(refund_request_id,status,reference,attempted_by)values(rr.id,'processed',trim(p_reference),p_staff_user_id);
 update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference)where id=rr.id;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';v_net:=greatest(round(v_gross-v_refunded,2),0);
 update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then'refunded'else'partial_refund'end where id=i.id;
 update reservations set payment_status=case when v_net=0 then'refunded'else'partial_refund'end where id=r.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'process_refund','refund_request',rr.id::text,jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference)));
 return query select'processed'::text,rr.eligible_amount,v_net;end$$;

-- A refund that could not be settled externally is recorded as a failed attempt and stays in the
-- Accounting queue. Nothing is marked settled or provider-verified on the strength of an attempt.
create or replace function public.accounting_fail_refund(p_refund_id uuid,p_staff_user_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;v_attempts integer;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'REFUND_FAILURE_REASON_REQUIRED';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 if rr.status='processed'then raise exception'REFUND_ALREADY_PROCESSED';end if;if rr.status='cancelled'then raise exception'REFUND_NOT_PENDING';end if;
 insert into refund_attempts(refund_request_id,status,reason,attempted_by)values(rr.id,'failed',trim(p_reason),p_staff_user_id);
 update refund_requests set status='failed'where id=rr.id;
 select count(*)into v_attempts from refund_attempts where refund_request_id=rr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'fail_refund','refund_request',rr.id::text,jsonb_build_object('status',rr.status),jsonb_build_object('status','failed','reason',trim(p_reason),'attempts',v_attempts));
 return jsonb_build_object('refundStatus','failed','eligibleAmount',rr.eligible_amount,'attempts',v_attempts,'retryable',true);end$$;

-- Cash drawer shifts. Expected cash is always computed from the payments recorded against the
-- shift; the counted amount is recorded as a variance and never used to rewrite guest payments.
create or replace function public.accounting_open_cash_shift(p_staff_user_id uuid,p_location text,p_opening_amount numeric)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 if exists(select 1 from cash_shifts where staff_user_id=p_staff_user_id and status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$$;

create or replace function public.accounting_close_cash_shift(p_shift_id uuid,p_actual_cash numeric,p_notes text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;s cash_shifts%rowtype;existing cash_shifts%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select * into existing from cash_shifts where close_idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('shiftId',existing.id,'status',existing.status,'expectedCash',existing.expected_cash,'actualCash',existing.actual_cash,'variance',existing.variance);end if;
 if p_actual_cash is null or p_actual_cash<0 then raise exception'INVALID_COUNTED_CASH';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status<>'open'then raise exception'CASH_SHIFT_NOT_OPEN';end if;
 if s.staff_user_id<>p_staff_user_id and actor not in('owner','admin','manager','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select coalesce(sum(amount),0)into v_in from payments where cash_shift_id=s.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_out from payments where cash_shift_id=s.id and status='paid'and purpose='refund';
 v_expected:=round(s.opening_amount+v_in-v_out,2);v_variance:=round(round(p_actual_cash,2)-v_expected,2);
 update cash_shifts set status='closed',closed_at=now(),expected_cash=v_expected,actual_cash=round(p_actual_cash,2),variance=v_variance,close_notes=nullif(trim(p_notes),''),close_idempotency_key=p_idempotency_key where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'close_cash_shift','cash_shift',s.id::text,jsonb_build_object('expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out));
 return jsonb_build_object('shiftId',s.id,'status','closed','expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out);end$$;

create or replace function public.accounting_reconcile_cash_shift(p_shift_id uuid,p_staff_user_id uuid,p_notes text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;s cash_shifts%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'RECONCILIATION_FORBIDDEN';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status='reconciled'then return jsonb_build_object('shiftId',s.id,'status',s.status,'variance',s.variance);end if;
 if s.status<>'closed'then raise exception'CASH_SHIFT_NOT_CLOSED';end if;
 if coalesce(s.variance,0)<>0 and nullif(trim(p_notes),'')is null then raise exception'VARIANCE_EXPLANATION_REQUIRED';end if;
 update cash_shifts set status='reconciled',reconciled_by=p_staff_user_id,reconciled_at=now(),reconciliation_notes=nullif(trim(p_notes),'')where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reconcile_cash_shift','cash_shift',s.id::text,jsonb_build_object('status',s.status,'variance',s.variance),jsonb_build_object('status','reconciled','variance',s.variance,'notes',nullif(trim(p_notes),'')));
 return jsonb_build_object('shiftId',s.id,'status','reconciled','variance',s.variance);end$$;

-- Payment-source reconciliation. Expected is derived from recorded payments; the settled figure is
-- the operator-entered statement total. A variance is recorded as a variance, never auto-applied.
create or replace function public.accounting_reconcile_payments(p_period_start date,p_period_end date,p_method text,p_settled_amount numeric,p_notes text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;existing payment_reconciliations%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;v_status text;v_id uuid;v_method text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'RECONCILIATION_FORBIDDEN';end if;
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

-- Receipts and folio statements are immutable snapshots of authoritative records. No payment
-- credentials, card data, authentication material or unrelated guest identity data is captured.
create or replace function public.accounting_generate_document(p_document_type text,p_reservation_id text,p_payment_id uuid,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;existing financial_documents%rowtype;r reservations%rowtype;i invoices%rowtype;p payments%rowtype;v_number text;v_snapshot jsonb;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'DOCUMENT_FORBIDDEN';end if;
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

revoke all on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)from public;
revoke all on function public.accounting_reject_deposit(uuid,uuid,text)from public;revoke all on function public.accounting_reverse_charge(uuid,numeric,text,uuid,uuid)from public;
revoke all on function public.accounting_record_adjustment(text,text,text,numeric,text,uuid,uuid)from public;revoke all on function public.accounting_fail_refund(uuid,uuid,text)from public;
revoke all on function public.accounting_open_cash_shift(uuid,text,numeric)from public;revoke all on function public.accounting_close_cash_shift(uuid,numeric,text,uuid,uuid)from public;
revoke all on function public.accounting_reconcile_cash_shift(uuid,uuid,text)from public;revoke all on function public.accounting_reconcile_payments(date,date,text,numeric,text,uuid,uuid)from public;
revoke all on function public.accounting_generate_document(text,text,uuid,uuid,uuid)from public;
grant execute on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)to service_role;
grant execute on function public.accounting_reject_deposit(uuid,uuid,text)to service_role;grant execute on function public.accounting_reverse_charge(uuid,numeric,text,uuid,uuid)to service_role;
grant execute on function public.accounting_record_adjustment(text,text,text,numeric,text,uuid,uuid)to service_role;grant execute on function public.accounting_fail_refund(uuid,uuid,text)to service_role;
grant execute on function public.accounting_open_cash_shift(uuid,text,numeric)to service_role;grant execute on function public.accounting_close_cash_shift(uuid,numeric,text,uuid,uuid)to service_role;
grant execute on function public.accounting_reconcile_cash_shift(uuid,uuid,text)to service_role;grant execute on function public.accounting_reconcile_payments(date,date,text,numeric,text,uuid,uuid)to service_role;
grant execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid)to service_role;
create index if not exists payments_cash_shift_idx on public.payments(cash_shift_id)where cash_shift_id is not null;
create index if not exists refund_attempts_request_idx on public.refund_attempts(refund_request_id,attempted_at desc);
create index if not exists financial_documents_reservation_idx on public.financial_documents(reservation_id,created_at desc);

-- Supabase's default privileges grant execute on every newly created function to anon and
-- authenticated, and a security definer function bypasses RLS. Nothing in this app ever talks to
-- Postgres with the anon key - lib/supabase.ts builds a service-role client only - so any other
-- grant is a way to reach a money path behind the API's server-side authorization (spec 6, 89).
-- Re-runnable: it recomputes the definer set every time, so later functions are covered too.
do $$declare v_fn text;v_role text;begin
 for v_fn in select p.oid::regprocedure::text from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef loop
  execute format('revoke all on function %s from public',v_fn);
  foreach v_role in array array['anon','authenticated'] loop
   if to_regrole(v_role) is not null then execute format('revoke all on function %s from %I',v_fn,v_role);end if;
  end loop;
 end loop;
 -- The folio recomputation helper stays internal: it is only ever called from inside another
 -- definer function, which runs as the owner, so no API role needs it at all.
 if to_regrole('service_role') is not null then revoke all on function public.sync_invoice_financials(text)from service_role;end if;
end$$;
