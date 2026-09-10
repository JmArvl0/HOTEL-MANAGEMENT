# Check-in & Room Assignment

Front Desk arrival, physical room assignment, and the alternative room-type exception flow.
`SYSTEM.md` §7–8 is authoritative; this note is the vault summary.

## Arrival wizard

`components/manager/front-desk-arrival-dialog.tsx` walks Front Desk through guest identity →
financial readiness → room assignment → check-in. Every step is presentational: the
`front_desk_check_in` RPC is the arbiter and its friendly gate errors surface inline.

## Eligibility — one server authority

Physical-room eligibility is defined only by the `front_desk_room_is_eligible` /
`front_desk_eligible_room_inventory` RPCs (migration `20260919010000`). No client re-implements
these rules — see [[D-002 — Server-authority room eligibility]].

Eligible = active room type + administratively active room + `status='available'` +
`housekeeping='clean'` + not maintenance-blocked + no overlapping active assignment +
confirmed reservation. (`maintenance_room_is_blocked` decides the Maintenance contribution —
see [[Maintenance Operations]].)

## Normal assignment

`GET /api/front-desk/reservations/[id]/eligible-rooms` returns the reserved type's eligible
rooms; Front Desk picks one and checks in through `front_desk_check_in`, which re-validates
identity, deposit, folio, window, and readiness atomically.

## Room-type exception flow (guided)

When the reserved type has **zero** eligible rooms, Step 3 offers an **Alternative room
assignment** panel instead of a dead end:

1. **Target room type** dropdown — only alternative types with ≥1 eligible room (reserved
   type, inactive types, and zero-eligibility types excluded); values are `room_types.id`.
2. **Physical room** dropdown — that type's currently eligible rooms (`?roomTypeId=` query;
   409 "Room inventory changed" if none remain).
3. Reason → **Request Manager approval**. Rejection leaves the reservation untouched;
   approval stays `awaiting_execution` until Front Desk checks in.

Requests carry structured IDs (`requestedRoomTypeId`, `requestedRoomId`, `originalRoomTypeId`)
and are revalidated by DB triggers at request insert, Manager approval, and check-in —
including the two-Front-Desk race (`ROOM_TYPE_EXCEPTION_ROOM_CHANGED`). The generic Manager
exception form cannot create this request type; only the guided dialog can.
See [[D-003 — Structured-ID room-type exceptions]] and [[Manager Approvals]].

## Pricing

Approved exceptions reprice the folio to `target base_rate × nights` and block check-in while
the repriced balance is unpaid (`ROOM_TYPE_EXCEPTION_BALANCE_DUE`) — [[D-004 — Exception
repricing policy]]. No other pricing change exists in this flow.

Related: [[Manager Approvals]] · [[Guest Booking Flow]] · [[Auth & Permissions]]
