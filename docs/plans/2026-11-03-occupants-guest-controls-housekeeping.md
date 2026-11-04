# Occupants, Guest Controls and Housekeeping Implementation Plan

> **For implementers:** Use the [Executing Plans skill](C:/Users/areva/.agents/skills/executing-plans/SKILL.md) task by task with **one agent**. Preserve unrelated working-tree changes. This document authorizes no production migration, deployment, merge of real guests or operational data changes.

**Goal:** Register individual occupants without requiring CRM profiles, enforce evidenced arrival eligibility, investigate occupancy discrepancies, and add governed guest flags and reviewed profile merging.

**Architecture:** Evolve `reservation_guests` and its existing party endpoints instead of creating a second occupant register. Keep mutations, final eligibility checks, concurrency controls and audit in PostgreSQL; use service-role server routes and the existing staff panels. Keep booking ownership, occupant identity, financial history, task progress, cleanliness and room readiness distinct.

**Tech Stack:** Next.js App Router, React, TypeScript, NextAuth, Zod, Supabase/PostgreSQL, Vitest/jsdom, existing native CSS and Haven controls. No new dependencies planned.

**Date/status:** 4 November 2026. Local implementation is written for Batches A–E, including reviewed CRM merging; conditional pricing, turndown and lost-property batches remain deferred. Clean chronological PostgreSQL 18 replay passed; SQL suites passed 24 backend-remediation, 13 occupant/guest-controls, and 27 housekeeping checks. Focused Vitest passed 157/157; the full suite passed 2,213/2,214, with one unrelated cancellation/change-flow source assertion failing. Typecheck and build pass; changed-file ESLint exits 0. The available Node 26.6.0 is outside the package's supported Node 22 range. Browser acceptance, restored/hosted-order replay, live migration-ledger verification and deployment remain outstanding. The Supabase CLI has no access token; local migration timestamps remain provisional until the live ledger is checked. Policy defaults below are proposals, not approved business decisions.

---

## 1. Baseline and boundaries

Read `AGENTS.md`, relevant `SYSTEM.md` sections 7.4–7.5, 7.16, 8–13 and 15, `DESIGN.md`, and current session memory before executing. Source/migrations establish implementation; `SYSTEM.md` establishes intended behavior.

| Concern | Current implementation | Change needed |
|---|---|---|
| Staying guests | `reservation_guests`, primary/accompanying roles, capacity, `party_version`, idempotent updates | Nullable CRM links, stay snapshots, adult/child classification, verification and attendance |
| Companion creation | `hotel_party_update` inserts into `guests` for a name-only member | Keep name-only occupants on the reservation; create a CRM record only through an explicit action |
| Identity | Reservation-level verification; no trusted DOB/age source | Occupant-level identity and age evidence; age gate in every check-in path |
| Duplicate review | Exact normalized email/shared account evidence, masked candidates, Manager/Owner decisions | Reviewed CRM merge with conflict preview, retained aliases and restricted eligibility |
| Housekeeping | Assign/start/complete, inspection/reclean, stayover work, priorities and deferral including DND | Discrepancy investigation and structured service conditions; retain existing lifecycle |
| Readiness | Room eligibility and check-in RPCs are authoritative; UI assessment is advisory | Include occupant/age/DNR/discrepancy gates in the shared server authority |
| Financials | Frozen nightly rates, folio ledger, operating-day controls | No automatic child/extra-person charges until an explicit pricing phase |

Primary source anchors:

- `supabase/migrations/20261103140000_hotel_operations.sql`: party table/RPCs, readiness, handovers and duplicate reviews.
- `supabase/migrations/20260830010000_housekeeping_operational_workflow.sql`: cleaning, inspection, reclean and deferral.
- `supabase/migrations/20261102010000_backend_audit_remediation.sql`: latest inspected full Front Desk and express QR check-in definitions; later migrations may modify them.
- `lib/hotel-operations.ts`, `lib/hotel-operations-route.ts`, `lib/guest-duplicates.ts`, `lib/permissions.ts`.
- `components/manager/reservation-party-panel.tsx`, `front-desk-arrival-dialog.tsx`, `reservation-readiness-panel.tsx`, `housekeeping-queue-panel.tsx`, `guest-duplicates-panel.tsx`.
- `lib/staff-data.ts`: guest dossier and accompanying-stay history.

The checkout contains unrelated cancellation/folio work, including pending migration `20261103160000_cancellation_folio_settlement.sql`, plus shared-file edits. Do not stage, revert, overwrite or describe them as this feature's work. The last recorded hosted ledger had 112 versions; that is historical context, not permission to choose a migration number.

This planning-only change stays in the current checkout so it references the actual working state. Before implementation, select an isolated checkout/worktree or coordinate the dirty tree; a fresh worktree must include required reviewed dependencies rather than silently omitting them. Do not create a new chat or subagents.

## 2. Delivery sequence and policy defaults

| Batch | Deliverable | Dependency / release boundary |
|---|---|---|
| A | Occupant register, evidence, presence and emergency list | First; independently useful, no new pricing |
| B | Room discrepancy report/investigation | Existing room authority; can follow A immediately |
| C | VIP/DNR/security/service flags and scoped overrides | A for occupant checks; shared booking/check-in enforcement |
| D | Reviewed CRM merge and aliases | A+C; first build preview, then restricted commit |
| E | Structured housekeeping service outcomes | Existing tasks and queue; no lifecycle rewrite |
| F | Child/extra-person pricing, turndown and lost property | Conditional, separately activated property workflows |

