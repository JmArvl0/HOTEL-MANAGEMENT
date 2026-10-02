-- 20261024060000_guest_loyalty_default.sql
--
-- New guests default to the governed starting tier.
--
-- Root cause (live-verified 2026-10-02): guests.loyalty_tier still defaults to
-- 'Member' from the initial schema, but 20261015010000 restricted the check
-- constraint to silver/gold/platinum without changing the default. Every
-- register_guest_account insert (which omits loyalty_tier) therefore failed
-- with 23514 guests_loyalty_tier_check, surfacing as POST /api/register 500
-- for all truly-new emails. The same stale default affects every other
-- guest-creating RPC, so the fix belongs here, not in one function.
--
-- Additive and idempotent: SET DEFAULT is re-runnable and touches no rows.
-- Existing rows were already backfilled to the governed set by 20261015010000.

alter table public.guests alter column loyalty_tier set default 'silver';
