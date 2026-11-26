# Haven Hotel Integration Readiness Plan

**Date:** 2026-11-23

**Status:** Hotel-side scope changes implemented locally. Partner acceptance and production cutovers are pending.

Keep Haven responsible for reservations, guest service, room readiness, the guest folio, desk collections and the Hotel operating day. Prepare the handoffs to Finance, HR, Supply Chain, Facilities, Fleet and Restaurant. Retire the standalone Hotel Accounting account after its remaining duties have authorized replacements and have passed a rehearsal.

## Hotel-side implementation

| Boundary | Local Hotel behavior | Partner dependency |
|---|---|---|
| Finance | Stay billing from the reservation, scoped Front Desk drawer, offline closed-day review and acknowledgment validation, and Owner-managed primary and backup Close Day coverage. New Accounting role assignment remains retired | Active managers designated by the Hotel Owner, Finance posting and refund acceptance, replacement coverage for remaining financial actions, then retirement of existing Accounting access |
| HR | Legacy schedule read and cancellation, operational handovers, and Hotel work assignment. Official schedule creation has moved out of Hotel | Approved employee mapping and availability sandbox |
| Supply Chain | Existing delivery receiving and PO history, with eligible cancellation. New PO creation, submission and approval have moved out of Hotel | SKU, location and PO mapping, stock opening reconciliation, and receipt acknowledgment |
| Facilities | Hotel room incidents, hold, inspection and release. Existing linked service completion remains available. Equipment registration and preventive scheduling have moved out of Hotel | Incident/work order and equipment mapping, versioned repair acknowledgment |
| Fleet and Restaurant | Existing local guest transport and breakfast operations, with provider activation controlled separately | Sandbox credentials and acceptance. Restaurant POS posting remains a separate later handoff |

## Implementation order

| Phase | Work | Completion gate |
|---|---|---|
| 0 | Confirm ownership, establish a clean local baseline, and agree the first partner contract | Each active track has an accountable Hotel owner, a partner owner, test data and a sandbox or approved dry-run process |
| 1 | Scope Front Desk finance access and remove dependency on Accounting for Hotel-only day operations | Booking through checkout works with the narrowed desk role. The designated Hotel supervisor can close an eligible day |
| 2 | Prove Finance posting and payout handoffs, then retire the standalone Hotel Accounting account | Finance accepts and reconciles the sample posting and refund. Each former Accounting-only action has an authorized disposition. An old session loses access |
| 3 | Pilot HR availability, Fleet trip updates and Restaurant breakfast redemption | Each workflow passes its own partner acceptance test before its feature is enabled |
| 4 | Transfer supplier and stock authority to SCM, and technical repair authority to Facilities | Opening records reconcile, each system has one writer for its records, and each partner acknowledges the first live handoff |
| 5 | Add Restaurant charge-to-room after the POS and Finance agree the posting model | One POS sale creates one accepted folio charge and one recognized revenue event. Corrections reconcile in all three systems |

Teams can prepare their sandbox tracks while Phases 1 and 2 are in progress. Each cutover has its own acceptance decision.

## Phase 0 Ownership and baseline