Proposed defaults to validate before activating their batch:

1. The registered primary occupant remains anchored to `reservations.guest_id`, preserving the current business rule. Booking/login owner (`user_id`) remains separate. Changing the primary identity requires a dedicated reviewed workflow and is outside this plan.
2. One primary and zero or more companions; role is independent of `occupant_type`. Named companions need no contact details, account or CRM profile. Legacy/unknown age classification remains explicitly unknown.
3. `minimumBookingAge` continues to mean the primary contracting/staying guest must meet the threshold. Assess against the hotel-local scheduled check-in date, not the browser clock. If the hotel intends a different rule, resolve that before enabling enforcement. Do not apply a minimum age to every companion.
4. Adult/child/infant labels are operational declarations until supported by DOB/evidence. They do not prove minimum age or authorize a price. Numeric child/infant pricing bands remain unset until Batch F.
5. Front Desk records/verifies occupants and presence. Front Desk/Manager/Owner can read the full register and emergency list; Housekeeping sees service instructions and headcounts only. No DOB, document or restricted incident details in general room lists, exports or guest portal payloads.
6. Once activated, newly created reservations require a complete named register at check-in. Existing incomplete reservations are labeled legacy/incomplete and require an explicit policy for remediation; never fabricate occupants from a headcount. Require verified primary age for all not-yet-checked-in reservations after age enforcement activation. Existing in-house stays retain their current status and show remediation warnings.
7. Manager/Owner can create/revoke operational guest flags and approve a single-reservation DNR exception. Front Desk executes normal reservation actions. Security alerts initially warn; they do not imply DNR. Accessibility and special handling store actionable instructions, not diagnoses or negative risk labels.
8. An unresolved occupancy discrepancy prevents a new arrival/assignment to the affected room. It neither checks out a guest nor cleans, blocks for maintenance, or cancels a reservation. Existing in-house occupancy and financial metrics retain their documented bases (D-033).
9. Initial merge execution accepts only two unlinked CRM records with no loyalty ledger/balance requiring consolidation. Records tied to login accounts remain review-only. This deliberately excludes account merges and loyalty transfers while providing a safe first CRM merge.

Activation is explicit and audited, after policy acceptance and staff readiness. Migration installation alone must not switch these enforcement rules on. Store occupant-register/age activation timestamps in the existing hotel policy configuration and expose them through its established Owner/Admin governance path; never put them in per-browser state. DNR checks become active with the flags release; there are no seeded DNR flags or silent disables.

## 3. Data contracts

### 3.1 Evolve `reservation_guests` in place

Use one additive migration per releasable batch. Determine each actual timestamp only after checking the current live migration ledger and local pending files. Migration labels in this plan are suffixes, not assigned filenames.

Proposed occupant fields:

| Field | Contract |
|---|---|
| `id uuid` | Stable occupant identifier and new primary key; populate existing rows with generated IDs |
| `reservation_id text` | Existing reservation FK; retain restrictive deletion |
| `guest_id text null` | Optional CRM FK; the primary still requires the reservation's registered guest ID |
| `full_name text` | Required stay-specific snapshot, trimmed 2–160 characters |
| `role text` | Existing `primary` / `accompanying` |
| `occupant_type text` | `adult`, `child`, `infant`, `unknown`; historical default `unknown` |
| `date_of_birth date null`, `nationality text null` | Optional sensitive data, never guessed |
| `identity_verified_by/at` | Nullable pair, server-stamped Front Desk evidence |
| `age_verified_by/at`, `age_verified_for_date`, `verified_age_years` | Separate age evidence; recorded after human document examination; no image required |
| `attendance_status` | `expected`, `present`, `departed`, `unknown`; RPC-maintained projection, legacy default `unknown` |
| `removed_at/by` | Retain canceled/pre-arrival membership history instead of delete/reinsert |
| `added_by/at`, `updated_at` | Retain existing attribution and add last-change time |

Retain `reservations.party_version`; add `party_completed_at/by` and invalidate completion whenever material roster details change. Keep verification separate from ordinary edits: changing name/DOB/CRM link clears affected evidence and completion. Names/evidence are snapshots, not live joins to a mutable CRM profile.

Replace the composite PK with `id`; retain a partial uniqueness rule for a nonremoved CRM member within a reservation and one nonremoved primary. Allow multiple NULL CRM links. Exactly-one-primary, valid-primary-link and active-capacity rules need transactional/constraint-trigger enforcement; a partial unique index alone only guarantees at most one primary. API and database both validate these invariants.

Keep repeated attendance in `reservation_occupant_presence(id uuid, occupant_id uuid, arrived_at timestamptz, departed_at timestamptz null, arrived_by uuid, departed_by uuid null)`, referencing the stable occupant row. Require departure not before arrival, one open episode per occupant, and nonoverlapping episodes. Derive the response's latest arrival/departure from these episodes; do not overwrite a prior departure when someone rejoins. Lock the reservation then occupant when changing presence and maintain `attendance_status` in the same transaction. Corrections are explicit audited actions, never arbitrary client timestamps.

Capacity: expected plus present occupants, excluding removed/departed history, must not exceed `least(reservations.guests, room_types.max_guests)`. Treat unknown legacy attendance conservatively as occupying a declared place, without representing it as verified presence. Rejoining must recheck capacity. Infants count toward physical capacity unless a separately approved capacity policy says otherwise. Registration completion requires a roster that accounts for the declared party size. A partial roster is valid while preparing an arrival and is clearly labeled incomplete. Party-size changes still use the existing reservation modification workflow; the occupant editor cannot silently alter sold capacity or price.

