# 2026-10-02 - Guest Registration 500 (Loyalty Default)

## Symptom
`POST /api/register` on `haven-hotel-management-ten.vercel.app` returned 500 for
every truly-new email. Vercel log:
`registration failed: stage=register_guest_account db_code=23514
db_message=new row for relation "guests" violates check constraint
"guests_loyalty_tier_check"`.

## Root cause
`guests.loyalty_tier` still defaulted to `'Member'` (initial schema) after
`20261015010000` restricted the check to `silver/gold/platinum` without changing
the default. `register_guest_account` omits `loyalty_tier`, so every new-guest
insert used the stale default → 23514 → route's generic 500. Same latent defect
in ~10 other guest-creating RPCs (booking, walk-in, holds). Live-verified via
`scripts/dbq.mjs`: default `'Member'::text`, check `silver/gold/platinum`,
ledger max `20261024050000` = highest file.

## Fix (local, push pending)
- `supabase/migrations/20261024060000_guest_loyalty_default.sql` — one statement:
  `alter table ... set default 'silver'`. Fixes all writers at once.
- `lib/loyalty.test.ts` — new `describe` pins `set default 'silver'` and rejects
  `default 'Member'`.

## Gates
typecheck clean; eslint 0 errors (SQL file correctly ignored); targeted
`loyalty` + `registration` 36/36; full suite 1920/1921 with 1 pre-existing
unrelated failure (`password-reset-audit.test.ts` selfie-overload expectation vs
`20261022010000` file content — untouched by this change, fails identically
without it); `npm run build` clean.

## Remaining
PUSHED 2026-10-02 (`supabase db push --db-url`, dry-run showed exactly the one
pending file, user-approved): ledger max now `20261024060000`, live default
`'silver'::text`. Standing session rule: dry-run → user confirms → push, per
migration; production target; CLI auth via session-only token (never on disk).
End-to-end `/api/register` probe with a throwaway `+` alias still pending
user approval (creates a persistent probe account).
