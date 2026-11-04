# Draft improvement plan — role and module findings

Date: 2026-11-03. Status: draft for scope review; implementation has not started.

**Subsequent status:** user authorized Phases 0–5 and implementation is now local.
The proposal below is retained as the original scope. Verified outcomes, pending
remote rollout and selected defaults are recorded in
[the implementation report](ROLE-IMPROVEMENT-IMPLEMENTATION.md).

Basis: [role/module source analysis](ROLE-MODULE-GAP-ANALYSIS-2026-11-03.md). Findings describe the checkout, not verified deployed behavior. This plan preserves the eight existing roles and separates workflow repairs from new business capabilities.

## Delivery sequence

| Phase | Deliverable | Priority | Dependency / completion gate |
|---|---|---|---|
| 0 | Verify current behavior, migration state and business rules | Prerequisite | Resolve source/documentation drift and reproduce affected workflows |
| 1 | Reliable cash collection, close/reopen and reconciliation | High | Approved drawer ownership model; end-to-end cash acceptance passes |
| 2 | Accurate PO receipt quantities and scoped receiving access | High | Approved receiving policy; stock and outstanding balances reconcile |
| 3 | Honest review states and pending guest-request withdrawal | Medium | Ownership, request-state and concurrent-action checks pass |
| 4 | Staff scheduling/handover and linked preventive maintenance | Medium | Separate prototypes accepted; role and workflow acceptance passes |
| 5 | Lost & Found; evaluate other operational extensions | Conditional | Hotel confirms operating need and ownership rules |

Phases are release units, not one large release. The review fallback fix may ship independently while cash or procurement verification is in progress. Dates/effort should be estimated after Phase 0; this document does not promise an unverified delivery timeline.

## Phase 0 — establish a verified baseline

1. Re-read current target files and preserve unrelated working-tree changes.
2. Inspect the deployed migration ledger through an authorized connection before creating or numbering migrations. If unavailable, keep deployment-dependent checks open; do not assume local SQL is deployed.
3. Reproduce cash open → collect → close → open next shift and inspect the original reopen failure. Record whether the drawer is shared, staff-owned, or location-owned, using the actual schema/RPC behavior.
4. Inspect current approved/received PO data and receiving UI without editing financial or stock records. Identify whether partial receiving has already occurred and what evidence exists for historical quantities.
5. Resolve documentation drift: SYSTEM.md §7.15 describes draft-only purchasing, while source/migrations implement submit/receive. SYSTEM.md remains authoritative. Record the conflict, confirm intended behavior before expanding it, then update the reference only for verified, accepted behavior.
6. Capture a signed-in role matrix for allowed and denied actions. Use dedicated test accounts in a test environment; never assume hiding navigation enforces authorization.

Output: a short baseline checklist, reproducible failures, confirmed business rules, and a migration/data-compatibility assessment. No speculative data backfill or permission expansion.

## Phase 1 — restore cash controls

**Roles:** Front Desk and Accounting operate authorized drawers; Accounting reconciles. Manager/Owner see exceptions only within existing permissions. Admin retains configuration/account governance.

**Work:**

- Repair the actual close/reopen cause across the open route, close route, RPCs and UI; do not merely remove the suspension flag.
- Define the lifecycle as opening a new shift after closure. Do not reopen or rewrite historical closed shifts unless a separately approved correction policy requires it.
- Require server-side cash attribution to an authorized open shift. Retire `CASH_BYPASS_ACTIVE` after the complete replacement flow is verified.
- Show opening balance, expected cash, counted cash, variance, collector/drawer identity and reconciliation status. Confirm the existing expected-cash calculation before changing it.
- Serialize payment versus closure so a concurrent cash collection cannot land in a closed shift or disappear from the expected balance.
- Handle historical unattributed payments as an explicit exception queue. Accounting investigates with audit evidence; never silently attach them to an arbitrary shift or change payment totals.
- Replace temporary UI notices with clear open/closed/reconciliation states. Sign-out behavior follows the confirmed shared/individual drawer policy; do not automatically close a shared drawer on logout.

**Acceptance:**

