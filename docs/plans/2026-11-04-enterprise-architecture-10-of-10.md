# Enterprise Architecture 10/10 Implementation Plan

> **For implementers:** Use the [Executing Plans skill](C:/Users/areva/.agents/skills/executing-plans/SKILL.md), one task at a time with one agent. Apply Systematic Debugging to reproduced failures and TDD to behavior changes. Preserve existing work and report evidence at each phase gate. This document records planned work, not completed implementation.

**Goal:** Bring Haven and its proposed enterprise boundaries to the audit's 10/10 architecture criteria through singular data ownership, appropriate scope, dependable hotel workflows, accepted integration contracts and verified operating procedures.

**Architecture:** Retain the existing single-property modular Next.js/Postgres PMS and seven hotel coverage areas. Reuse protected transactions for reservations, rooms, guests, folios, stock and hotel business dates. Build thin adapters only for agreed partner systems; retain controlled local/manual workflows until reconciled ownership cutover.

**Tech Stack:** Existing Next.js App Router, React/TypeScript, NextAuth, Zod, Supabase/PostgreSQL with server-only service-role access, Vitest/jsdom and existing real-PostgreSQL test scripts. Node `>=22.22.2 <23`. No new infrastructure or dependency is assumed.

**Date / baseline:** 4 November 2026, Asia/Singapore; `main` at `a3f2438` when planned. Existing uncommitted audit/handoff/session documentation belongs to this conversation and must be preserved.

**Status:** PLAN CREATED; Tasks 1–25 are not executed by this document. This planning request does not deploy code, activate policies, grant partner access or transfer existing ownership. Earlier implementation/QA evidence remains credited with its original scope and environment.

---

## 1. What 10/10 means

The score is a review outcome, not a promise that adding these documents earns ten points. Every criterion requires accepted responsibilities and inspectable evidence. The whole-enterprise score needs the other teams' participation; the Hotel team does not implement six other enterprise applications.

| Architecture criterion | Audit baseline | Target | Evidence needed for full credit |
|---|---|---|---|
| Business-domain coverage | 1.5/2 | 2/2 | Facilities accepts building/equipment work orders; SCM accepts receiving/returns/stock controls; all seven domains have an owner and usable workflow/fallback. |
| Ownership/separation | 1/2 | 2/2 | Accepted record/process ownership, allowed writers, IDs and cutover rules; no two active authorities for the same fact. |
| Fit to property scale | 1/2 | 2/2 | Seven hotel areas retained; HR/GL/POS/procurement expansion excluded from PMS; optional chain/AI/optimization work does not block launch. |
| Integration/control design | 1/2 | 2/2 | Agreed, versioned partner contracts with authentication, idempotency, status, correction, failure and reconciliation behavior. Enabled connections pass real partner acceptance; deferred connections have explicit manual/local alternatives. |
| Delivery/operations | 1.5/2 | 2/2 | Compatible app/schema releases; fresh checks; critical hotel acceptance; full recovery rehearsal; owned operational alerts and accounting reconciliation. |

Maintain three separate outcomes: **architecture acceptance**, **local implementation/QA**, and **hosted production readiness**. Do not inflate scores for simulated integrations, unavailable partner systems or documents awaiting approval.

## 2. Source and scope rules

Read these selectively before executing affected tasks:

- `AGENTS.md`; `SYSTEM.md` sections 1, 5–7, 12–15; current handoff/status.
- `docs/audits/ENTERPRISE-MODULE-AUDIT-2026-11-04.md` for the complete requirement/ownership audit.
- `docs/ENTERPRISE_BOUNDARIES.md` and `docs/integrations/RESTAURANT_CHARGE_TO_ROOM.md`; both are proposals until the counterparties accept them.
- `docs/plans/2026-11-04-hotel-scope-integration-and-manual-acceptance.md` and its matching QA report. Reuse completed occupant, housekeeping, procurement and manual acceptance work; do not restart it.
- `nano_bots/05 Memory/Decisions.md` for existing business rules; `Known Issues.md` for relevant risks. `SYSTEM.md` remains authoritative when older notes conflict.

Already present: night-audit/operating-day controls, room assignment history, handover, local stock issue/count, folios/cash/refunds/receipts, local PO submission/approval/receiving and occupant/guest-control/housekeeping extensions. Some are locally unreleased or separately policy-gated. Verify the intended release instead of adding a second implementation.

Last audit checks, not fresh results for execution: typecheck/build passed; lint 0 errors/88 warnings; full Vitest 2,281 passed/3 failed of 2,284; isolated failed-file run 50 passed/2 failed. PO source-contract and room-rack history assertions reproduced; booking clipboard timeout passed alone. The default sandbox TEMP caused file-loading failures; workspace-local TEMP allowed tests to execute.

Only after source changes are verified should `SYSTEM.md` describe them as current behavior. Accepted enterprise decisions may enter `Decisions.md`; proposals and external dependencies must not be presented as approved policy.

### Out of scope

No microservice rewrite, general ledger/payroll/POS inside PMS, speculative ESB/event broker/API gateway, generic workflow engine, chain-wide CRM/CRS, vehicle route solver, warehouse automation, mandatory AI expansion or global sidebar redesign. Do not remove current local procurement/transport/maintenance or erase historical records merely to make a diagram cleaner.

## 3. Ownership and execution responsibilities

| Fact/process | Target authority | Hotel responsibility before/after integration | Counterparty required |
|---|---|---|---|
| Staff employment/official schedule/attendance/leave/payroll | HRMS | Current local account eligibility and task assignment; later minimal HR projection plus hotel-owned permissions | HR lead and identity administrator |
| Guest/stay/occupant/physical room/rates/folio | Hotel PMS | Remains authoritative; no guest-master copies in Restaurant/Fleet | Hotel operational owner |
| Stock/SKU/UOM/supplier/PO/receipt/return | SCM after measured handoff | Current atomic local ledger/PO remains authoritative until cutover; later usage/count/requisition evidence | SCM lead, stores owner, Finance |
| GL/AP/enterprise AR/credit/bank settlement/tax policy | Finance | Source hotel transactions, operational guest balance and acknowledged exports/transfers | Finance lead/accountant |
| Restaurant order/check/menu/kitchen/sale | Restaurant | Minimal stay lookup, accepted folio charge, controlled correction and hotel collection | Restaurant/POS lead and Finance |
| Building asset/repair/preventive work | Facilities | Current local room maintenance remains until handoff; PMS always owns immediate room blocks and final readiness | Facilities lead |
| Vehicle/driver/dispatch/trip/final-fare evidence | Fleet | Current request/local coordination remains until handoff; PMS owns guest promise and accepted folio charge | Fleet/provider lead |
| Private document storage/retention enforcement | Shared platform; record meaning/access remains domain-owned | Hotel governs hotel guest-ID/proof/document access; storage is not a public cross-domain archive | Platform/records owner |

“Lead” is a role assignment, not a claim someone has accepted it. Record an actual accountable person/support contact before enabling the dependent connection. Do not send messages to teams from tools unless the user separately instructs that communication.

## 4. Work packages and gates

| Phase | Tasks | Deliverable | Gate |
|---|---|---|---|
| 0 — Establish baseline | 1 | Verified scope, runtime and known failures | G0: repeatable local checks and owned test environment |
| 1 — Set boundaries | 2–3 | Accepted ownership and minimum enterprise process definitions | G1: no conflicting authority; pending partner decisions explicit |
| 2 — Stabilize core | 4–7 | Reproduced failures resolved, gateway path and hotel invariants verified | G2: appropriate local checks green; unaccepted automatic payment path disabled |
| 3 — Align Hotel modules | 8–14 | Supplies/team, access, stock, maintenance, documents, reporting and policy acceptance | G3: seven hotel areas have accurate scope and accepted critical journeys |
| 4 — Finance/Restaurant connection | 15–18 | Controlled Finance handoff and first real partner integration | G4: enabled flows reconcile once; manual alternatives retained until acceptance |
| 5 — Other partner handoffs | 19–22 | HR/SCM/Facilities/Fleet adapters as counterparties become ready | G5: each ownership cutover individually accepted |
| 6 — Operate and rescore | 23–25 | Recovery, controlled rollout and evidence-based architecture review | G6: all applicable criteria accepted; remaining scope honestly classified |

