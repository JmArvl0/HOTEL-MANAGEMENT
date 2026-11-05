# Cash findings implementation and verification

Date: 5 November 2026, Asia/Singapore. Scope: the user's approved
[recommendation](../plans/2026-11-05-cash-shifts-findings-recommendations.md).
Implemented locally. No hosted migration, business write, deployment or Git push.

## Resulting behavior

| Finding | Implemented correction | Saved destination |
| --- | --- | --- |
| KI-021: physical cash refund omitted from drawer | Accounting selects the actual payout method and confirms the specific open drawer for cash; noncash rejects drawer linkage | Existing refund request, attempt, payment, folio and audit transaction; `payments.method`, `cash_shift_id`, `received_by` |
| Temporary count draft | Explicit Save draft & return, resume/fresh count, saved/unsaved feedback, version conflicts and stale-activity protection | Separate `cash_count_drafts`, scoped to drawer/user/role; final shift fields only change on Close |
| Separate Close/handover/report actions unclear | Closed-drawer next steps with complete source-scoped follow-up, handover prefill and correct report-date navigation | Existing `shift_handovers` and `front_desk_reports`; writes still require explicit submission |

Cash payout, collection and close share the existing property drawer lock. A
payout above recorded available cash is rejected. Refund caps, policy exceptions,
fee reversals and approval completion remain in the refund transaction. Exact
retries work after drawer closure; changed payout details conflict. Historical
paid records, prior drawer attribution and recorded variances are not rewritten.

The Refunds dialog fetches the current drawer when Cash is selected, including
when staff open Refunds before a ledger view. Failed reads block cash confirmation
instead of accepting an old cached drawer. Movement rows expose the recorded
method and recording staff; they do not assert a different person's cash custody.

Saved drafts persist in PostgreSQL, rather than browser storage. The paid-movement
fingerprint includes IDs and values, detecting new offsetting transactions that
leave the net balance unchanged. Save rejects stale versions/bases; Close consumes
the saved count/version/key under the drawer lock. Draft invalidation preserves
the key/result needed for retries. Blank physical count is never coerced to zero.

Post-close follow-up reads page through the complete selected drawer/department
scope. Report status is read only for Front Desk, using the existing Manila
close-date convention. A saved report generated before the drawer close is
identified as an older snapshot; no snapshot is rewritten. Failed status reads
show unavailable, rather than implying that work is complete.

## Verification

Supported Node 22.22.2 was used for application tests, typecheck and build.

| Check | Observed result |
| --- | --- |
| Clean chronological PostgreSQL replay | 126 migration files, including the new migration |
| Real PostgreSQL acceptance | **12/12 pass**, including second-connection draft read-back, rollback and competing transactions |
| Scoped Vitest | **13 files / 179 tests pass** |
| Full `npm test` | **2,343 pass / 2 fail**, 220 files |
| `npm run typecheck` | Pass |
| ESLint on touched JS/TS/TSX | 0 errors / 6 existing warnings in the dashboard/report files |
| Isolated `npm run build` | Pass, using `HAVEN_BUILD_DIR=.tmp/cash-findings-build` |
| Local browser component QA | Pass at 320, 390 and 1280px, light/dark, bundled fonts/shared stylesheet order; no runtime errors or page overflow |

The two full-suite failures are the previously recorded purchase-order surface
contract and reservation-history refresh test. Earlier clean-baseline reproduction
is documented in the 4 November cash publish-sync handoff/report. This session
did not repair them. Concurrent room-rack and data-control edits from another
session were preserved, and were not attributed to this cash work.

The SQL checks exercise the real migration-owned functions with service-role
execution against fictional fixtures in fresh loopback-only scratch databases:

1. Save/read an operator's draft from a separate connection; final financial
   count fields remain unchanged and another cashier cannot read it.
2. Reject a stale cross-device draft version.
3. Reject a saved physical count after offsetting new cash movements.
4. Persist the ₱250 cash refund's method, drawer, recording actor and audit;
   ₱1,000 float + ₱2,000 original collection − ₱250 payout = ₱2,750 expected.
5. Exclude an external payout from the drawer, rejecting incompatible method/link
   combinations and Front Desk refund execution without partial records.
6. Force an audit failure and verify payment, attempt, request and folio rollback.
7. Close a fresh ₱2,750 count with zero variance; exact close/refund retries remain
   safe after closure. Close creates neither handover nor daily report.
8. Reject insufficient drawer funds and revoked legacy RPC bypasses.
9. Queue close and payout on the real shared lock; the losing operation cannot
   produce a close snapshot that omits the payout.
10. Competing refunds cannot spend the same recorded cash balance twice.
11. Preserve the actual terminal folio-credit refund cap.
12. Execute an approved refund exception's fee reversal and approval completion
    exactly once, including on retry.

Runner: [scripts/cash-findings-qa.mjs](../../scripts/cash-findings-qa.mjs). It never
reads `.env`, accepts no hosted target, creates a fresh database each run and
preserves fixtures/results. It requires the disposable PostgreSQL cluster on
`127.0.0.1:55441` with its dedicated test user. Results/logs remain ignored under
`.tmp/cash-findings-qa/` and `.tmp/cash-findings-*.log`.
The task's test cluster was stopped after verification; fictional databases and
evidence were retained. Final document links/whitespace and `git diff --check` pass.

The real-component browser fixture uses explicitly labeled sample data and fake
HTTP responses. Checked count/save/close, cash/noncash payout inputs, prefilled
handover source, report date, no automatic handover/report writes, checkbox
sizing, narrow-screen overflow and modal visibility. Screenshots and fixture are
ignored under `.tmp/cash-findings-ui/`. This is **not** authenticated application
browser-to-database financial-write E2E; that remains unverified. Database writes
and browser behavior were verified separately.

## Release boundary

New additive migration:
[20261105010000_cash_refunds_and_count_drafts.sql](../../supabase/migrations/20261105010000_cash_refunds_and_count_drafts.sql).
The linked hosted migration ledger was read before numbering. No `supabase db push`
was performed. The new refund function retains the local cancellation-settlement
contract, so release must account for its existing pending prerequisite
`20261103160000_cancellation_folio_settlement.sql` and review the remaining linked
ledger gaps. Do not blindly push the entire root migration directory or use
`npm run migrate`.

Deploy the matching API/UI and reviewed migration set together. Until that release,
KI-021 is fixed in local source and remains a hosted-release concern. Accounting
still records a confirmed manual payout; a separate authorize-now/disburse-later
cash-custody workflow was not introduced.
