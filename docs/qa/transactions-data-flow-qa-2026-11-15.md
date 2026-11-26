# Transactions data-flow QA — 2026-11-15

## Scope and method

Read-only Front Desk browser checks against the configured local app and its
`/api/accounting/ledger` response, plus source tracing and component tests.
No payment, invoice, receipt, refund, or drawer was written. Accounting's live
write controls were not exercised. All amounts below are PHP.

## Routing checks

| Flow | Observed result |
| --- | --- |
| Transactions ledger | 48 payment rows: 38 paid, 4 pending verification, 1 failed, 5 expired. All-dates gross and net each ₱263,720; no refund rows. |
| Deposit Verification | 48 rows, including 4 requiring manual review and 44 in history. The selected `AUDIT-20261114-001` transaction now opens its matching payment and proof context, rather than the queue's default first item. |
| Billing | 38 invoices. `RSV-C843202B` shows a ₱12,800 folio, ₱3,840 deposit plus ₱8,960 stay payment, and ₱0 balance; both payments match Transactions. Total outstanding ₱412,400 matches the ledger metric. |
| Financial Documents | 49 documents. Receipt `RCP-261115-020E85` links to the ₱8,960 stay payment. No receipt references a missing payment ID. |
| Cash & Shifts | 11 shifts. The sampled closed shift `6b4c640e-…` shows linked `CASH-261002-73284C` of ₱4,480 and expected ₱9,480 including ₱5,000 opening float. No payment with a non-null shift ID references a missing shift. |
| Referential checks | No payment references an unknown invoice; no linked payment/invoice reservation pair disagrees; no receipt payment ID is orphaned. |

## Defects fixed in source

1. **Lost payment context on navigation.** Transactions opened Deposit
   Verification at its default queue item. The link now passes the payment ID
   into section search; payment search includes IDs and opens the all-records
   queue when seeded. Front Desk browser retest selected the same pending
   `AUDIT-20261114-001` entry at the destination.
2. **Settlement assigned to creation day.** Transactions grouped a later
   verified payment under `created_at`, while Accounting Reports uses
   `verified_at` for settled money. The period total, row date, and sort now
   use verification time for paid entries, falling back to creation time.
   A regression test crosses the Manila day boundary. The detail still shows
   both recorded and verified timestamps.

## Data exceptions found on 15 November (status in follow-up below)

- **KI-029, P1:** `INV-7799`, `INV-7800`, and `INV-7801` report paid totals of
  ₱8,900, ₱23,200, and ₱6,400, respectively, but have no linked paid rows.
  Billing displays a warning. Accounting must reconcile external evidence
  before any balance correction.
- **KI-032, P2:** Two paid cash rows have no drawer link:
  `CASH-261003-8C1135` (₱4,060, `RSV-E6199544`) and
  `CASH-261003-8369D2` (₱6,230, `RSV-5C4E8679`). Transactions shows them;
  no Cash & Shifts drawer can attribute them without a shift ID. Historical
  cash evidence is needed before assigning one.

No live refund row exists, so refund-to-ledger and drawer routing was assessed
from source/tests only. The Accounting role's live action paths need a separate
authorized browser session. This QA did not compare calendar date totals with
Night Audit's operating-date reports, which deliberately use an operating day.

## Verification

- Focused transaction and deposit component tests: 14/14 passed.
- `npm run typecheck`: passed.
- ESLint on touched TypeScript/TSX: 0 errors, 3 existing warnings in
  `manager-dashboard-client.tsx` outside the changes.
- Full Vitest: 234 files, 2,451 tests passed.
- Isolated `npm run build -- --webpack`: passed after Windows filesystem
  permission was granted to create the build directory. Generated TypeScript
  config references were restored afterward.

## Follow-up — 16 November 2026

The owner confirmed the three unsupported invoice paid amounts are demo seed
values and the two drawer-less cash receipts are disposable demo records.
Read-only configured-ledger checks found no payment, refund, document, charge,
or adjustment for the three seed invoices. Their exact balances and creation
timestamp match the demo fixture; the reservations have no payment audit.
`20261116010000_recompute_confirmed_demo_invoice_balances.sql` now guards those
facts, recomputes via `sync_invoice_financials`, and writes immutable before/after
audit entries. A full local migration replay on disposable PostgreSQL passed:
fresh databases were unchanged, altered fixture state rolled back all three
updates, and the expected demo rows became unpaid with three audit entries.

The two cash rows have `collect_payment` audits explicitly recording
`unattributedCash=true`. They also belong to paid folios: `RSV-5C4E8679`
remains checked in with ₱8,900 applied, while `RSV-E6199544` is checked out
with ₱5,800 applied. Removing only the cash payments would make those stays
appear to owe ₱6,230 and ₱4,060, respectively. The settled payment
immutability and audit rules prohibit simply deleting or moving them. The
Transactions detail now names the missing drawer link and offers Accounting
the existing Reconciliation investigation queue. Front Desk browser QA
confirmed the warning for `CASH-261003-8C1135`; Accounting navigation passed a
component test, not a live Accounting browser session. Neither cash payment
nor its folio was changed.

**Linked correction applied:** this checkout's dry-run first failed because
the linked database had 17 remote-only versions through `20261115090000`,
including a different `20261115010000`. The latest `origin/main` contained that
source. An isolated worktree from it passed a 150-migration SQL replay; its
linked dry-run listed only `20261116010000`. `supabase db push --linked` applied
that migration. Read-only database readback confirmed:

| Invoice | Paid before → after | Balance before → after |
| --- | ---: | ---: |
| `INV-7799` | ₱8,900 → ₱0 | ₱17,800 → ₱26,700 |
| `INV-7800` | ₱23,200 → ₱0 | ₱0 → ₱23,200 |
| `INV-7801` | ₱6,400 → ₱0 | ₱6,400 → ₱12,800 |

All three are now `unpaid`, and three before/after audit entries were read
back. The two cash payments remained paid and drawer-less. The exact migration
source and replay script were pushed as branch
`codex/transactions-demo-correction` at commit `b013e43`. The older working
checkout still has conflicting migration history and must not run `db push`.
Front Desk Billing browser QA showed `INV-7799` and `INV-7800` as unpaid with
their full balances; linked database readback covered all three invoices.

Final local checks for this follow-up: Transactions component 8/8; full
Vitest 234 files and 2,452 tests; typecheck; scoped ESLint 0 errors (three
pre-existing dashboard warnings); isolated Webpack production build passed.
