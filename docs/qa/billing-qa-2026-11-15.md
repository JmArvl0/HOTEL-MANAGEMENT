# Billing and guest folio QA — 2026-11-15

## Scope and result

Read-only QA against the local Front Desk session at `localhost:3000`, the
authenticated Billing and Accounting ledger endpoints, and the current source.
The snapshot contained 38 folios, 48 payment transactions, 4 deposits awaiting
verification, and 48 issued financial documents. No payment, verification,
adjustment, reversal, statement, or database write was made.

The Billing sidebar entry opened the integrated workspace; Guest Folios was no
longer a separate menu entry. Guest, booking-number and invoice searches,
checkout/deposit/settled filters, pagination, no-match state, and folio selection
worked. `Open reservation` loaded the selected reservation. The selected
deposit's booking and amount matched Deposit Verification. The three summary
values matched the API rows: outstanding ₱412,400, checkout due ₱0, and 4
pending deposits. A settled folio showed ₱12,800 applied as ₱3,840 deposit
plus ₱8,960 stay payment. At 390px, the queue and detail were separate, and
Back returned focus to the selected row. The browser error log was empty.

## Findings and resolution options

| ID | Severity | Evidence | Recommended resolution |
|---|---|---|---|
| BILL-01 | P1 · financial data integrity | `INV-7799`, `INV-7800`, and `INV-7801` report applied payments of ₱8,900, ₱23,200, and ₱6,400, respectively, but have zero paid rows attached to their Billing folios. Searching Transactions for the first reservation also returned no rows. Their totals appear in `lib/demo-store.ts`; the source of the live discrepancy is unconfirmed. | Reconcile these invoice amounts against verified payment evidence. If real payment records exist but lack links, backfill the invoice/reservation links with an audited, additive correction. If no payment exists, correct the invoice through the authoritative financial workflow after Accounting review. Do not fabricate payment records. Until reconciled, show an explicit “payment history unavailable” warning when the paid total has no ledger support. |
| BILL-02 | P2 · document traceability | Among 48 issued documents, 38 belong to 8 groups with the same source and financial snapshot after excluding document number and issue time. `FOL-261003-E7C515`, `FOL-261003-5359EB`, and `FOL-261002-B57AFF` are three snapshots for the same reservation and financial position; two were issued 1.46 seconds apart. The Billing `Issue statement` button has no in-flight guard; each call sends a new idempotency key. | Decide whether reissue is allowed. Immediately guard repeated clicks and show/open the issued document after success. If only one document per unchanged financial state is desired, deduplicate server-side by source and financial snapshot or require an explicit reissue action with revision lineage. Preserve existing immutable documents. This confirms the repeated-record observation in KI-013, while the intended policy remains undecided. |
| BILL-03 | P2 · incomplete payment timeline | A folio with a ₱19,140 pending deposit shows it in a banner, but the Payments filter says “No payments on this folio.” `staff-billing-workspace.tsx` removes pending deposits from activity. The Front Desk queue also labels the row “Verify deposit” despite Front Desk having no verification action. | Include pending deposits in payment activity with a clearly unapplied amount and status, while keeping the banner. Use “Awaiting Accounting” for Front Desk and “Review deposit” for Accounting; link the latter to the existing review action. |
| BILL-04 | P2 · cancelled folio explanation | `INV-FF587288` is cancelled with original total ₱63,800, applied ₱0, and balance due ₱0. The detail still lists a +₱63,800 booked stay without a cancellation/settlement explanation. On phone the queue is hidden, so the detail does not show “Cancelled” at all. Seven cancelled invoices have this intentional total-versus-balance shape. | Put invoice status and cancellation context in the detail itself. Explain that the original charge is historical and the collectible balance was closed by cancellation; show the actual cancellation/fee/refund events from authoritative records where available. Do not invent an adjustment to force arithmetic. |

## Coverage limits and automated checks

There were no live folio charge or adjustment rows and no checked-in stay with
an outstanding balance. The Accounting login was unavailable in this QA session.
Therefore charge reversal, adjustment, collection, and Accounting verification
were checked through current source and component/permission tests, not by
making financial writes in the browser. `Issue statement` was not clicked
because it creates an immutable financial document.

`npm run typecheck` passed. ESLint on Billing/navigation source passed. Five
targeted test files passed 77/77 tests, and `npm test` passed 2,428/2,428.
An isolated `npm run build -- --webpack` first stopped on a sandboxed Windows
`EPERM` mkdir. With filesystem access, Webpack compiled successfully, then
Next route type generation failed on two unrelated exported constants:
`transportVehicleTypeColumns` in the transport vehicle types API route and
`QR_BUCKET` in the Owner payment QR route. Neither is imported elsewhere in
current app code. Removing those route exports (keeping the constants local)
is the smallest candidate fix, followed by a fresh production build. Billing
itself has no reported build error; a successful production build is not yet
verified.

Relevant implementation: `app/api/staff/billing/route.ts`,
`lib/staff-billing.ts`, `components/manager/staff-billing-workspace.tsx`,
`components/manager/manager-dashboard-client.tsx`,
`app/api/accounting/documents/route.ts`, and
`supabase/migrations/20260928010000_tax_aware_documents.sql`.
