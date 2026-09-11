# Decisions

Lightweight decision log. Each entry records a choice that constrains future development.
Trivial implementation details do not belong here. Historical sessions never override the
current system or `SYSTEM.md` — see [[AI Session Handoff]] for the authority order.

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