- Authorized staff can open, collect, close with actual cash, and open the next shift successfully.
- Cash collection without an eligible open shift is rejected by the server; electronic payment flows still work.
- Retrying payment or closure does not duplicate records or totals; concurrent attempts produce one valid result.
- Variance and reconciliation figures agree with the underlying payment records, with audit history preserved.
- Unauthorized roles cannot collect, close, reconcile, or alter financial records through direct API requests.

**Primary surfaces:** `components/manager/manager-dashboard-client.tsx`, `app/api/front-desk/reservations/[id]/payment/route.ts`, `app/api/accounting/cash-shifts/`, relevant permission helpers and cash/payment migrations.

## Phase 2 — make procurement receiving complete and role-consistent

**Proposed policy for review:** support cumulative partial receipts and give Housekeeping a scoped Approved Deliveries queue, matching its existing backend receiving permission. If the hotel requires full-delivery-only receiving, reject partial input explicitly instead; do not implement both policies ambiguously.

**Work:**

- Keep a receipt header/line history linked to stable PO lines, recording actual received quantity, actor, time and retry key. Track ordered, cumulative received and outstanding quantities.
- Introduce a partial state or equivalent derived status. Finalize only when every line is complete, or when an authorized short-close records the outstanding quantity and reason.
- Require explicit received quantities. Missing lines mean no receipt, rather than assuming all ordered units arrived.
- Apply stock movements, receipt history and PO totals atomically. Reject negative quantities, quantities above the remaining amount, stale versions and duplicate processing.
- Design a separate audited correction/return path if required; do not enable arbitrary editing of completed receipts.
- Give Housekeeping only the approved/partially received deliveries and necessary receipt fields. Keep draft creation, threshold decisions and approval rights unchanged. Confirm whether vendor cost visibility is necessary.
- Preserve historical received orders. Backfill receipt history only when quantities can be proven from existing movements; mark uncertain legacy history for review instead of inventing quantities.

**Acceptance:** ordering 10 and receiving 6 adds exactly 6 to stock and leaves 4 outstanding; receiving the remaining 4 finalizes once. Retrying either receipt never doubles stock. Two simultaneous receipts cannot exceed the outstanding quantity. Housekeeping can receive eligible deliveries but cannot create/approve POs or list restricted drafts.

**Primary surfaces:** purchase-order API/list/action routes, inventory replenishment panel, shared dashboard gates, PO/stock-movement RPCs. Use a new additive migration rather than modifying applied migration files.

## Phase 3 — improve guest trust and request control

### A. Honest public reviews

- Remove sample testimonials from the production fallback. Render a restrained empty state when no reviews exist and a suitable unavailable state on retrieval failure.
- Preserve real completed-stay eligibility, masked names and verified-stay badges. Keep demo fixtures isolated from production output.
- Optional later scope: Manager response/flagging with an audit trail and privacy/abuse handling. Low ratings alone are not a removal criterion.

Acceptance: empty data, unavailable database and query errors never produce invented guest reviews; valid reviews still render correctly.

### B. Pending general-request withdrawal

- Identify eligible states in the actual batched request model. Default proposal: withdrawal before approval/department acceptance, with server-validated ownership and version checks.
- Display a Withdraw action and explain when Front Desk assistance is required. Preserve submitted details, status history and audit evidence.
- Do not apply this new endpoint to reservation-change or transportation flows, which already have their own rules.
- If a request is accepted/charged concurrently, reject withdrawal cleanly. Any existing charge must use the approved reversal/refund process; never silently delete a charge.
- Define whether an action withdraws one line or the entire batch. Proposed default: individual eligible request lines, showing the result for each line.

Acceptance: a Guest can withdraw only their own eligible request; repeated withdrawal is safe; another guest, accepted request, stale version and concurrent staff action are handled without orphaned work or financial changes.

## Phase 4 — connect people and maintenance work

### A. Manager roster and shift handover

