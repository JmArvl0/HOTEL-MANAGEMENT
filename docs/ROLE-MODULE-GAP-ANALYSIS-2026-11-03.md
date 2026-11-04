# Role and module gap analysis — 2026-11-03

## Scope and conclusion

Source review of SYSTEM.md, role capabilities, shared permissions, role dashboards, relevant API routes, and migration definitions. This is not a live database audit or signed-in acceptance test. No runtime code was changed and no tests were run for this documentation-only assessment.

HAVEN has eight roles and substantial hotel operations coverage. The most urgent gaps are incomplete cash controls and purchase-order receiving, rather than a need to add more dashboards. New modules should follow the existing separation of duties.

Older `docs/lacking-of-the-system` notes are not a reliable current backlog: several capabilities described there as absent now exist, including booking/payment workflows, purchase orders, preventive-maintenance asset schedules, loyalty, rate plans and stay reviews.

## Role coverage and recommended additions

| Role | Existing responsibilities and modules | Gap or next useful capability |
|---|---|---|
| Owner | Executive/financial oversight, departments, protected roles, critical policies, exceptions, audit and executive reports | Cash-control exception visibility after repairing the underlying workflow. Expense/budget or external accounting integration only if full financial management is required. |
| Admin | Users/staff governance, role visibility, rooms/catalogs, policies, audit/security events, password-reset audit, system health | No confirmed essential new admin module from this review. Verify deployment backup/restore procedures separately; absence of an app screen does not prove backups are absent. Keep operational execution with departments. |
| Manager | Reservations/room oversight, guest requests, transport supervision, task coordination, inventory/POs, approvals, reports, insights and Staff & Duty | Actual staff roster and duty assignments; shift handover visibility. Staff & Duty currently shows evidence of work, not attendance or a shift schedule. |
| Front Desk | Reservation lifecycle, walk-ins, room assignment, check-in/out, guest coordination, transportation, folio charges, collections, cash shifts, documents and daily reports | Reliable drawer close/reopen flow; structured shift handover and, if required, formal hotel business-day close. Existing daily reports are not absent. |
| Accounting | Proof review, payments, refunds, folios, adjustments, overpayment handling, reconciliation, financial documents and reports | Restore end-to-end cash reconciliation. Statement import/matching is an enhancement. GL, payables and trial balance are a separate scope decision. |
| Housekeeping | Cleaning/task lifecycle, inspections, guest requests, inventory and maintenance reporting | Approved-delivery receiving access is inconsistent with backend permissions. Lost & Found is a useful new operational module; linen/laundry tracking depends on actual operations. |
| Maintenance | Work orders, assignment/progress, diagnosis, waiting-parts/defer/resolve/close, inventory and asset service schedules | Link due asset service to an assigned work order and completed service history. Current preventive-maintenance dates provide visibility, not generated work. |
| Guest | Own bookings, booking changes/cancellation, payments/proofs, documents, service requests, transport, loyalty and completed-stay reviews | Withdrawal of a still-pending general service request. Transport cancellation and reservation-change withdrawal already have separate flows. |

Role basis: `lib/types.ts:1`, `lib/admin.ts:3–14`, `lib/permissions.ts`, and the Owner/Admin/Manager dashboard clients. Presence in a shared client does not by itself grant a role permission; API and RPC checks remain authoritative for execution.

## Confirmed incomplete workflows

### 1. High — cash-shift closing is suspended in the UI, while cash can bypass a drawer

- `components/manager/manager-dashboard-client.tsx:1` sets `CASH_SHIFT_CLOSE_SUSPENDED = true`; the close button is gated at line 1882 and a suspension notice appears at line 1906.
- `app/api/front-desk/reservations/[id]/payment/route.ts:2–3` sets `CASH_BYPASS_ACTIVE = true` and passes `p_allow_unattributed_cash` to the payment RPC.
- The backend closing path still exists: `app/api/accounting/cash-shifts/[id]/route.ts:9–13`. The apparent temporary API rejection is on a comment line, so it does not disable the route.

Impact: a complete, attributable collect → close → variance review → reopen cycle is not consistently available through the normal UI. These flags establish a source-level gap; they do not establish that money is currently missing or that the original reopen failure still reproduces.

Recommended ownership: Front Desk/Accounting operate drawers; Accounting reconciles; Manager/Owner review exceptions through the existing authority model. First reproduce and repair reopen/close behavior, then retire the bypass with meaningful payment, idempotency, reconciliation and authorization checks.

### 2. High — receiving can finalize an under-delivered purchase order

`supabase/migrations/20261014010000_inventory_replenishment_workflow.sql:65–91` accepts received quantities from zero through the ordered quantity, but unconditionally sets the entire PO to `received`. Unspecified item quantities default to the full ordered quantity. The same migration restricts receiving to approved orders and makes received orders immutable at lines 142–149. No later replacement of this receive function was found.

Impact: if partial quantities are submitted, the outstanding balance has no receiving state in this function and a second receipt cannot complete it. This is not a missing procurement module: drafting, submission, threshold approval, stock movements and auditing already exist.