Backfill only from existing membership and its linked guest: snapshot the name/nationality, preserve its relationship and assign an ID. Do not backfill DOB, age, verification or presence. Do not delete existing companion CRM profiles. Missing primary/name conflicts remain an explicit resolution item. Existing departed/in-house timestamps are unknown unless a trustworthy source proves them; show reservation-derived expected occupancy separately.

### 3.2 Preserve the existing party API, extend its payload

Keep GET `/api/staff/reservations/[id]/guests` and POST `/api/front-desk/reservations/[id]/guests`. Add dedicated POST `/api/front-desk/reservations/[id]/occupants/[occupantId]/verify` and `/presence` for server-stamped evidence/attendance. Name-only inserts must never call `insert into guests`.

Example target ordinary edit contract (not permission to set verification):

```ts
type OccupantInput = {
  occupantId?: string;
  guestId?: string;
  name: string;
  role: "primary" | "accompanying";
  occupantType: "adult" | "child" | "infant" | "unknown";
  dateOfBirth?: string;
  nationality?: string;
};
type PartyUpdate = {
  members: OccupantInput[];
  expectedVersion: number;
  idempotencyKey: string;
  completeRegister: boolean;
};
```

Use strict boundary validation; reject client-supplied verifier/timestamp/price fields. Any submitted occupant ID must belong to this reservation. Reuse `hotel_request_result`, actor validation, row locks and `party_version`. Reject editing/removing a present member through a roster omission; use the explicit departure action. If rejoining later, add a new presence row/episode and retain the previous one rather than resetting departure history. Repeating a request returns its recorded result with no extra rows/events.

Old request compatibility: during expansion, resolve existing members by guest ID, accept the old shape only while register enforcement is disabled, and label unknown classifications honestly. Keep old response `guestId`, `name`, `role`, `version`, `capacity` fields while adding fields. Disable the old destructive update behavior before any standalone occupant can be created; a prior app must fail safely rather than erase new members. Plan a controlled app/database cutover for write compatibility, not a claim of unrestricted rollback.

### 3.3 Shared arrival authority

Implement one narrowly scoped internal database eligibility helper, called by existing Front Desk check-in, express QR self-check-in and readiness. It checks roster completeness, verified primary age, applicable DNR restrictions and room discrepancy restrictions. Creation/booking paths reuse the DNR identity restriction helper where an identity is known. No generic client-controlled bypass or duplicated frontend decision logic.

DOB is not proof. Permit either verified DOB or a staff-attested exact age at the configured check-in date after examining ID; record the reference date and verifier. Missing/unverified evidence blocks when age enforcement is active. Changing check-in date or minimum-age policy invalidates an incompatible attestation; do not automatically reuse a previous stay's evidence. Use date arithmetic with leap-year/birthday tests. No OCR/provider dependency is required for manual evidence recording.

On check-in, record explicitly confirmed occupants as arrived in the same transaction; register entries expected later remain expected. Express QR check-in requires the register/evidence already verified by staff and records only the primary's arrival; it cannot assert companions are present. Checkout closes remaining open attendance with the checkout timestamp, without rewriting prior departures. Room moves derive current location from the active assignment rather than duplicating room numbers on each occupant.

### 3.4 Discrepancies, flags and merges

- `room_discrepancies`: room/reservation/task references, system occupancy snapshot and assignment version, observed `occupied`/`vacant`/`uncertain`, observation time, reporter, reason, assigned investigator, `open`/`investigating`/`resolved`, version, resolution reason/actor/time. Report RPC captures system state; clients cannot supply it. Preserve repeated observations as audited events; retries cannot duplicate reports. Do not auto-resolve when a booking changes.
- `guest_flags`: guest link, typed flag, actionable/restricted note, creator/time, optional expiry, revoked actor/time, version. Active DNR/security restrictions must survive merges/aliases. No name-only blacklist matching. An unlinked occupant can be flagged only after an explicit authorized CRM-link/create action; do not auto-create permanent profiles for every companion.
- `guest_flag_overrides`: restriction ID/version, reservation ID, purpose (`booking`/`check_in`), approver/time, mandatory reason, expiry, revocation. Recheck the exact reservation/flag/version at commit. Ordinary staff have no boolean override field. A new DNR flag invalidates prior eligibility and requires its own override.
- `guest_profile_merges`: source/survivor IDs, approved field choices, expected versions/fingerprints, actor/time/reason, before snapshots, idempotency key. `guest_aliases` retains the old guest ID and historical names/contact identifiers as staff search evidence pointing to the survivor; aliases never grant authentication/ownership. Keep source guest rows and historical FKs. Prevent cycles, self-merge and repeated/chained ambiguous merges in v1.

## 4. Execution tasks

Each task follows this cycle: add the specified failing behavior check, run it and confirm the intended failure, implement the smallest change, rerun it, then inspect/stage only that task's diff. Make a focused commit at a verified boundary if commits are requested or established for execution; do not commit unrelated work. Tests must exercise data/output/transactions, not merely search source strings or assert mock calls.

### Task 0 — Establish baseline and release dependencies

**Read:** `SYSTEM.md`, `DESIGN.md`, current handoff/status, relevant Decisions (D-033/D-034), `package.json`, `scripts/hotel-db-test-helpers.mjs`, existing SQL harnesses. **Create:** `docs/qa/occupants-guest-controls-housekeeping-2026-11-03.md` during implementation.

