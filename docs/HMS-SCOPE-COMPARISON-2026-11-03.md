# HMS scope comparison — 2026-11-03

## Scope and evidence

The user's clarified project is only the Hotel Management System in the supplied ecosystem: Guest & Customer Management; Reservation & Booking; Front Office Operations; Room & Housekeeping; Billing & Payment; Inventory & Staff Management; Administration & Analytics. HR, Financials, Logistics, Facilities and Restaurant are separate systems with no current integration.

This is a source-based assessment against those seven broad headings, not a complete requirements specification or signed-in acceptance audit. No fresh remote deployment check was made in this assessment. The last verified remote ledger ended at `20261024130000`; seven November improvement migrations were still pending. Local changes must not be described as deployed functionality.

The main weakness is consistency across existing hotel workflows, especially supplies consumption, cash handling and saved records. Missing standalone HR, procurement or general-ledger systems are not HMS deficiencies.

## Module comparison

| HMS module | Substantial existing coverage | Actual weakness / qualification | Assessment |
|---|---|---|---|
| Guest & Customer | Guest/account profile, consolidated stay history, preferences, requests, loyalty, ID verification and completed-stay reviews | Profile changes span separate writes; pre-arrival ID verification can report success without confirming the document-status update. Pending-request withdrawal is local and migration-dependent. | Needs data-consistency and request-workflow hardening; not a missing customer module. |
| Reservation & Booking | Availability/holds, rate plans and frozen rates, deposit workflow, cancellation/no-show, room assignment/change, stay extension and exception approvals | Group/multi-room consolidated booking is deliberately deferred; whether it is a gap depends on actual HMS requirements. No new critical absence was established in the basic lifecycle in this review. | Among the stronger modules; validate edge cases before adding scope. |
| Front Office | Walk-ins, arrivals/departures, identity checks, room readiness gates, charges/collections, guest coordination and daily report submission/review | Cash-open defect was reproduced previously; new close/payment fixes and handover are not remotely validated/applied. New source and old DB are not a release-ready combination. | High priority: reliable cashier and shift-continuity operations. |
| Room & Housekeeping | Cleaning/task lifecycle, self-assignment, priorities, deferral, inspection/reclean, room readiness, checkout turnover and room-related maintenance | Guest-request completion and stock consumption are separate operations; a completed task can lack its supplies movement. Self-inspection is an explicit policy, not an accidental missing supervisor feature. | Core room workflow is substantial; supply accountability needs work. |
| Billing & Payment | Folios, charges, deposits, payment review/collection, adjustments, refunds, receipts and documents | Strict drawer flow depends on pending fixes. Most payment/refund recording remains manual, unlike configured gateway deposits; human verification/settlement evidence remains necessary. | High priority for reliability, not for building a general ledger. |
| Inventory & Staff | Hotel stock counts, movement history, low-stock/forecast signals, departmental task assignment and workload visibility | Stock quantity and movements are not atomic in the generic adjustment/guest-consumption paths. A planned roster is not required to establish an HMS staffing gap when official scheduling belongs to HR. | Inventory integrity is the clearest additional HMS weakness. |
| Administration & Analytics | Account/role governance, hotel policies, catalogs, audits/security, system health and operational reports/insights | Local/remote schema drift, pending migration readiness and unverified signed-in acceptance. Some collection-based KPIs are titled revenue; inventory forecasts depend on trustworthy movement history. | Needs deployment discipline, clear labels and reliable source data. |

## Prioritized findings

### 1. High — supplies count and movement history can disagree

Two separate source paths establish this concern:

- `app/api/resources/[resource]/route.ts:12–13` reads the old quantity, records a movement, suppresses logging exceptions and then separately updates the stock record. A failed stock update can leave a movement without a corresponding quantity change; a failed log can leave the reverse.
- `lib/inventory-movements.ts:50–85` reads a quantity, writes a new absolute quantity and separately inserts a consumption movement. The insert result is not checked by `recordInventoryMovement` at lines 25–38. `app/api/housekeeping/tasks/[id]/complete/route.ts:7` invokes consumption after task completion and suppresses failures.

Example: two staff members both read a stock of 10, each issues one item and each writes 9. The count can become 9 while two movements were logged. Conversely, a task can complete without a saved consumption record. This is a code-established failure risk, not proof that existing stock records are already wrong.

HMS improvement: an atomic, retry-safe issue/adjustment workflow with actual quantity, operational reference and correction reason. Keep it about hotel supplies use and accountability; supplier buying, bidding and AP remain outside this repair.

### 2. High — cash control is repaired locally but not verified as operational remotely

