-- 20261024030000_migration_ledger_upsert.sql
--
-- The 20261024020000 form still fails: ON CONFLICT (version) is parsed as an
-- expression, so plpgsql flags `version` as ambiguous against the OUT
-- parameter (SQLSTATE 42702). Replace the upsert with a qualified NOT EXISTS
-- insert — no bare column reference remains anywhere in the statement.

drop function if exists public.admin_read_migration_ledger();

create or replace function public.admin_read_migration_ledger()
returns table(version text, name text, applied_at timestamptz, approximate boolean)
language plpgsql security definer set search_path=public as $$
begin
  insert into public.migration_apply_log (version, name, applied_at, approximate)
  select src.version, src.name, now(), false
  from supabase_migrations.schema_migrations src
  where not exists (
    select 1 from public.migration_apply_log seen where seen.version = src.version
  );
  return query
  select logged.version, logged.name, logged.applied_at, logged.approximate
  from supabase_migrations.schema_migrations live
  join public.migration_apply_log logged on logged.version = live.version
  order by live.version desc;
end$$;

revoke all on function public.admin_read_migration_ledger() from public,anon,authenticated;
grant execute on function public.admin_read_migration_ledger() to service_role;