1. Run `git status --short`; inventory ownership of overlapping dirty files. Record local HEAD and pending migrations. Record proposed policy defaults and unresolved property choices as proposals in the QA report, not approved Decisions.
2. Use Node 22.22.2–22.x. Run `npm run typecheck` and `npx vitest run lib/hotel-operations.test.ts lib/guest-duplicates.test.ts lib/housekeeping-workflow.test.ts components/manager/hotel-operations.test.tsx` to establish an actual baseline; record failures without attributing them to unimplemented work.
3. At migration authoring time run `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run`; read relevant live RPC definitions through approved server tooling without exposing credentials. Stop numbering if versions differ or source cannot be reconciled.
4. Prepare disposable loopback PostgreSQL using the established backend-remediation harness and fixed local target. The app's normal configuration points to hosted Supabase: do not use it for mutation tests and do not modify `.env`.

**Acceptance:** Baseline and migration dependencies are evidence-backed; no real guest edits or remote migrations.

### Task 1 — Add occupant behavior regression cases and schema expansion (Batch A)

**Create:** `scripts/occupant-register-db-test.mjs`; new migration suffix `_reservation_occupant_register.sql` after Task 0. **Modify tests:** `lib/hotel-operations.test.ts`.

1. Build the DB runner on `hotelTestDatabase()`/`hotelFixture()` in `scripts/hotel-db-test-helpers.mjs`. Clone the full current replayed baseline; no fixed production identifiers or environment overrides. Accept `--baseline` to demonstrate missing-feature failures before the feature migration, following existing harness patterns.
2. Add real SQL cases: primary + two standalone names; CRM row count unchanged; multiple NULL links; duplicate linked person rejected; cross-reservation occupant ID rejected; invalid/missing primary; active capacity; historical departed member excluded; stale version; retries and payload conflict; unauthorized/disabled actors; invalid DOB and foreign keys.
3. Run `node scripts/backend-remediation-db-test.mjs`, then `node scripts/occupant-register-db-test.mjs --baseline` sequentially. Expected baseline failure must be the missing standalone occupant contract, not database connection/setup failure.
4. Write the expansion migration and replace party RPCs/triggers with stable-ID updates/history retention. Add the presence episode table from §3.1 for Task 4. Protect direct service writes with constraints/triggers as well as RPC validation. Enable RLS, revoke public/anon/authenticated access and grant only established service-role access to new tables/RPCs.
5. Rerun `node scripts/occupant-register-db-test.mjs`; expected all cases pass. Confirm row counts and before/after snapshots for legacy backfill and reservation/CRM ownership preservation.

### Task 2 — Wire occupant validation, routes, dossier and existing panel

**Modify:** `lib/hotel-operations.ts`, `lib/hotel-operations-route.ts`, `app/api/front-desk/reservations/[id]/guests/route.ts`, `app/api/staff/reservations/[id]/guests/route.ts`, `components/manager/reservation-party-panel.tsx`, `components/manager/front-desk-arrival-dialog.tsx`, `lib/staff-data.ts`.

**Tests:** `lib/hotel-operations.test.ts`, `lib/hotel-operations-route.test.ts`, `lib/guest-profile.test.ts`, `components/manager/hotel-operations.test.tsx`; create `components/manager/reservation-party-panel.test.tsx` for dedicated editor behavior.

1. Add boundary cases for standalone/linked members, invalid date strings, missing role/type/name, supplied verifier fields and duplicate stable IDs. Strict validation rejects privilege-bearing fields.
2. Update types, errors and route mappings to the contract in §3.2. Preserve existing role gates; use the server session actor, never an actor from JSON. Return 401/403/404/409/503 consistently and do not expose sensitive raw database errors.
3. Extend the existing editor: name, companion role, adult/child/infant/unknown selector, optional DOB/nationality, expected/present/departed, completeness and separate Verify action. Default new companion creation to reservation-only. Existing CRM linking is explicit; no speculative new guest-search framework.
4. Keep accessible labels, keyboard actions, pending/error/retry states and 390px layout. Reuse HavenSelect, native date input, existing Modal and staff styles. Do not import a new component library.
5. Dossier shows only linked CRM memberships, with stay snapshots and role; standalone occupants are not promoted to CRM. Keep companion history separate from ownership/financial responsibility.
6. Run `npx vitest run lib/hotel-operations.test.ts lib/hotel-operations-route.test.ts lib/guest-profile.test.ts components/manager/reservation-party-panel.test.tsx components/manager/hotel-operations.test.tsx`; expected pass.

### Task 3 — Record evidence and enforce register/age in both arrival paths

**Create:** `app/api/front-desk/reservations/[id]/occupants/[occupantId]/verify/route.ts`, `lib/occupant-eligibility.test.ts`, `lib/occupant-routes.test.ts`.

**Modify:** Batch A migration before release (new additive migration if already applied), `lib/hotel-operations.ts`, `lib/hotel-policy.ts`, `app/api/admin/policy/route.ts`, `app/api/front-desk/reservations/[id]/identity/route.ts`, `app/api/front-desk/check-in/route.ts`, `app/api/qr/express-checkin/route.ts`, `components/manager/front-desk-arrival-dialog.tsx`, `components/manager/reservation-readiness-panel.tsx`, `scripts/occupant-register-db-test.mjs`; policy governance UI in `components/manager/manager-dashboard-client.tsx` only where its existing controls require it.

