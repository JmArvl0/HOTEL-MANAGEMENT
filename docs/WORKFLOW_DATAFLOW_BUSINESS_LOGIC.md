# HAVEN — Workflows, Data Flow, and Business Process Logic

> Operational reference for the current implemented system. `SYSTEM.md` remains the
> authoritative governance file; if this document disagrees with it or with the live
> code, they win. Last refreshed: 2026-09-09 (after the booking data-placement fixes).

## 1. Architecture: how every request flows

The system is a single Next.js App Router application with four surfaces (public site
+ catalogue, customer portal, staff role portals, auth) over one Supabase/Postgres
database. Every mutation follows the same four layers:

```
React client component
  → route handler (app/api/**)  — session gate (next-auth) → zod validation → permission check (lib/permissions.ts)
    → lib domain module (lib/*.ts) — server-only, service-role Supabase client
      → Postgres SECURITY DEFINER RPC — re-checks the actor's role null-safely,
        row-locks what it mutates, and writes an audit row
```

Rules that hold across the whole system:

- **Client code never talks to the database directly.** All Supabase access is
  server-side with the service-role key; the browser only sees JSON from route handlers.
- **The RPC is the last line of defense.** Even if a route handler is compromised, the
  RPC re-derives the actor from `user_accounts` and refuses inactive/incorrect roles
  (`actor is null or actor not in (...)` guard style — never `actor not in (...)` alone,
  which silently passes for NULL).
- **Every state-changing RPC writes an audit row** (who, what, when, why) before it
  returns. Money paths (payments, refunds, adjustments) are idempotent via
  idempotency keys and immutable once settled.
- **Email (Resend, `lib/email.ts`) is optional and never blocks a mutation** — a failed
  email leaves the business state committed.

## 2. Roles and authority

| Role | Owns | Never does |
|---|---|---|
| guest | Own bookings: holds, deposit submission, stay requests, change requests, stay payments | See staff data |
| front_desk | Reservation operations: check-in, room assignment, guest-contact edits, guest-request review, walk-ins | Verify payments, process refunds |
| accounting | Payment verification (deposits + stay payments), refunds, adjustments, financial documents, ledger, cash shifts | See guest contact profiles (slim financial projection only) |
| manager | Derived oversight: attention lists, approvals/escalations — advisory, never mutating operations | Front Desk or Accounting execution |
| owner | Exception review, escalations from Manager, executive view | Routine operations |
| admin | Account/room/catalog governance with version guards | Book rooms, verify payments |
| housekeeping / maintenance | Their task queues and room readiness | Reservations, payments, guest contact |

Housekeeping and Maintenance see a minimal department projection
(`lib/staff-data.ts` `departmentRequestFields`): request text and status only, no
guest identity.

## 3. Guest booking flow (the money path)

```
Search ──► Guest details ──► Hold (15 min) ──► Review ──► Payment proof ──► Deposit submitted
            (form)           create_booking_hold          (staged upload)   submit_reservation_deposit
                                                                                  │
                                    Accounting verifies ◄──────────────────────┘
                                    verify_reservation_deposit
                                          │ paid
                                          ▼
                                 Reservation CONFIRMED
                                   ├── auto-file guest_request batch (one batch_id per submission)
                                   └── auto-file transportation_requests row (if ride requested)
```

### 3.1 Search and availability

- `getAvailability` (`lib/booking.ts`) computes sellable units per room type as
  **inventory − blocking reservations − active holds**:
  - Inventory excludes maintenance rooms, out-of-service rooms
    (`administratively_active = false`), rooms under blocking maintenance orders, and
    dirty rooms when check-in is today (housekeeping needs a day to reach them).
  - Blocking reservations: `pending`, `confirmed`, `checked_in` overlapping the window —
    except a *pending website* reservation past its `payment_due_at`, which has
    released its inventory.
  - Holds: `active` or `payment_submitted`, unexpired, not yet converted.
- Prices come from `room_types.base_rate`; the deposit policy snapshot is stamped onto
  every hold and reservation (triggers `booking_holds_policy_snapshot`,
  `reservations_policy_snapshot`) so later policy edits never reprice old bookings.

### 3.2 Guest details → hold

