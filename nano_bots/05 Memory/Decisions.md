# Decisions

Lightweight decision log. Each entry records a choice that constrains future development.
Trivial implementation details do not belong here. Historical sessions never override the
current system or `SYSTEM.md` — see [[AI Session Handoff]] for the authority order.

## D-017 — One interaction system with customer and internal presentation contexts

Date: 2026-09-18
Status: Active

### Decision

Shared HAVEN controls use one behavior contract with two density contexts: `customer`
(spacious, consumer-facing, approximately 44px controls) and `internal` (compact,
operational). Combined data controls always follow search → quick filters → advanced
filters → results in both DOM and visual order. Search is automatically debounced (350ms
default), ordinary filters apply immediately, and quick-filter groups put `All` first and
use it as the default unless a workflow explicitly opens a scoped queue.

`HavenSelect`, `Modal`, `TablePagination`, `ToastStack`, `HavenLoader`, and
`RoomTypeBadge` remain the canonical existing implementations. New shared search/filter,
button, status, empty-state, and hotel-time helpers extend rather than replace them.
Presentation standardization must never alter hotel workflow, authority, calculations,
or stored state.

### Reason

Customer and staff pages need consistent keyboard behavior, feedback, and filter semantics
without collapsing their intentionally different information density or duplicating
control architectures.

### Related

`docs/HAVEN_UI_STANDARDS.md` · `DESIGN.md` §10/§14 ·
[[2026-09-18 - Universal UI Foundation]]

---

## D-001 — Migrations are applied with `supabase db push`, never `npm run migrate`

Date: 2026-08-30 (observed)
Status: Active

### Decision

All schema changes ship as files in `supabase/migrations/` and are applied to the remote
database only with `npx supabase db push`.

### Rules

- `migrate.mjs` records no ledger row — using it desyncs `supabase migration list`.
- Before picking a migration number, check local files AND the remote ledger — parallel
  sessions have collided on numbers before.
- The live remote DB is authoritative for applied state, not the local ledger.

### Reason

A 2026-08-30 ledger drift had to be repaired manually; `db push` keeps the remote ledger
consistent.

### Related

[[Setup & Commands]] · `SYSTEM.md` §12

### Origin

Reconstructed from project memory and git history (no session note exists).

---

## D-002 — Room eligibility has one server-side authority; the UI never duplicates it

Date: 2026-09-08
Status: Active

### Decision

Physical-room eligibility for check-in assignment is defined only by the
`front_desk_room_is_eligible` / `front_desk_eligible_room_inventory` RPCs. Every client
(dropdowns, dialogs) renders what those endpoints return; no availability rule is
re-implemented in TypeScript or in the browser.

### Rules

Eligible = active room type + administratively active room + `status='available'` +
`housekeeping='clean'` + not maintenance-blocked + no overlapping active assignment +
confirmed reservation.

### Reason

The old eligible-rooms route filtered maintenance statuses client-side; that duplicate logic
drifted from the DB rules and let stale/wrong rooms appear.

### Related

[[Check-in & Room Assignment]] · [[Maintenance Operations]] · [[2026-09-08 - Session 01]]

### Origin

[[2026-09-08 - Session 01]]

---

## D-003 — Room-type exceptions carry structured IDs and are validated at three gates

Date: 2026-09-08
Status: Active

### Decision

A room-type exception request carries `requestedRoomTypeId`, `requestedRoomId`,
`originalRoomTypeId` (plus display names) — real primary keys, never type names or free text.
Only the guided arrival dialog can create this request type; the generic exception form
cannot. DB triggers revalidate at request insert, Manager approval, and check-in
(`ROOM_TYPE_EXCEPTION_ROOM_CHANGED` covers the two-Front-Desk race).

### Rules

- Alternative types are offered only when the reserved type has zero eligible rooms, and only
  types with ≥1 eligible room (reserved type, inactive types, zero-eligibility types excluded).
- Manager approval is always required; rejected requests leave the reservation untouched.
- Approved requests stay `awaiting_execution` until Front Desk checks in.

### Reason

Free-text room-type entry let Front Desk fabricate inventory; with the approval-time trigger
requiring a uuid, those requests could never be approved at all.

### Related

[[Check-in & Room Assignment]] · [[Manager Approvals]] · [[2026-09-08 - Session 01]]

### Origin

[[2026-09-08 - Session 01]]

---

## D-004 — Room-type change financial responsibility derives from the approved reason (SUPERSEDED re: repricing)

Date: 2026-09-12 (rule introduced) · 2026-09-08 (documented, preserved) · 2026-09-22 (superseded)
Status: Superseded — the unconditional repricing rule below was replaced by reason-coded
financial responsibility (migration `20260922010000`, see [[D-008]]).

### Decision (SUPERSEDED — kept for history)

`front_desk_check_in` repriced the invoice to `round(target_type.base_rate × nights)` when
consuming an approved exception, and blocked check-in with
`ROOM_TYPE_EXCEPTION_BALANCE_DUE` while the repriced balance was unpaid.

### Superseding rule (2026-09-22)

Financial responsibility is derived server-side from a structured, Manager-approved reason code —
never a manual "who pays?" control. Hotel-caused reasons → the hotel absorbs any positive rate
difference (guest keeps the original agreed total; folio untouched; absorbed amount audited).
Guest-requested reasons → the guest pays the positive difference, with recorded guest acceptance
(`record_room_type_change_acceptance`) and folio settlement before finalization. Downgrades display
the negative difference and flag it for review — no refund policy was invented. Full rule:
SYSTEM.md § "Room-type change financial responsibility". See [[D-008]].

### Rules

- No other pricing change is made anywhere in the exception flow.
- Downgrade refunds remain out of scope until an explicit business decision exists.

### Reason

Pre-existing rule in migration `20260912020000`; preserved unchanged because changing
reservation pricing requires an explicit business rule. The business rule arrived 2026-09-22.

### Related

[[Check-in & Room Assignment]] · [[Known Issues]] · [[D-008]]

