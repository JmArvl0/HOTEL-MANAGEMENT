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

## D-004 — Approved room-type exceptions reprice the folio to target base rate × nights

Date: 2026-09-12 (rule introduced) · 2026-09-08 (documented, preserved)
Status: Active — business confirmation pending for exceptions (see [[Known Issues]])

### Decision

`front_desk_check_in` reprices the invoice to `round(target_type.base_rate × nights)` when
consuming an approved exception, and blocks check-in with
`ROOM_TYPE_EXCEPTION_BALANCE_DUE` while the repriced balance is unpaid.

### Rules

- No other pricing change is made anywhere in the exception flow.
- If the hotel wants non-repricing upgrades (e.g. free upgrade), that is a separate business
  decision — do not implement it without one.

### Reason

Pre-existing rule in migration `20260912020000`; preserved unchanged because changing
reservation pricing requires an explicit business rule.

### Related

[[Check-in & Room Assignment]] · [[Known Issues]]

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