- Prototype a weekly roster and a handover detail view using the existing design system before implementing new UI.
- Manager assigns scheduled start/end times and departments to active operational staff. Admin/Owner retain account creation, disabling and role changes.
- Show scheduled coverage separately from actual task activity. A login or scheduled shift does not prove attendance.
- Let staff view only their own schedule; Manager sees department coverage. Validate overlapping/overnight shifts using the Asia/Manila hotel day.
- Handover records link unresolved guest issues, arrivals/departures, room outages and cash exceptions to their source records. Add submission/acknowledgement and follow-up ownership without copying confidential financial details to unrelated departments.
- Keep payroll, leave balances, biometric attendance and formal business-date locking outside this first increment. Reuse existing daily reports rather than creating competing totals.

Acceptance: cross-midnight scheduling works; overlaps are handled explicitly; staff cannot edit others' schedules; handover items retain source links and acknowledgement history; scheduling never changes cash ownership automatically.

### B. Preventive maintenance linked to work orders

- Prototype a due-asset action and linked service-history view.
- Manager/Maintenance can create a linked preventive work order from a due asset. Reuse existing assignment and work-order lifecycle rules.
- Prevent duplicate open work for the same asset/service occurrence. Record service history and advance the service date only after authorized completion with an actual service date.
- Cancelling/deferring work does not mark an asset serviced. Keep room serviceability decisions on the existing authorized path; due dates alone do not block rooms.

Acceptance: one service occurrence creates one active linked order; completion produces one service entry and correct next-due date; retries, cancellation and unauthorized calls cannot advance the schedule.

## Phase 5 — add only justified operational modules

**First candidate: Lost & Found.** Prototype intake, custody history and claim/release. Housekeeping records findings; Front Desk coordinates claims; Manager handles disputed release and disposition under a confirmed hotel policy. Restrict guest/item details by role and audit custody transfers. Acceptance requires a traceable found → secured → claimed/released or authorized disposition path; no broad guest-facing item inventory.

**Separate scope decisions:** linen/laundry tracking, formal night audit/business-day closure, OTA inventory sync, group/corporate billing, and full accounting/AP/budget or external integration. For each, document the real operational problem, responsible role, lifecycle, integration needs and acceptance criteria before scheduling development. Admin backup/restore readiness belongs in deployment verification and a restore drill, not automatically a new admin module.

## Verification and release gates

- For each implemented increment: `npm run typecheck`, ESLint on touched source files, targeted Vitest covering actual business transitions and denied access. At release checkpoints run full `npm test` and `npm run build`.
- Exercise SQL/RPC behavior against a test database for cash and stock concurrency, atomicity, idempotency and migration compatibility; UI mocks alone are insufficient.
- Run manual signed-in checks for all affected roles, including direct unauthorized API calls. For new UI, verify expanded/collapsed shared navigation, desktop/mobile, keyboard/focus, loading, empty, error and stale-data states.
- Existing unrelated test failures or network-blocked builds must be reported separately; do not claim a passing release gate without running it.
- Apply additive migrations through `supabase db push` only after ledger verification and compatibility review. Never use `npm run migrate` for this work.
- For schema changes, ship backward-compatible database changes before dependent app code. Validate old/new client behavior during rollout. Prefer forward corrective migrations over destructive rollback.
- Do not roll back a cash-control fix by silently re-enabling unattributed payments. If a critical regression occurs, surface an explicit failure and use the hotel's approved continuity procedure.
- Update SYSTEM.md, role capability documentation, session notes and the handoff only with verified outcomes. Preserve unrelated in-progress UI changes.

## Decisions required before the affected implementation

| Decision | Draft recommendation | Needed for |
|---|---|---|
| Drawer ownership and logout policy | Verify existing shared/individual behavior first; preserve historical closure | Phase 1 |
| Partial receiving vs full-delivery only | Cumulative partial receipts with explicit quantities | Phase 2 |
| Housekeeping delivery ownership | Scoped receiving, no PO approval or creation | Phase 2 |
| Request batch withdrawal | Individual still-pending lines | Phase 3B |
| Scheduling vs attendance | Roster first; attendance is separate scope | Phase 4A |
| Lost & Found custody/release rules | Confirm hotel policy before schema/UI | Phase 5 |

These are proposed business rules, not decisions already approved by the user. Drafting this plan does not authorize deploying changes, changing role authority or altering historical financial/stock records.
