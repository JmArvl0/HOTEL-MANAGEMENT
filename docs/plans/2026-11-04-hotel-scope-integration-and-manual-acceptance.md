# Hotel Scope, Integration and Manual Acceptance Implementation Plan

> **For implementers:** Follow the [Executing Plans skill](C:/Users/areva/.agents/skills/executing-plans/SKILL.md), one task at a time, with one agent. The user requested execution after this plan and personal browser checks by Codex. Preserve the existing dirty working tree and report checkpoints without requiring repeated permission for already-authorized local work.

**Goal:** Finish verifiable hotel workflows, correct misleading scope documentation, and define the first external integration without duplicating other teams' systems.

**Architecture:** Keep the existing reservation, room, guest-party, folio and operating-day authorities. Use server-side service-role access and transactional database rules. A real partner contract determines any machine-authenticated integration; do not invent a production connection, create a speculative event platform, or replace existing hotel workflows merely to match a module diagram.

**Tech Stack:** Existing Next.js App Router, React, TypeScript, NextAuth, Zod, Supabase/PostgreSQL, Vitest/jsdom, local PostgreSQL behavior suites, and browser computer use. Node must satisfy package.json (`>=22.22.2 <23`). No new dependency planned.

**Date:** 4 November 2026, Asia/Singapore.

**Execution status (4 November 2026):** Available local tasks A–D and F executed;
the partner-dependent runtime batch E remains pending actual POS inputs. The
companion [QA report](../qa/hotel-scope-integration-and-manual-acceptance-2026-11-04.md)
records five behavioral fixes, personal browser acceptance, 2,217 passing tests,
120-migration replay/restore rehearsal and the successful linked dry run. No
production deployment, hosted policy activation, real guest merge or real charge
was performed. Contract D is proposed/documented, not agreed with an absent partner.

## 1. Verified starting point

Read `AGENTS.md`, relevant `SYSTEM.md` sections 7.15–7.16 and 15, `DESIGN.md`, current handoff/status, then inspect source before edits.

- Night Audit, Accounting-controlled operating date and handovers already exist. Preserve them.
- `reservation_guests` is the one occupant register. Do not add a competing `reservation_occupants` table.
- Occupant evidence/presence, guest flags, reviewed merge, discrepancies and housekeeping service conditions already exist locally. Continue acceptance; do not rewrite the existing batches.
- The latest browser notes cover roster save/check-in, Manager DNR override, Front Desk DND, emergency occupancy and a Front Desk discrepancy path. They leave Housekeeping task outcomes/reporter access, reviewed merge, Owner/disabled staff and mobile flows open.
- Latest recorded full Vitest has one cancellation/change-modal source assertion failure. Reproduce under supported Node before deciding whether code or the assertion is wrong.
- `SYSTEM.md` and the header in `lib/purchase-orders.ts` say draft-only, but `20261014010000_inventory_replenishment_workflow.sql` and current routes implement submission, threshold approval, review, receiving and cancellation. Record this drift explicitly and verify before correcting the description.
- The allocation image and Restaurant team's actual API/test interface have not been supplied. Ownership is a proposed enterprise agreement, not a confirmed institutional requirement.
- Local migration timestamps are provisional until compared with the live ledger. Previously recorded deployment/ledger details are historical evidence, not a fresh live check.

## 2. Scope and ordering

| Batch | Deliverable | Completion condition |
|---|---|---|
| A | Baseline, supported runtime and isolated QA environment | Fresh test results; safe synthetic website with reachable browser |
| B | Accurate scope and procurement documentation | Source-traceable capability/ownership records; no workflow removal |
| C | Finish existing browser acceptance and fix reproduced defects | Required role/device journeys pass or have explicit evidence-backed blockers |
| D | Restaurant charge-to-room contract | Concrete proposed request/response, ownership, authentication, retries and reversals agreed/documented |
| E | First real integration and transactional delivery, conditional on partner readiness | Actual partner sandbox round trip; no simulated result described as live integration |
| F | Final verification and release readiness | Fresh automated gates, browser evidence, remaining dependencies and handoff |

Do A–D and F with information available. Execute E when the partner's identity, endpoint, authentication provisioning and test environment are available. Continue independent work while awaiting these inputs. Group/corporate, OTA, lost property, new pricing, payroll, fleet dispatch, GL and a sidebar redesign are outside this implementation batch.

## Task 1: Establish baseline and ownership of changes

**Read:** `package.json`, `git status --short`, the current handoff and existing QA report.

