-- Make every actor role guard NULL-safe.
--
-- Each privileged function opens with:
--   select ua.role into actor from user_accounts ua where ua.id=p_staff_user_id and ua.active;
--   if actor not in('owner','admin','housekeeping') then raise exception '..._FORBIDDEN'; end if;
--
-- When the id matches no row -- or matches a row with active=false -- the select
-- assigns NULL, and `NULL not in (...)` evaluates to NULL, not true. The `if` never
-- fires and execution continues straight past the authorisation check. The role list
-- only ever rejects a caller whose role is known AND wrong; it never rejects a caller
-- with no role at all.
--
-- Demonstrated against the deployed database, inside a rolled-back transaction:
-- housekeeping@haven.test (active = false) successfully executed
-- housekeeping_start_task and then housekeeping_complete_task, moving a real room
-- through cleaning to clean. A guest-role account was correctly refused, which is why
-- the hole is easy to miss -- the guard works for every case except the one that
-- matters most, a deactivated or deleted account.
--
-- This matters through the application, not just through direct SQL: NextAuth issues
-- stateless JWTs and `lib/housekeeping-route.ts` forwards `session.user.id` without
-- re-reading the account, so a staff member deactivated mid-session keeps a valid
-- token and, before this migration, kept full mutation rights.
--
-- The pattern is repo-wide (38 functions across Front Desk, Accounting, Manager,
-- Customer/Guest and Housekeeping), so it is fixed here mechanically rather than by
-- re-emitting 38 function bodies: pg_get_functiondef reproduces each definition
-- verbatim -- signature, argument names, return type, volatility, security definer and
-- `set search_path` -- and `create or replace` preserves the owner and the existing
-- ACL. Nothing is dropped, no signature changes, and no caller needs to change.
do $$
declare
  target record;
  definition text;
  patched integer := 0;
begin
  for target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.prosrc like '%if actor not in(%' or p.prosrc like '%if target_role<>%')
      -- already-fixed bodies are skipped so this migration is safe to re-run
      and p.prosrc not like '%actor is null or actor not in(%'
      and p.prosrc not like '%target_role is null or target_role<>%'
    loop
      definition := pg_get_functiondef(target.oid);
      definition := replace(definition, 'if actor not in(', 'if actor is null or actor not in(');
      definition := replace(definition, 'if target_role<>', 'if target_role is null or target_role<>');
      execute definition;
      patched := patched + 1;
    end loop;
  raise notice 'null-safe actor guards applied to % function(s)', patched;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.prosrc like '%if actor not in(%'
      and p.prosrc not like '%actor is null or actor not in(%'
  ) then
    raise exception 'NULL_UNSAFE_ACTOR_GUARD_REMAINS';
  end if;
end $$;

-- Finish the EXECUTE lockdown started in 20260830030000. That migration revoked the
-- named-role grants to anon and authenticated; these three application trigger
-- functions additionally carry the implicit PUBLIC grant, which a named-role revoke
-- does not touch. They return `trigger` and so cannot be invoked as ordinary
-- functions, but leaving a PUBLIC grant on a security-definer function is not worth
-- the argument. Extension-owned functions (btree_gist) keep their stock Supabase
-- grants deliberately -- they hold no application authority.
revoke execute on function public.protect_audit_history() from public;
revoke execute on function public.protect_settled_payment() from public;
revoke execute on function public.sync_customer_change_request_status() from public;