### Origin

[[2026-09-08 - Session 01]]

---

## D-005 — `user_accounts` rows are never deleted, only deactivated

Date: observed 2026-09 (pre-vault)

### Decision

Deactivate accounts; never `delete from user_accounts`.

### Reason

The audit FK `SET NULL` fires a statement-level immutable-audit trigger even on zero rows,
making any teardown DELETE fail. Full teardowns need the trigger disabled explicitly.

### Related

[[Auth & Permissions]] · [[Admin Governance]]

### Origin

Reconstructed from project memory (no session note exists).

## D-006 — Manager attention rules are derived, never mutating

Date: 2026-09-08 (Session 04)

### Decision

Manager reservation oversight issues (overdue checkout, unresolved arrival, room readiness,
pending approvals, financial warnings) live in a pure presentation module
(`lib/manager-attention.ts`) over server-authorized data. They never change a reservation
status, and "Review Exception" routes through the existing manager approval workflow — no
direct modification shortcut is ever added to the Manager UI.

### Reason

The Manager role is oversight + approval authority, not a second Front Desk/Accounting
operator. Derived advisory state keeps a single source of truth for status transitions
(the RPC layer) while still surfacing operational risk.

### Related

[[Manager Approvals]] · [[2026-09-08 - Session 04]] · `SYSTEM.md` §7.8–§7.9

## D-007 — Accounting handles routine financial operations; Manager handles exceptions

Date: 2026-09-09 (Session 05)

### Decision

A policy-computed refund is authorized by the frozen cancellation policy itself: `cancel_reservation`
creates the `refund_requests` row with `exception_approval_id NULL` and Accounting settles it directly
(`process_refund`) — no Manager approval step exists on the normal path. Only amounts the policy does
not grant route through the Manager approval engine (`refund_exception`), and even then the Manager
authorizes while Accounting executes. The same split holds for every financial capability:
deposit/stay-payment verification, refunds, folio adjustments, reconciliation are Accounting-only
(`lib/permissions.ts`); Manager has no financial execution flags and no financial dashboard sections.

### Reason

Removing workflow loops between Accounting and Manager: a second human approval on a
policy-compliant amount added latency without adding control — the server already recomputes the
entitlement from the frozen snapshot, validates exception amounts against settled deposits, fixes the
executable amount at approval time, and stamps execution closed via
`refund_completes_manager_approval` (no re-approval loop). The audit trail (2026-09-09 session)
verified the RPC layer already enforced this model end-to-end; the revision closed the display gap —
the refund queue now badges each row Within policy / Manager approval required / Approved exception
(`refundBasisBadge`, `normal_policy_amount`, `exception_approval_id` loaded in `lib/staff-data.ts` and
`lib/accounting.ts`), and the Manager approvals summary counts "awaiting Accounting" exceptions.

### Related

[[Manager Approvals]] · [[2026-09-09 - Session 05]] · `SYSTEM.md` §7.4, §7.8–§7.9 · [[D-006]]

---

## D-008 — Room-type change financial responsibility derives from the approved reason code

Date: 2026-09-22 (Session — room-type change responsibility)
Status: Active

### Decision

Every `room_type_exception` and `room_upgrade` request must carry a `reasonCode` from the
`room_type_change_responsibility()` allowlist (SQL helper, mirrored in
`lib/room-type-change-reasons.ts`). `request_manager_approval` strips any client-submitted
financial field and stamps a server-computed snapshot into `requested_action.financials`
(reasonCode, responsibility, originalTotal = `reservations.total`, targetRate, nights,
targetTotal, difference), frozen at request time. Consumption branches on the derived
responsibility:

- Hotel-caused (type unavailable, unserviceable, maintenance, overbooking, hotel error, failed
  APPROVED early check-in) → hotel absorbs any positive difference; guest keeps the original
  agreed total; folio untouched; absorbed amount audited.
- Guest-requested (larger room, premium type, better view, early-arrival upgrade) → guest pays
  the positive difference; `record_room_type_change_acceptance` records acceptance and posts the
  charge through the existing folio architecture (idempotent on the approval id); execution
  raises `ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED` without it.
- Downgrade (negative difference) → displayed and flagged for Manager review; pricing stays at
  the original total — no refund policy exists.
- Same-type reassignment stays ₱0 (unchanged `type_mismatch=false` path).

The "same-type room available ⇒ unnecessary" gates apply to hotel-caused changes only — a
guest-requested voluntary upgrade is legitimate while reserved-type rooms remain. Legacy requests
without a `financials` stamp can no longer be approved (reject + re-request). The manual
`priceDifference`/`waived` inputs are gone.

### Reason

Business rule (task spec, 2026-09-22): the system derives responsibility from the approved
reason — a manual "who pays?" control invites the Front Desk to charge the guest for the hotel's
problem or give away revenue without a record. Also fixed en passant: the old exception branch
rewrote `invoices.amount`, silently dropping unrelated charges (e.g. transportation fares) from
the folio total; the new branch never rewrites the invoice.

### Related

[[Check-in & Room Assignment]] · [[Manager Approvals]] · [[D-003]] · [[D-004]] (superseded) ·
`SYSTEM.md` §7.8 "Room-type change financial responsibility"

### Origin

[[2026-09-22 - Room-Type Change Responsibility]]

---

## D-009 — Stay extension semantics: in-house only, one implementation, Manager exception only on room conflict

Date: 2026-09-23 (Session — stay extension workflow)
Status: Active

### Decision

A **stay extension** (extra nights — the checkout *date* changes) is a distinct business case
from **late checkout** (same date, later *time*), and is governed by:

- **In-house only.** Both the normal path (`front_desk_extend_stay`) and the
  `stay_extension` Manager exception require `status='checked_in'`. A pre-arrival
  checkout extension is an existing `reservation_modification` — no second path exists
  for it (no duplication of D-008's room-change model either: a cross-type move goes
  through the reason-coded room-type change exception first, then extends normally).
