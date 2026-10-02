-- 20261024100000_cancel_backfill_stale_pending.sql
--
-- Backfill for reservations cancelled BEFORE 20261024080000.
-- That migration fixes cancel going forward (expiring pending_verification
-- deposits at cancel time), but rows already cancelled while the old
-- cancel_reservation body was live still carry the stale combination the QA
-- retest observed: reservation cancelled / balance ₱0 / refund ₱0, yet the
-- deposit payment row still reads pending_verification ("Awaiting
-- Verification") and reservations.payment_status is still unpaid.
--
-- Business rule (unchanged, mirrors cancel_reservation + the hold-expiry
-- sweep): a deposit that was never verified can never be collected after
-- cancel, so on a terminal reservation it is void (expired), never pending.
-- Paid rows are never touched: protect_settled_payment (20260905020000)
-- forbids any status change off 'paid', and paid deposits remain the basis
-- for refund_requests / process_refund. Reservations that already own an
-- eligible refund row are left for process_refund (refunded/partial_refund).
--
-- Scope: terminal reservations only (cancelled / no_show). Active
-- pending/confirmed/checked_in rows are untouched, so normal verification
-- queues keep working.

-- 1. Void in-flight deposits on terminal reservations.
update payments p
set status = 'expired',
    notes = coalesce(notes, 'Reservation cancelled before deposit verification')
where p.status = 'pending_verification'
  and p.purpose = 'reservation_deposit'
  and exists (
    select 1 from reservations r
    where r.id = p.reservation_id
      and r.status in ('cancelled', 'no_show')
  );

-- 2. Stamp payment_status failed on cancelled reservations with no refund
-- eligible (nothing paid out, nothing owed back). Eligible rows keep their
-- status for process_refund. Only the stale unpaid marker is moved; paid /
-- partial / refunded markers are left alone.
update reservations r
set payment_status = 'failed'
where r.status = 'cancelled'
  and r.payment_status = 'unpaid'
  and not exists (
    select 1 from refund_requests rr
    where rr.reservation_id = r.id
      and coalesce(rr.eligible_amount, 0) > 0
  );

-- 3. Zero any leftover folio balance on those same no-refund cancellations
-- (mirrors cancel_reservation: balance 0, invoice cancelled).
update invoices i
set balance = 0,
    status = 'cancelled'
where i.status <> 'cancelled'
  and exists (
    select 1 from reservations r
    where r.id = i.reservation_id
      and r.status = 'cancelled'
      and r.payment_status = 'failed'
      and not exists (
        select 1 from refund_requests rr
        where rr.reservation_id = r.id
          and coalesce(rr.eligible_amount, 0) > 0
      )
  );