The guest-details form collects: name, email, mobile, **address (required)**,
**nationality (optional)**, **expected arrival time**, **request options** (chips:
late checkout, etc.), special requests, and optional **transportation preferences**
(service type, route, date/time, passengers, instructions).

`POST /api/booking/holds` → `create_booking_hold` RPC:
- Locks availability again, writes the `booking_holds` row (15-minute expiry by
  default; the hold token doubles as the payment-link credential).
- Upserts the `guests` row (matched by `user_account_id` or email) with
  address/nationality/special-requests under coalesce semantics — new data fills
  blanks, never overwrites what staff already hold.
- Payment-link email is sent best-effort; failure never blocks the hold.

### 3.3 Review → proof → deposit

- The review page shows everything the guest entered (name, contact, address,
  nationality, expected arrival, request chips, ride request, deposit math) so errors
  are caught **before** money moves.
- Proof upload stages the screenshot in the private `payment-proofs` bucket
  (`pending/<token>/<uuid>.<ext>`, magic-byte sniffed, guest + Accounting access via
  60-second signed URLs). `submit_reservation_deposit` re-derives all proof metadata
  server-side, moves the object to its permanent path, writes the `payments` row as
  `pending_verification`, flips the hold to `payment_submitted`, and **freezes the hold
  clock** — the guest is no longer racing expiry while Accounting works.

### 3.4 Verification → confirmation

Accounting (only) calls `verify_reservation_deposit`:
- Row-locks the payment; idempotent — a second decision on a settled payment is
  rejected, not replayed. Settled payment rows are immutable (trigger).
- **Approved** → payment `paid`, reservation `confirmed`, hold `completed`,
  invoice created, confirmation email best-effort, `CheckInQr` unlocked.
- **Rejected** → payment `failed` with a reason; the hold is released and inventory
  returns to the pool. The guest re-books from live availability.

On confirmation two automations fire (triggers):
- **Guest requests**: each request option becomes a `guest_requests` row sharing one
  `batch_id` — one portal submission = one Front Desk decision. A housekeeping task is
  auto-created for housekeeping-type requests
  (`guest_request_create_housekeeping_task`, only when a room is assigned).
- **Transportation**: the ride preferences stored on the reservation are filed into a
  `transportation_requests` row for the Front Desk to schedule (no fare charged to the
  booking — settled with the hotel directly).

### 3.5 Where every booking field lands (post-fix, 2026-09-09)

| Field | Stored | Guest sees | Staff sees |
|---|---|---|---|
| Name, email, mobile | `reservations` + `guests` | Review, confirmation, my-reservations | Detail modal (Stay summary / Guest contact) |
| Address, nationality | `guests` | Review page | Detail modal Guest contact |
| Expected arrival | `reservations.expected_arrival` | Review, my-reservations Stay tab | Detail modal, update-guest form |
| Request options | `reservations.request_options` | Review, payment, confirmation (chips) | Detail modal "Requested at booking" chips + derived `guest_requests` after confirm |
| Special requests | `reservations` + `guests` | Review, my-reservations | Detail modal Requests and notes |
| Transportation prefs | `reservations.transportation_preferences` | Review, confirmation, Transportation tab | Transportation panel, manager oversight |

## 4. Front Desk operations

### 4.1 Walk-in / phone reservations

`front_desk_create_reservation` — same availability math, same hold-free path,
`source` recorded (`walk_in`, `phone`, `front-desk`, `website`), idempotency key
guarded. Staff-created reservations are not subject to the online deposit deadline.

### 4.2 Check-in and room assignment

`front_desk_check_in(reservation, room)` behind a three-gate validation
(migration 20260919):
1. Reservation is `confirmed`.
2. Room is administratively active, not maintenance-blocked, clean or same-day serviceable.
3. Room type matches — **unless** a Manager-approved room-type exception exists
   (structured exception approvals, not ad-hoc overrides; repricing per approved
   exception policy D-004).

On check-in: reservation `checked_in`, `reservation_room_assignments` row written
(trigger links pending housekeeping stayover tasks to the physical room), identity
verification recorded if performed. Pre-assignment before arrival is also supported
(assignment without status change). **No-show**: `mark_reservation_no_show` after the
configured cutoff; releases room inventory.