- **Normal path first.** Front Desk extends directly whenever the room is free; the
  `stay_extension` exception exists for exactly one refusal:
  `EXTENSION_REQUIRES_ROOM_CHANGE` (the room is taken during the added nights). Approval
  is allowed with a conflict recorded — the conflict is why the exception exists;
  **execution enforces integrity and never creates an overlap**.
- **One extension implementation.** The exception's execute branch performs the same
  `front_desk_extend_stay` with the approval id as idempotency key, so every guard,
  charge, date update, and audit event re-runs atomically. Room moves at execution are
  **same-type only** (validated, with turnover task); a cross-type move must be a separate
  room-type change first.
- **Pricing is the existing rule**: current room-type `base_rate` × added nights, charged
  once through the standard folio/invoice architecture. No extension pricing policy was
  invented and none may be.
- **Figures are server-stamped.** `request_manager_approval` strips any client-supplied
  snapshot and stamps `requested_action.stayExtension`
  ({currentCheckOut, requestedCheckOut, nights, rate, additionalAmount, projectedTotal,
  roomConflict, roomNumber, roomType}); the new `front_desk_extend_stay_preview` RPC is
  the only source of the figures the Extend stay dialog shows. Manager decides, Front
  Desk executes, the system audits — approval never auto-executes.
- Departure transportation booked on the old checkout date is **flagged, never
  rescheduled** — coordinate with Transportation.

The 2026-09-23 dropdown audit confirmed all eight generic Manager-exception options are
live business cases; label clarifications only, nothing removed.

### Reason

Task spec (2026-09-23): extension payment must ride the existing folio architecture (no
disconnected extension payment system), staff must never type values the server can
derive, and no execution path may create a room overlap.

### Related

[[Manager Approvals]] · [[D-003]] · [[D-008]] (room-move financial model, reused not
duplicated) · `SYSTEM.md` §7.4 "Extend stay", §7.8 "Stay extension"

### Origin

[[2026-09-23 - Stay Extension Workflow]]

## D-010 — Room-type badge color governance: reservation scope, approve = activate, Owner/Admin-only recolors

Date: 2026-09-24 (Session — room-type badge color workflow)
Status: Active

### Decision

A room-type's badge color (semantic key on `room_types.badge_color_key`, one of the eight curated
HAVEN palette keys) is governed by three rules (migration `20260927010000`, extending the
`20260925010000` column/palette/index work):

- **Reservation scope.** A color is held by active types *and* inactive types with a pending rate
  proposal — a pending proposal is a room type on its way live, so its color is reserved until the
  proposal is decided. Rejection frees the color automatically (the scope is derived from live
  rows; nothing is stored on the proposal). All four claim paths (create, update, propose,
  review-approve) serialize on a per-color transaction advisory lock before the existence check;
  the `20260925010000` partial unique index over active types remains the race-proof backstop.
- **Approve = activate.** Approving a rate proposal on a still-inactive type (the shape every
  Manager creation takes) sets the rate *and* publishes the type with its badge in **one**
  decision — no second activation step and no second approval. The color is revalidated at
  approval (stale-form protection); the rate must be > 0. Already-active types keep rate-only
  approval.
- **Active-type recolors are Owner/Admin-only.** A Manager's edit form shows the color read-only
  (mirroring the rate field); the RPC raises `BADGE_COLOR_CHANGE_APPROVAL_REQUIRED` on any
  change. Managers choose freely at creation and on still-inactive types.

Creation requires a color (API zod enum, swatch selector with the shared `RoomTypeBadge` preview;
reserved colors are disabled with the holder named, never hidden). Physical rooms inherit the
type's color — there is no per-room color control. Room status/housekeeping colors and all
pricing/inventory/booking rules are untouched.

### Origin

[[2026-09-24 - Room-Type Badge Color Workflow]]

---

## D-011 — Staff notification surfaces are three distinct derived views; no persistent read/unread store

Date: 2026-09-11 (Session — staff notification badges + toasts)
Status: Active

### Decision

Staff notifications have exactly three surfaces with non-overlapping meanings, and none of them
persists notification state:

- **Sidebar module badge = pending actionable workload.** A count derived server-side in
  `getDashboard` from the module's own domain state (pending batches, `REQUESTED` rides, open
  tasks, `pending_verification` payments, …), role-gated to the roles that can act on it. It is
  never an unread count, never a total record count, and modules without a true actionable-pending
  state (Reservations, Rooms, Guests, Inventory, Billing, Transactions, Folios, Cash & Shifts,
  Reconciliation, Documents, Reports) carry no badge.
- **Header bell = live derived alerts.** The pre-existing `dashboard.notifications` list computed
  in `getDashboard(role)`. Alerts resolve with the underlying work; there is no read/unread table,
  no `staff_notifications` schema, no migration. A badge clearing means work was done, not read.
- **Toast = transient new-event alert.** `components/ui/toast-stack.tsx`, diffed against a
  seen-ids ref that seeds silently on the first poll — a refresh never replays history as toasts.

Refresh stays on the existing 30 s poll of `/api/manager_dashboard`. No Supabase Realtime: the
browser never talks to Supabase (service-role-only, zero public policies), so realtime would
require exposing an anon key and public RLS policies, violating the security model.

Front Desk never gains a Deposit Verification/Refunds badge (Accounting-only, matching the
execution authority in D-007); Owner/Admin dashboards are out of scope (operational 5 roles only).

### Reason

Task spec (2026-09-11) with user confirmation: a persistent read/unread store would create a
second notification system duplicating `getDashboard`'s derivations, and the badge/unread
conflation the spec warns about is impossible by construction when no read state exists.

### Related

[[2026-09-11 - Session 06]] · `SYSTEM.md` §7.9 "Staff notification surfaces" · [[D-007]]

### Origin

[[2026-09-11 - Session 06]]

## D-012 — Hotel timezone is Owner-or-System-Administrator configuration

Date: 2026-09-30 (Session — System Administrator formalization)
Status: Active

### Decision