Execute local work through G3 while contract discussions remain pending. Task 23 recovery documentation can begin after Task 2; perform its rehearsal before Task 24. Task 15 can use a controlled export before API readiness. Tasks 17–22 require actual counterparties and are not satisfied by empty routes, mock receivers or status labels. An unavailable partner blocks its activation/cutover, not independent Hotel work.

## 5. Shared execution method and commands

Each task below is a work package. Its numbered steps are individual actions; split each named test case/fix into a small red→green step rather than implementing the package in one large change. For a behavior change: reproduce or add one meaningful failing test, make the smallest shared-authority fix, rerun that test, then the affected suite. Real money/stock/concurrency correctness requires real PostgreSQL evidence, not mock-call assertions. Documentation-only tasks use content/contract review rather than artificial unit tests.

At a completed code checkpoint run typecheck, touched-file ESLint, affected Vitest, then full tests/build. Finish gates without broad unrelated rewrites. Make a focused local commit only when committing is within the execution session's scope; never include earlier uncommitted work by blanket staging. No commit/push is performed by plan creation.

### Supported runtime and repeatable local tests

From `C:\Projects\HOTEL-MANAGEMENT`, use installed supported Node or the existing local runtime when present:

```powershell
$taskNodeDirectory = Join-Path (Get-Location) '.tmp\hotel-remaining\node22'
if (Test-Path -LiteralPath (Join-Path $taskNodeDirectory 'node.exe')) {
    $env:Path = $taskNodeDirectory + ';' + $env:Path
}
$taskNodeVersion = [version]((node --version) -replace '^v', '')
if ($taskNodeVersion.Major -ne 22 -or $taskNodeVersion -lt [version]'22.22.2') {
    throw 'Use Node >=22.22.2 <23 before running repository checks.'
}
$taskTempDirectory = Join-Path (Get-Location) '.tmp\architecture-10of10\temp'
New-Item -ItemType Directory -Path $taskTempDirectory -Force | Out-Null
$env:TEMP = $taskTempDirectory
$env:TMP = $taskTempDirectory
node --version
npm --version
```

The guard checks the minimum patch version as well as the supported major. TEMP/PATH changes are process-local. Keep logs under ignored `.tmp/architecture-10of10/`; no credentials or guest records in tracked evidence.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Do not run build simultaneously with TypeScript checks that consume generated Next types. Run database reset/replay suites sequentially against an owned isolated loopback target. Existing helpers use different ports/baselines: `hotel-db-test-helpers.mjs` uses loopback 55432; `prepare-hms-test-db.mjs` uses loopback 55439. Inspect each helper before executing, select its intended fixture and never substitute a hosted connection. Do not use QA-reset or live-system scripts as generic unit tests.

Migrations: draft unnumbered SQL under `docs/sql/` if needed; allocate a new additive `supabase/migrations/<verified-version>_<purpose>.sql` only after reading the live ledger and remote definitions. The placeholder describes a naming rule, not a filename to create. Use `supabase db push` only with a reviewed release manifest and scope; never `npm run migrate` or a blind root push. Do not edit released migration history.

## Phase 0 — Establish baseline

### Task 1: Record a safe executable starting point

**Owner:** Hotel engineering. **Depends on:** none.

**Files:** Read `AGENTS.md`, `SYSTEM.md`, `package.json`, current memory and the audit. Create `docs/qa/enterprise-architecture-acceptance-2026-11-04.md` as the single accumulating evidence register. Preserve the existing audit and all pre-existing dirty paths.

1. Record commit, dirty paths and which session owns each change; use `git status --short` and `git log -1 --format='%h %s'`.
2. Set the supported runtime/workspace TEMP as above and record versions without environment secrets.
3. Reproduce the known failures with `npx vitest run lib/purchase-orders.test.ts components/front-desk/fused-room-rack-panel.test.tsx components/booking/confirm-booking-form.test.tsx --maxWorkers=1`.
4. Record exact test names/results; classify source assertion, UI behavior, timeout or environment failure without prematurely deciding the repair.
5. Verify the available local PostgreSQL fixtures/helpers and intended browser environment; label unavailable external/live checks NOT RUN.

**Validation:** G0 has real command output, a safe local-test target and no lost unrelated work. No passing test count is inherited as a fresh result.

## Phase 1 — Set boundaries before moving authority

### Task 2: Turn proposed ownership into an explicit acceptance register

**Owner:** Hotel architecture lead; accountable domain leads accept their rows. **Depends on:** 1.

**Files:** Modify `docs/ENTERPRISE_BOUNDARIES.md`; record results in the acceptance register. Update `Decisions.md` only for decisions actually accepted. No runtime change.

1. Add an acceptance column to each ownership row: proposed/accepted, accountable role/person, date and evidence reference.
2. For each shared record list the final owner, originating requester, permitted writer, immutable ID, copied fields and correction authority. Split combined facts such as “hotel payment” vs “Finance journal”.
3. Assign document bytes to shared storage but record access/retention decisions to the source domain; assign principal authentication separately from employee master and Hotel permissions.
4. Record retained local authority and effective handoff condition for stock/POs, maintenance and transport. No removal or simultaneous dual authority.
5. Record the seven Hotel areas and optional exclusions; HR/GL/POS/provider ERP is external scope.

**Validation:** Every business fact has one final write authority; no blank accountable owner for an enabled flow. Unaccepted external rows remain visible dependencies. Review against audit Part 2/8; no unit test is needed for a prose ownership table.

### Task 3: Define the missing enterprise workflows and partner readiness checklist

**Owner:** Facilities/SCM leads for their business processes; Hotel lead for request/response boundaries. **Depends on:** 2.

**Files:** Create `docs/integrations/ENTERPRISE_CONTRACTS.md`, incorporating Finance/HR/SCM/Facilities/Fleet contracts from audit Part 7. Reference the existing Restaurant contract rather than duplicate it.

1. Define Facilities incident→diagnosis→assignment→repair→verification→reopen; equipment/service schedule and PMS block/release acknowledgment.
2. Define SCM requisition→approved PO→partial/accepted/rejected receipt→return→Finance invoice matching. Capture UOM, location and single stock effect.
3. Add a readiness checklist per counterparty: owner/support, identity/authentication, schema/version, stable IDs, sandbox, paging/change cursor, retries/status query, corrections, outage rules and reconciliation.
4. Specify source occurrence time vs Hotel posting date vs Finance accounting date; no late-message backdating of closed history.
5. Give every unavailable API a controlled local/manual alternative and adoption trigger. No implementation of the other teams' work-order, HR or procurement systems inside Haven.

**Validation:** G1 has complete process definitions and accepted local boundaries. Partner inputs may remain pending; their runtime tasks stay conditional. The proposed event names are not advertised as active integrations.

## Phase 2 — Stabilize existing Hotel behavior

### Task 4: Resolve the purchase-order surface assertion without weakening receiving controls

**Owner:** Hotel supplies engineer. **Depends on:** 1; can proceed while external rows await acceptance.

**Files:** Inspect `lib/purchase-orders.test.ts`, `components/manager/manager-dashboard-client.tsx`, `components/manager/inventory-replenishment-panel.tsx`, PO routes under `app/api/inventory/purchase-orders/` and latest receipt SQL including `20261104020000_inventory_receipt_stock_status.sql`. Modify only the test/current receive UI or shared authority actually responsible.