**Report:** `docs/qa/hotel-scope-integration-and-manual-acceptance-2026-11-04.md`.

1. Record current dirty paths; distinguish pre-existing work from this session's edits. Do not reset, stash, stage or commit unrelated work.
2. Locate supported Node 22 and use it consistently for npm, Next and tests. Record `node --version` and `npm --version`.
3. Run `npx vitest run lib/change-request-redesign.test.ts lib/purchase-orders.test.ts lib/hotel-operations.test.ts lib/hotel-operations-route.test.ts components/manager/hotel-operations.test.tsx`. Expect exit 0, or capture the exact pre-existing failure for Task 3.
4. Inspect existing local-only QA artifacts; start/reuse only owned disposable services after checking the local database target. Do not load hosted credentials into a synthetic test instance.
5. Record the website URL, environment mode, database isolation, browser entry and synthetic fixture coverage without secrets.

## Task 2: Correct scope and procurement descriptions

**Modify:** `SYSTEM.md` (procurement/limitations paragraphs only), `lib/purchase-orders.ts` (stale comments only).

**Create:** `docs/ENTERPRISE_BOUNDARIES.md`.

1. Trace draft creation through `app/api/inventory/purchase-orders/route.ts`, `_actions.ts`, submit/receive/cancel/review routes and the latest migration definitions. Check later migrations for overrides.
2. Keep draft creation's narrow contract while describing the wider PO lifecycle accurately. A local submit is not proof an order was sent to a supplier.
3. Document Hotel/HR/Finance/SCM/Fleet/Facilities/Restaurant ownership as a proposed matrix awaiting team agreement. Distinguish enterprise purchasing from hotel delivery acknowledgment and enterprise maintenance from hotel room readiness.
4. State that all seven hotel categories are represented, with implementation, verification, deployment and policy activation tracked separately.
5. Preserve deployed capabilities and role-based navigation. Do not rename tables, delete transport/PO flows, or remove financial operations.
6. Verify with `git diff --check`, source comparison and `npx vitest run lib/purchase-orders.test.ts`. No brittle prose-matching test is required.

## Task 3: Resolve the reproduced cancellation/change acceptance failure

**Inspect:** `lib/change-request-redesign.test.ts`, `components/customer/reservation-actions.tsx`, `lib/cancel-reservation.test.tsx`, `lib/cancellation-folio.test.ts`.

1. Reproduce the exact failure using `npx vitest run lib/change-request-redesign.test.ts`.
2. Inspect which dialog belongs to reservation changes versus cancellation. A global ban on a component name is not proof of the user journey.
3. If the actual change flow has an extra step, add a failing behavior test and fix only that flow. If the behavior is correct and the assertion is stale, replace the assertion with a scoped or rendered interaction check; keep cancellation protection.
4. Run `npx vitest run lib/change-request-redesign.test.ts lib/cancel-reservation.test.tsx lib/cancellation-folio.test.ts`. Expect exit 0.
5. Personally open the customer change and cancel dialogs in the synthetic website. Confirm reason entry, back/cancel behavior and final action match their separate purposes.

## Task 4: Complete the outstanding staff browser journeys

**Inspect/fix only when reproduced:** `components/manager/reservation-party-panel.tsx`, `housekeeping-queue-panel.tsx`, `guest-duplicates-panel.tsx`, `guest-flags-panel.tsx`, `room-discrepancy-panel.tsx`, `hotel-operations-panel.tsx`, `components/admin/occupant-policy-section.tsx`, their routes and shared domain/RPC authorities.

**Existing regression sources:** `components/manager/hotel-operations.test.tsx`, `components/manager/housekeeping-queue-panel.test.tsx`, `lib/housekeeping-action-routes.test.ts`, `lib/hotel-operations-route.test.ts`, `scripts/occupant-guest-controls-db-test.mjs`, `scripts/housekeeping-workflow-db-test.mjs`.

1. Seed synthetic Front Desk, Housekeeping, Manager, Owner, Accounting, Admin and guest accounts in an isolated database. Create real tasks, eligible merge candidates, a blocked candidate, an in-house stay and a confirmed arrival. Empty queues do not satisfy task acceptance.
2. Execute the browser matrix below, recording observed outcomes and role/device.
3. For a reproduced defect, trace browser -> route -> domain/RPC before editing. Write the smallest failing regression, make the minimal fix and retest the original browser journey.
4. Preserve frozen prices, occupancy limits, restricted-note redaction, historical unknowns, role authority and existing dirty changes. Do not activate hosted policies.
5. Record unexercised rows as NOT RUN/BLOCKED; API/SQL success does not substitute for browser completion.

