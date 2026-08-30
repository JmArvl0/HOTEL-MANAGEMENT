-- Repoint the foreign keys left behind by the legacy `app_users` consolidation.
--
-- 20260826130603 copied every `app_users` row into `user_accounts` (preserving
-- ids) and made `user_accounts` the single runtime source used by NextAuth, but
-- five foreign keys were never repointed. They still reference `app_users`, which
-- retains only the one pre-consolidation row. Any write that references an account
-- created after the consolidation therefore fails with 23503.
--
-- Guest registration is the path a real user hits first: register_guest_account
-- inserts the new `user_accounts` row, then writes its audit trail, and that
-- audit_logs insert fails the stale constraint, aborting the whole function and
-- surfacing as HTTP 500 from POST /api/register. The same latent failure sits in
-- front of every other audited workflow that stamps a post-consolidation user id.
--
-- `supabase/schema.sql` already declares these columns against `user_accounts`, so
-- this migration only brings a database provisioned from the older schema back in
-- line with the committed one.
--
-- Safety: repointing is strictly widening. Every id in `app_users` also exists in
-- `user_accounts`, so no row that satisfies the old constraint can fail the new
-- one -- verified against the deployed database, which reports 0 violating rows
-- for all five columns. ON DELETE behaviour is preserved exactly per constraint.
-- Nothing is dropped, truncated, deleted or reseeded, and `app_users` itself is
-- left in place; only constraint definitions change.
do $$
declare target record;
begin
  for target in
    select * from (values
      ('audit_logs',      'audit_logs_user_id_fkey',           'user_id',     ' on delete set null'),
      ('guest_requests',  'guest_requests_assigned_to_fkey',   'assigned_to', ''),
      ('payments',        'payments_received_by_fkey',         'received_by', ''),
      ('purchase_orders', 'purchase_orders_ordered_by_fkey',   'ordered_by',  ''),
      ('staff',           'staff_user_id_fkey',                'user_id',     ' on delete set null')
    ) as t(tbl, con, col, on_delete)
  loop
    -- Only touch a constraint that still points at the legacy table, so the
    -- migration is safe to re-run and a no-op on an already-correct database.
    if exists (
      select 1 from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_class ref on ref.oid = c.confrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public' and rel.relname = target.tbl
        and c.conname = target.con and ref.relname = 'app_users'
    ) then
      execute format('alter table public.%I drop constraint %I', target.tbl, target.con);
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.user_accounts(id)%s',
        target.tbl, target.con, target.col, target.on_delete);
    end if;
  end loop;
end $$;