1. Add real SQL scenarios: birthday exactly at threshold, day before, Feb 29, hotel/browser date boundary, missing DOB and age evidence, declared adult without verification, stale attestation after date change, identity verified without age, invalidated evidence after edits, and a child companion allowed with an eligible primary.
2. Add bypass tests against both `front_desk_check_in` and `express_qr_self_check_in`, plus readiness parity and unchanged financial/time/inspection checks. Test every other check-in transition found in the current source/live-function census; generic status updates must not bypass the new guard.
3. Add manual Front Desk evidence RPC, with verifier/time server-owned and an audit entry. Existing reservation-level identity verification stays compatible but cannot fabricate age evidence. Record DOB verification and age attestation separately from a general ID checkbox.
4. Add the shared eligibility helper and call it from both final transactional entry points and readiness. Introduce actionable `OCCUPANT_REGISTER_REQUIRED`, `PRIMARY_AGE_UNVERIFIED`, `PRIMARY_UNDER_MINIMUM_AGE` errors. Final action rechecks current data under reservation lock.
5. Add governed, default-disabled activation fields and a dated preview of affected not-yet-arrived reservations. Verify preactivation behavior, legacy/in-house remediation, and postactivation enforcement. No check-in can use a client-selected legacy exemption.
6. Run `node scripts/occupant-register-db-test.mjs` and `npx vitest run lib/occupant-eligibility.test.ts lib/occupant-routes.test.ts lib/hotel-policy.test.ts components/manager/front-desk-arrival-dialog.test.tsx`; expected pass. Evidence tests are SQL authority checks, not only route stubs.

### Task 4 — Presence history and emergency occupancy list

**Create:** `app/api/front-desk/reservations/[id]/occupants/[occupantId]/presence/route.ts`, `app/api/staff/occupants/in-house/route.ts`, `components/manager/emergency-occupancy-panel.tsx`, `components/manager/emergency-occupancy-panel.test.tsx`.

**Modify:** Batch A migration, `lib/hotel-operations.ts`, `lib/staff-data.ts`, `components/manager/hotel-operations-panel.tsx`, `components/manager/reservation-party-panel.tsx`, SQL runner and occupant route tests.

1. Add SQL cases for expected vs arrived vs departed, late joining, same guest rejoining with preserved prior attendance, occupancy after a room move, checkout closure, retry and concurrent updates. Do not let attendance exceed room capacity or create overlapping active presence for the same linked person.
2. Implement explicit server-timestamped arrive/depart actions and transactional check-in/checkout hooks. Retain audit/history; terminal reservations are read-only. Staff roster edits may not delete attendance.
3. Add a restricted in-house endpoint: current active assignment, reservation reference, occupant names/classification/presence, declared count, roster completeness and generated-at timestamp. Show missing/unknown attendance and unresolved discrepancy markers; never claim an exact physical census from booking data.
4. Add a printable list in Hotel Operations with role-filtered projection; omit DOB, ID evidence, contacts and restricted flags. Read/register access stays Front Desk/Manager/Owner. Log access/export metadata without copying personal data to logs. Use bounded/paginated queries with complete export, not a silent default result cap.
5. Run `node scripts/occupant-register-db-test.mjs` and `npx vitest run lib/occupant-routes.test.ts components/manager/reservation-party-panel.test.tsx components/manager/emergency-occupancy-panel.test.tsx`; expected pass. Manually inspect print layout later in Task 12.

### Task 5 — Discrepancy reporting and Front Desk investigation (Batch B)

**Create:** migration suffix `_room_discrepancies.sql`, `lib/room-discrepancies.ts`, `lib/room-discrepancies.test.ts`, `scripts/room-discrepancy-db-test.mjs`, `app/api/housekeeping/rooms/[id]/discrepancies/route.ts`, `app/api/staff/room-discrepancies/route.ts`, `app/api/front-desk/room-discrepancies/[id]/resolve/route.ts`, `components/manager/room-discrepancy-panel.tsx`, `components/manager/room-discrepancy-panel.test.tsx`.

**Modify:** `components/manager/housekeeping-queue-panel.tsx`, `components/manager/hotel-operations-panel.tsx`, `lib/hotel-operations-route.ts`, existing shared room eligibility/readiness/check-in functions through the new migration.

1. Test occupied→observed-vacant and vacant→observed-occupied through actual SQL. Assert reservation status, room cleanliness, folio and assignment remain unchanged. Require an investigation reason and reporter attribution; denied actors cannot report/resolve.
2. Housekeeping reports from room/task context. Front Desk owns investigation/resolution; Manager/Owner read/escalate. Return the current expected state and detect stale reservation/assignment versions when resolving.
3. Capture system state atomically and create one linked `hotel_handovers` item in the same transaction, routed to Front Desk. Reuse handovers rather than a new messaging/notification subsystem. Reconcile its status with investigation; resolving a handover alone must not clear the discrepancy.
4. Extend the authoritative physical-room eligibility path to exclude open/investigating discrepancies from new arrivals/assignments, including a move into the room. Existing occupants may move out or check out through normal controls. Neither a report nor resolution independently releases/cleans a room.
5. Resolve with a mandatory outcome/reason; any required reservation correction uses its existing protected action. A stale snapshot requires refresh and re-evaluation. New or uncertain observations require investigation, not silent overwrite.
6. Test report-vs-check-in in two connections with deterministic barriers: if report commits first arrival is refused; if arrival commits first the report snapshots the occupied state. Use consistent locks/order, no time-based sleeps.
7. Run `node scripts/room-discrepancy-db-test.mjs` and `npx vitest run lib/room-discrepancies.test.ts components/manager/room-discrepancy-panel.test.tsx lib/housekeeping-queue.test.ts components/manager/housekeeping-queue-panel.test.tsx`; expected pass.