## Task 5: Specify the first Restaurant integration

**Create:** `docs/integrations/RESTAURANT_CHARGE_TO_ROOM.md`.

**Reuse authorities:** `app/api/front-desk/reservations/[id]/charge/route.ts`, `app/api/accounting/charges/[id]/reverse/route.ts`, `lib/financial-route.ts`, latest definitions of `post_folio_charge`, `sync_invoice_financials` and operating-date posting locks.

1. Define a partner-authenticated stay-eligibility lookup that discloses the minimum data needed to confirm a charge. A room number alone never authorizes billing and can refer to different stays over time.
2. Define proposed `POST /api/integrations/restaurant/folio-charges` with a stable stay reference, external transaction ID, integer centavos, explicit PHP currency, description and source occurrence time. Source identity comes from authentication, never a trusted request-body label.
3. Document a concrete example: transaction `POS-QA-0001`, `amountMinor: 185000`, `currency: PHP`, description `Restaurant dinner`. The stay reference must be the synthetic stay returned by lookup, not a hard-coded production ID.
4. Require same-key/same-payload retries to return the original result; same-key/different-payload returns conflict; two simultaneous submissions create one charge. Recheck stay eligibility atomically with posting and checkout/move concurrency rules.
5. Preserve server-owned posting date and original source timestamp separately. Posting a restaurant sale is not receiving a second payment, and Finance must not count POS and PMS revenue twice.
6. Specify Accounting-controlled linked reversals and POS cancellation-request handling without deleting settled history or giving the partner general Accounting permissions.
7. List partner decisions needed before runtime work: identity/auth method, confirmed schemas, maximum amount, tax evidence ownership, disputed/offline charges, cancellation rules, sandbox and receiving endpoint.
8. Label proposed endpoints as NOT IMPLEMENTED until Task 6 is executed and verified. Current manual Front Desk charge posting stays available.

## Task 6: Implement the agreed partner connection only when inputs exist

**Proposed files, only after agreement:** `lib/restaurant-integration.ts`, `app/api/integrations/restaurant/stays/route.ts`, `app/api/integrations/restaurant/folio-charges/route.ts`, `lib/restaurant-integration.test.ts`, `scripts/restaurant-integration-db-test.mjs`.

**Database:** additive SQL draft under `docs/sql/restaurant-integration.sql` while ledger access is unavailable; promote to a uniquely numbered migration only after live-ledger verification. Do not duplicate folio/invoice calculation or bypass staff authentication by pretending a machine is Front Desk.

1. Write failing validation/authentication/idempotency/eligibility tests from the agreed contract.
2. Implement partner-scoped machine authentication server-side, denying missing/disabled identities and keeping service-role secrets private. Keep all reads server-side and database grants service-role only.
3. Reuse the financial calculation path through a narrowly authorized transactional database entry point, retaining separation between charge origination and Accounting reversal.
4. Where an outgoing event is actually required, save business change plus event in the same transaction; track per-destination delivery, retries, next attempt and actionable failure. Verify duplicate delivery does not duplicate the receiving effect. Do not build unused HR/SCM/Fleet adapters.
5. Test real PostgreSQL rollback, duplicate/concurrent submissions, stale stay/checkout, reversal history and closed-day behavior. Test the actual partner sandbox; label local test sender/receiver as simulated.
6. Personally verify the resulting charge and correction in the existing staff and guest website views. A backend-only success does not finish acceptance.

## Task 7: Verify accounting and procurement regression behavior

1. On a synthetic bill, collect part in cash and part through another supported method with a test reference. Verify the combined paid amount, remaining balance and drawer totals. Describe card/GCash entries honestly as manually recorded unless a real gateway is exercised.
2. Assess Night Audit on a prior synthetic business day, resolve documented blockers and close once as Accounting. Repeat the same submission; verify one immutable close, one date advance and unchanged contracted room obligation. Front Desk cannot close.
3. Exercise local draft -> submitted/approval -> received procurement using synthetic stock. Confirm one restock and no supplier-send claim. Test duplicate receipt/state conflict in SQL.
4. Preserve existing procurement and transport until enterprise handoff/cutover rules are actually agreed.

## 3. Mandatory personal browser acceptance

