-- Deposit/payment proof verification is Accounting's job alone (separation of duties:
-- the staff taking money at the desk is not the staff blessing the proof). Previously
-- front_desk shared the verify/reject authority in every layer; now only accounting may
-- verify reservation deposits, reject deposit submissions, and review guest-submitted
-- stay-payment proofs. Front desk keeps cash collection (record_staff_payment — no proof
-- to verify) and still SEES the payments queue; only the decision buttons disappear.
-- Website check-in remains gated on an Accounting-verified deposit.
--
-- Recreated from the LIVE pg_get_functiondef bodies; only the role guard line changes
-- in each (front_desk dropped, NULL-safe single-role check). Signatures unchanged, so
-- the service_role EXECUTE grants survive.

create or replace function public.verify_reservation_deposit(p_payment_id uuid,p_staff_user_id uuid)
returns table(reservation_id text,reservation_status text,payment_status text,deposit_paid numeric,remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
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
 select count(*)into inventory from rooms x where x.type=r.room_type and x.status<>'maintenance'and(r.check_in>current_date or x.housekeeping='clean');
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

-- Manual deposit rejection: the submitted proof is recorded as failed with the reviewer
-- decision; the payment row itself is preserved, never deleted.
create or replace function public.accounting_reject_deposit(p_payment_id uuid,p_staff_user_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$
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

-- Guest-submitted stay-payment proofs (verify_customer_stay_payment): same principle —
-- proof review is Accounting's decision.
create or replace function public.verify_customer_stay_payment(p_payment_id uuid,p_staff_user_id uuid,p_approve boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;p payments%rowtype;i invoices%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'stay_payment'then raise exception'PAYMENT_NOT_FOUND';end if;
 if p.status in('paid','failed')then return jsonb_build_object('paymentId',p.id,'status',p.status);end if;if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if not p_approve and nullif(trim(p_reason),'')is null then raise exception'REJECTION_REASON_REQUIRED';end if;
 if p_approve then update payments set status='paid',received_by=p_staff_user_id,verified_at=now(),reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=null where id=p.id;select * into i from sync_invoice_financials(p.invoice_id);
 else update payments set status='failed',reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=trim(p_reason)where id=p.id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,case when p_approve then'verify_customer_stay_payment'else'reject_customer_stay_payment'end,'payment',p.id::text,jsonb_build_object('status',p.status),jsonb_build_object('status',case when p_approve then'paid'else'failed'end,'reason',nullif(trim(p_reason),'')));
 return jsonb_build_object('paymentId',p.id,'status',case when p_approve then'paid'::text else'failed'::text end);end$$;

-- Signatures unchanged; the existing service_role grants survive the create-or-replace.