The internal `admin` role (displayed as System Administrator) may change `hotel_timezone`
in the operational policy, same as Owner. Other roles may not. Migration
`20261001010000` intentionally removed the former Owner-only gate from
`admin_update_operational_policy`; stale-version protection, required reason, audit
logging, IANA validation, and future-only snapshots are preserved.

### Reason

Timezone is system/operational configuration, which fits the System Administrator
responsibility (users, configuration, room setup, policies, health, audit). The Admin
policy dialog label incorrectly claimed Owner-only; route guard, RPC guard, and UI are
now consistent end to end.

### Related

[[2026-09-30 - System Administrator Formalization]] · `SYSTEM.md` §7.10 ·
`supabase/migrations/20261001010000_policy_timezone_admin.sql`

### Origin

[[2026-09-30 - System Administrator Formalization]]

---

## D-013 — Notification history is a modal with hotel-day filtering; staff read state is per-device UI dismissal

Date: 2026-09-15 (build session — "View all notifications" modal)
Status: Active (user-authorized amendment of [[D-011]])

### Decision

"View all notifications" opens the shared `HavenNotificationModal`
(`components/ui/haven-notifications.tsx`) instead of navigating, on both the
guest bell and the staff operations bell. The modal filters by hotel day (Today / Yesterday /
loaded days / specific date, Asia/Manila bucketing in `lib/notifications.ts`), groups
notifications by recency, supports All / Unread / Read and Newest / Oldest controls, and offers
"Mark visible as read" for the current filtered result. Opening the modal never marks anything
read; the guest `/account/notifications` page
stays intact for direct URLs.

- **Guest:** persistent `read_at` on the existing `notifications` table (now exposed to the UI)
  plus `GET/POST /api/account/notifications[/read]`; the bell carries one aggregate unread badge.
