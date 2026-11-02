# Backend Remediation Implementation Plan

> Execute task-by-task in this checkout with one agent. User authorized all audit findings except B-005 (PayMongo webhook envelope parsing).

**Goal:** Resolve the 23 authorized backend findings with regression evidence and preserve unrelated working-tree changes.

**Architecture:** Keep existing route/domain/RPC boundaries. Put transactional ownership, money, recovery and stock guarantees in PostgreSQL; use existing shared TypeScript entry points for session and read correctness. Prepare additive SQL under `supabase/pending/` until the remote ledger and live function definitions can be verified; AGENTS.md forbids numbering migrations before that check.

**Tech Stack:** Next.js, NextAuth v4, TypeScript, Supabase/PostgreSQL 18, Vitest.

**Outcome:** all 23 authorized source fixes implemented and verified locally. The linked CLI
later reached the remote ledger and verified live function bodies; SQL is finalized as
`supabase/migrations/20261102010000_backend_audit_remediation.sql`. Dry-run lists only that
migration. Actual app/database rollout is pending and must be coordinated; see
`docs/qa/backend-remediation-2026-11-02.md`. Analytics uses an atomic failed/completed
transaction instead of separately visible running rows. Proof is finalized before transactional
submission; uncertain commits retain evidence for reference reconciliation.

---

1. **Establish database verification.** Use the installed PostgreSQL 18 binaries to create an isolated disposable cluster under `.tmp/backend-remediation/`, loopback port 55432. Do not touch hotel data. Build a schema/SQL behavior harness from repository migrations. Record baseline failing cases before SQL edits. Remote metadata probes currently fail; retain SQL as an unnumbered draft until connection works.
2. **Security (B-001–004, B-009, B-022).** Tests in `lib/backend-remediation.test.ts` and `scripts/backend-remediation-db-test.mjs`; edits to `lib/auth.ts`, `lib/otp-flow.ts`, JWT types, OTP verify/reset routes, recovery upload/completion routes, generic resource route, and additive SQL. Preserve original login time, deny generic reservation writes, return durable OTP failure verdicts, preserve suspended lifecycle, bind selfie to token.
3. **Booking/cash/proof (B-006–008, B-010–013, B-017, B-023).** Additive SQL corrects advisory-lock spelling, nullable legacy nightly rate, missing sellability helper, gateway pricing snapshots, canonical room gates, pending-loyalty eligibility, and express approval expiry. Finalize deposit proof atomically on submission; stage deletion must never reach finalized evidence. Enforce manual/off policy inside RPC. Do not change `lib/gateway-store.ts` or webhook envelope parsing.
4. **Loyalty/stock (B-014–016).** Real SQL tests for tier thresholds, oversized redemption, concurrent/alternative completion paths, stock decrement and unique movement. Deduct stock and record movements inside the fulfillment transaction; remove JavaScript replacement writes and pre-update movement logging.
5. **Read correctness (B-018–019).** Tests exercise pagination beyond first response and query failures. Fetch complete relevant datasets through one small paged reader with errors propagated, keeping list rendering limits separate from complete aggregates. Update `lib/accounting.ts`, `lib/data.ts`, `lib/customer.ts`, Owner/rack queries and necessary readers.
6. **Durability (B-020–021).** Await durable notification completion in existing routes; email remains non-fatal. Atomically claim analytics generation, persist running/failed/completed states, and mark completion only after predictions commit. Test concurrent claims and failed persistence.
7. **Verification gate (B-024).** Restore build type checking. Regenerate corrupt ignored Next type artifacts. Run focused regressions after each batch, then typecheck, touched-file eslint, full Vitest and production build. Keep environment blockers distinct from implementation failures.
8. **Close-out.** Re-review every authorized audit ID, document source/test outcomes and pending remote application, update SYSTEM.md where verified behavior changes, refresh handoff/session/KI-016 without replacing unrelated notes. No commit or deployment implied.

Each behavior change follows failing test → minimal fix → passing test. SQL tests run against a disposable local database with separate committed calls for OTP counters and real concurrent transactions for stock/claims. Do not replace these with assertions over SQL text.