### 4.3 Checkout

`front_desk_checkout` — requires balance settled (or an explicit recorded exception);
reservation `checked_out`; a `checkout_cleaning` housekeeping task is filed
automatically; the room turns `dirty` until housekeeping completes turnover.

### 4.4 Guest-request review

Front Desk sees customer submissions grouped by `batch_id` (Guest requests panel).
One decision covers the whole submission:
- **Approve** → each item routes to its department queue (housekeeping tasks created
  where applicable).
- **Decline** → reason is required and guest-visible; every item in the batch is
  cancelled, including pending housekeeping tasks.

Manager sees the same queue read-only; can escalate an item to an approval request.

## 5. In-stay operations

- **Stay payments**: the guest may submit additional payments (bank transfer / GCash)
  from the portal — `customer_submit_stay_payment` → Accounting verifies
  (`verify_customer_stay_payment`), same idempotency rules as deposits.
- **Charges**: Front Desk posts folio charges to the in-house reservation; Accounting
  may reverse charges or record adjustments/credits/write-offs — every financial
  mutation is versioned and audited.
- **Change requests**: `customer_request_reservation_change` — the guest proposes new
  dates/type/guests; the system recalculates totals and the payment difference; a
  trigger syncs execution status. Changes execute through Front Desk with payment
  settlement, not silently.
- **Housekeeping lifecycle**: `housekeeping_assign/start/complete/inspect/defer` +
  report-maintenance; inspection gates the room returning to "clean"; deferrals and
  maintenance reports create cross-department work.
- **Maintenance lifecycle**: `maintenance_create_work_order` (from staff, housekeeping
  reports, or guest requests) → assign → start → diagnose (severity, serviceability
  impact, parts status) → progress → resolve → close. A diagnosis of
  `blocked`/`out_of_service` marks the room unsellable; resolving restores room state
  (`maintenance_restore_room_state`).

## 6. Accounting

- **Payment verification queue**: deposits and stay payments, proof preview via
  60-second signed URLs, over/under vs expected deposit surfaced, decision reason
  required on rejection.
- **Refunds**: two paths (D-006 — Accounting owns routine financial operations). A policy-computed
  refund needs no Manager: `cancel_reservation` derives the entitlement from the frozen
  `operational_policy_snapshot` (paid deposit × basis points) and inserts the `refund_requests` row
  with `exception_approval_id NULL` — the policy computation itself is the authorization, and
  Accounting settles it directly via `process_refund` (idempotent by `idempotency_key=rr.id`;
  `REFUND_EXCEEDS_RECEIVED` aggregate guard). A refund **exception** (an amount the policy does not
  grant) routes through the Manager approval engine: the approved amount is written to
  `eligible_amount` with `normal_policy_amount` as the baseline, and Accounting executes exactly
  that approved amount; trigger `refund_completes_manager_approval` stamps the approval executed —
  no re-approval loop. The queue badges each row **Within policy** / **Manager approval required** /
  **Approved exception** (`refundBasisBadge`). Failures recorded with attempts; cancellation refund
  policy (from the snapshot): 100% ≥ full-refund days before arrival; partial ≥ partial-refund
  days; otherwise non-refundable.
- **Cash shifts**: opened/closed per cashier with declared totals; discrepancies
  flagged in the ledger.
- **Financial documents**: receipts and folio statements generated on demand
  (`financial_documents`), one authoritative document per artifact.

## 7. Transportation lifecycle

Filed on confirmation (or by staff). States: `filed` → Front Desk **schedules**
(confirms pickup date/time, guest-visible notes) → assigns driver/vehicle →
`in_progress` → `completed` (or `cancelled`). Round trips have outbound + return legs.
No fare touches the reservation folio; settlement is direct with the hotel. Guest sees
their trips in the portal Transportation tab with driver/vehicle once visible.

## 8. Manager oversight and approvals

- **Oversight is derived, never mutating** (`lib/manager-attention.ts` is pure
  derivation — no supabase, no fetch): which reservations need attention, risky
  arrivals/departures, readiness, exceptions. Manager panel actions route through the
  same approval workflow Front Desk uses; the Manager never executes operations.