1. Run `npx vitest run lib/purchase-orders.test.ts` and identify the expected partial-delivery information and current rendering component.
2. Render an approved order with 10 ordered/4 received and inspect whether remaining quantity and next-delivery behavior are visible. If behavior is absent, write its failing rendered interaction test; if only the scan location is stale, replace it with the scoped user-visible assertion.
3. Verify receipt of 3 more changes cumulative received to 7 and stock by 3, retains order history and still permits only the remaining quantity. Duplicate retry adds zero extra stock; over-receipt fails atomically.
4. Repair the smallest responsible path; preserve approval thresholds, roles, historical unknown receipt details and vendor-optional draft behavior.
5. Run `npx vitest run lib/purchase-orders.test.ts lib/hms-workflow-routes.test.ts`; run the existing `scripts/inventory-replenishment-db-test.mjs` only after its isolated-fixture preflight.

**Validation:** Meaningful UI/real-SQL checks pass. Do not fix this by pasting an expected sentence into unrelated source or deleting the receipt assertions.

### Task 5: Resolve reservation-history refresh/default-view behavior

**Owner:** Front Office engineer. **Depends on:** 1.

**Files:** Inspect/modify `components/front-desk/fused-room-rack-panel.test.tsx`, `components/front-desk/fused-room-rack-panel.tsx`, `components/front-desk/board-reservation-tabs.tsx`, `hooks/use-front-office-rack.ts` and `components/manager/manager-reservations-panel.test.tsx` as needed.

1. Run `npx vitest run components/front-desk/fused-room-rack-panel.test.tsx` and locate the actual table/view labels and history scope.
2. Use a rendered test with an explicit requested workspace/view, a stable test clock and appropriate history endpoint response. Select history through the real UI if that is the approved interaction; do not assume all reservations appear in the default room calendar.
3. Mutate the synthetic folio/terminal status, increment `refreshVersion`, and assert the selected workspace/filter is retained and refreshed history shows the new status exactly once.
4. If the implementation loses selection or does not refresh, fix the shared reload/history path. If only fixture/view expectations are outdated, correct the test while retaining refresh coverage.
5. Run `npx vitest run components/front-desk/fused-room-rack-panel.test.tsx components/manager/manager-reservations-panel.test.tsx lib/reservation-workspace.test.ts`.

**Validation:** Both the requested view and post-mutation history are verified. Do not change the user's approved seven-day room-calendar default to satisfy an obsolete fixture.

### Task 6: Make provider-shaped payment confirmation trustworthy

**Owner:** Billing engineer. **Depends on:** 1; provider contract/sandbox for final activation.

**Files:** Modify `lib/gateway.ts`, `lib/gateway-store.ts`, `lib/paymongo.test.ts` and `app/api/webhooks/payments/route.ts` only where the shared path requires it. Extend an existing real-PostgreSQL suite or add `scripts/gateway-settlement-db-test.mjs` if no suitable protected fixture exists. Add SQL only for a demonstrated missing invariant/recovery record.

1. Add a failing parser test using the provider's actual `data.attributes.type` envelope. Stop constructing paid-event fixtures with an invented top-level discriminator. The [official event examples](https://docs.paymongo.com/docs/developer-tools-webhooks-events) are the contract reference, not authority to skip signature/resource validation.
2. Add one shared event-type reader and route all discriminator decisions through it. A complete minimal reader and its initial test are specified below; they cover event location only, not complete payment validation.
3. Test the production handler with a correctly signed raw body and real test-database settlement. Verify event/resource type, stable session/payment mapping, integer amount, expected currency, configured test/live mode and authoritative provider paid state. Missing/ambiguous payment evidence must fail or enter verification/recovery, never confirm optimistically.
4. Remove `source.chargeable` from final-paid handling unless provider documentation and an accepted provider-status lookup establish actual collected money. Failures/refund events must not enter the paid-confirmation branch.
5. Verify same event retry and distinct paid events describing the same payment produce one receipt, one reservation transition and one accepted money effect. Keep DB locking/idempotency authoritative; a mocked RPC invocation does not prove this.
6. Cover provider-paid after hold expiry, last-room conflict and unknown reference with a durable owned recovery case. Never drop a valid financial event with a successful ignored acknowledgment merely because booking confirmation is impossible.
7. Exercise the actual provider sandbox, including bad signature, wrong amount/currency/mode, duplicate and failed payment. Keep automatic confirmation unenabled until accepted; retain verified manual methods as a separately accepted flow.

**Initial minimal code for the discriminator, added to existing `lib/gateway.ts`:**

```typescript
export function gatewayEventType(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const data = (event as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const attributes = (data as { attributes?: unknown }).attributes;
  if (!attributes || typeof attributes !== "object") return null;
  const type = (attributes as { type?: unknown }).type;
  return typeof type === "string" && type.length > 0 ? type : null;
}
```

**Initial regression, in the existing Vitest file with the new export imported:**

```typescript
it("reads the business event type from the provider envelope", () => {
  expect(gatewayEventType({
    data: {
      id: "evt_architecture_test",
      type: "event",
      attributes: { type: "checkout_session.payment.paid" },
    },
  })).toBe("checkout_session.payment.paid");
  expect(gatewayEventType({ type: "payment.paid" })).toBeNull();
  expect(gatewayEventType(null)).toBeNull();
});
```