### Task 6 — Operational flags and scoped DNR overrides (Batch C)

**Create:** migration suffix `_guest_operational_flags.sql`, `lib/guest-flags.ts`, `lib/guest-flags.test.ts`, `lib/guest-flags-route.test.ts`, `scripts/guest-flags-db-test.mjs`, `app/api/staff/guests/[id]/flags/route.ts`, `app/api/staff/reservations/[id]/flag-overrides/route.ts`, `components/manager/guest-flags-panel.tsx`, `components/manager/guest-flags-panel.test.tsx`.

**Modify:** `lib/permissions.ts`, `lib/staff-data.ts`, `lib/hotel-operations-route.ts`, `components/manager/manager-dashboard-client.tsx`, `components/manager/front-desk-arrival-dialog.tsx`, readiness and shared arrival helpers. Trace booking callers in `app/api/booking/holds/route.ts`, `app/api/booking/holds/[token]/confirm/route.ts`, `app/api/booking/payments/gateway/route.ts`, `app/api/front-desk/reservations/route.ts` before editing their underlying SQL functions.

1. Test active/revoked/expired flags, multiple flags, strict Manager/Owner mutation authority, restricted-note redaction, audit, stale versions, separate DNR vs VIP/security/accessibility behavior.
2. Add flag lifecycle RPCs and dedicated capability functions. Prevent generic guest-resource mutation from writing flags/override state. Front Desk sees operational restriction/instructions; only authorized management sees restricted incident notes. Guest/public APIs never return internal flag details.
3. Test DNR at staff creation, authenticated web hold/confirmation, gateway completion, final Front Desk and express arrivals, and newly linked/arriving companions. All known registered occupant identities participate; do not claim to identify an anonymous or unlinked person from a name.
4. If DNR is added during an in-house stay, require Front Desk/management investigation; do not evict, deactivate an account or cancel automatically. If found after a paid gateway transaction, record the real payment and route to review/refund controls; never discard payment evidence or falsely mark it failed.
5. Override is a Manager/Owner-reviewed, reservation/flag/version/purpose-bound record with reason and expiry. No wildcard/global override. Check under lock at execution; audit every use. Test expired, revoked, wrong-reservation and newly added restrictions. Valid override does not waive age, balance, time, inspection or capacity gates.
6. Concurrency: lock the relevant guest/restriction records in deterministic order in flag writes and booking/arrival. Two-connection tests prove no stale approval/flag race. Public errors disclose only booking eligibility, not an internal security narrative or existence of another guest's record.
7. Run `node scripts/guest-flags-db-test.mjs` and `npx vitest run lib/guest-flags.test.ts lib/guest-flags-route.test.ts components/manager/guest-flags-panel.test.tsx lib/hotel-operations-route.test.ts`; expected pass.

### Task 7 — CRM merge preview and dependency census (Batch D1)

**Create:** `lib/guest-merge.ts`, `lib/guest-merge.test.ts`, `app/api/staff/guests/merge/preview/route.ts`, `scripts/guest-merge-db-test.mjs`.

**Modify:** `lib/guest-duplicates.ts`, `lib/guest-duplicates.test.ts`, `components/manager/guest-duplicates-panel.tsx`; add `components/manager/guest-duplicates-panel.test.tsx`.

1. Inventory actual FKs to `guests`, guest matching/creation, staff dossier/search, occupant links, flags, handovers, loyalty and guest/customer authorization. Record each caller in the QA report before choosing merge SQL. The original migration's uniqueness constraints mean same-email candidates may be rare; do not weaken identity matching to manufacture candidates.
2. Test preview for two nonaccount CRM records, field conflicts, retained historical references, survivor selection, flag union and protected account/loyalty records. Names/phones may help an operator search; they are never automatic identity proof.
3. Preview returns explicit field choices, alias records, counts of linked references, disqualifiers and a server-computed state fingerprint for both profiles and dependent restrictions. It writes nothing. Manager/Owner only, with masked candidate-list evidence and full detail only within their permitted profile view.
4. Retain existing dismissed/do-not-merge review decisions; require explicit re-review with reason before a previously protected pair can progress. Allow manually selected records with a reason/evidence review; never automatic fuzzy merging.
5. Run `npx vitest run lib/guest-duplicates.test.ts lib/guest-merge.test.ts components/manager/guest-duplicates-panel.test.tsx`; expected pass. Preview may ship alone while merge execution remains unavailable.

### Task 8 — Transactional restricted merge, aliases and canonical staff reads (Batch D2)

**Create:** migration suffix `_reviewed_guest_profile_merge.sql`, `app/api/staff/guests/merge/route.ts`. **Modify:** Task 7 files, `lib/staff-data.ts`, `lib/guest-profile.test.ts`, all matching/search/flag callers identified by the census; `lib/guest-loyalty.ts` and `lib/customer.ts` only if required to reject merged-source misuse without changing ownership.

