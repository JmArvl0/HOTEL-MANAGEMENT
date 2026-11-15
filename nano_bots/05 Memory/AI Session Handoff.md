# AI Session Handoff

## Remaining backup items port — 2026-11-15

All missing earlier local history is now ported onto a local branch
`codex/remaining-backup-items-20261115` (worktree `.tmp/remaining-backup-items-20261115`),
a single commit `b1b97a2` on top of `origin/main` `794eca8`: 10 previously missing
commits plus both missing `30512aa` DB-test scripts, with all 22 conflicts across
14 files resolved. Every current main safeguard was kept (attempt-based holds,
Xendit-only checkout, error microcopy, durable email, deposit gating); the old
breakfast/policy/landing features were added on top and remain feature-flagged
(`HAVEN_BREAKFAST_ENABLED`, default false). The old PayMongo/GCash manual
payment UI was discarded. Verified on Node 22.22.2: typecheck, scoped ESLint
(0 errors / 9 pre-existing-pattern warnings), full Vitest 2,637/265, production
build, and real disposable-PostgreSQL suites — migration replay 25 PASS / 0 fail,
breakfast 5 PASS, inventory replenishment PASS. No merge to main, no push, no
hosted write, no browser QA available. See
[[2026-11-15 - Remaining Backup Items Port]].

## Scoped Git reconciliation — 2026-11-15

Reconciled the 38-change series on top of `origin/main` without the 21 earlier local commits. Preserved the hosted Fleet version and the remote cash draft workflow. The verified plan and eight pending migrations are recorded in `docs/runbooks/reconciliation-release-2026-11-15.md`. All 2,625 app tests, the production build, a fresh 149-migration replay, and seven SQL suites passed. Production lacks the new booking and cash functions, so the production push remains gated on the coordinated database rollout.

## Latest work — error microcopy repairs (2026-11-15)

The mobile browser retest found that guests had to scroll to see the cancellation error. The follow-up moved it above the action buttons in the dialog footer. A simulated connection drop in Edge mobile emulation showed the full message and both buttons at 320 × 568 and 390 × 844, including dark mode. The cancellation reason was retained. Full suite: 2,602 passed. See [[2026-11-15 - Cancellation Error Visibility]] and [[2026-11-15 - Error Microcopy Browser Retest]].

The user reviewed the application-wide audit, received its plain-English explanation, and authorized implementation. The repairs are local. See [[2026-11-15 - Error Microcopy Repairs]] and `docs/qa/error-microcopy-implementation-2026-11-15.md`; the original 82-row audit is preserved in `docs/qa/error-microcopy-audit-2026-11-15.md`.

Shared public messages/validation and server/browser boundaries now suppress arbitrary exceptions, parser/provider text and raw field diagnostics while retaining useful domain distinctions and existing status/success/machine contracts. Field feedback, busy recovery, stable retry identities, truthful payment/booking/cancellation uncertainty, explicit notification severity, queue delivery, bounded polling and redacted logging are implemented. Confirmed payment receipts survive refresh failures. Guest delivery/provider guidance is separate from Admin setup messages. Existing payment authority, permissions and database guards are preserved.

Verified: **2,601 tests across 259 files**, typecheck, isolated Next.js production build and scoped ESLint (**0 errors, 41 warnings**) on Node 22.22.2. Edge fixture checks pass at 1440/768/390/320 px with dark/zoom and polling cases. These are real components with synthetic local HTTP responses, not hosted provider or physical-device/screen-reader verification. Evidence is in ignored `.tmp/error-ux-implementation/` and the report directory. No dependency/migration, hosted query/write, real email/payment, commit/push or deployment was performed. The dirty checkout still includes substantial earlier work; preserve it and review a coordinated release rather than deploying the entire tree.

## Earlier work — remaining validation audit repairs (2026-11-15)

The user requested fixes for all 20 remaining findings and a modern UI. All 20 repairs are implemented locally. No production deployment, hosted database write, new wallet payment or live email was performed in this work. Production remains at guest-payment retirement release `d95d14b7a68dd305fc3fa9b6cb7bf9de332039a9`.

See [[2026-11-15 - Remaining Validation Audit Repairs]] for the implementation, verification and release state. `SYSTEM.md` documents the verified behavior; source and migrations are the implementation authority. The external audit's `payment-retirement-follow-up.md` maps every finding to its fix. Evidence is in ignored `.tmp/audit20/`.

Implemented areas include actor-bound booking/retry recovery; consistent dates, numbers, phones and passwords; anti-abuse and OTP identity controls; capacity and photo/reference integrity; SQL daily reports with preview-version enforcement; asset/stock boundaries; per-device idle authority and browser write guards; durable email outcomes and bounded retries; recoverable forms with field-specific errors and mobile layouts.

Normal Xendit provider confirmation stays automatic. Missing callbacks can be recovered with independently verified sessions. Uncertain creations and late captures enter a separate Accounting reconciliation queue with evidence and audit history. Released inventory is never revived. PayMongo, manual guest-payment submission, and Accounting manual Verify/Reject remain retired.

New explicit defaults are a maximum 365-night stay and check-in within 730 days. Zero-deposit online checkout is unavailable. Existing contacts were not rewritten; four pre-existing digit collisions were found read-only. Existing password sign-in remains compatible.

## Verified checkpoints

- User-requested retest passes all 2,581 tests across 256 files on Node 22.22.2 with four workers. Fresh build/typecheck, lint and all 118 SQL checks pass again. Another 27 real localhost HTTP checks and 13 Edge fixture checks pass; 1,045 source/config/migration fingerprints stayed unchanged. No application edits were needed. See [[2026-11-15 - Validation Audit Retest]]. Evidence is in `.tmp/audit20/retest-20261115/`.
- Exact final migration replay applied all 148 files in isolated PostgreSQL; all 103 public tables have RLS. Six new files run from `20261115020000` through `20261115070000`. The hosted ledger was checked read-only before numbering.
- 118 real SQL checks pass across audit, Xendit, availability, F01/F02 amendments, hotel operations and enterprise boundaries. The final Node 22.22.2 production build/typecheck passes. Scoped ESLint has zero errors and seven warnings.
- Installed Edge fixture checks pass at 1440, 390 and 320 px for booking, registration and reconciliation, with no runtime errors. Screenshots were inspected after mobile fixes. These are synthetic local checks, not hosted provider verification.

## Production and release boundary

F01/F02 and migration `20261115010000` were deployed first. PayMongo/manual guest payments and Accounting Verify/Reject were then retired at `d95d14b`. Hosted sandbox GCash deposit, Maya full payment, safe retries and webhook checks passed for that prior release. See [[2026-11-15 - F01 and F02 Critical Audit Fixes]] and [[2026-11-15 - Guest Payment Retirement]].

The remaining repairs require a coordinated application and six-migration rollout, followed by hosted Xendit verification. The root checkout has extensive pre-existing unrelated changes. Preserve them; do not deploy the entire dirty checkout indiscriminately. The prior production checkout `.tmp/my-stay/release` remains at `d95d14b`.

## Earlier and unrelated execution state

All previous handoff content, including My Stay, Workforce, Fleet, architecture, cash, inventory and other unfinished/deferred work, is preserved verbatim in [[2026-11-15 - Handoff before Remaining Audit Closeout]]. Read its relevant section and linked session when resuming that scope. Current Status and Known Issues retain their project summaries. No unrelated implementation or session record was replaced.
