-- 20261008010000_reservation_cancelled_notifications.sql
--
-- Customer cancellation bell entry. The notifications type check is an
-- allowlist, so the new event needs a value before the cancel route can
-- record it (same pattern as 20261007010000).
--
-- Exactly-once per cancelled reservation: the route addresses the entry at
-- /my-reservations/<reservationId>, and the partial unique index below turns
-- a retried POST (same already-cancelled reservation) into a silent conflict
-- instead of a second bell item. recordNotification already swallows insert
-- errors without failing the business response, so the conflict needs no
-- handling.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (
  type in ('deposit_verified','deposit_rejected','stay_payment_verified','stay_payment_rejected',
           'request_batch_reviewed','transportation_scheduled','transportation_cancelled',
           'payment_link','reservation_confirmed','reservation_cancelled','pre_arrival_reminder','pre_departure_reminder',
           'reservation_change_submitted')
);

create unique index if not exists notifications_cancelled_once
  on public.notifications (user_id, href)
  where type = 'reservation_cancelled';