- **Staff:** no new table, no fan-out rows, no second fetching system (upholds D-011's core).
  The modal reuses the already-loaded role-scoped `dashboard.notifications`; read/dismissed ids
  live in per-device `localStorage` (keyed per user+role, capped at 500). The server alert list
  stays authoritative, sidebar workload badges never consume read state, and toasts are untouched.

### Amendment (2026-09-19 — customer dropdown + View-All modal redesign, user-authorized continuation)

Guest bell is **click-to-open** (hover = tooltip/highlight only). The dropdown previews ≤ 7
events from the same authoritative source — unread-first (newest) then an "Earlier" read group —
with per-row semantic icons (`NOTIFICATION_TYPE_ICONS`, `reservation_cancelled` included),
relative Manila times, an accessible unread dot, one-row optimistic mark-read, and
server-authoritative "Mark all as read" (`POST /read` with `{all:true}`), plus
loading/empty/error states. The modal adds
**All / Unread / Read quick-filter tabs** (All first, default; the hotel-day filter is retained
alongside, defaulting to "All days" per the user's choice) plus a Newest/Oldest sort,
recency grouping (Today / Yesterday / Earlier this week / Earlier, hotel days), and "Load more"
paging via additive `?offset=` on `GET /api/account/notifications` (100-row windows, cap 200,
dedupe on append) so the complete history stays reachable without an unbounded fetch. Rows in
both surfaces render through one shared `HavenNotificationItem`, so dropdown and modal can
never disagree on content. Staff triad (sidebar badges / derived bell / toasts) and D-011's
no-second-system rule are untouched.

### Reason

D-011 forbade a persistent staff read/unread store as a second notification system. The user
explicitly requested staff history too while keeping every ban (no duplicate records, no second
system, no RBAC change, no business-rule change). Per-device dismissal satisfies the visible
behavior (unread grouping, bell updates, filtered-result mark-read) with zero migration and zero new
emitters; the small-volume reuse is expressly allowed by the brief.

### Related

[[D-011]] · `SYSTEM.md` §7.3, §7.9 · `lib/notification-history.test.ts` ·
`components/customer/notification-history-modal.test.tsx` ·
`components/customer/customer-shell-notifications.test.tsx` ·
`components/manager/staff-notification-history.test.tsx`

---

## D-014 — Time-of-day entry is a native `<input type="time">`; no custom clock/wheel picker

Date: 2026-09-16 (Guest Details refinement session)
Status: Active

### Decision

Guest-facing time entry uses the platform's own time control. On **Guest Details**
(`/booking/details`) the **Expected arrival** field is a plain native
`<input type="time">` inside the shared `.booking-form-grid` — the same control as
**Need a ride? → Pickup time** — and the custom radial clock popover / touch wheel sheet
(`ExpectedArrivalPicker`, ~230 lines plus its CSS block) is deleted outright. Native time
inputs return canonical 24-hour `HH:MM`, which is exactly what `guestDetailsSchema`
(`lib/booking.ts`) stores, so there is no normalization layer, and no API, schema, or DB
change.

- **Expected arrival stays required** — the existing JS guard and its `.booking-error`
  paragraph are preserved verbatim (no `required` attribute, so no browser bubble).
- **Expected arrival and Pickup time remain independent fields** with independent state;
  neither binds to the other. Expected arrival is an *estimate* — it never implies, seeds,
  or auto-approves an early check-in request.
- Same rule applies to the other times on the page: Return time and Pickup time were already
  native inputs; Return date / Pickup date stay native `<input type="date">`.

### Reason

The radial clock consumed a large popover on a two-column guest form and duplicated a control
the same page already solved better. The project already prefers the native platform feature
over a custom picker (this is the same call as `<input type="date">` and the room radiogroup),
and the stored value format was already identical — so the picker was pure presentation cost.
`DESIGN.md` §11 now states time inputs are out of scope for `HavenSelect`-style restyling.

### Related

`SYSTEM.md` §7.2, §1435 · `DESIGN.md` §11 · `lib/arrival-time-options.ts` (`formatArrival`) ·
`components/booking/guest-details-form.test.tsx` · `lib/booking.test.ts` ·
[[2026-09-16 - Expected Arrival Time Input]]

---

## D-015 — Pre-arrival inventory options are Manager-governed, in-stock-only, fulfillment-consumed

Date: 2026-09-16 (build session — inventory-backed Guest Details options)
Status: Active

### Decision

Amenities under Guest Details "What can we prepare before you arrive?" come from live
inventory through `guest_request_catalog` rows carrying an explicit,
independent `pre_arrival_requestable` flag plus `inventory_item_id`. Offered iff the row
is active AND pre-arrival-enabled AND the linked item's `quantity > 0`
(`inventory.quantity` is authoritative; `status` is staff-maintained display state with
no trigger, so gating ignores it). Quantities never reach the customer; empty shelves
render "Request items are temporarily unavailable." — never dummy items.

- **Governance is Manager-only** for the two new columns (DB-verified role in the PATCH
  route; Owner/Admin keep generic catalog administration but gain no pre-arrival toggle —
  SYSTEM.md grants Owner no such operational capability, and the System Administrator
  role is excluded). In-stay portal behavior (`active` only) is unchanged by either flag.
- **No reservation:** selecting an option reserves nothing; consumption stays at
  fulfillment, where `guest_requests.inventory_item_id` (stamped by
  `file_booking_guest_requests`) drives exact consumption with the legacy name-match as
  fallback for old rows. Holds revalidate every selection against the live offering.
- High floor / early check-in / celebration stay structured service constants, never
  inventory rows.

### Reason

User corrections: generic catalog roles must not leak into booking visibility;
in-stay and pre-arrival visibility must be independently governable; stale status must
not gate; requests must not reserve stock.

### Related

`SYSTEM.md` §7.2, §7.7 · `supabase/migrations/20261005010000_pre_arrival_inventory_requests.sql` ·
`lib/inventory-request-options.ts` · [[2026-09-16 - Pre-Arrival Inventory Options]]

---

## D-016 — Owner controls WHERE customer money goes; System Administration controls HOW payments work

Date: 2026-09-16 (build session — GCash-only customer deposits)
Status: Active

### Decision

New online reservation deposits are **GCash-only** (`manual_gcash`). Payment
responsibility splits three ways, each enforced server-side:

- **Owner** edits the customer-facing GCash destination (account name, mobile
  number, official QR, enabled flag) through the dedicated
  `owner_update_payment_destination` RPC, which refuses every non-Owner actor
  (`PAYMENT_DESTINATION_OWNER_ONLY`). Destination columns live on
  `hotel_operational_policies`; changes are version-checked and audited with
  the number masked (`09******8211`).
- **System Administrator** sees the same values masked and read-only, plus
  technical health (QR storage, completeness, webhook/provider `Not
  configured`, auto-verify `Disabled`). No editable copy exists anywhere.
- **Accounting** verifies submitted proofs; it cannot touch the destination.

Staged QR uploads go live only on Save behind an explicit money-redirection
confirmation; replacing the QR retires the old object. Historical
`manual_bank_transfer` rows and the portal stay-payment form keep both labels.

### Reason

User business decision: changing where customers send deposits must require
Owner authority with an audit trail, while technical integration stays with
System Administration. One authoritative source prevents divergent copies.

### Related

`SYSTEM.md` §6, §7.2 · `supabase/migrations/20261006010000_gcash_payment_destination.sql` ·
`lib/payment-destination.ts` · [[2026-09-16 - GCash Deposit Flow]]

---

## D-017 — One unresolved reservation-change request per reservation, single modal, per-request notification

Date: 2026-10-07 (build session — customer Request-a-Change redesign)
Status: Active

### Decision

- **One unresolved request at a time.** `customer_request_reservation_change` already refused a
  second open row (`CHANGE_ALREADY_OPEN` on `status IN ('pending','approved')`, race-safe behind
  the reservation `FOR UPDATE` lock); this work keeps that guard as the authority and mirrors it
  in the UI (non-action "Change request under review" button + status panel). Resolved
  (executed/rejected/cancelled) rows never block a future request.
- **One complete modal.** Dates (native date pickers), room type (HavenSelect over the
  `room-options` endpoint — same `getAvailability` engine, name+units projection), and the
  required reason (textarea, server floor min 3 / max 500) submit once with one idempotency key
  per modal open plus a synchronous double-submit guard.
- **Exactly-once bell entry.** `reservation_change_submitted` notification type (migration
  `20261007010000`) addressed per change request behind a partial unique index, so idempotent
  replays collapse instead of duplicating; `recordNotification` never fails the response.
- **Shared ToastStack in the customer shell** (`CustomerToastProvider`) for the transient
  success confirmation — no second toast architecture.

### Reason

The two-step modal hid the required reason, the free-text room type bypassed inventory, and
the action button stayed live on open requests. All fixes reuse existing authorities (RPC
guard, approval engine, toast component) instead of inventing parallel ones.

### Related

`SYSTEM.md` §7.3 · `supabase/migrations/20261007010000_change_request_notifications.sql` ·
`components/customer/reservation-actions.tsx` · `lib/change-request-redesign.test.ts`

## D-018 — Customer cancellation preview, auto-refund, and exactly-once cancel notification

Date: 2026-09-18
Status: Active

### Decision

- Cancellation reason is required free text (textarea, client/server floor min 3 / max 500).
  There is no reason dropdown anywhere in the cancel flow.
- One cancel modal shows a server-authoritative, read-only refund preview
  (`GET .../cancel/preview`, snapshot-derived via `lib/cancellation-preview`) before commit;
  execution always recalculates inside `cancel_reservation` and the browser never sends amounts.
- A normal policy-compliant cancellation auto-creates exactly one Accounting refund request
  when eligible > 0. The customer never presses a second Request Refund button.
- One persistent `reservation_cancelled` bell entry per cancelled reservation (migration
  `20261008010000`, partial unique index on user+href); recording never fails the response.
- Reservations carry no version column, so cancellation concurrency relies on the RPC row
  lock plus idempotent retry on the cancelled state — no invented version protocol.

### Reason

Customers cancelled blindly (no preview), could lose refunds by missing a second action that
never needed to exist, and received no persistent confirmation. All fixes reuse existing
authorities (snapshot policy, RPC settlement, toast + notification systems) instead of
inventing parallel ones.

### Related

`SYSTEM.md` §7.3 · `supabase/migrations/20261008010000_reservation_cancelled_notifications.sql` ·
`app/api/account/reservations/[id]/cancel/route.ts` · `lib/cancellation-preview.ts` ·
`components/customer/reservation-actions.tsx` · `lib/cancel-reservation.test.tsx`

---

## D-019 — One canonical customer receipt document; eligibility mirrors the staff document RPC

Date: 2026-09-18
Status: Active

### Decision

- Exactly one server-authoritative receipt exists per settled payment. `getCustomerReceipt(userId,
  paymentId)` in `lib/customer` assembles it; the modal, the printable page, the PNG, the PDF and
  the email body all render that same `ReceiptDocument`. No surface may re-derive a value.
- Eligibility is `payments.status = 'paid' and payments.purpose <> 'refund'` — the exact predicate
  `accounting_generate_document` applies. A refund is money leaving the guest, not a payment to
  them, so it never carries a receipt.
- A `financial_documents` `RCP-` number is included only when one was actually issued, and is
  labelled **Receipt number**; the payment's own UUID is labelled **Payment reference**. The two
  are never conflated and a number is never synthesised.
- Payment awaiting verification is **not** a receipt. Payment proof is the customer's upload;
  a HAVEN-issued receipt requires a settled, staff-verified payment.
- PDF and PNG downloads are authorisation-checked server-side through
  `GET /api/account/receipts/[paymentId]`, not by hiding buttons. A foreign, unsettled or refund
  id all return 404 so the response is not a probing oracle.
- Receipt email goes to `session.user.email` only. No address is read from the request body, and
  no address is ever hardcoded. With no mail provider configured the endpoint reports
  `EMAIL_UNAVAILABLE` (503) rather than claiming success.
- Receipt generation adds no dependency: `lib/receipt-pdf.ts` is a hand-written base-14 A4 text PDF
  and `lib/receipt-image.ts` paints the document onto a canvas.

### Reason

The customer surface previously offered `View receipt` for a paid refund row (an action the staff
RPC refuses), labelled a raw payment UUID "Receipt reference", and had no way to take a receipt
away at all. Two representations (live-derived page vs. staff `financial_documents` snapshot) could
disagree. One model, one predicate, one row list removes both the defect and the drift.

### Related

`SYSTEM.md` §7.3 · §7.9 · §11 · `lib/receipt.ts` · `lib/receipt-pdf.ts` · `lib/receipt-image.ts` ·
`lib/customer.ts` (`getCustomerReceipt`) · `app/api/account/receipts/[paymentId]/route.ts` ·
`components/customer/receipt-action.tsx` · `lib/receipt.test.ts` · `lib/receipt-route.test.ts` ·
[[2026-09-18 - Customer Receipt Surface]]

---

## D-020 — One notification presentation family; data authority remains role-specific

Date: 2026-09-19
Status: Active

### Decision

`HavenNotificationBell`, `HavenNotificationPopover`, `HavenNotificationItem`, and
`HavenNotificationModal` are the canonical presentation family for every role that currently
has a persistent/current notification source. Customer uses durable, user-scoped
`public.notifications`; operational staff use the existing role-filtered
`dashboard.notifications` list. Popover and modal receive the same in-memory records and read
state. Sidebar workload badges and transient ToastStack events remain separate.

Customer mark-all is a server-authoritative update of every unread row for the signed-in user.
Operational staff dismissal stays per-device under D-011 because there is no staff notification
table. Owner and System Administrator have no persistent notification source today; audit logs,
health records, and governance records must not be synthesized into a bell inbox merely to make
the header look uniform.

### Reason

The previous customer and operational dropdowns had incompatible dimensions, grouping, labels,
and View-All behavior. Sharing presentation fixes that drift without changing RBAC, introducing
duplicate notification records, or weakening the service-role-only database architecture.

### Related

[[D-011]] · [[D-013]] · `docs/HAVEN_UI_STANDARDS.md` · `SYSTEM.md` §7.3 and §7.9 ·
`components/ui/haven-notifications.tsx`

---

## D-024 — Official redesign direction: Modern Luxury Hospitality SaaS
Date: 2026-09-19
Status: Active

### Decision

The reference dashboard images in `reference/` plus the written brief are the
official system-wide visual authority for every role and module. One token
family, two densities (D-017); dark toggle kept with light default; teal hero
band on dashboards/major landings only, compact headers elsewhere.
`PageHeader` (band/default variants) is the single hero; `ModuleSummaryCards`
is the canonical KPI grammar. Reference content (figures, mascot, sample
modules) is never reproduced — figures always come from authoritative sources.

### Related

`DESIGN.md` §15 · `reference/` · [[2026-09-19 - Redesign Phase 1 Tokens]]

---

## D-021 — Session security policy: own table, live enforcement, passcodes deferred

Date: 2026-10-09
Status: Active

### Decision

- Session security policy lives in its own `security_policies` table (migration
  `20261009010000`), never in `hotel_operational_policies` — operational columns
  freeze into every booking's `operational_policy_snapshot`, and authentication
  values must never be frozen into a reservation.
- Enforcement is live in the NextAuth `session` callback (`lib/auth.ts`), because
  `getToken` only decodes: `callbacks.jwt` does not run per request. The callback
  reads the policy (60 s in-memory cache) plus `user_accounts.last_seen_at` and
  neutralizes expired sessions in one place (`disabled` + guest role + blank id).
- Idle timeout uses server-side `last_seen_at` (stamped at sign-in, throttled to
  one write per minute); absolute lifetime uses the token `iat`. Standard sign-in
  is bound by the inactivity window; Remember Me (offered only when the toggle is
  on) extends to the configured maximum. A never-stamped account is grandfathered
  once so a policy deploy can never silently log everyone out.
- Mutation is System Administrator (`admin` role) only — enforced in the
  `admin_update_security_policy` RPC (`SECURITY_ADMIN_ONLY`) and at the route.
  Owner holds no edit path (read-only Owner visibility is a follow-up).
- Passcode policy is deferred, not faked: the audit proved HAVEN has no
  one-time-passcode/MFA flow (only one-time hashed recovery links), so no
  passcode values are stored or surfaced as configurable. Recovery links are
  untouched. No step-up MFA was invented for this task.

### Reason

A second auth mechanism or an inert "OTP policy" would be configuration theatre:
values with no enforcement path mislead administrators about what is protected.
The session half is fully enforced; the passcode half waits for a real flow.

### Related

`SYSTEM.md` §6 · `lib/security-policy.ts` · `lib/auth.ts` ·
`app/api/admin/security-policy/route.ts` · `app/api/security-policy/public/route.ts` ·
`supabase/migrations/20261009010000_security_policy.sql` · `lib/security-policy.test.ts`

---

## D-022 — Genuine email login OTP inside NextAuth; D-021's deferral is superseded

Date: 2026-10-10
Status: Active (supersedes the OTP-deferral half of [[D-021]]; the session-policy
half of D-021 stands unchanged)

### Decision

- Login OTP is a second stage of the existing Credentials flow, not a second
  system: password verified → pending token (`otpPending` + `challengeId`, no
  role, no id, disabled) → emailed 6-digit code → atomic `auth_otp_verify`
  consumes the challenge → the full session cookie is minted through NextAuth's
  own encode. A correct password alone reaches no protected page while OTP is
  required, and no client flag can complete verification.
- Codes use `crypto.randomInt`; storage holds only
  `HMAC(OTP_HASH_SECRET, challengeId:code)`; resend rotates with a
  server-side cooldown; attempts, hourly issue caps, and failed-password
  lockout are database-backed (no in-memory counters, no `Math.random`).
- One global toggle covers all roles (no weaker backdoor tier). It ships
  **off**: SMTP failure fails closed, existing sessions expire naturally on
  Off→On (emergency = `auth_version` rotation), and recovery links are a
  separate untouched flow.
- Nodemailer is the OTP mailer (server-only `lib/otp-transport.ts`); Resend
  keeps its notification-copy role. Delivery status is factual
  (Configured/Unknown/Ready only after a passing test, test-email to the
  requester's own address, latest `smtp_connection_tested` audit row as the
  "last checked" source).

### Reason

D-021 deferred passcode policy because no flow existed; inventing values then
would have been configuration theatre. The flow now exists with its
enforcement, so the policy, storage, UI, and audit are real — while the same
honesty rule keeps the toggle off until delivery is proven.

### Related

`SYSTEM.md` §6 · §7.10 · §15 · `lib/auth-otp.ts` · `lib/otp-email.ts` ·
`lib/otp-transport.ts` · `lib/otp-flow.ts` · `app/api/auth/otp/*` ·
`app/(auth)/verify/page.tsx` · `supabase/migrations/20261010010000_login_otp.sql` ·
`lib/auth-otp.test.ts` · `.env.example` (SMTP block)

---

## D-023 — Guest-to-staff is an onboarding conversion, not a role-label update

Date: 2026-10-12
Status: Active

### Decision

- `admin_change_user_role` may change roles only within the same guest/staff side of
  the identity boundary. A guest becoming staff must use
  `admin_convert_guest_to_staff`.
- Conversion requires an exact locked ID+email match and zero booking holds or
  reservations, whether the reservation points directly to `user_accounts` or through
  `guests`. This transitively protects linked payments, invoices, refunds, requests,
  transportation, and stay history from being stranded on a current staff identity.
- A successful conversion preserves the user ID, email, name, guest profile, and audit
  trail; creates the staff mirror; forces inactive + recovery-required; replaces the
  prior password with the recovery sentinel; invalidates open OTP challenges and prior
  JWT authority; creates a hashed one-hour recovery token; and audits the transition in
  the same transaction.
- Existing protected-role boundaries stand: Admin may assign operational roles only;
  an authenticated Owner is required for Owner/Admin targets. Service-role possession
  is not permission to impersonate an Owner for a conversion.

### Reason

A role-only update left no staff record, silently retained a guest password, skipped
recovery onboarding, and could make live guest reservations appear to belong to a staff
identity. Atomic conversion makes those invalid intermediate states impossible and
preserves HAVEN's history and least-privilege rules.

### Related

`SYSTEM.md` §6 · `supabase/migrations/20261012010000_guest_to_staff_conversion.sql` ·
`supabase/migrations/20261012020000_guest_to_staff_conversion_input_hardening.sql` ·
`app/api/admin/users/[id]/action/route.ts` · `components/admin/admin-dashboard-client.tsx` ·
`lib/guest-staff-conversion.test.ts`

---

## D-024 — History-carrying guest-to-staff conversion is owner-only and audited

Date: 2026-10-13
Status: Active

### Decision

- The base converter keeps its zero-history rule unchanged. A separate
  `admin_convert_guest_to_staff_with_history` RPC (migration
  `20261013010000`) permits conversion carrying holds/reservations, with
  identical onboarding (staff mirror, sentinel password, inactive +
  recovery-required, session/OTP invalidation, version bump).
- Actor must be an active, non-recovery **Owner**; admin actors are refused
  (`OWNER_AUTHORITY_REQUIRED`). The owner allowlist covers all roles
  including owner.
- Carried history is censused into the audit row
  (`convertedWithHistory`, `holdsCarried`, `reservationsCarried`); no
  reservation, hold, payment, refund, notification, or audit row is
  rewritten. The staff mirror carries `converted_with_guest_history` as the
  hook for future segregation-of-duties guards.
- Guest-portal access is lost by the existing role gate, so converted staff
  cannot continue guest workflows; operational self-dealing on own live
  stays is a disclosed residual risk, not a blocked one.

### Reason

Owner-authorized onboarding of real accounts whose test history cannot be
deleted. Least-privilege preserved everywhere except the single explicit
owner decision, which is fully audited.

### Related

`SYSTEM.md` §6 · `supabase/migrations/20261013010000_guest_to_staff_with_history.sql` ·
`app/api/admin/users/[id]/action/route.ts` (`withHistory`) ·
`lib/guest-staff-conversion-with-history.test.ts`

---

## D-025 — Organization Executive Dashboard theme governs staff pages

Date: 2026-09-20
Status: Active (supersedes D-024's staff styling only; landing/customer/auth keep their systems)

### Decision

- `reference/design.mdd (1).txt` (FleetOps Executive Dashboard language —
  tokens and grammar only, never fleet content) is the visual authority for
  every staff surface under `.app-shell`.
- Delivered as `app/staff-ops-theme.css` (last import in `app/layout.tsx`),
  every rule staff-scoped: Midnight Ink primary, Cool Paper light floor,
  12/16/24px radii, Inter-only type scale, 10%-tint AA-safe status pills,
  24px stat-card grammar, flat executive headers (teal band retired on
  staff), tactile 280ms motion with reduced-motion gates.
- Dark staff variant is kept + refined (user choice), same token names.
- Landing, customer portal, booking flow, and auth screens are out of scope
  by construction (scoping, not discipline).

### Reason

One unified professional operations platform per the organization's spec;
the prior teal-band direction conflicts with it on staff pages.

### Related

`DESIGN.md` §16 · `app/staff-ops-theme.css` · `reference/design.mdd (1).txt`

---

## D-026 — Universal search/filter standard: transparent wrapper, enforced by stylesheet walk

Date: 2026-09-20
Status: Active

### Decision

- One search/filter layout system-wide: **search → quick filter chips →
  advanced filters → results**, in that DOM order, at every width. The order
  never changes on mobile.
- The combined toolbar **wrapper is transparent at every width and in both
  themes**: no background, border, radius, shadow, or padding. It is a layout
  row, not a card. Individual controls inside it keep their own surfaces
  (search input fill/border/radius/icon/clear, chips, `HavenSelect`); one
  surface per control, never a box around the box. The **results** container
  (`.data-panel`, tables, room cards, KPI cards, `.table-scroll`) is a separate
  element and keeps its container.
- Two chip families are permitted and must stay visually identical: shared
  `HavenFilterBadges` and modules whose bespoke chip row already matches the
  approved pill (`.reservation-filters`, `.owner-toolbar`). Aligned, **not
  migrated** — the approved Reservations markup is the reference. Pill radius,
  subtle inactive border, unmistakable active fill, visible focus ring.
- `All` is first and is the default unless a workflow is intentionally scoped to
  a queue. Counts are real counts from the module's own data.
- Customer surfaces share the **pattern**, not the palette: they keep `--cp-*`
  tokens and their own control density. Midnight Ink is not imposed on them.
- The public booking flow is reviewed against this standard, not converted into
  a filter toolbar. The landing page is out of scope and unchanged.
- **Enforcement:** because wrapper transparency is a cascade property that jsdom
  cannot see, `components/ui/haven-data-controls.test.tsx` walks every stylesheet
  under `app/` and `components/` and fails if any rule selecting a toolbar
  wrapper (`.haven-data-toolbar`, `.reservation-filters`, `.owner-toolbar`,
  `.tp-toolbar`, `.hk-toolbar`, `.sd-toolbar`, `.approval-toolbar`,
  `.table-tools`) declares a non-inert `background`, `border`, `border-color`,
  `border-width`, `box-shadow`, or `padding`.

### Reason

The first attempt at this standard appended de-card **overrides** to the
last-loaded stylesheet instead of fixing the source rules. The overrides were
4-class selectors and the light-theme rules they targeted were 5-class, so
specificity beat load order and the white card still rendered in light theme —
the standard was documented as met while being visibly violated. Two rules of
thumb follow: **fix the source rule, never append a broader override**, and
when a visual property lives in the cascade, assert it against the cascade
rather than trusting a component test.

### Related

`docs/HAVEN_UI_STANDARDS.md` (§ Data toolbar) · `docs/DESIGN.md` (Data toolbar row) ·
`components/ui/haven-data-controls.{tsx,css,test.tsx}` ·
[[2026-09-20 - Universal Search Filter Standard]]

---

## D-027 — Password reset is selfie-gated and fully audited

Date: 2026-09-23
Status: Active

### Decision

- Recovery completion requires a staged identity selfie: `complete_account_recovery`
  takes `p_selfie_path`, refuses missing/foreign paths (`SELFIE_REQUIRED`, shape
  enforced in SQL), and marks the `password_reset_logs` row completed in the
  same transaction. Upload alone never completes a reset.
- New self-service flow: `/forgot-password` (email → OTP code → emailed
  one-time link), always generic responses (no account enumeration), 5
  requests/email/hour, pre-verification token rotated on code success.
- `password_reset_logs` records user, token, challenge, email, IP, user agent,
  OTP state, selfie path, and lifecycle status (`requested`/`otp_verified`/
  `completed`/`failed`); service-role only behind RLS.
- Selfies live in the private `recovery-selfies` bucket (magic-byte sniffed,
  5 MB); admins inspect via 60s signed URLs in the new Governance →
  Password reset audit section. Selfies are human-reviewed evidence — no
  facial matching, no auto-approval.

### Reason

Recovery links are bearer credentials sent by email; a stolen inbox meant a
stolen account with no trace. The selfie adds a human-reviewable identity
barrier at the exact moment of credential change, and the ledger makes every
attempt visible to System Administration.

### Related

`supabase/migrations/20261022010000_password_reset_audit.sql` ·
`app/api/password-reset/*` · `app/api/recover/[token]/*` ·
`app/(auth)/forgot-password/page.tsx` · `lib/password-reset-audit.test.ts`