The previous rollback-only remote check reproduced `42883` from the deployed `hashtextended` typo. Local migration `20261103010000_restore_cash_controls.sql` fixes it, restores strict drawer attribution and serializes payment/closure. Local SQL tests passed, including concurrency. Those results do not establish that the configured remote system now has the fix.

HMS improvement: release and signed-in verification of collection → count/close → next drawer → receipt/folio consistency. Retain the boundary between hotel guest billing and a separate enterprise Financial system. Do not treat lack of GL/AP as a defect in this HMS module.

### 3. High — the working tree depends on schema changes that are still pending

For example, `lib/customer.ts:100` now selects `guest_requests.version`, while the PO list selects `received_quantities` and receipt relations in `app/api/inventory/purchase-orders/route.ts:30,48`. The new roster, handover, Lost & Found and asset-work routes also require new tables/functions.

If updated app code runs against the previously inspected schema, these new reads/actions can fail. This is a release-readiness problem and an introduced dependency to manage, not proof that all older deployed pages are broken.

HMS improvement: first scope-filter the pending work after the user's clarification, then use a compatible database-first release and role acceptance checklist. Do not blindly push all seven migrations: official rosters, procurement and broad asset-management additions need boundary review. Preserve the unrelated pending admin-password migration.

### 4. Medium — profile updates can save only part of a change

`app/api/account/profile/route.ts:4–6` updates the account name, then looks up and updates/inserts a guest record, then writes the audit event. These are separate operations; later failure does not roll back the first. The route also tolerates duplicate guest rows by choosing the newest, which is defensive handling rather than a canonical guest-data reconciliation workflow.

HMS improvement: atomic guest-profile updates, explicit account/guest linkage and a controlled duplicate-resolution process where actual duplicates exist. Preserve historical reservation snapshots; do not silently rewrite guest identities or old stays.

### 5. Medium — pre-arrival ID review has two separate success states

`app/api/staff/reservations/[id]/verify-id/route.ts:22–35` first calls `verify_guest_identity`, then updates pending `guest_id_documents`. The second update's error/result is not checked before returning `{ ok: true }`.

Impact: the stay may be marked identity-verified while its uploaded document still appears pending. The underlying identity verification exists; this is incomplete consistency/error handling.

HMS improvement: one controlled verification operation that validates the intended document and records both statuses/audit atomically, with an honest error when it cannot complete. Automated ID recognition is not required by the broad scope.

### 6. Medium — guest request lifecycle and shift handover are not yet fully available remotely

Requests already have approval, routing, department work, escalation and completion. The new withdrawal route and source-linked handover are local additions, not a reason to call the whole request or Front Office module absent.

HMS improvement: finish the scoped withdrawal and operational handover paths and validate role transitions. Keep operational handover separate from official HR scheduling and attendance.

### 7. Medium — reporting labels and predictions need trustworthy operational sources

`lib/accounting.ts` derives `netRevenue` from settled collections less refunds; the shared accounting UI uses “Net revenue” with collection-related hints. A clearer “Net collections” label would avoid confusing money received with stay charges or business profit. This is a UI/data-definition recommendation, not a request for enterprise accounting.

`lib/analytics/inventory.ts:57–80` appropriately labels insufficient movement history as limited data. That honesty is already implemented. Repairing the movement path in finding 1 should precede adding more inventory predictions. Low-history forecasts are a data limitation, not a missing analytics module.

## What should not be called a missing HMS module

- HR employee master records, payroll, leave, attendance and official workforce scheduling.
- Financial general ledger, AP, corporate budgeting or a replacement for the hotel's complete books.
- Logistics procurement, supplier sourcing, centralized warehousing and enterprise purchase-order ownership.
- Enterprise fleet optimization or Facilities-wide asset/contract management.
- Restaurant menu, kitchen orders, table management and restaurant POS.
- Integration with these systems is future work requiring agreed ownership/contracts; its current absence was disclosed by the user, not a failed promise in this audit.

Hotel supplies usage, guest bills/payments, hotel task assignment, room readiness and guest-service handover remain useful HMS responsibilities even before integration. Asset/PO modules may contain limited hotel-facing functions, but their authoritative ownership should be agreed before expansion or rollout. No existing code is removed by this assessment.

## Recommended HMS-only focus

1. Clarify the pending release scope and make app/database versions compatible.
2. Stabilize hotel payment/drawer/folio flows and stock-consumption/adjustment history.
3. Make profile and ID verification changes consistent and auditable.
4. Finish guest-request withdrawal and front-office handover.
5. Refine report labels and verify real role journeys; add reservation features only against confirmed requirements.

No runtime changes or new tests were made for this analysis. Existing implementation results remain documented separately in `ROLE-IMPROVEMENT-IMPLEMENTATION.md`.
