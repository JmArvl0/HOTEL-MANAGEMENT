-- 20261024010000_migration_apply_log.sql
--
-- System Health → Applied Migrations date column. The live ledger
-- (supabase_migrations.schema_migrations) stores version + name only, so no
-- true applied-at timestamp exists for any row. This table records
-- first-seen dates going forward: existing versions are backfilled as
-- approximate (first recorded by this ledger, not the true apply time) and
-- admin_read_migration_ledger() upserts newly seen versions as exact on
-- every read. The view marks approximate rows so history is never
-- misrepresented.

create table if not exists public.migration_apply_log (
  version text primary key,
  name text not null default '',
  applied_at timestamptz not null default now(),
  approximate boolean not null default false
);

alter table public.migration_apply_log enable row level security;

insert into public.migration_apply_log (version, name, applied_at, approximate)
select version, name, now(), true from supabase_migrations.schema_migrations
on conflict (version) do nothing;

-- The return shape changes (version, name) -> (version, name, applied_at,
-- approximate), so the old signature must be dropped first — CREATE OR
-- REPLACE cannot change a return type.
drop function if exists public.admin_read_migration_ledger();

create or replace function public.admin_read_migration_ledger()
returns table(version text, name text, applied_at timestamptz, approximate boolean)
language plpgsql security definer set search_path=public as $$
begin
  insert into public.migration_apply_log (version, name, applied_at, approximate)
  select version, name, now(), false from supabase_migrations.schema_migrations
  on conflict (version) do nothing;
  return query
  select l.version, l.name, l.applied_at, l.approximate
  from supabase_migrations.schema_migrations m
  join public.migration_apply_log l on l.version = m.version
  order by m.version desc;
end$$;

revoke all on table public.migration_apply_log from public,anon,authenticated;
grant all on table public.migration_apply_log to service_role;
revoke all on function public.admin_read_migration_ledger() from public,anon,authenticated;
grant execute on function public.admin_read_migration_ledger() to service_role;
