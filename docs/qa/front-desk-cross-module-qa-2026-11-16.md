# Front Desk cross-module QA — 2026-11-16

## Scope and method

Read-only browser QA in the configured Front Desk session covered all 16 visible
navigation modules. I followed sample records across their destination modules
and compared the browser with authenticated GET responses from the local app.
I inspected source for the two UI routing discrepancies. No booking, guest,
payment, receipt, report, handover, approval, room, or drawer was written.
Amounts are PHP. The live dataset contains historical demo records.

## Module coverage

| Front Desk module | Read-only observation and routing check |
| --- | --- |
| Dashboard | Loaded operational cards. “Rooms ready” showed **6**, while Room Management and Bookings showed **8** (KI-033). |
| Room Management | 12 rooms: 8 ready, 1 occupied, 1 reserved, 2 out of service. Room board and status filters loaded. |
| Bookings | Calendar and list loaded; 39 bookings. Sample `HVN-261114-3BA574` opened with room 101, ₱12,800 folio, two paid payments (₱8,960 and ₱3,840), and a linked guest request. |
| Guest Management | 35 guests. Sample guest search and Stays tab linked to `HVN-261114-3BA574` and a second stay. |
| Guest Requests | 20 grouped submissions: 8 awaiting approval, 1 open work, 11 history. The sampled batch linked to booking `HVN-261114-3BA574` and room 101. The backing response contained 60 request items across 20 batch IDs. |
| Transportation | Queue and empty state loaded; 0 requests. |
| Hotel Operations | Operating-day tracking was inactive; shift briefing had no handovers. Room discrepancy GET returned 0. Other internal operating-day actions were not exercised. |
| Approvals & Escalations | Front Desk “filed by you” scope loaded with 0 cases. |
| Housekeeping | No active task; the backing resource had 8 completed historical tasks, all linked to known rooms. No approved active housekeeping request lacked a task. |
| Reports | Preview loaded; 0 submitted reports. For Manila date 2026-10-03, GET reported 13 collections totaling ₱79,600, matching 13 paid non-refund ledger rows and the method totals. No report was submitted. |
| Operational Handover | Log and creation form loaded; 0 handovers. No handover was created. |
| Billing | 38 folios, ₱450,900 outstanding, 4 deposits awaiting Accounting. Sample booking showed ₱12,800 total, ₱12,800 applied, ₱0 due, with both payments in activity. One checked-out booking had no folio (KI-034). |
| Transactions | 48 payment rows, ₱263,720 gross/net across all dates, no refunds. Sample ₱8,960 paid transaction linked to the same booking/invoice and receipt. |
| Deposit Verification | 4 pending and 44 historical rows. Front Desk was read-only; proof/review actions were reserved for Accounting. |
| Cash & Shifts | 11 historical shifts, none open. A sampled closed shift linked paid cash `CASH-261002-73284C` (₱4,480); its displayed expected cash includes the ₱5,000 float. Two other historical paid cash rows lack shift IDs (existing KI-032). |
| Financial Documents | 49 documents: 18 receipts and 31 folio statements. `RCP-261115-020E85` showed ₱8,960 and the same payment reference as the sampled booking/transaction. |

## Cross-module integrity checks

- Checked 39 reservations, 12 rooms, 35 guests, 60 request items, 8 historical
  housekeeping tasks, 38 invoices, 48 payments, 49 documents and 11 shifts.
  No reservation referenced an unknown guest or room; no invoice or request
  referenced an unknown reservation; no task referenced an unknown room.
- No payment referenced an unknown invoice. For each of the 38 invoices, the
  recorded paid amount equaled the sum of linked paid payment rows. No receipt
  referenced an unknown payment or disagreed with its payment amount. No cash
  payment with a non-null shift ID referenced an unknown shift. Tax arithmetic
  checks found no exception in these records.
- The receipt register contains 3 payment IDs with multiple receipts, with 8
  excess receipt rows. Five same-content folio groups contain 22 excess rows
  (document number and issue time excluded from content comparison). This is
  historical data covered by KI-013; the repair migration is pending deployment.
- Two paid cash rows lack shift IDs, as already tracked by KI-032.

## Findings from the read-only pass

### KI-033 — “Rooms ready” differs across Front Desk modules (P2)

