-- Event-sourced customer notifications.
--
-- Until now the portal's "notifications" were derived on read (lib/customer
-- buildNotifications) — recomputed from reservation/payment/request rows, with no
-- read/unread tracking and no record of *when* the guest was told something. This
-- migration gives events a durable home: state-changing routes insert one row per
-- guest-facing event (deposit verified/rejected, stay payment reviewed, request
-- batch reviewed, transportation scheduled/cancelled), the portal reads the table.
--
-- Trust model matches every other table: RLS enabled with zero policies, writes
-- only from the app server via the service-role key. Rows are never updated
-- except read_at (mark-read); event content is immutable by convention.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete set null,
  type text not null check (type in ('deposit_verified','deposit_rejected','stay_payment_verified','stay_payment_rejected','request_batch_reviewed','transportation_scheduled','transportation_cancelled','payment_link','reservation_confirmed')),
  title text not null,
  detail text not null default '',
  href text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_recent_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant all on table public.notifications to service_role;
