-- 20261024020000_migration_ledger_ambiguity.sql
--
-- The 20261024010000 upsert reads bare `version`/`name`, which are ambiguous
-- against the function's own OUT parameters (SQLSTATE 42702) — every ledger
-- read fails. Qualify all column references with the source table.

drop function if exists public.admin_read_migration_ledger();

create or replace function public.admin_read_migration_ledger()
returns table(version text, name text, applied_at timestamptz, approximate boolean)
language plpgsql security definer set search_path=public as $$
begin
  insert into public.migration_apply_log (version, name, applied_at, approximate)
  select m.version, m.name, now(), false from supabase_migrations.schema_migrations m
  on conflict (version) do nothing;
  return query
  select l.version, l.name, l.applied_at, l.approximate
  from supabase_migrations.schema_migrations m
  join public.migration_apply_log l on l.version = m.version
  order by m.version desc;
end$$;

revoke all on function public.admin_read_migration_ledger() from public,anon,authenticated;
grant execute on function public.admin_read_migration_ledger() to service_role;
