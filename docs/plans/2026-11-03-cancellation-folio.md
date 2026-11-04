# Cancellation Folio Settlement Implementation Plan

**Goal:** Record cancellation/no-show penalties as explicit folio charges and settle refunds from the resulting credit.

**Architecture:** Preserve frozen deposit refund tiers and the deposit-only no-show penalty. Inside the existing protected transition RPCs, release the unused reservation obligation while preserving independently posted transportation through an immutable credit adjustment, post the policy fee with its calculation snapshot, and recompute invoice paid/balance/credit. New settlements use folio credit to authorize payout; existing historical reservations retain their original workflow. Accounting execution of an approved refund exception records a corresponding fee reversal before payout.

**Tech Stack:** PostgreSQL migrations, Next.js, TypeScript, Vitest, isolated PostgreSQL behavior checks.

1. Add a disposable PostgreSQL regression runner covering full/partial/no refunds, no-show cutoff/retries, unverified funds, additional prepayments, refunds and approved exceptions. Run against the existing migrations and observe failures.
2. Add migration `20261103160000_cancellation_folio_settlement.sql` after checking the linked ledger (verified through 150000). Keep authorization and operating-day locks; do not backfill historical accounting records. Exercise real SQL behavior.
3. Expose the fee in cancellation preview and show settled receipts/credit clearly on guest folios. Add separate fee totals to daily ledger reporting. Run targeted tests.
4. Run typecheck, touched-file ESLint, full Vitest, build, and migration dry-run. Record verified outcomes in SYSTEM.md and session memory. Deployment remains a separate release action.
