# Role Improvement Implementation — 2026-11-03

User authorized draft Phases 0–5 and said continue. Single agent. Preserved unrelated sidebar/landing changes and unfinished admin-password migration.

## Implemented locally

- Phase 0 read remote ledger (latest `20261024130000`) and live relevant RPCs. Shared drawer; 11 reconciled shifts. Rollback-only open verification reproduced `42883`: deployed `hashtextended` typo. No retained remote writes.
- Cash typo corrected to `hashtextextended`; open/close/payment serialization, strict cash attribution and row-lock backstop; close UI restored; shared-drawer sign-out reminder. Accounting-only historical cash investigation notes preserve payment history.
- Partial PO receiving with receipt/version retry history, integer explicit quantities, outstanding balances, immutable completed/partial-protected orders, scoped Housekeeping delivery listing/UI. No historical quantity backfill.
- Removed production sample-review fallback. Guest withdrawal per owned pending/unassigned line; versions, audit, work guards and batch-review exclusion.
- Manager roster and department handovers for five operational roles; own schedules for staff. Planned coverage separate from task activity/presence. Native date-time form support.
- Linked preventive asset work assigned to technicians; existing work-order lifecycle; actual service date only after completion.
- Lost & Found intake/storage/custody/claim/Manager authorization/verified release/disposition confirmation; claim notes excluded from HK. Optional Phase 5 expansion evaluated separately, not fabricated integrations.

Seven additive migrations: `20261103010000` through `20261103070000`. All **pending remote application**. Detailed implementation/deployment instructions and optional-module evaluation: `docs/ROLE-IMPROVEMENT-IMPLEMENTATION.md`. SYSTEM §§7.14–7.16 updated, including verified stale procurement wording.

## Verified

- Local PostgreSQL 18 scratch cluster, loopback port 55439. Applied 107 migrations from scratch (excluded unrelated pending `20261024140000`). Supabase-owned auth/storage platform schemas use small local substitutes; app tables/RPCs are real migration definitions.
- 11 SQL scenarios pass, including concurrent deliveries and payment/closure interleavings, denied roles, guest withdrawal/batch behavior, roster/handovers, linked PM, Lost & Found and immutable historical-cash investigation.
- 16 HTTP authorization/query-scope tests pass; controlled session/query doubles, not live signed-in QA.
- Full suite: 2087 pass / 1 pre-existing `lib/password-reset-audit.test.ts` CRLF literal assertion failure. Earlier introduced import-order and Staff & Duty copy failures were fixed and the full suite rerun.
- Final typecheck passed; touched-file ESLint: 0 errors / 21 warnings in existing shell/FormDialog code. New operational panels/routes/helpers lint clean. Diff whitespace check clean. Logs in ignored `.tmp/role-plan-*`.
- Build attempted, failed fetching Google Fonts Inter/Playfair (same environmental limitation).
- Desktop and 390px fixture preview inspected, tabs/action feedback checked. `public/prototypes/role-improvements-preview.html` plus desktop/mobile PNGs. No signed-in deployed-account QA claimed.

## Pending / continuation

Remote rollback-only migration verification was not executed: automatic approval review failed due usage limit, not an unsafe-action judgment. Local SQL verification used a separate scratch cluster. Supabase CLI unavailable via offline npx. Do not claim remote rollout complete.

Recheck ledger/live drift, use Supabase CLI dry-run/push in a scoped migration checkout that excludes the unrelated unfinished admin-password migration, then signed-in role QA. Database before app code; drain old receiving clients. Never bypass approval review or use `npm run migrate`.

Local test helpers: `scripts/prepare-role-improvements-test-db.mjs` (refuses replacement of existing DB), `scripts/test-role-improvements.mjs`; `ROLE_TEST_DB_NAME=role_improvements_fresh_test`. They never load `.env.local`. Sequential fixtures rolled back; synthetic concurrent fixtures remain only in scratch DB.

Temporary PostgreSQL server was stopped cleanly after testing. Test cluster remains under ignored `.tmp/role-plan-test-db` for reuse; no app database configuration was changed.