**Reproduction:** Dashboard showed 6 ready rooms; Room Management and Bookings
showed 8 in the same session. Both use the “Rooms ready” label. Front Desk
`getDashboard` passes all reservations into `roomBoardState`, while Room
Management filters stays through `roomRackStays` for its current window.
Future assigned stays can therefore reduce the Dashboard count before the
room rack marks those rooms reserved. See `lib/data.ts:59-61` and
`components/front-desk/fused-room-rack-panel.tsx:236,475`. The two room counts
were observed live; the source difference explains a plausible cause, but the
exact two reservations responsible were not isolated.

### KI-034 — Checked-out booking has no Billing folio (P2 data integrity)

**Reproduction:** Booking `RSV-1046` is `checked_out` in the configured
reservation response, has total ₱17,400, `payment_status=unpaid`, no room ID,
and no linked payment or request. It is absent from all 38 invoices; 39
reservations are present. The local demo seed at `lib/demo-store.ts:10` labels
this record `pending`, so the configured record's origin/state needs review.
The test did not establish whether a historical import, demo fixture, or
application workflow produced the mismatch.

### KI-035 — “View receipt” calls document issuance (P2)

**Reproduction:** The sample booking's ₱8,960 paid payment already has receipt
`RCP-261115-020E85` in Financial Documents. Its Bookings detail offers “View
receipt,” but the control calls `generateDocument`, which POSTs to
`/api/accounting/documents`, reloads the ledger and reports an issued number;
it does not open the existing receipt. Transactions offers “Issue receipt” on
paid non-refund rows without checking for an existing document. See
`components/manager/manager-dashboard-client.tsx:~300,1219-1220` and
`components/manager/transactions-workspace.tsx:177`. I did not click these
controls because they can write a live document. The duplicate-document risk
overlaps existing KI-013, but the misleading Bookings action is a separate UI
finding.

## Limits and verification

Live write paths remain **unverified end to end**: booking creation, check-in
and checkout, guest/request creation or approval, transportation dispatch,
housekeeping progress, report submission, handover, payment/deposit review,
receipt issuance, and opening/closing drawers. Empty queues also limited
Transportation, Approvals, Handover and active Housekeeping checks. Source and
the automated suite provide coverage, but they do not replace a live write
readback.

`npm run typecheck` passed. `npm test -- --reporter=dot` passed 234 files and
2,452 tests. `npm run lint` passed with 0 errors and 77 warnings. A default
and an isolated Webpack build hit Windows `EPERM` while creating generated
directories. The elevated isolated `npm run build -- --webpack` then passed;
Next's generated TypeScript config changes were restored afterward.

## Follow-up corrections — 2026-11-16

- **KI-033, source fixed:** `getDashboard` now passes `roomRackStays` into
  `roomBoardState` for Front Desk as well as Manager. A regression test with a
  future assigned stay confirms that it does not reduce today's ready count.
- **KI-034, live data corrected:** The owner identified `RSV-1046` as a demo
  booking and chose to archive it and reverse demo credit. It had no check-in,
  assignment, folio, payment, or checkout audit, but did have a +174 immutable
  loyalty entry and ₱17,400 lifetime spend. A guarded migration was replayed
  against 151 migrations locally, then applied to the linked database. Readback
  confirmed `status=cancelled`, a retirement reason, `checked_out_at=null`,
  guest points and lifetime spend at 0, an append-only -174 ledger adjustment,
  and an audit record. The original booking and award remain for traceability.
  Gold tier remains under the system's no-downgrade rule; its origin is unknown.
  The orphaned row was also removed from the local demo seed.
- **KI-035, source fixed:** Bookings and Transactions match receipts to the
  payment ID. Existing receipts route to Financial Documents; an issue action
  appears only when none is linked. The reservation detail query now selects
  `financial_documents.payment_id`. Interaction tests verify the existing
  receipt path does not call document issuance.

The signed-in local development browser retest showed **8 ready rooms** in
Dashboard, Room Management, and Bookings. For `HVN-261114-3BA574`, Bookings and
Transactions both opened the existing `RCP-261115-020E85` receipt with its
₱8,960 preview. `RSV-1046` appeared as cancelled with its retirement note.
That retest exposed a remaining display fallback: its detail showed a phantom
₱17,400 folio balance despite having no invoice. The detail now explicitly
says “No folio recorded for this booking” and offers no folio adjustment; a
browser refresh and regression test confirmed the correction. No receipt was
issued during this retest. The app source has not been deployed to a hosted
environment. Historical duplicate documents remain KI-013; drawer-less demo
cash remains KI-032.

The final follow-up passed typecheck, scoped lint, full Vitest (236 files /
2,458 tests), isolated production build, and `git diff --check`.