1. Add SQL cases: authorized explicit merge, stale fingerprint, concurrent flag addition, opposite-direction concurrent merge, retry, wrong payload, cycle/self/repeated merge refusal, protected linked account, loyalty history, surviving DNR and both guests linked to the same reservation.
2. Commit locks guest IDs deterministically and recomputes the entire preview/fingerprint. Reject changed dependencies. Store source/survivor snapshots and chosen CRM fields, retain source rows and historical FKs, mark the source as merged and create aliases. Do not rewrite reservation names, occupant snapshots, invoices, documents, closed audits, auth accounts, balances or loyalty ledgers.
3. Staff CRM search/dossier resolves old IDs to the survivor and aggregates linked history without double-counting reservations. New operational CRM selection uses the survivor. Historical party links remain readable; do not create duplicate occupants just to relink them. Apply DNR/security restrictions from every merged source; do not silently drop or downgrade them.
4. Identifier aliases remain search evidence. Email/phone aliases must not silently attach a website account or grant access to reservations or points. Reject incompatible account claims pending explicit review. Trace every staff/web/gateway guest matcher and prove it cannot recreate a merged identity through the old identifier.
5. Initial execution rejects both account-linked records and any loyalty-ledger/balance consolidation case; explain the reason in preview. No account link transfer, loyalty summation or anonymization is included. Keep merge history available for investigation; automatic undo is deferred because postmerge bookings/flags need their own reconciliation design.
6. Run `node scripts/guest-merge-db-test.mjs` and `npx vitest run lib/guest-merge.test.ts lib/guest-duplicates.test.ts lib/guest-profile.test.ts components/manager/guest-duplicates-panel.test.tsx`; expected pass. Re-run Batch C SQL against aliases to prove restrictions cannot be evaded through a merged-source ID.

### Task 9 — Structured housekeeping service conditions (Batch E)

**Create:** migration suffix `_housekeeping_service_conditions.sql` and `lib/housekeeping-service.test.ts`. **Modify:** `lib/housekeeping-route.ts`, `lib/housekeeping-queue.ts`, `components/manager/housekeeping-queue-panel.tsx`, `components/manager/manager-dashboard-client.tsx`, `app/api/housekeeping/tasks/[id]/defer/route.ts`, `scripts/housekeeping-workflow-db-test.mjs`, relevant queue/action tests.

1. Keep `pending/assigned/in_progress/completed/deferred/cancelled` and current room cleanliness states. Add structured service reason (`dnd`, `declined`, `late_service`, `other`) alongside the existing mandatory note; legacy free text remains readable.
2. DND is a current in-house reservation/room service instruction with set/clear times and attribution, not a permanent room status. Front Desk/Housekeeping can record it through a dedicated guarded action; only its active stay context follows a room move. Guest departure clears current applicability without deleting history. A task deferral alone does not claim the room is under DND forever.
3. Service declined records that service was offered/declined; it is not cleaning completion. Late service has a timestamp and appears in the existing queue; no new notification provider. Starting nonemergency routine service respects active DND and requires an authorized recorded clearance; never use DND to bypass checkout cleaning or inspection.
4. Reuse current priority and `room_preparation` tasks for priority-room/VIP preparation, with a stored service-purpose field only if needed for reporting. Keep failed inspection→child reclean unchanged. Turndown remains conditional Task 11.
5. SQL/UI tests cover DND set/clear/move/checkout, declined service not becoming clean, allowed deferral task types, late-service ordering, role gates and nonduplication in queue counts.
6. Run `node scripts/housekeeping-workflow-db-test.mjs` and `npx vitest run lib/housekeeping-service.test.ts lib/housekeeping-queue.test.ts lib/housekeeping-action-routes.test.ts components/manager/housekeeping-queue-panel.test.tsx`; expected pass.

### Task 10 — Child/extra-person pricing (conditional Batch F1)

**Activation prerequisite:** Property-approved age bands, included occupancy, infant/capacity treatment, extra-bed rules, amount/tax basis, per-night/per-stay basis, effective date, rate governance and treatment of unknown age. Do not seed a fee or infer one from adult/child labels.

**When activated, create:** migration suffix `_occupant_pricing_policy.sql`, `lib/occupant-pricing.test.ts`, `scripts/occupant-pricing-db-test.mjs`. **Modify:** `components/booking/guest-details-form.tsx`, `lib/hotel-policy.ts`, existing quote/hold/confirm/staff-create functions, `lib/customer.ts`, existing folio quote/posting UI and tests.

1. Collect adult/child/infant counts and ages-at-arrival only where needed; do not require every name/DOB to obtain a quote. Counts include the primary once. Server rejects composition exceeding physical capacity or conflicting with the completed roster.
2. Quote policy/rate version, age-reference date, counts, quantities, rate basis and exact money server-side. Freeze the accepted breakdown with the reservation; client totals are display-only.
3. Test threshold birthdays, unknown-age handling, infant capacity, free/included occupants, child/extra-person rates, extra beds, expiry/stale quote, mid-stay join/leave, date extension, cancellation/refund and replay. Avoid duplicate charging where the base rate already includes occupants.
4. New occupants may produce a reviewed charge preview, never automatic repricing of old nights. Post accepted changes through existing idempotent folio/adjustment controls on the current operating day. Preserve frozen rates, issued documents and the pending cancellation-settlement contract.
5. Run `node scripts/occupant-pricing-db-test.mjs` and `npx vitest run lib/occupant-pricing.test.ts components/booking/guest-details-form.test.tsx`; expected pass. Omit this entire implementation batch until its prerequisites exist; A–E must remain useful without it.

### Task 11 — Turndown and lost property (conditional Batch F2)

**Prerequisite:** Actual service schedule/ownership, and approved found-item custody/claim/retention process. These are separate workflows, not more room statuses.

**If turndown is adopted:** Extend the task-type constraint and existing create/start/complete/deferral/assignment rules in an additive `_housekeeping_turndown.sql` migration. Add a service window and idempotent reservation/date/type creation; respect DND, cancellation and room moves. Reuse the queue, existing assignment policy and `scripts/housekeeping-workflow-db-test.mjs`; prove no duplicate nightly tasks.