Codex performs these interactions using the available browser/computer-use tool. Use real local app -> authentication -> API -> disposable database, not mocked screens. Before Windows UI automation, read the computer-use guidance/confirmation documents; follow the tool's current browser documentation. Record exact URL, build, role, viewport, steps, expected/actual, PASS/FAIL/BLOCKED and evidence. No secrets or real guest PII in screenshots/reports.

| ID | Role/journey | Expected result |
|---|---|---|
| B01 | Front Desk edits occupants, saves and reopens | Names, types and presence persist; no CRM record created for a name-only companion |
| B02 | Front Desk arrival with missing age/register evidence | Accurate blocker; authorized evidence resolves it; browser does not infer unknown age |
| B03 | Manager DNR plus Front Desk arrival | Restricted notes stay hidden; scoped valid override works; expired/wrong-purpose override cannot be used |
| B04 | Housekeeping opens a real stayover task with DND | Start is blocked; declined/late outcomes persist without marking the room clean |
| B05 | Housekeeping reports a discrepancy; Front Desk investigates/resolves | Correct permissions and snapshot; resolution does not silently change guest/cleanliness state |
| B06 | Manager reviews and merges two eligible synthetic CRM profiles | Preview/field choices/reason required; history retained; DNR preserved; retry does not merge twice |
| B07 | Manager attempts login-linked or loyalty-bearing merge | Explicit refusal with no mutation |
| B08 | Owner reviews permitted records; disabled staff reuses an existing session | Owner authority matches policy; disabled staff cannot read/mutate protected data |
| B09 | Front Desk/Accounting partial cash plus second-method payment | Correct total, balance and drawer; no false gateway-success claim |
| B10 | Accounting prior-day close; Front Desk attempts close | Blockers enforced, exactly one close/date advance, role rejection, no duplicate room charge |
| B11 | Manager/Owner procurement draft, approval and hotel receipt | Existing state transitions work; stock increment occurs once; no fake supplier delivery |
| B12 | Guest opens change/cancel flows | Each flow has its intended self-contained dialog; no accidental submission from closing/back |
| B13 | Front Desk emergency list; Housekeeping attempts restricted view | Present occupants accurate; restricted identity details inaccessible |
| B14 | Changed staff/guest dialogs on 390x844 and 1366x900 | No clipped controls or page overflow; scroll, keyboard focus, Escape and save/error feedback usable |
| B15 | Partner charge after Task 6, staff and guest folios | One correctly labeled charge, correct balance, linked reversal and stable history |

B15 is dependency-blocked if Task 6 cannot run. Log ordinary fixture setup separately from UI actions so a database setup step is never described as a successful browser interaction. Retest every user-visible fix after the final code change affecting it.

## 4. Verification commands and release boundary

Run with supported Node 22; ensure no test helper resets a database while another suite uses it.

```powershell
node --version
npm run typecheck
npx vitest run lib/purchase-orders.test.ts lib/change-request-redesign.test.ts lib/cancel-reservation.test.tsx lib/cancellation-folio.test.ts lib/hotel-operations.test.ts lib/hotel-operations-route.test.ts components/manager/hotel-operations.test.tsx components/manager/housekeeping-queue-panel.test.tsx
node scripts/backend-remediation-db-test.mjs
node scripts/occupant-guest-controls-db-test.mjs
node scripts/housekeeping-workflow-db-test.mjs
node scripts/hotel-operations-db-test.mjs
npm test
npm run build
git diff --check
```

The SQL commands require the verified owned loopback PostgreSQL server on port 55432 with test user `backend_audit`. The first command rebuilds only its disposable test database; the following hotel helpers clone that completed baseline. Inspect each helper again before executing. Run touched-file ESLint with an explicit path list, including every changed TS/TSX file. Expected exit is 0 for every required gate; record warning counts and exact remaining failures instead of inheriting earlier results.

Before any eventual release: verify the live migration ledger, rehearse actual deployed-order upgrades on an isolated restored database, review app/schema compatibility and rollback, and use `supabase db push` as the supported migration path. Local QA does not authorize hosted policy activation, a real payment, or a real profile merge. Request only missing release inputs after the local result is reviewable; never invent a successful external connection.

## 5. Completion record

Update the companion QA report with outcomes and remaining blockers, this plan with task status, and a new session note under `nano_bots/05 Memory/Sessions/Codex/`. Refresh the live handoff with a small scoped entry preserving concurrent notes. Update Current Status only when project state genuinely changes; add no unapproved enterprise ownership decision to Decisions.md. Final user report must separate implemented changes, fresh automated checks, personally exercised website flows, and dependency-blocked partner/release work.
