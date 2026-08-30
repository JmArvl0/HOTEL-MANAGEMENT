-- Lock every RPC to the service role.
--
-- `20260830010000` (and the Manager and Customer/Guest migrations before it) ended
-- each function block with `revoke all on function ... from public`, then granted
-- execute to `service_role`. That pattern is incomplete: it removes only the
-- implicit PUBLIC grant. Supabase ships `alter default privileges ... grant execute
-- on functions to anon, authenticated` for the `public` schema, so every newly
-- created function also carries *named-role* grants to `anon` and `authenticated`,
-- and a revoke aimed at PUBLIC leaves those untouched.
--
-- The result, measured against the deployed database before this migration: 21 of
-- 53 security-definer functions were executable by `anon` -- including
-- housekeeping_start_task, housekeeping_assign_task, housekeeping_complete_task,
-- housekeeping_inspect_task, housekeeping_defer_task,
-- housekeeping_report_maintenance, request_manager_approval,
-- review_manager_approval, register_guest_account and the customer_* stay
-- workflows. Row-level security does not contain this: these functions are
-- `security definer`, so the body runs as the owner and bypasses RLS entirely. The
-- in-function role gate is the only barrier, and it reads
-- `select role into actor ...; if actor not in (...) then raise` -- which does not
-- fire when `actor` is NULL, because `NULL not in (...)` is NULL rather than true.
-- Callers passing an unknown id are then stopped only incidentally, by NOT NULL and
-- foreign-key checks on the audit and assignment inserts.
--
-- This application never uses the anon or publishable key. `lib/supabase.ts`
-- constructs exactly one client, with the service-role key, and it is server-only;
-- authentication is NextAuth, not Supabase Auth, so the `authenticated` role is
-- never assumed either. Neither role needs any privilege in this schema.
--
-- Safety: revoking a privilege deletes no data and changes no logic. `service_role`
-- and `postgres` grants are left exactly as they are, so every server-side call
-- path is unaffected. Trigger functions keep firing -- trigger execution does not
-- consult EXECUTE on the trigger function.
revoke execute on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Defence in depth on tables. RLS is enabled on all 32 public tables with zero
-- policies, so `anon` and `authenticated` already read no rows and the surviving
-- table grants are inert. Dropping them means a permissive policy added later
-- cannot silently become reachable, and removes the last place where "no policy
-- exists yet" is the only thing standing between a public key and hotel data.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
