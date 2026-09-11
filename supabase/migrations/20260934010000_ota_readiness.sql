-- Roadmap Phase 9B: OTA-readiness columns.
--
-- Three nullable columns on reservations so a future channel-manager/OTA
-- integration has somewhere to record provenance — and NOTHING else. There is
-- no sync code, no cron, no API surface, and no UI reading or writing these
-- columns anywhere in the app: an integration that doesn't exist cannot
-- pretend to exist. Until one is actually built, every reservation keeps
-- NULL here and behaves exactly as before.

alter table public.reservations
  add column if not exists external_channel text,
  add column if not exists external_reference text,
  add column if not exists external_synced_at timestamptz;

-- One lookup path per external identity, only when present.
create unique index if not exists reservations_external_reference_idx
  on public.reservations (external_channel, external_reference)
  where external_channel is not null and external_reference is not null;