Recommendation: decide explicitly between full-delivery-only receiving and cumulative partial receipts. For partial receiving, keep per-line ordered/received/outstanding quantities and finalize only when complete or explicitly short-closed with a reason.

### 3. Medium — Housekeeping receiving rights have no standard discovery/UI path

`app/api/inventory/purchase-orders/_actions.ts:7` and the receive RPC authorize Housekeeping to receive. However, purchase-order GET access in `app/api/inventory/purchase-orders/route.ts:21–27` excludes Housekeeping; the shared dashboard's `replenishmentRoles` gate at `components/manager/manager-dashboard-client.tsx:109` also excludes it.

Recommendation: either provide a scoped Approved Deliveries queue for Housekeeping, without PO creation or approval authority, or explicitly remove its receiving responsibility if receiving belongs solely to Manager. Current backend permissions suggest the first option, but operational ownership should be confirmed before implementation.

### 4. Medium — staff supervision lacks a schedule and handover model

`lib/staff-duty.ts:5–14` explicitly describes a read-only view and the absence of a shift/clock-in model. It derives activity from housekeeping tasks, maintenance orders and cash shifts. `app/api/manager/staff-duty/route.ts:14–17` exposes the Manager-only read view.

Recommendation: add roster assignments and a handover record covering unresolved arrivals/departures, guest concerns, room outages and cash exceptions. Attendance/leave are a later extension; payroll should not be bundled automatically. Keep the existing rule that login activity does not equal being on duty.

### 5. Medium — asset service dates do not create actionable maintenance work

`app/api/maintenance/assets/[id]/[action]/route.ts:8–11` explicitly states that asset actions do not create work orders or alter rooms; due dates are visibility only.

Recommendation: a Manager/Maintenance action to turn a due asset into an assigned work order, with a completion link back to the asset service record. This is an extension of an intentional current boundary, not a broken existing promise. Do not automatically block a room merely because an asset is due.

### 6. Medium — general guest requests lack self-service withdrawal

The general service-request endpoint `app/api/account/requests/route.ts:3` exposes submission. The account route inventory contains no corresponding general-request cancellation endpoint. This is distinct from existing transport cancellation in `app/api/account/transportation/[id]/cancel/route.ts` and reservation change requests.

Recommendation: allow the owner of a pending request to withdraw it before department acceptance/work begins, with version checks and an audit trail. Later-stage cancellation should pass through Front Desk and any existing charge/reversal policy.

### 7. Medium — sample reviews can appear under real-guest messaging

`lib/stay-reviews.ts:38–92` defines named, rated sample reviews and returns them when Supabase is unavailable, the query fails, or no reviews exist. `app/(landing-page)/page.tsx:89–97` renders the reviews under “Real words from real stays”; only the verified badge is suppressed for dummy entries.

Recommendation: show an honest empty/unavailable state in production. A Manager review response/flagging workflow can follow if needed; it should address abuse/privacy and preserve authentic negative feedback. This is a guest-trust issue, not evidence of fabricated records in the database.

## Useful new modules, conditional on hotel operations

- **Lost & Found:** Housekeeping logs item/location/time and secure custody; Front Desk coordinates guest claims; Manager handles disputed release/disposal. No dedicated source/schema workflow was found in the targeted search. Avoid exposing item details broadly.
- **Linen/laundry tracking:** stock issuance, collection, washing, loss and replacement when the hotel operates that workflow. Existing laundry folio charges do not constitute a linen management system.
- **Formal night audit/business-day closure:** opening/closing business date, unresolved exceptions and approved close. Daily report generation/review already exists; do not duplicate it or assume room charges need a new posting model without examining frozen nightly rates.
- **OTA/channel manager:** source explicitly documents provenance columns only, with no working sync (`SYSTEM.md:1858` onward). Add only if selling through external channels; inventory sync and failure recovery require their own project.
- **Group/corporate bookings:** multi-room coordination and consolidated billing if the hotel needs them; currently a documented future scope.
- **Full accounting/AP/budget or external integration:** appropriate only if operational payments/folios/reconciliation must expand into the hotel's complete books. Owner visibility alone is not a reason to implement a general ledger.

## Permission boundaries to preserve

Manager approval is distinct from execution: `lib/permissions.ts:41–44` assigns review to Manager, operational execution to Front Desk, and financial execution to Accounting. Admin governs accounts/configuration; Owner governs critical policies and exceptions. Neither should automatically inherit all operational write actions. Housekeeping inspection by Housekeeping is current policy, not proof that a new supervisor role is required.

## Suggested implementation order

1. Repair cash close/reopen and drawer attribution; validate reconciliation and permissions.
2. Fix PO receiving completeness and align Housekeeping's receiving UI/API scope.
3. Remove production sample-review fallback and add pending guest-request withdrawal.
4. Add Manager roster/handover, Lost & Found, and linked preventive-maintenance work in separate increments.
5. Decide separately whether OTA, group booking, linen tracking and full accounting belong in the hotel's actual operating scope.

Before implementation, validate the deployed migration ledger and run signed-in role acceptance scenarios. This assessment describes the checked-out source, not proof that every migration is deployed or every workflow succeeds live.
