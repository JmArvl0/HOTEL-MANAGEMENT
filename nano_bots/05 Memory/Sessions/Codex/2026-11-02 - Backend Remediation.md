# Backend Remediation — 2026-11-02

User authorized all audit fixes except B-005 (payment webhook envelope parsing).
Single-agent implementation; existing unfinished work preserved.

- 23 authorized source findings implemented; details/evidence/rollout notes in
  `docs/qa/backend-remediation-2026-11-02.md`. Plan at
  `docs/plans/2026-11-02-backend-remediation.md`.
- Real baseline PostgreSQL failures recorded before SQL changes. Final isolated
  PostgreSQL 18 replay: all 101 migrations, 23 regression cases pass. Cases cover
  NULL ownership, separate committed OTP failures, recovery lifecycle and proof,
  cash open/collect/close/reopen, mixed/seasonal prices, room state, loyalty,
  concurrent stock and analytics, insufficient-stock rollback, onboarding.
- Vitest checkpoint: 194 files / 2106 tests pass. Typecheck, touched-backend lint,
  production build pass. Initial build correctly caught a new test typing error;
  corrected and rebuilt. Next generated-type corruption regenerated rather than
  hidden; `ignoreBuildErrors` is false. Existing middleware deprecation warning.
- Finalized proof is protected from staging deletion, including legacy proof paths;
  unknown RPC outcomes retain evidence. No historical financial/loyalty/stock rewrite.
- Remote metadata initially failed because `.env.local` points to a stopped local
  Supabase stack; linked CLI later reached remote successfully. 100 old migration
  versions match; 15 relevant live functions/grants read. Replaced bodies match
  latest source; snapshot-only helper captured; live HK role gate is not replaced.
- New migration `20261102010000_backend_audit_remediation.sql`; dry-run shows only it.
  **Not applied, application not deployed, no commit.** App and DB must roll out
  together because of OTP/proof/analytics contracts and DB-owned stock consumption;
  old JS stock deduction must not overlap the trigger. Existing frontend edits
  would also be included by a whole-checkout deployment.
- Excluded source files unchanged: `lib/gateway-store.ts`, `lib/gateway.ts`,
  `app/api/webhooks/payments/route.ts`, and existing PayMongo tests. Session-only
  audit probe passes; full probe retains the two excluded payment-envelope failures.
- SYSTEM, handoff, Current Status and KI-016 refreshed without replacing unrelated
  notes. Disposable loopback PostgreSQL server stopped after verification.

Production lifecycle/browser/provider checks remain rollout work. Do not describe
local verification or migration dry-run as a completed production release.