**If lost property is adopted, create:** migration suffix `_lost_property.sql`, `lib/lost-property.ts`, `lib/lost-property.test.ts`, `scripts/lost-property-db-test.mjs`, `app/api/staff/lost-property/route.ts`, `app/api/staff/lost-property/[id]/handover/route.ts`, `components/manager/lost-property-panel.tsx` and its component test.

1. Capture found-item description, location/time, reporter, custody location and optional reservation/occupant link. A found location does not establish ownership.
2. Record custody transfers and `held/claimed/disposed` lifecycle with responsible actor/time/reason, claimant evidence and authorized release. Housekeeping records discovery, designated Front Desk custodian executes handover, Manager supervises. No silent deletion or automatic disposal.
3. Log each transfer, enforce version/idempotency and restrict sensitive claimant detail. Photos/storage/guest notifications remain outside v1 unless the property requires them.
4. Run `node scripts/lost-property-db-test.mjs` and `npx vitest run lib/lost-property.test.ts components/manager/lost-property-panel.test.tsx`; expected pass if this conditional batch is adopted.

### Task 12 — Regression, browser acceptance, docs and staged release

**Modify after verified implementation only:** `SYSTEM.md` §§7.4–7.5, 7.16, 8–13 and gap entry in §15; `docs/FRONT_DESK_OPERATIONS.md`; `DESIGN.md` only if an actual shared interaction/design contract changes; current QA report and small session/handoff entries. Add approved policy decisions to `nano_bots/05 Memory/Decisions.md` only when actually accepted.

1. At each releasable batch, run `npm run typecheck`; run `npx eslint` with the explicit list of touched `.ts/.tsx/.mjs` files; run targeted suites and actual SQL harnesses; then `npm test` and `npm run build`. Record current results and existing warnings separately. No build/test claim from an earlier session counts for this diff.
2. Replay all migrations into a clean disposable database and into a database restored from the verified previous-release schema. Test upgrade against hosted order captured at execution time; existing hardcoded `--upgrade-order` lists may be stale and must be updated in the test harness only after the real order is known. Never run template reset while a suite uses it.
3. Browser QA against isolated synthetic fixtures, 390px and 1366px, light/dark: occupant CRUD/evidence, late arrival/departure, partial legacy register, QR path, emergency print, discrepancy investigation, DNR denial/override, merge preview/conflicts and DND/declined service. Verify keyboard focus, long names, dates, refresh after conflict and empty/error/loading states. Report manual/browser results honestly; do not claim a supported unattended runner merely because `package.json` contains Playwright scripts.
4. Verify direct 401/403 behavior for guest, disabled staff, Admin, Accounting and Maintenance, plus intended Housekeeping/Front Desk/Manager/Owner permissions. Assert DOB/restricted notes never leak to general room, public/guest, analytics or accounting payloads. Test blocked generic PATCH/status paths.
5. Release A, B, C, D and E separately with compatible DB/application versions. Obtain fresh linked-ledger/dry-run evidence, backup and restore rehearsal, and a reviewed deployment artifact before any separately authorized production cutover. Use `supabase db push`, never `npm run migrate`.
6. Roll forward additive data changes if a new writer has run. An old app cannot safely write the new roster, evaluate DNR or resolve aliases; do not roll back to it under traffic. If a hotfix is required, gate affected writes during the controlled repair. Do not drop occupant/flag/merge history to make an old build work.
7. Age/register activation is a separate audited configuration action after the affected-arrival preview and staff walkthrough. New DNR restrictions are enforced immediately on creation. Production tests use authorized synthetic fixtures and remove only owned disposable data through reviewed paths.
8. Update this plan's task status from verified evidence only. Refresh the live handoff and create a concise Codex session record; touch Current Status/Project Memory only if their project-level facts genuinely change.

## 5. Completion criteria

- [ ] A named companion can stay without creating a CRM guest; CRM row count proves it.
- [ ] Existing profiles/memberships are preserved; unknown historical details remain unknown.
- [ ] Primary identity, roster completion, capacity and attendance remain consistent under retries and concurrency.
- [ ] Verified primary age is enforced in both staff and express check-in after explicit activation; an adult label/old ID checkbox cannot bypass it.
- [ ] Emergency list reflects current assignment and recorded presence, with visible incomplete/unknown coverage.
- [ ] A Housekeeping discrepancy opens Front Desk investigation and blocks conflicting new arrivals without mutating reservations/cleanliness.
- [ ] Operational flags have correct visibility; DNR is checked through all known-identity booking/arrival paths and exceptions are scoped/audited.
- [ ] Restricted CRM merges preserve auth, history and financial/loyalty records, retain searchable aliases and cannot remove a DNR restriction.
- [ ] DND/declined/late service work within existing tasks; inspection, reclean and maintenance gates still hold.
- [ ] Pricing/turndown/lost-property batches are implemented only when their documented property prerequisites are met; otherwise explicitly remain deferred.
- [ ] Current typecheck, touched-file lint, targeted/full tests, SQL clean/upgrade replay and build have recorded outcomes; browser gaps are named.
- [ ] Source/docs distinguish installed schema, deployed app and activated policy; no production work is represented as done by this plan.

**Recommended first execution slice:** Tasks 0–2, then Tasks 3–4 to complete Batch A. Keep Batch B–E in this sequence and leave conditional Batch F inactive until the property has the required policies.
