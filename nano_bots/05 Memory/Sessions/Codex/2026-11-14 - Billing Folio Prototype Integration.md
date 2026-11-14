# Billing Folio Prototype Integration — 2026-11-14

The user approved the revised Guest Folios preview as a detail view inside
Billing and asked to see it implemented locally. Existing Billing content was
to remain; the separate staff Guest Folios entry was redundant.

## Delivered

- Added charges, financial adjustments, and complete payment history to the
  server-side Billing snapshot. Entries attach by invoice, then reservation.
- Added a filterable folio activity list inside the existing Billing detail.
  The booked-stay line is derived from invoice amount less listed charges and
  corrections, avoiding double counts. Unsettled payments are marked as not
  applied to the balance.
- Kept checkout, deposit review, settled queues, summary cards, collection,
  and reservation access. Brought statement issuance and Accounting-only
  adjustment/reversal actions into Billing.
- Removed the separate Guest Folios staff menu and routed the dashboard's
  balance shortcut to Billing. Phone queue/detail navigation returns focus to
  the selected row.
- No database migration, financial record deletion, hosted write, or deploy.

## Verification

- Targeted Billing/navigation tests (15), typecheck, touched-file ESLint, and
  diff check passed. A full Vitest run passed before a concurrent untracked
  cash-report refund test appeared. The latest run passed 2,428 tests and
  failed that one unrelated test (refunds counted in collections). Front Desk
  desktop and 390px browser review passed against live local data. Accounting
  login was unavailable for browser review; role-specific actions passed
  component tests.
- Default production build stopped while Windows tried to create a Sharp
  junction in `.next` (access denied). This matches the known local build
  environment issue.

## Follow-up

- Review the local Billing view as Front Desk or Accounting at
  `/manager_dashboard`, then choose Billing in the Finance sidebar.
