-- 20261024080000_cancel_settles_pending_state.sql
--
-- A cancelled reservation left two stale states behind: pending_verification
-- deposit payments stayed "Awaiting Verification" forever (invoice zeroed but
-- the payment rows untouched), and reservations.payment_status stayed whatever
-- it was (usually 'unpaid'), so the My Reservations card ("Cancelled /
-- Unpaid" + full balance from total-deposit math) disagreed with the detail
-- and folio surfaces (invoice-derived ₱0).
--
-- This migration finishes cancel's paperwork, cancel path ONLY:
--   1. pending_verification reservation_deposit payments expire at cancel
--      time. Paid rows are never touched: protect_settled_payment
--      (20260905020000) forbids any status change off 'paid', and paid
--      deposits remain the basis for refund_requests / process_refund.
--   2. reservations.payment_status becomes 'failed' when no refund is
--      eligible (nothing paid out, nothing owed back). When a refund IS
--      eligible the status is left for process_refund, which upgrades it to
--      refunded/partial_refund on settlement.
--
-- cancel_reservation body below is the LIVE body (read via pg_get_functiondef
-- 2026-10-02, equal to 20260828050000) with exactly those two additions.
-- Grants survive CREATE OR REPLACE (live: service_role only); no footer needed.

create or replace function public.cancel_reservation(p_reservation_id text,p_actor_user_id uuid,p_reason text)
returns table(reservation_status text,refund_request_id uuid,eligible_refund numeric,refund_basis_points integer)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;policy jsonb;tz text;today date;days_before int;full_days int;partial_days int;partial_bp int;deposit_paid numeric;basis int;eligible numeric;refund_id uuid;existing refund_requests%rowtype;begin
select role into actor from user_accounts where id=p_actor_user_id and active;select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
if actor='guest'and r.user_id<>p_actor_user_id then raise exception'RESERVATION_OWNERSHIP_REQUIRED';end if;if actor not in('guest','owner','admin','manager','front_desk')then raise exception'CANCELLATION_FORBIDDEN';end if;
select * into existing from refund_requests where reservation_id=r.id and status in('pending','processed')order by created_at desc limit 1;
if r.status='cancelled'then return query select r.status,existing.id,coalesce(existing.eligible_amount,0),coalesce(existing.refund_basis_points,0);return;end if;
if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CANCELLABLE';end if;if nullif(trim(p_reason),'')is null then raise exception'CANCELLATION_REASON_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');today:=(now()at time zone tz)::date;days_before:=r.check_in-today;
full_days:=coalesce((policy->>'cancellationFullRefundDays')::int,14);partial_days:=coalesce((policy->>'cancellationPartialRefundDays')::int,7);partial_bp:=coalesce((policy->>'cancellationPartialRefundBasisPoints')::int,5000);
select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
basis:=case when days_before>=full_days then 10000 when days_before>=partial_days then partial_bp else 0 end;eligible:=round(deposit_paid*basis/10000.0,2);
select * into i from invoices where reservation_id=r.id for update;update reservations set status='cancelled',payment_status=case when eligible>0 then payment_status else'failed'end,cancellation_reason=trim(p_reason)where id=r.id;
update invoices set balance=0,status=case when eligible>0 then'refund_pending'else'cancelled'end where id=i.id;
update payments set status='expired',notes=coalesce(notes,'Reservation cancelled before deposit verification') where reservation_id=r.id and purpose='reservation_deposit' and status='pending_verification';
if eligible>0 then insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount)values(r.id,i.id,p_actor_user_id,trim(p_reason),deposit_paid,basis,eligible)returning id into refund_id;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'cancel_reservation','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled','reason',p_reason,'eligibleRefund',eligible,'refundBasisPoints',basis));
return query select'cancelled'::text,refund_id,eligible,basis;end$$;