- **Approvals**: `request_manager_approval` creates a structured request (type,
  severity, reason, requested action, department). Review → approve/reject; approved
  requests execute through the responsible department (e.g. room-type exceptions
  execute as Front Desk, guest compensation applies as Accounting). The approvals
  summary strip counts **awaiting Accounting** — approved financial exceptions
  (guest compensation, refund exception) still to be executed — so the Manager can
  see what Accounting owes without touching the ledger itself. High/critical may
  escalate to Owner (`escalate_manager_approval_to_owner`); owner-only requests are
  guarded by trigger (`owner_exception_review_guard`).

## 9. Admin governance

Account lifecycle (create staff, change status/role/metadata, initiate recovery),
room and room-type catalog edits, request-type and transport-vehicle catalogs — all
with optimistic version guards (`p_expected_version`), reasons, and audit. User
accounts are **never deleted** (audit FK immutability) — they are deactivated.
Recovery uses hashed single-use tokens with expiry.

## 10. Core state machines

**Reservation**: `pending` (awaiting deposit) → `confirmed` → `checked_in` →
`checked_out`; terminal alternatives `cancelled`, `no_show`. A pending *website*
reservation past `payment_due_at` stops blocking inventory (treated as released by
the availability math; formal expiry handled by the same sweep).

**Payment** (deposits and stay payments): `pending_verification` → `paid` |
`failed`; `paid`/`failed` are settled and immutable — correction is a compensating
entry (refund/adjustment), never an edit.

**Housekeeping task**: `pending` → `assigned` → `in_progress` → `completed`
(+ `inspection_status`); `deferred` and `cancelled` branch off; guest-request tasks
are cancelled with their batch.

**Maintenance order**: `open` → `assigned` → `in_progress` → `resolved` → `closed`;
branches `waiting_parts`, `deferred`, `cancelled`.

**Transportation request**: `filed` → `scheduled` → `in_progress` → `completed` /
`cancelled`.

**Hold**: `active` → (`payment_submitted` → `completed`) | `expired` (15-minute sweep
`expire_booking_holds`, which every read path calls before querying).

## 11. Automation inventory (triggers)

| Trigger | Effect |
|---|---|
| `booking_holds_policy_snapshot` / `reservations_policy_snapshot` | Stamp deposit/operational policy at write time — bookings never reprice |
| `guest_request_create_housekeeping_task` | Housekeeping task per approved housekeeping-type request (assigned room required) |
| `link_housekeeping_tasks_to_assigned_room` | Re-binds pending stayover tasks when a room is assigned |
| `refund_completes_manager_approval` | Refund outcome closes its linked approval |
| `sync_customer_change_request_status` | Change-request execution status follows reservation/payment state |
| `sync_user_account_lifecycle` | Account status changes propagate to auth |
| `owner_exception_review_guard` | Owner-only approval rows cannot be decided by others |
| settled-payment immutability trigger | Settled payments reject updates |
| user_accounts audit trigger | Statement-level immutable audit on account rows (why accounts are deactivated, never deleted) |
| transportation on-confirm filer | Rides requested at booking are filed on confirmation |
| room-assignment exception triggers (20260919) | Keep exception inventory and readiness consistent |

## 12. Known gaps (from SYSTEM.md §15 and current status)

- `room_is_sellable` exists remote-only (not in schema.sql) — the fresh-install
  snapshot lags the last migrations.
- `front_desk_assign_room` skips the `administratively_active` check (mitigated at the
  eligibility API layer).
- Manual payments at Front Desk (cash) partially modeled.
- Pre-existing test debt: `manager-reservations-panel.test.tsx` date-rot (2
  deterministic failures), room-catalog next.config.mjs flake (re-run once).

## 13. Related documents

- `SYSTEM.md` — authoritative governance (§6 booking, §7 role portals, §8 data
  integrity).
- `docs/FRONT_DESK_OPERATIONS.md`, `docs/MANAGER_OPERATIONS.md` — per-role detail.
- `docs/PROVISIONAL_BUSINESS_POLICIES.md` — policy values not yet hard-coded.
- `nano_bots/05 Memory/Decisions.md` — D-002…D-005 active decisions.
