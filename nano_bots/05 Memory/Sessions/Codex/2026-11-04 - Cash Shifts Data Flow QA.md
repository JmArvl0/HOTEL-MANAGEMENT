# Cash Shifts Data Flow QA

Date: 2026-11-04. User requested QA and an understandable report tracing where
Cash & Shifts data goes. Preserved existing implementation work and other files.

## Verified

- Traced actual UI → POST/PATCH routes → migration-owned functions → tables →
  ledger/history/details, receipts/folios, handover, reports and operating-day use.
- Added `scripts/cash-shifts-data-qa.mjs`: fixed loopback-only PostgreSQL target,
  no environment secrets, new scratch DB per run, real migration replay (117
  source files) and service-role function/read checks. 17 checks pass, including
  payment/receipt atomic failure rollback, retry deduplication, role/source
  controls, exact persisted notes/count/variance and independent connection read.
- Added actual HTTP handler destination tests and mounted-only draft regression.
  10 files / 159 targeted tests pass; full suite 214 files / 2,303 tests pass.
  Typecheck, touched QA-file ESLint (0 warnings/errors) and diff check pass.
  No new runtime source change or build run; prior implementation build passed.
- Live Front Desk browser reads: shift history/details, known drawer payment
  found in Transactions by exact reference/amount, Financial Documents populated,
  current-day report preview cash section and no automatic report submission.
  No hosted business writes. Disposable SQL server stopped after QA.

## Findings / limits

- KI-021 (high operational risk): normal `process_refund` stores a paid
  `manual_refund` with NULL `cash_shift_id`. Refund/payment/attempt/audit survive,
  but a refund physically paid from the drawer cannot feed Cash out. Isolated
  example: float1000 + cash2000, refund250 unlinked, count2750 yields expected3000
  / variance-250. Noncash refunds correctly stay outside the drawer. Recorded
  the gap; did not silently change payout policy or migrate historical records.
- Count/note drafts are not autosaved: same mounted refresh/filter/cancel retain
  them, but leaving/reload clears them. Close saves them permanently.
- Close does not auto-create a handover or submit daily report. Cash reconcile
  does not create statement reconciliation or erase original variance.
- Reviewer/receiving staff IDs persist but current cash UI omits their names.
- Live Accounting/browser-write E2E, 200% zoom and physical touch/Safari remain
  unverified. Raw PostgreSQL bootstrap emulates Supabase platform grants/storage;
  no claim that all117 source migrations are hosted/applied. No hosted write,
  schema migration, deployment, commit or runtime financial correction.

User report: `docs/qa/cash-shifts-data-flow-qa-2026-11-04.md`; portable fictional
read-back JSON in `docs/qa/evidence/cash-shifts-data-readback-2026-11-04.json`.
Local logs/scratch DB under ignored `.tmp/cash-data-qa/`.

## Commit/push follow-up

User subsequently authorized commit/push of all changes. All26 implementation/QA
files committed and rebased onto origin/main `d707824` after fetching six incoming
commits. Dashboard conflicts retain incoming room-rack refresh plus cash routing,
draft-safe refresh errors and handover focus. Status notes preserve both sides.
Combined typecheck/production build pass; dashboard lint0errors/5existing warnings.
Full suite2,313pass/2fail. Both failures reproduced on pristine `d707824` in a
temporary detached checkout (41pass/2fail): PO surface contract and reservation
history refresh after folio mutation. No unrelated fixes bundled. Temporary
checkout removed; generated Next type paths restored. No migration/deployment.
