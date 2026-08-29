# Front Desk operations

This document records how the authoritative Front Desk specification maps to the implementation deployed on 2026-08-28.

## Source of truth and lifecycle

Website, Front Desk, walk-in, and phone bookings all use `reservations`, `guests`, and `invoices`. Staff booking accepts guest/contact/stay input, but the server obtains the active room type, nightly rate, and inventory from PostgreSQL. Guest matching uses authenticated ownership or normalized email; names are never used as a deduplication key.

The normal lifecycle is `pending -> confirmed -> checked_in -> checked_out`. `cancelled` and `no_show` are terminal alternatives. Protected database functions lock affected records, validate transitions, perform related room/folio/task writes atomically, and append audit events.

## Room assignment and in-stay changes

`reservation_room_assignments` is the assignment history. Only one active assignment may exist for a reservation, and a PostgreSQL GiST exclusion constraint rejects overlapping active assignments for the same physical room. Preassignment and check-in require the reserved room type, a clean/available room, no open maintenance order, and no conflicting stay.

A room change retains the reservation and folio. It closes the old assignment, creates the replacement assignment, and sends the released room to turnover. Front Desk can move within the reserved type; Owner, Admin, and Manager may explicitly authorize a different-type upgrade. A stay extension also retains the reservation, checks the active room against future assignments, prices only additional nights, and uses an idempotency key for the new folio charge.

## Check-in and checkout gates

Check-in requires a confirmed reservation, complete guest contact data, verified ID, verified deposit, zero pre-stay invoice balance, the hotel-local arrival window, and an eligible physical room. Early check-in is disabled by default. Checkout requires `checked_in` status and zero folio balance, completes the active assignment, records the checkout timestamp, marks the room dirty, and creates a single Housekeeping turnover task.

## Department boundaries

- Front Desk: reservation, guest contact, assignment, arrival/departure, payment collection, folio visibility, and request routing.
- Housekeeping: completion of housekeeping work and room-readiness cleaning.
- Maintenance: completion of work orders; resolved rooms still require cleaning before sale.
- Accounting: refund approval/processing and financial reconciliation.
- Owner/Admin/Manager: supervisory operations, including cross-room-type upgrade authorization.

The generic resource endpoint cannot be used by Front Desk to bypass protected reservation, room, guest, housekeeping, invoice, payment, or refund workflows. Specialist guest requests cannot be completed by Front Desk.

## Front Desk API surface

- `POST /api/front-desk/reservations`
- `GET /api/front-desk/reservations/:id/eligible-rooms`
- `POST /api/front-desk/reservations/:id/assign`
- `POST /api/front-desk/check-in`
- `POST /api/front-desk/reservations/:id/change-room`
- `POST /api/front-desk/reservations/:id/extend`
- `PATCH /api/front-desk/reservations/:id/guest`
- `POST /api/front-desk/reservations/:id/requests`
- existing protected payment, folio, cancellation, no-show, and checkout endpoints

## Deliberately unresolved dependencies

Minimum-age enforcement needs a reliable date-of-birth or verified-ID attribute; no age is inferred. Real card/e-wallet capture and refund execution need provider credentials and webhooks; manual references remain auditable but are not presented as gateway settlement. Final notification delivery needs an email/SMS provider. These gaps are explicit configuration/provider dependencies, not duplicate placeholder workflows.
