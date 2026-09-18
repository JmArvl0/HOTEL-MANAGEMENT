-- 20261007010000_change_request_notifications.sql
--
-- Customer "Request a change" bell entry. The notifications type check is an
-- allowlist, so the new event needs a value before the change-request route
-- can record it (same pattern as 20260930010000).
--
-- Exactly-once per change request: the route addresses the entry at
-- /my-reservations/<reservation>#change-<requestId>, and the partial unique
-- index below turns a replayed submission (same idempotency key, retried
-- POST, double-click race) into a silent conflict instead of a second bell
-- item. recordNotification already swallows insert errors without failing
-- the business response, so the conflict needs no handling. A later,
-- legitimately new request carries a different request id and notifies
-- normally.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in ('deposit_verified','deposit_rejected','stay_payment_verified','stay_payment_rejected',
           'request_batch_reviewed','transportation_scheduled','transportation_cancelled',
           'payment_link','reservation_confirmed','pre_arrival_reminder','pre_departure_reminder',
           'reservation_change_submitted')
);

create unique index if not exists notifications_change_submitted_once
  on public.notifications (user_id, href)
  where type = 'reservation_change_submitted';
