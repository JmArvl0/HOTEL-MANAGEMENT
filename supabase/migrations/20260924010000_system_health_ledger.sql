-- Admin System Health: read-only view over the migration ledger.
--
-- The admin dashboard needs to compare local migration files against what is
-- actually applied remotely (recurring drift risk: parallel sessions, legacy
-- migrate.mjs rows). PostgREST cannot reach the supabase_migrations schema,
-- so this exposes the ledger to the service role only.

create or replace function public.admin_read_migration_ledger()
returns table(version text, name text)
language sql security definer set search_path=supabase_migrations as $$
  select version, name from supabase_migrations.schema_migrations order by version desc
$$;

revoke all on function public.admin_read_migration_ledger() from public, anon, authenticated;
grant execute on function public.admin_read_migration_ledger() to service_role;
