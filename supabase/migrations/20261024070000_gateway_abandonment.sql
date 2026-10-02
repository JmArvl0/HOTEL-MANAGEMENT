-- 20261024070000_gateway_abandonment.sql
--
-- Abandoned PayMongo checkouts: starting a gateway checkout creates the pending
-- reservation + pending_verification payment up front (submit_gateway_deposit),
-- and the money arrives later via the signed webhook. A guest who presses Back
-- (or whose test-mode checkout has no usable payment method) leaves a pending
-- reservation that reads as accepted, blocks inventory forever (payment_submitted
-- holds never expire by time; gateway rows carry payment_due_at NULL so the
-- legacy backstop never fires), and offers no way back to a payment screen.
--
-- This migration, three parts, gateway rows ONLY (manual rows untouched, so the
-- "staff verification has no deadline" invariant from 20260907010000 stands):
--   1. cancel_gateway_attempt: guest-owned abandon of one gateway pending —
--      reservation cancelled, payment expired, hold released, all audited.
--   2. expire_booking_holds gains a gateway lapse: unsettled gateway pendings
--      older than 24h (provider checkout links die at ~24h, so a later paid
--      event is near-impossible; a race loses to HOLD_EXPIRED, never double
--      confirmation) void themselves on every existing expire call site.
--   3. verify_reservation_deposit refuses gateway rows
--      (GATEWAY_MANUAL_VERIFY_FORBIDDEN): only the webhook proves money moved,
--      so one staff click can no longer confirm a zero-money stay.
--
-- verify/expire bodies below are the LIVE bodies (read via pg_get_functiondef
-- 2026-10-02: verify = 20260916010000 accounting-only + room_is_sellable form;
-- expire = 20260907010000 form), each with exactly one added branch.

-- 1. Guest abandon of an unsettled gateway checkout. Idempotent: repeating the
-- call once already cancelled/expired returns existing state.
create or replace function public.cancel_gateway_attempt(p_reservation_id text, p_user_id uuid)
returns table(reservation_id text, reservation_status text, payment_status text)
language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r reservations%rowtype;h booking_holds%rowtype;begin
 perform expire_booking_holds();
 select * into r from reservations where id=p_reservation_id for update;
 if not found or r.user_id is distinct from p_user_id then raise exception'GATEWAY_ATTEMPT_NOT_FOUND';end if;
 if r.payment_method is distinct from 'gateway_paymongo' then raise exception'GATEWAY_ATTEMPT_NOT_GATEWAY';end if;
 select * into p from payments where reservation_id=r.id and purpose='reservation_deposit' and method='gateway_paymongo' for update;
 if not found then raise exception'GATEWAY_ATTEMPT_NOT_FOUND';end if;
 if p.status='paid' or r.status='confirmed' then raise exception'GATEWAY_ALREADY_SETTLED';end if;
 if r.status='cancelled' then return query select r.id,r.status,r.payment_status;return;end if;
 if r.status<>'pending' or p.status<>'pending_verification' then raise exception'GATEWAY_ATTEMPT_NOT_PENDING';end if;
 select bh.* into h from booking_holds bh where bh.reservation_id=r.id for update;
 if found and h.status<>'payment_submitted' then raise exception'GATEWAY_ATTEMPT_NOT_PENDING';end if;
 update reservations set status='cancelled',payment_status='failed',cancellation_reason=coalesce(cancellation_reason,'Gateway checkout abandoned by guest') where id=r.id;
 update payments set status='expired',notes=coalesce(notes,'Gateway checkout abandoned by guest') where id=p.id;
 if found then update booking_holds set status='expired' where token=h.token;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
 values(p_user_id,'cancel_gateway_attempt','reservation',r.id,jsonb_build_object('paymentId',p.id,'method','gateway_paymongo'));
 return query select r.id,'cancelled'::text,'failed'::text;
end$$;

revoke all on function public.cancel_gateway_attempt(text,uuid) from public,anon,authenticated;
grant execute on function public.cancel_gateway_attempt(text,uuid) to service_role;

-- 2. Gateway lapse inside the existing expiry sweep. Manual rows untouched.
create or replace function public.expire_booking_holds() returns integer language plpgsql security definer set search_path=public as $$
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
 -- Gateway abandonment: provider checkout links die (~24h) with no webhook. Void
 -- gateway pendings the guest never completed so they stop blocking inventory
 -- and polluting the verification queue. Scoped to gateway_paymongo only.
 update reservations r set status='cancelled',payment_status='failed',cancellation_reason=coalesce(cancellation_reason,'Gateway checkout abandoned before payment')
 where status='pending' and payment_method='gateway_paymongo'
 and exists(select 1 from booking_holds h where h.reservation_id=r.id and h.status='payment_submitted' and h.submitted_at<=now()-interval'24 hours');
 update payments p set status='expired',notes=coalesce(notes,'Gateway checkout abandoned before payment')
 where purpose='reservation_deposit' and method='gateway_paymongo' and status='pending_verification'
 and exists(select 1 from reservations r where r.id=p.reservation_id and r.status='cancelled' and r.cancellation_reason='Gateway checkout abandoned before payment');
 update booking_holds h set status='expired' where status='payment_submitted' and submitted_at<=now()-interval'24 hours'
 and exists(select 1 from reservations r where r.id=h.reservation_id and r.status='cancelled' and r.cancellation_reason='Gateway checkout abandoned before payment');
 return n;end$$;

-- 3. verify_reservation_deposit: live 20260916010000 body verbatim, plus the
-- single gateway guard after the payment row is loaded.
CREATE OR REPLACE FUNCTION public.verify_reservation_deposit(p_payment_id uuid, p_staff_user_id uuid)
 RETURNS TABLE(reservation_id text, reservation_status text, payment_status text, deposit_paid numeric, remaining_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;actor text;inventory int;reserved int;paid_total numeric(12,2);ln jsonb;lname text;lprice numeric;v_posted numeric:=0;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 perform expire_booking_holds();select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 if p.method='gateway_paymongo'then raise exception'GATEWAY_MANUAL_VERIFY_FORBIDDEN';end if;
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
end$function$;
