-- 20260930010000_guest_reminders.sql
-- Phase 4 of the post-audit roadmap: guest communication automation.
--
-- Pre-arrival (~24h before check-in) and pre-departure (~24h before checkout)
-- reminders, sent by a daily cron. Idempotency is the core design constraint:
-- cron retries, redeploys, and manual re-runs must NEVER produce a duplicate
-- send. guest_reminder_deliveries enforces one delivery per (reservation, kind)
-- with a unique index — the insert IS the claim, a duplicate-key error means
-- "already sent, skip".
--
-- Email is secondary (lib/email.ts is never-throw): a Resend outage can only
-- mark a delivery failed; hotel operations never depend on it. The in-app
-- notification row is always recorded through the same never-throw channel.

-- 1. New notification types for the reminder events.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in ('deposit_verified','deposit_rejected','stay_payment_verified','stay_payment_rejected',
           'request_batch_reviewed','transportation_scheduled','transportation_cancelled',
           'payment_link','reservation_confirmed','pre_arrival_reminder','pre_departure_reminder')
);

-- 2. Delivery ledger — one row per (reservation, kind), ever.
create table if not exists public.guest_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null references public.reservations(id),
  kind text not null check (kind in ('pre_arrival','pre_departure')),
  status text not null default 'sent' check (status in ('sent','failed')),
  error text,
  sent_at timestamptz not null default now()
);
-- Idempotency: the unique index is the guard; a duplicate insert raises 23505
-- which the sender treats as "already sent".
create unique index if not exists guest_reminder_deliveries_once
  on public.guest_reminder_deliveries (reservation_id, kind);

alter table public.guest_reminder_deliveries enable row level security;
revoke all on public.guest_reminder_deliveries from public, anon, authenticated;
grant all on public.guest_reminder_deliveries to service_role;