- [ ] Confirm the Hotel and partner owner and the person handling operational support for each connection. Record the authoritative writer, permitted readers, correction owner and fallback in the [ownership register](../ENTERPRISE_BOUNDARIES.md#ownership-acceptance-register).
- [ ] Review the actual migration ledger before assigning any migration number. Compare deployed RPC signatures, flags and existing release dependencies with `SYSTEM.md` and the working tree. Keep this work scoped from the pending Front Office, analytics and RBAC changes unless a dependency is verified.
- [ ] Record the local baseline for booking, arrival, checkout, charges, receipts, refund and close. Use synthetic guest, stay, shift, work-order and PO fixtures for partner QA. Record aggregate counts and references for open production work at cutover.
- [ ] Agree the first concrete partner contract using the [existing contracts and acceptance checklist](../integrations/ENTERPRISE_CONTRACTS.md). Pin version, required fields, authentication scope, credentials rotation, operation IDs, status lookup, retry conditions, corrections and support contacts. Endpoint paths and activation dates follow partner agreement.

## Phase 1 Hotel cashiering and operating day

**Front Desk**

- [ ] Inventory callers of `/api/accounting/ledger`, `/api/resources/payments`, reservation and guest detail, documents, and cash shifts. Replace the Front Desk use of hotel-wide ledger reads with authorized booking or folio lookup and current drawer or handover information. Preserve the exact historical lookup needed for a guest inquiry and audit protected document access.
- [ ] Keep guest balance, deposit/payment status, permitted charges, payment collection and receipt or folio statement issuance in the Hotel. Limit the drawer action to authorized shift custody. Move the user-facing entry points into the booking, folio and cashier workspaces as applicable. Align the API projections, action guards and sidebar using the shared permission policy.
- [ ] Verify a direct API request cannot obtain hotel-wide transactions, cash history, adjustment reasons, Finance exports, payout actions or private payment evidence with Front Desk authority. Retest new bookings, walk-ins, checkout, receipts, cancellations and authorized balance collection.

**Hotel operating day**

- [x] Implement scoped activation and close for the two Managers designated by the Owner. HTTP guards staff and Owner workspaces. PostgreSQL verifies assignment, eligibility and version and records the actor in the audit trail.
- [x] Replay existing preconditions, idempotency, posting locks, immutable snapshots, concurrent attempts and revocation in isolated PostgreSQL. Front Desk resolves operational blockers using its existing permissions.
- [ ] Assign actual primary and backup staff in the matching release. Rehearse checkout, drawer reconciliation, lost acknowledgement and an eligible Close Day on the accepted staging candidate. Agree the unresolved Finance response and correction rules before replacing Accounting coverage.

**Starting files:** `lib/authorization.ts`, `lib/permissions.ts`, `lib/accounting.ts`, `lib/staff-data.ts`, `config/role-navigation.ts`, `components/manager/manager-dashboard-client.tsx`, `app/api/accounting/ledger/route.ts`, `app/api/staff/operational-date/route.ts`, `app/api/accounting/night-audit/close/route.ts`.

## Phase 2 Finance handoff and Accounting retirement

- [x] Validate the existing closed-day review JSON and draft Finance acknowledgment offline. Test exact amounts in centavos, missing or duplicate IDs, partial rejection, and exact replay.
- [ ] Agree the actual journal import with Finance, including immutable line-level references, minor units, currency and control totals. Reconcile accepted postings, rejected lines and corrections with Finance before recording the handoff as accepted.
- [ ] Agree how Finance accepts refund requests and reports payout outcomes. Hotel retains booking-policy eligibility and any exception review. Finance owns disbursement. Hotel records confirmed refunds through a narrow, idempotent workflow that binds the original stay, refund and payment, verifies remaining refundable amount and records the Finance payout reference. Reconcile gateway cases and cash refunds, including who owns drawer impact and evidence.
- [ ] Give every former `accounting` action a disposition. Cover refunds and failed attempts, compensation and financial approvals, adjustments and reversals, overpayments, drawer discrepancy review, reconciliation, Xendit exception resolution, fee catalog changes, operational date activation/close, exports and access to legacy evidence. Keep Hotel policy and operational oversight with the designated Hotel authority. Give Finance a dedicated partner identity scoped to the accepted commands and results. Any temporary human fallback has only the individual permissions it uses.
- [ ] Test ordinary and approved-exception refunds, payout failure, exact replay, late payout acknowledgment after day close, and Finance batch import with an invalid line and linked correction. Reconcile the actual Hotel and Finance totals and verify old money records remain readable under authorized access.
- [ ] Rehearse with the Accounting account disabled. Test guest-facing steps and supervisor close, make sure exception queues still have authorized operators, and verify the old session is invalid. Before live deactivation, reconcile open refunds, pending payment reviews, drawer exceptions and exports. Retire the login through the existing deactivation flow. Keep historical actor IDs, role values and audit references. Retire future Accounting provisioning and remove its interactive workspace after the account cutover is accepted.

**Starting files:** `app/api/accounting/{adjustments,refunds,cash-exceptions,reconciliations,xendit-reconciliation,hotel-fees,exports}`, `app/api/manager/approvals/[id]/financial-execute/route.ts`, `lib/finance-export.ts`, `lib/xendit-store.ts`, existing folio, approval, refund and operating-day migrations.

**Acceptance owners:** designated Hotel supervisor, Finance lead and Hotel Admin. [Finance workflow and open decisions](../integrations/ENTERPRISE_CONTRACTS.md#3-finance-handoff)

## Phase 3 Existing partner adapters

### HR and Workforce

- [ ] Reuse `/api/integrations/workforce/availability` and the existing employee mapping. Test employment, schedule and attendance updates in the sandbox. Use immutable source, property and employee IDs and versions, and consume only fields needed for eligibility and workload.
- [ ] Pilot read-only evidence first. Verify leave, clock-out, stale data, restart/catch-up, termination during an active Hotel session and reviewed rehire. Confirm who disables the mapped Hotel account and how confirmed termination propagates to active sessions. Then consider enabling automatic Housekeeping assignment separately.
- [ ] Retire local edits that duplicate the **official** HR roster only after the feed and outage process pass. Keep Hotel task assignments, duty handover and local access governance.

[Existing Workforce receiver and activation steps](../integrations/WORKFORCE_MANAGEMENT.md)

### Fleet

- [ ] Reuse the existing Fleet request delivery, status callback and fare acknowledgment. Verify the target environment and approved endpoints and credentials before the pilot.
- [ ] Test an authorized pickup and a round trip, consent withdrawal, timeout and retry, out-of-order updates, request cancellation and fare revision after a folio charge. Compare the Hotel transport request, Fleet trip reference and folio amount.
- [ ] Route Fleet-managed rides through the provider. Keep guest requests, ride status and folio acceptance in Hotel. Retain the local path for approved hotel-operated rides and keep provider-side cancellation ownership explicit.

[Fleet handoff and existing adapter](../integrations/ENTERPRISE_CONTRACTS.md#7-fleet-request-trip-and-fare-handoff)

### Restaurant breakfast

- [ ] Pilot the existing `/api/integrations/restaurant/breakfast/v1` validate and redeem workflow. Match outlet scope, service date, guest entitlement and allowance. Verify partial redemption and retry without serving twice. Preserve the staff breakfast service workflow until partner acceptance.
- [ ] The Restaurant remains responsible for its menu, table, kitchen, tender and sale records. The Hotel owns the breakfast entitlement and any accepted charge carried on the guest folio.

[Breakfast pass handoff and test cases](../integrations/RESTAURANT_BREAKFAST_HANDOFF.md)

## Phase 4 Supply Chain and Facilities

### Supply Chain

- [ ] Map Hotel items and units to SCM SKU, unit of measure and store. Reconcile opening balances, open POs and partial receipts. Agree which records represent a request, physically counted goods, accepted receipt, rejected delivery, return or correction.
- [ ] Pilot requisition, usage and receiving acknowledgments against the existing Inventory and Purchase Order workflows. Freeze the relevant local balance and PO writers for cutover after a final reconciliation. Keep Hotel use/count evidence and receipt status available to departments.
- [ ] Verify partial acceptance, concurrent receiving/counting, correction and repeated delivery by source ID. Compare ledger totals per SKU and location and retain a visible pending queue during outages.

[SCM opening and cutover worksheet](../integrations/ENTERPRISE_CONTRACTS.md#scm-opening-and-cutover-worksheet)

### Facilities

- [ ] Map existing assets, open work orders and room blocks to Facilities references. Hotel records the incident and immediately protects the room. Facilities acknowledges, diagnoses, schedules, repairs and can reopen its work order. Hotel records inspection and releases the exact room restriction when eligible.
- [ ] Verify two independent blocks in one room, a stale completion after reopening, preventive service against a sold night, and manual follow-up during outages. Move technical work and asset master writes after the partner accepts the open work. Keep housekeeping and room readiness decisions in Hotel.

[Facilities incident and repair handoff](../integrations/ENTERPRISE_CONTRACTS.md#6-facilities-incident-and-repair-handoff)

## Phase 5 Restaurant charge-to-room

- [ ] Agree the POS sale and correction contract and the Finance posting basis. Identify the stay by its stable scoped reference. Keep Restaurant sale details and fiscal issuance under the agreed owners.
- [ ] Implement a scoped Hotel charge acceptance command using the existing folio writer. Return an acceptance or rejection tied to the Restaurant sale ID and Hotel charge ID. Use a linked correction or reversal for later changes.
- [ ] Test an eligible stay, denial after checkout for new charges, exact replay of an earlier accepted charge, approved partial reversal, unavailable folio and cross-outlet denial. Finance reconciles the Restaurant sale and Hotel collection references to one recognized revenue event.

[Restaurant charge-to-room contract](../integrations/RESTAURANT_CHARGE_TO_ROOM.md)

## Integration verification and release

| Check | Evidence to record |
|---|---|
| Authorization | Missing and revoked machine or human access, incorrect role, property or outlet, and confidentiality of private guest and staff data |
| Transaction behavior | Exact repeats produce one business effect, changed reuse is rejected, unknown outcomes resolve by saved operation ID, and corrections reference the original record |
| Database and application | Migration replay against an isolated PostgreSQL clone, app and RPC agreement, checked enum/legacy compatibility, `npm run typecheck`, ESLint on touched files, targeted Vitest, full tests and build at release checkpoints |
| Browser and real partner | Actual Hotel user and partner sandbox complete booking, checkout and the applicable handoff. Both owners confirm money, stock, task or trip results agree |
| Cutover | Approved contract version, measured pending/unmatched work, opening/final totals, secure credential exchange, migration versions, flags, effective time, operational owners and support contacts |
| Recovery | Pause the affected connection, preserve unknown/pending references, reconcile accepted writes with the partner, and resume or switch authority only after matching totals and versions |

Use existing regression harnesses where applicable, including `scripts/rbac-db-test.mjs`, `scripts/hotel-operations-db-test.mjs`, `scripts/workforce-http-db-test.mjs`, `scripts/fleet-automatic-dispatch-db-test.mjs`, `scripts/hotel-breakfast-db-test.mjs` and `scripts/inventory-replenishment-db-test.mjs`. Add tests for the new handoff behavior. Document verified outcomes in `SYSTEM.md` and the Hotel handoff after each implementation release.

## First implementation PR

Scope the Front Desk finance reads to the selected stay and authorized drawer, wire the existing Front Office screens to those projections, and verify direct API denial for property-wide financial data. List the current `accounting` dependencies in the PR and identify the owner for each transition. This slice can ship while Finance prepares its import and payout acknowledgment.