**Validation:** `npx vitest run lib/paymongo.test.ts` plus real settlement/race checks and signed provider sandbox evidence. The earlier implementation explicitly excluded this envelope repair; this plan includes it as proposed future scope, not a claim it was already authorized/executed in that earlier batch. Provider delivery has finite retries; retain payment-status reconciliation per the [delivery reference](https://docs.paymongo.com/reference/webhook-resource).

### Task 7: Verify critical reservation, money, stock and day-close invariants

**Owner:** Hotel engineering + Front Desk/Accounting acceptance owners. **Depends on:** 4–6 for enabled gateway; independent manual-money checks may proceed earlier.

**Files:** Reuse `lib/accounting.test.ts`, `lib/cancellation-folio.test.ts`, `lib/hotel-operations.test.ts`, `lib/hotel-operations-route.test.ts`, `lib/hms-workflow-routes.test.ts`; relevant UI tests; existing `scripts/test-hms-integrity.mjs`, `scripts/hotel-operations-db-test.mjs`, `scripts/hotel-availability-db-test.mjs`, `scripts/cancellation-folio-db-test.mjs`. Record evidence in the acceptance register.

1. Prove concurrent last-room booking has one winner and the losing payer has a visible recovery path if money was already collected.
2. Prove collection/receipt save together, count/close cannot race money into the wrong drawer, and refund retry cannot exceed received/unrefunded funds.
3. Prove cancellation/no-show creates the approved fee/released obligation/credit without erasing independent transport charges or changing frozen policy.
4. Prove stock issue/task fulfillment has one movement, stale count is rejected and failed consumption rolls back its effect.
5. Prove financial posting/day close serialize, repeated close advances once, closed snapshots remain immutable and close adds no duplicate room obligation.
6. Run the listed affected Vitest files together, then full checks. Run each real-SQL helper sequentially only on its validated fixture; record cases, not merely “SQL passed”.

**Validation:** G2 has green applicable local checks and no unaccepted automatically enabled payment path. Any remaining failure has a concrete acceptance blocker and owner; no broad timeout increase or weakened assertions as a substitute for diagnosis.

## Phase 3 — Align the seven Hotel modules

### Task 8: Clarify the Hotel module map without restructuring working screens

**Owner:** Hotel product/architecture lead. **Depends on:** 2; code checks from 4–5 before changing their surfaces.

**Files:** Modify `docs/ENTERPRISE_BOUNDARIES.md`; current-behavior sections of `SYSTEM.md` only when verified. Inspect `lib/types.ts`, `lib/permissions.ts`, `components/manager/manager-dashboard-client.tsx`, `components/manager/staff-duty-panel.tsx`, `components/manager/operational-handover-panel.tsx`. Read `DESIGN.md` before any user-visible copy change. No new screen is assumed.

1. Map every official Hotel heading to existing routes/domain code/screens and its data authority; keep all seven headings traceable for project evaluation.
2. Document “Inventory & Staff Management” as **Hotel Supplies & Team Operations** in the internal architecture. Preserve the official label as an alias where institution/team requirements need it.
3. State that supplies evidence and team workload are separate internal responsibilities; a joint workspace does not merge employee and stock masters.
4. If current help/copy claims payroll, official attendance or supplier transmission, correct that exact misleading statement. Do not rename public API resources/tables or redesign the navigation merely for this plan.
5. Review current roles against the map so each role sees appropriate actions rather than every architecture module.

**Validation:** Seven areas map to real behavior; no workflow disappears and no additional HR/SCM/GL authority is implied. If TSX changed, run its existing component/navigation tests, touched-file ESLint and typecheck; verify the changed text in a browser.

### Task 9: Establish staff identity and Hotel permission boundaries

**Owner:** Hotel Admin/security owner; HR lead supplies future eligibility. **Depends on:** 2, 8; external synchronization remains Task 19.

**Files:** Inspect `lib/auth.ts`, `lib/permissions.ts`, `lib/staff-duty.ts`, relevant Admin account routes and current `user_accounts`/staff-mirror functions. Reuse `lib/auth-authorize-policy.test.ts`, `lib/security-policy.test.ts`, `lib/staff-duty.test.ts` and current account-disable tests. Do not add an HR employee-master table to PMS.

1. Document current local principal/account and staff-mirror IDs vs future external `employeeId`; assign one explicit mapping instead of joining by name/email.
2. Add/confirm tests that disabled/deactivated accounts cannot act using an existing session and cannot receive new task assignments.
3. Test that guest→staff conversion retains existing protected history rules and cannot be simulated by a plain role-label edit.
4. Verify hotel role grants/revocation are local audited decisions; HR active status alone cannot grant Accounting/Admin rights. Preserve permission checks in both route and protected DB operation.
5. Define temporary local provisioning while HR is absent, emergency disable ownership and maximum acceptable eligibility staleness for a future adapter. Use configurable/approved policy, not an invented indefinite grace period.

**Validation:** `npx vitest run lib/auth-authorize-policy.test.ts lib/security-policy.test.ts lib/staff-duty.test.ts lib/guest-staff-conversion.test.ts lib/guest-staff-conversion-with-history.test.ts` passes. Signed-in disable/reload and forbidden financial action are verified in the intended isolated browser environment. No payroll/attendance capability is introduced.

### Task 10: Establish one stock authority and a safe SCM transition

**Owner:** Hotel supplies owner + SCM/stores lead. **Depends on:** 2–4, 7; no ownership transfer before Task 20.

**Files:** Inspect `app/api/inventory/movements/route.ts`, `components/manager/stock-integrity-panel.tsx`, PO lifecycle routes, `supabase/migrations/20261103080000_hms_integrity.sql` and later overrides. Modify `docs/ENTERPRISE_BOUNDARIES.md` and SCM contract section only unless a reproduced invariant fails.

1. Inventory every writer of local stock; trace task fulfillment, direct issue/count and PO receiving to the current protected authority. Confirm generic quantity PATCH stays blocked.
2. Define SKU/UOM/location mappings, opening count and open-PO/receipt mapping required for SCM adoption. If current source lacks locations, document a single Hotel store as the initial mapping; do not build a warehouse hierarchy without need.
3. Specify cutover: reconcile counts/open movements → pause conflicting writers → record exact effective authority/version → switch writes → reconcile first acknowledgments. Never run two active quantity writers.
4. Specify offline behavior: recorded pending/provisional use, approved operating limit and later submission with the original operation ID; an SCM balance cache is explicitly stale until refreshed.
5. Verify one task/request consumption maps to one movement and acknowledgment never deducts again. Linen laundry custody is not automatically consumption; return/transfer is a linked movement, not arbitrary balance editing.

**Validation:** Existing real-stock cases from Task 7 pass; cutover worksheet has totals and reversal/fallback ownership. Use local authority until actual SCM acceptance. A documented mapping does not claim an SCM connection.

### Task 11: Separate Facilities repair from Hotel readiness

**Owner:** Hotel room operations + Facilities lead. **Depends on:** 2–3, 7; external adapter is Task 21.

**Files:** Inspect `lib/maintenance-operations.test.ts`, `lib/room-discrepancies.ts`, `lib/housekeeping-service.ts`, `app/api/maintenance/orders/`, `app/api/housekeeping/`, `app/api/front-desk/room-discrepancies/[id]/resolve/route.ts` and latest maintenance/readiness SQL. Modify Facilities contract and affected source only for reproduced gaps.

1. Record room dimensions separately: occupancy, cleanliness/inspection, guest service condition, safety/repair restriction and inventory availability. Specify each block's assignment/sale/reporting effect.
2. Prove urgent local safety blocking works without an external response, including an occupied room incident requiring Front Desk escalation/relocation.
3. Prove repair completion removes only the relevant repair restriction and does not automatically set clean/inspected/available while another blocker remains.
4. Prove a late older repair-completed event cannot override a reopened unsafe incident; planned preventive service does not silently cancel sold room nights.
5. Record existing local work-order authority and open incident mapping needed for Facilities handoff. Vehicle maintenance remains Fleet, not a second Facilities ledger.

**Validation:** `npx vitest run lib/maintenance-operations.test.ts lib/housekeeping-workflow.test.ts lib/housekeeping-action-routes.test.ts lib/hotel-operations-route.test.ts` plus the relevant real-SQL incident/inspection/release scenario. No new preventive-assets module is needed solely for Hotel scope.

### Task 12: Govern private documents and retention without building another archive

**Owner:** Platform/storage owner + originating domain owner. **Depends on:** 2, 9.

**Files:** Inspect `lib/payment-proof.ts`, private-document access in `lib/customer.ts`, `app/api/booking/payments/[id]/proof/route.ts`, `app/api/front-desk/reservations/[id]/identity/route.ts`, `app/api/staff/reservations/[id]/verify-id/route.ts`, receipt routes and existing storage policies/migrations. Document operations in Task 23's runbook; extend existing relevant route tests only for missing behavior.

1. Register each existing bucket/object category: owning domain, record link, allowed roles, retention approver, legal-hold mechanism and backup coverage. No secrets, IDs, guest names or object access URLs in tracked examples.
2. Verify another guest/role/disabled account cannot fetch a private proof/ID by changing a URL or record ID. Prove server-side ownership authorization precedes link issuance/download.
3. Verify supported type/size/upload handling and short-lived authorized access; inspect public-bucket and signed-link expiry configuration. Choose exact limits with the current property/provider policy.
4. Preserve original document snapshots and review/version linkage; replacement evidence invalidates its prior approval as current rules require.
5. Record retention/hold/disposal rules for approval, with unknown periods remaining unset. Never delete/backfill existing records under an invented retention rule. Restore object bytes and metadata together in Task 23.

**Validation:** Unauthorized cross-record requests fail without content disclosure; authorized roles can view the exact current evidence; issued receipt/invoice history remains stable. Document storage remains shared infrastructure while access decisions remain domain-owned.

### Task 13: Align financial definitions, fiscal ownership and operational reporting

**Owner:** Hotel Accounting/reporting owner + Finance/accountant. **Depends on:** 2, 7; export implementation is Task 15.

**Files:** Inspect/modify `lib/accounting.ts`, `lib/front-desk-reports.ts`, `components/manager/performance-reports.tsx`, `lib/hotel-operations.ts`, `lib/receipt.ts` and existing issued-document SQL only where a verified correction is needed. Add the Finance contract section to `docs/integrations/ENTERPRISE_CONTRACTS.md`.

1. Define separate measures for room obligation/accrual, extra charges, deposits, collections, refunds, credits, remaining guest balance and Finance-recognized revenue/profit.
2. Record ADR/RevPAR/occupancy numerator, denominator, date basis, excluded room-night types, tax/service-charge basis, zero-denominator display and source query. Preserve approved booked-night vs physical-rack definitions and label historical capacity limitations.
3. Obtain actual entity-specific fiscal issuer/numbering/correction and tax/service-charge policy acceptance. PMS and Finance must not issue two fiscal invoices for one sale. Do not invent rates, exemptions or retention periods.
4. Define deposit liability/recognition and corporate AR transfer acknowledgment. Pending export/transfer is not collected money or automatically settled debt.
5. Select one Restaurant revenue model: POS exports sales/tax and PMS exports guest receivable/clearing/collection (preferred starting design), or agreed PMS consolidation with POS revenue excluded. Document legal-entity implications before posting.
6. Correct only demonstrably misleading labels/calculation paths and add source-total regression cases for those changes.

**Validation:** `npx vitest run lib/accounting.test.ts lib/front-desk-reports.test.ts lib/receipt.test.ts lib/hotel-operations.test.ts components/manager/performance-reports.test.tsx`. Closed-day/source totals reconcile; no report claims operational collections are profit. Unaccepted fiscal policy blocks fiscal activation, not documentation completion.

### Task 14: Complete scoped Hotel role/device/policy acceptance

**Owner:** Hotel operational owner + Front Desk, Housekeeping, Accounting, Manager/Admin/Owner representatives. **Depends on:** 7–13 as applicable.

**Files:** Reuse `docs/qa/hotel-scope-integration-and-manual-acceptance-2026-11-04.md`, `docs/qa/cancellation-folio-browser-qa-2026-11-03.md` and the matching existing implementation plans. Store new results in the acceptance register; inspect/fix existing routes/components only for reproduced defects.

1. Reuse earlier evidence for unchanged flows and explicitly rerun flows affected by the merged changes; populate synthetic records so action journeys can be exercised.
2. Verify occupant edit/solo confirmation, optional companion CRM link, identity/age evidence and restricted emergency occupancy. Adopt register/age effective dates only through the existing authorized policy controls.
3. Verify guest flags/override redaction, reviewed merge refusals/history and disabled staff using affected paths; no real guest merge.
4. Verify DND across room move, declined/late service, discrepancy investigation and final readiness without false clean/checkout transitions.
5. Verify staff/guest folio and cancellation/refund views, operational handover acknowledgment and cash/night-close role split on desktop and 390px phone; include keyboard/focus/error/retry behavior.
6. Record PASS/FAIL/NOT RUN/DEPENDENCY PENDING with environment, role, actual observed result and evidence. Do not label jsdom/API/SQL checks as browser completion. Existing Playwright configuration is not proof of a working authenticated runner; use a verified harness or personal browser QA with explicit limits.

**Validation:** G3 has accepted critical Hotel flows and policy status separately recorded. No blanket requirement to build groups, OTA, AI, loyalty expansion or a new roster before core acceptance.

## Phase 4 — Finance and Restaurant integration

### Task 15: Implement a controlled Finance export and acknowledgment first

**Owner:** Hotel Billing adapter owner + Finance posting owner. **Depends on:** 2–3, 7, 13; accepted Finance format/account/tax mappings.

**Files:** Create `lib/finance-export.ts`, `lib/finance-export.test.ts` and, if a staff download/status interface is needed, `app/api/accounting/exports/route.ts`. Reuse `lib/financial-route.ts`, existing ledger/close/source IDs and audit. Draft SQL at `docs/sql/finance-export.sql` only if durable batch/acknowledgment state cannot be safely represented by existing supported records.

1. Agree export granularity, accepted schema, accounting mappings and cutover opening balances with Finance. Include property, source/effect ID, source document, business/occurrence dates, category, amountMinor, currency and correction linkage. No names/ID evidence unless a justified debtor record needs them.
2. Write deterministic export tests from synthetic closed-day/source facts: deposit, room obligation/allocation, extra charge, POS clearing-only line, cash/GCash/transfer, refund and reversal. Expected totals must be explicitly asserted.
3. Produce one immutable batch package with stable ID, source line references, schema/mapping version and control totals. Regenerating the same package must not create a second business posting identity.
4. Add restricted Accounting export/download and record pending/accepted/rejected status. Manual Finance import/acknowledgment is acceptable initially; record the Finance batch/journal IDs and responsible operator. Do not fabricate an acknowledgment from successful file download.
5. Reconcile source count/amount, accepted lines, rejected/unmatched lines and corrections. A correction after close is a new linked effect on the current Hotel day and appropriate Finance period, not an edited old batch.
6. If corporate direct billing is adopted, implement a separately acknowledged AR transfer; no automatic “paid” flag on queue/send. Otherwise keep it explicitly deferred.

**Validation:** `npx vitest run lib/finance-export.test.ts lib/accounting.test.ts lib/hotel-operations.test.ts`. Finance accepts a real test import and confirms no duplicate revenue/source posting on replay. Without Finance acceptance, export stays candidate/manual-review and no accounting ownership cutover occurs.

### Task 16: Ratify Restaurant authentication and charge/correction contract

**Owner:** Hotel Billing + Restaurant/POS + Finance leads. **Depends on:** 2–3, 13. Can progress alongside Task 15.

**Files:** Modify `docs/integrations/RESTAURANT_CHARGE_TO_ROOM.md`; reference Finance decisions in `docs/integrations/ENTERPRISE_CONTRACTS.md`. No runtime endpoints yet.

1. Obtain an actual partner/outlet identity, support owner, sandbox, credential-provisioning method and event/status capabilities. Use placeholder identifiers in tracked examples; keep actual credentials in existing secret storage.
2. Agree minimal lookup, authenticated stable stay reference, explicit eligibility/no-post/credit behavior, amount limits, PHP currency, source time and immutable external sale ID. Decide the exact permitted payment/charge resource types; room number is never posting authority.
3. Agree proposed lookup/post endpoints already documented plus status query and correction-request endpoint. Schema must define integer minor units, required fields, string/size limits, tax evidence, unknown outcome and error codes.
4. Confirm exact same-key replay returns the original accepted result even after checkout; changed-payload retry conflicts; new post must recheck current stay and serialize with checkout/day close.
5. Keep corrections as requests to authorized Hotel Accounting, then linked reversal and outcome. No partner direct refund, receipt deletion, tax rewriting or general account-search access.
6. Accept the Finance revenue/clearing model and offline alternative tender/manual exception reference before enabling room tender at POS.

**Validation:** Contract is marked accepted with counterparties/date/version; unresolved rows are explicit dependencies. Without these inputs, Task 17 is pending and the existing authorized manual folio charge remains the fallback. A local simulator does not satisfy this gate.

### Task 17: Implement the narrow Restaurant adapter using existing financial authority

**Owner:** Hotel Billing integration engineer. **Depends on:** 7, 9, 12–13, 16 and isolated DB fixture; Task 15's agreed Finance model.

**Files:** Create `lib/restaurant-integration.ts`, `lib/restaurant-integration.test.ts`, `app/api/integrations/restaurant/stays/route.ts`, `app/api/integrations/restaurant/folio-charges/route.ts`, `app/api/integrations/restaurant/transactions/[externalTransactionId]/route.ts`, `app/api/integrations/restaurant/reversal-requests/route.ts`, `scripts/restaurant-integration-db-test.mjs`. Draft `docs/sql/restaurant-integration.sql`; promote only after live-ledger verification. Reuse current financial guard/calculation/charge/reversal and operating-day authorities; do not grant the machine a human Accounting identity.

1. Add failing contract/auth/validation tests for the accepted Task 16 schema. Use server-derived partner/property/outlet scope and reject disabled credentials before sensitive lookup.
2. Implement only the partner authentication actually agreed. Reuse Node crypto/provider facilities or installed dependencies; do not introduce a generic gateway/SSO platform for one partner. Store only appropriate hashed credential material/references; never expose service-role credentials.
3. Add a narrow protected DB entry point that validates partner status/scope and reuses the canonical financial calculation/locking rules. If the existing wrapper assumes a human actor, reuse/extract only the necessary shared primitive and preserve separate machine and approving-human audit fields; never masquerade as Front Desk.
4. In one transaction: resolve replay identity/payload → return saved exact replay before current-stay eligibility checks → otherwise lock/recheck in-house stay/no-post/credit/current business day → post one charge/audit/effect reference. Enforce unique partner/outlet/source transaction and changed-payload conflict in DB.
5. Implement partner-scoped status query. A timeout followed by query/retry must recover the original accepted result; reject ambiguous/unknown stay matches without enumerating guest records.
6. Implement correction request state; authorized Accounting executes the existing linked reversal, with remaining-reversible cap and idempotency. Provide status to the partner; keep original charge/documents/history.
7. Add real PostgreSQL cases: concurrent duplicate vs changed payload, checkout/post in both orders, room move after lookup, partial/full reversal race, closed-day arrival and atomic rollback. HTTP tests verify status and minimal disclosure; they do not replace these real effects.
8. Perform actual POS sandbox charge/status/correction round trip and inspect both staff and guest folios plus Finance control totals. Keep room tender disabled until this passes.

**Validation:** `npx vitest run lib/restaurant-integration.test.ts lib/accounting.test.ts lib/hotel-operations-route.test.ts` plus the dedicated isolated SQL script and real partner evidence. New routes are NOT IMPLEMENTED until execution; their presence in this plan is not a working connection.

### Task 18: Add durable delivery and reconciliation only for real receiving destinations

**Owner:** Integration owner + counterpart receiver owner. **Depends on:** 15/17 and a contract requiring outgoing acknowledgment/reversal events. If synchronous response + status query is sufficient, omit unnecessary outgoing delivery and record that choice.

**Files:** When required, create `lib/integration-delivery.ts`, `lib/integration-delivery.test.ts`, `scripts/deliver-integration-events.mjs`; extend `docs/sql/restaurant-integration.sql` or a separately scoped additive migration draft. Add the actual deployed worker/scheduler entry only for the selected hosting runtime; it is not chosen in advance without an execution mechanism. Extend `lib/system-health.ts` and the existing system-health surface only for inspectable facts.

1. Save the outgoing event in the same transaction as the charge/reversal/close fact. Envelope: eventId, schemaVersion, property/source aggregate ID/version, occurredAt, correlationId and minimal business payload.
2. Track delivery per destination: event/destination, pending/leased/delivered/failed, attempt count, next attempt, bounded lease expiry, response category and accepted acknowledgment. Never treat one destination's success as all-destination completion.
3. Implement lease/reclaim to survive worker crashes, bounded backoff/jitter, `Retry-After`, permanent-error pause and operator replay using the same event ID. Receiver deduplicates event ID plus business effect identity.
4. Test transaction rollback leaves no orphan event, crashed worker becomes retryable, delivery timeout after receiver commit has one receiving effect, stale aggregate updates cannot undo newer state and multi-destination failures remain independent.
5. Add source/accepted/reversed totals and unmatched/stuck queue age. Logs include IDs/results and no credentials/guest documents. Assign an operator and a supported sender execution schedule.
6. Verify a deployed non-production worker actually sends to the partner receiver and receives acknowledgment. A database outbox table or manual local script without scheduled execution does not prove delivery readiness.

**Validation:** `npx vitest run lib/integration-delivery.test.ts lib/system-health.test.ts` plus real sender/receiver and crash/retry tests. G4 requires agreed reconciled Finance/Restaurant outcomes for enabled flows; deferred flows keep their controlled alternatives.

## Phase 5 — Integrate other enterprise teams when ready

These tasks are independent after their listed prerequisites; execute one at a time under the one-agent rule. Do not implement all four as speculative frameworks. Reuse a concrete shared delivery/auth helper only after an actual second use demonstrates it fits.

### Task 19: Implement minimal HR eligibility/schedule projection and revocation

**Owner:** HR/identity owner + Hotel access adapter owner. **Depends on:** 3, 9, accepted HR contract and sandbox; delivery capability from 18 only if needed.

**Files:** Conditional create `lib/hr-integration.ts`, `lib/hr-integration.test.ts`, `app/api/integrations/hr/events/route.ts` and a partner-supported pull/catch-up entry point only where required. Extend existing `lib/auth.ts`, staff assignment/eligibility authority and staff-duty display minimally. Add a narrowly scoped SQL draft only for external-ID/version mapping not already supported.

1. Accept minimal employeeId/principal link, name, employment state, department, source version and official schedule/availability fields. Exclude salary, health, personnel documents and attendance calculation.
2. Test create/change/termination, stale/replayed event and ambiguous principal mapping before implementation. An email/name match cannot silently claim a Hotel account.
3. Save source version/projection and mapping atomically; advance pull cursor only after the accepted page is persisted. Recovery pull reconciles missed events and pagination without regranting revoked permissions.
4. Route deactivation through current protected disable/auth-version logic so existing sessions fail and future task assignment is blocked; preserve task/financial history and reassign unfinished work explicitly.
5. Keep Hotel role grants local; HR activation/schedule updates do not promote an account or mark attendance paid. Show stale source status and apply approved bounded outage policy; local emergency disable always works.
6. Verify actual HR sandbox termination→PMS denial and rehire/reactivation→reviewed local grant. No automatically restored sensitive permission from an old mapping.

**Validation:** `npx vitest run lib/hr-integration.test.ts lib/auth-authorize-policy.test.ts lib/staff-duty.test.ts` plus protected-DB/session/browser evidence and partner catch-up round trip. Without HR readiness retain accepted local provisioning; do not advertise SSO or HR sync.

### Task 20: Transfer stock/procurement authority to SCM with reconciled opening records

**Owner:** SCM/stores + Hotel supplies adapter + Finance inventory owner. **Depends on:** 3–4, 10, accepted SCM contract/sandbox and an agreed cutover window; delivery from 18 if required.

**Files:** Conditional create `lib/supply-chain-integration.ts`, `lib/supply-chain-integration.test.ts`, `app/api/integrations/supply-chain/events/route.ts`; minimally extend current issue/count/replenishment/PO actions. Draft additive mapping/cutover SQL after inspecting existing stock/retry keys. Keep existing stock/PO records immutable or corrected through authorized operations.

1. Reconcile item/UOM/location/vendor mappings, opening physical count and open PO/partial receipt/return records. Refuse ambiguous mapping; names cannot determine SKU or UOM.
2. Test consumption/count/requisition submission, accepted/rejected status, same-key retry, delayed acknowledgment and out-of-order balances. Use original task/operation IDs, accepted quantity and one SCM movement reference.
3. Enable SCM-backed operations only after a successful opening reconciliation. Persist explicit authority/effective time so old local direct quantity writers cannot continue after activation.
4. Reconcile pending operations before cutover; do not replay historical completed issues or received POs as new movements. Record outstanding quantities and supplier/AP consequences.
5. Verify one authoritative effect for hotel use, accepted receipt, return and two-location transfer. Offline issue remains visible pending/provisional under approved rules; acknowledgment cannot decrement a second time.
6. Rehearse rollback before real adoption: if no SCM writes have occurred, revert the mode safely; after accepted SCM writes, stop/pause and reconcile forward before any authority switchback. Application rollback alone must not reactivate a competing quantity ledger.

**Validation:** `npx vitest run lib/supply-chain-integration.test.ts lib/purchase-orders.test.ts lib/hms-workflow-routes.test.ts` plus actual SCM sandbox totals/ledger and isolated concurrent issue/receipt checks. Current local ledger remains the valid authority until this task's cutover is accepted.

### Task 21: Connect Facilities work status while preserving Hotel sale-block authority

**Owner:** Facilities owner + Hotel rooms adapter owner. **Depends on:** 3, 11, accepted Facilities contract/sandbox; delivery from 18 if required.

**Files:** Conditional create `lib/facilities-integration.ts`, `lib/facilities-integration.test.ts`, `app/api/integrations/facilities/events/route.ts`; reuse existing maintenance incident and room readiness authorities. Add external work-order/block/version mapping only for this connection.

1. Map current open incidents to Facilities work-order IDs without creating duplicate work. Keep local historical records/source references.
2. Submit new hotel incidents with stable source ID; apply an immediate local safety restriction before waiting for acceptance.
3. Validate partner/property/asset/room mapping and work-order version on callbacks; accept only authoritative status, not external writes to generic room fields.
4. Record completed repair independently from inspection/readiness. Clear only that work order's restriction through Hotel rules; unresolved discrepancy, another repair or dirty/uninspected state continues to block assignment as appropriate.
5. Test completion/reopen/out-of-order events, two repairs on one room, partner outage, planned outage against sold reservations and local emergency relocation.
6. Run actual Facilities incident→repair→PMS inspection/release sandbox flow and confirm hotel availability changes once with audit evidence.

**Validation:** `npx vitest run lib/facilities-integration.test.ts lib/maintenance-operations.test.ts lib/housekeeping-action-routes.test.ts` plus real partner/DB block-and-release scenarios. There is no partner “set room ready” bypass.

### Task 22: Connect Fleet request/dispatch/fare without duplicate billing

**Owner:** Fleet/provider owner + Hotel guest-service/Billing adapter owner. **Depends on:** 3, 7, accepted Fleet contract/sandbox and current fare policy mapping; delivery from 18 if required.

**Files:** Conditional create `lib/fleet-integration.ts`, `lib/fleet-integration.test.ts`, `app/api/integrations/fleet/events/route.ts`; minimally extend `lib/transportation.ts`, current transportation transition routes, `components/manager/transportation-panel.tsx` and related guest status views if needed.

1. Map existing open guest requests, acknowledged assignments, vehicle/driver references and already posted fares. Agree estimated/assigned vs completed-trip fare semantics before changing the present assignment-time behavior.
2. Submit/cancel with stable Hotel request ID; show pending until Fleet acknowledges. Do not imply a scheduled driver from successful HTTP submission alone.
3. Handle cancellation racing dispatch/start with current acknowledged result, not a fictitious cancelled trip. A replacement booking must refer to the original rejected/cancelled request.
4. Accept final fare/version once and reference any existing Hotel charge. Difference/correction is a linked delta/reversal through Billing authority, never a second full fare.
5. Route late completed-trip fare against a closed stay to an Accounting exception; no silent reopen/backdate or arbitrary charge to the room's new occupant.
6. Verify real provider sandbox request→assignment→trip→fare→one folio effect, failed/cancelled trip and timeout-after-acceptance status recovery. For fully outsourced transport, integrate provider request/status/fare only; no vehicle/fuel ERP required.

**Validation:** `npx vitest run lib/fleet-integration.test.ts lib/transportation.test.ts components/manager/transportation-panel.test.tsx lib/accounting.test.ts` plus partner fare/reversal reconciliation. G5 records acceptance independently for HR, SCM, Facilities and Fleet; no unrelated partner is claimed ready.

## Phase 6 — Operate, release and rescore

### Task 23: Rehearse full recovery and assign actionable monitoring

**Owner:** Hosting/platform operator + Hotel duty/Accounting owners. **Depends on:** 2 for authority; begin documentation early and complete rehearsal after the applicable code/config is stable.

**Files:** Create `docs/operations/ENTERPRISE-OPERATIONS.md` as one runbook covering release, recovery, fallback and support. Reuse `lib/system-health.ts`, `lib/system-health.test.ts`, `app/api/admin/data/route.ts`, `components/admin/system-health-ledger.tsx` and current notification/job logs for measured status. Do not create a new generic monitoring application.

1. Inventory database, private objects, configuration/secrets access, deployment artifact, scheduled jobs and integration mappings/delivery state. Record backup scope and recoverability evidence, not credentials or real guest content.
2. Have the property/operator accept achievable recovery-point and recovery-time targets, provider features/cost and escalation owners. The audit's suggested one-hour/four-hour targets are not existing guarantees.
3. Restore the intended deployed database/object/config combination to isolated infrastructure. Reapply only manifest-selected upgrades; verify document links, authorization, arrivals/occupants, open folios/deposits, pending jobs and integrations.
4. Ensure the restored test instance cannot send real email/partner messages or process real payments. Resume workers only against controlled test receivers and with duplicate-effect protection.
5. Reconcile provider/Finance transactions around the recovery window; identify unknown pending money and prevent restored queued events from duplicating already accepted effects.
6. Rehearse manual desk continuity: restricted timestamped occupant/emergency list, unique manual receipt/request references, later reconciliation and disposal/access controls. No shared public guest register.
7. Configure actionable alerts for payment confirmation/recovery exceptions, lagging Hotel business date, failed required jobs, failed stock operations, integration backlog/rejection, unavailable private storage and missed backup verification. Each alert has an owner, threshold, action and resolution record; no fabricated “healthy” result from missing data.
8. Test actual alert delivery/escalation and recovery timing; identify optional features that may degrade without blocking core check-in/cash controls.

**Validation:** Runbook records measured restoration/reconciliation/notification outcomes, responsible operator, targets and unresolved gaps. `npx vitest run lib/system-health.test.ts components/admin/system-health-view.test.tsx` where source changed. Backup job success alone does not satisfy recovery acceptance.

### Task 24: Release a compatible Hotel increment, then activate each partner separately

**Owner:** Hotel release operator + operational/Finance owner. **Depends on:** G0–G3, applicable partner gates G4/G5 and Task 23; fiscal/policy acceptance for affected features.

**Files:** Use the accumulating acceptance register and runbook; inspect `scripts/hms-scoped-push.mjs` before reuse because its existing allowlist is specific to an earlier release. Update `SYSTEM.md` and memory only to reflect verified outcomes. Do not extend an old migration allowlist blindly.

1. Record intended application commit/build, source migrations, actual live ledger/object definitions, exact pending manifest, held files and app/schema compatibility. Historical 112/120 counts are not the live answer.
2. Rehearse deployed-order upgrade from a fresh isolated restoration; run current protected SQL and relevant role/browser journeys. Record any database extension prerequisites and prohibit live fixture/reset scripts.
3. Run final `npm run typecheck`, explicit touched-file ESLint, full `npm test`, `npm run lint`, `npm run build`, `git diff --check` and applicable real-SQL suites. Resolve failures; record remaining accepted warnings. Do not run a narrower subset and claim the full gate passed.
4. Prepare the concrete release checklist: maintenance/traffic strategy, verified backup, additive manifest, compatible app, non-destructive rollback/forward repair, operator/support and smoke cases. Use the execution session's actual deployment authorization; if it does not cover hosted release, finish the reviewable package and leave deployment pending.
5. Apply only the reviewed migration scope with `supabase db push`, deploy the matching app and verify role/public/storage/payment controls before traffic reopen. A migration itself must not activate register/age/payment/partner policy unexpectedly.
6. Activate property policies and partners separately under the accepted owner/config. Verify real endpoint/auth, event acknowledgment and opening reconciliation; keep unaccepted gateway/room-tender/stock cutover disabled.
7. Monitor initial operating cycle and day close, payment/stock exceptions, receiver backlog and Finance totals. Revert a broken application safely only if compatible; after data ownership changes, pause and reconcile before switchback.
8. Record hosted smoke results, actual app/schema identifiers, active policies/integrations and remaining manual operations. Preserve private release logs outside tracked docs; no secrets.

**Validation:** Intended increment runs against the intended schema; required checks/role acceptance and recovery gates have evidence. Each active partner is independently accepted; no activation is inferred from deployed code, stored credentials or a proposal document.

### Task 25: Re-audit against the five criteria and record the actual score

**Owner:** Hotel architecture/product owner with each affected domain owner. **Depends on:** applicable preceding gates; unimplemented optional/partner work has accepted scope/fallback.

**Files:** Complete `docs/qa/enterprise-architecture-acceptance-2026-11-04.md`; append a dated reassessment to `docs/audits/ENTERPRISE-MODULE-AUDIT-2026-11-04.md` without rewriting the historical baseline as if it had always passed. Refresh current handoff and a scoped session note; accepted decisions only in `Decisions.md`.

1. Review every source-of-truth row: one authority, actual writer paths, domain-approved corrections and retained local/manual alternatives. Explicitly identify any remaining dual writer.
2. Review external workflows: Facilities/SCM process owner and evidence, accepted interface/control design and concrete manual fallback where an adapter is deferred. The Hotel team's success does not certify unseen partner implementations.
3. Trace each claimed capability through definition → source implementation → tests → actual acceptance → hosted status → policy activation, recording NOT IMPLEMENTED/NOT RUN where appropriate.
4. Review the five acceptance scenarios in section 6 and all applicable deployment gates. Reject fabricated sandbox, mocked money/stock effects and source-file assertions standing in for real user behavior.
5. Rescore each 2-point architecture dimension with evidence and explicit limitations. Record architecture, local PMS completeness and hosted production readiness independently; no automatic point increase from task count.
6. Reach 10/10 only if all five dimension criteria are accepted for the agreed operating model, including other teams' ownership. Otherwise record the actual score and exact remaining gap/owner. A safe standalone Hotel release can still proceed under its own accepted scope while the broader enterprise score remains incomplete.

**Validation:** G6 is a traceable judgment supported by evidence, not a badge added by code. No unresolved critical active flow or conflicting authority is hidden by a future roadmap.

## 6. Required business acceptance scenarios

Record these in the single acceptance register. Each entry needs environment/build/schema, actual actor/partner, executed action, observed result, expected totals/reference and evidence. Synthetic local, real partner sandbox and hosted acceptance are separate columns.

| ID | Scenario | Required observable outcome | Task owner |
|---|---|---|---|
| A01 | Last room booked concurrently | One valid reservation; losing request does not silently consume a second room/payment | 7 |
| A02 | Provider-shaped paid event, retry and alternate paid event | One verified payment/receipt/confirmation; failures never confirm | 6–7 |
| A03 | Provider paid after hold expiry/availability loss | Durable owned money-recovery case, verified status and approved resolution | 6 |
| A04 | Collect, count, reconcile and close concurrently | Correct drawer/payment linkage; explained variance; no lost/duplicate money | 7, 14 |
| A05 | Cancellation/no-show/refund/reversal | Frozen policy honored; released obligation/fees/credit coherent; original evidence retained | 7, 14 |
| A06 | Night close retried with a posting in progress | One immutable close/day advance; no duplicate room obligation or backdated posting | 7 |
| A07 | Staff disabled/terminated during an existing session | Access denied; future assignments blocked; history retained | 9, 19 |
| A08 | Hotel task consumes two mapped supplies | One authoritative stock effect; shortage/retry/count conflict is explicit | 10, 20 |
| A09 | Partial delivery received twice/retried | Cumulative accepted stock and open quantity correct; retry adds no extra stock | 4, 20 |
| A10 | Two repairs; one completes, another remains unsafe | Only the relevant restriction changes; Hotel inspection/readiness remains authoritative | 11, 21 |
| A11 | Unauthorized private ID/proof/document request | No content or cross-guest disclosure; authorized access audited | 12 |
| A12 | Occupant/DND/decline/discrepancy/handover journeys | Exact accepted policy enforced; no false clean, checkout or identity merge | 14 |
| A13 | Restaurant lookup, room move/checkout, post/retry | Correct stable stay; stale new charge refused; exact accepted replay recovered | 16–17 |
| A14 | Restaurant partial/full correction | Authorized linked reversal only; cap prevents excess; POS/PMS/Finance totals reconcile | 15, 17 |
| A15 | Finance export/reimport/AR transfer | Source effect booked once; pending/rejected acknowledgment visible; no duplicated restaurant revenue | 13, 15 |
| A16 | Delivery accepted then sender times out/crashes | Saved retry/status recovers; receiving effect happens once; other destinations remain independent | 18 |
| A17 | Fleet final fare/correction after prior local posting | One mapped fare plus approved delta/reversal; closed-stay exception is visible | 22 |
| A18 | Restore DB + private objects + configuration/job state | Required recovery targets measured; access and money/stock/partner reconciliation verified | 23–24 |

Do not mark partner cases A13–A17 passed using a fake receiver or manual database setup. A chosen manual operating alternative has its own acceptance record and does not become an API integration.

## 7. Definition of done and deployment blockers

| Deliverable | Done when | Blocks what if absent |
|---|---|---|
| Ownership register | Accepted domains/writers, support owners and cutover rules; pending external decisions explicit | Conflicting ownership cutover and whole-enterprise 10/10 claim |
| Core stabilization | Fresh checks pass; critical real-SQL and role journeys accepted | Affected real-hotel release |
| Fiscal/payment acceptance | Actual policy, one fiscal issuer and verified collection/refund/provider handling | Fiscal documents or unaccepted payment method activation |
| Hotel module alignment | Seven areas map accurately to current authority/behavior | Claims of architectural completion; misleading affected workflow |
| Partner connection | Accepted contract, authentication, real sandbox, correction/retry/reconciliation and operational support | That partner's activation/cutover |
| Deferred partner alternative | Named local/manual owner, unique references, controlled reconciliation and adoption trigger | Reliance on the deferred service without a safe process |
| Recovery/release | Full restoration, compatible manifest, smoke/acceptance and support tested | Unattended production reliance and affected hosted release |
| Reassessment | Five dimensions individually evidenced and rated; local/hosted/activated status separate | An honest 10/10 conclusion |

No hard requirement to implement optional groups, OTA, digital locks, enterprise BI, RMS or AI expansion for this architecture target. Add them only when a confirmed operating requirement changes scope.

## 8. Recommended execution order and completion log

Start with **1 → 2–3 → 4–7 → 8–14**. Begin Task 23's runbook as soon as owners are defined. Then **15–18** for ready Finance/Restaurant counterparts; **19–22** in actual counterparty-readiness order; finish recovery, release and rescore through **23–25**. One unavailable partner does not halt independent work or justify creating its ERP inside Hotel.

For each completed task record: task ID, exact changed files/commit, fresh checks, real browser/SQL/partner evidence, accepted policy/cutover status and unresolved owner/dependency. Update this plan's status only with verified outcomes. Preserve existing audit and memory work; session notes remain small and link the accumulating evidence.

**Plan creation verification:** This document is planning only. File references, numbered tasks, dependencies, phase gates and ownership criteria are checked when delivered. No new application test/build/SQL/browser/provider/deployment result is claimed from creating the plan; the audit's earlier results above remain historical checkpoints.
