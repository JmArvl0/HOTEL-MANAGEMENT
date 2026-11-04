# Front Desk operations

This document records the Front Desk specification and the implementation deployed on 2026-08-28. The occupant, guest-control, discrepancy and service-condition additions below are local unreleased changes until their migrations and matching application release are applied.

## Source of truth and lifecycle

Website, Front Desk, walk-in, and phone bookings all use `reservations`, `guests`, and `invoices`. Staff booking accepts guest/contact/stay input, but the server obtains the active room type, nightly rate, and inventory from PostgreSQL. Guest matching uses authenticated ownership or normalized email; names are never used as a deduplication key.

The normal lifecycle is `pending -> confirmed -> checked_in -> checked_out`. `cancelled` and `no_show` are terminal alternatives. Protected database functions lock affected records, validate transitions, perform related room/folio/task writes atomically, and append audit events.

## Room assignment and in-stay changes

`reservation_room_assignments` is the assignment history. Only one active assignment may exist for a reservation, and a PostgreSQL GiST exclusion constraint rejects overlapping active assignments for the same physical room. Preassignment and check-in require the reserved room type, a clean/available room, no open maintenance order, and no conflicting stay.

A room change retains the reservation and folio. It closes the old assignment, creates the replacement assignment, and sends the released room to turnover. Front Desk can move within the reserved type; Owner, Admin, and Manager may explicitly authorize a different-type upgrade. A stay extension also retains the reservation, checks the active room against future assignments, prices only additional nights, and uses an idempotency key for the new folio charge.

## Check-in and checkout gates

Check-in requires a confirmed reservation, complete guest contact data, verified ID, verified deposit, zero pre-stay invoice balance, the hotel-local arrival window, and an eligible physical room. Early check-in is disabled by default. The unreleased occupant extension adds a complete named register and verified primary-age check only after their separately configured effective dates. Active DNR flags and unresolved room discrepancies also block arrival in the database authority; UI readiness is advisory.

## Staying guests and age evidence (local unreleased)

Front Desk records the primary staying guest and companions on the reservation. A companion can be a name-only occupant and does not need a permanent CRM guest record. The list must match the reservation's declared guest count and physical capacity when the register rule is active. The primary remains tied to the reservation's registered guest.

Record DOB or exact age only after checking official ID. An `adult`/`child` label is not evidence of age. The minimum-age rule applies to the primary guest, uses the scheduled check-in date in the hotel timezone, and remains inactive until an authorized policy change reaches its effective date. Do not invent age for legacy stays. Presence records distinguish expected, present, absent and unknown coverage in the restricted in-house occupancy list.

## Guest flags and profile merge (local unreleased)

Manager/Owner maintain VIP, Do Not Rent, Security Alert, Accessibility and Special Handling flags. Front Desk sees operational instructions; restricted incident notes are limited to Management. DNR exceptions are Management-approved for one reservation, purpose, active flag version and expiry, with a reason and audit entry. If a restriction is discovered after a gateway payment, retain the payment record and route the reservation to Front Desk review.

Identity Review surfaces exact normalized email or phone as masked evidence; names never generate automatic matches. A merge preview lists linked records and checks account ownership, loyalty, flags and concurrent changes. Manager/Owner choose the survivor and every profile field, enter identity evidence and confirm before commit. Source IDs and old contact/name values remain as search aliases only; historical reservation links and booking/login ownership are not transferred. Login-linked and loyalty-bearing profiles cannot be merged.

## Room discrepancies and service instructions (local unreleased)

Housekeeping reports the observed room occupancy alongside the system snapshot. The report opens a Front Desk handover and does not silently change the reservation or room state. Front Desk investigates and resolves it against a fresh room snapshot. An unresolved discrepancy blocks new arrivals and room reassignment.

Do Not Disturb is attached to an in-house reservation, follows its room move, and clears with history at checkout. Front Desk may set or clear it; Housekeeping may set it only from an active room-care task, while Management may clear it. DND blocks starting routine stayover cleaning. Housekeeping can record a guest-declined outcome (task deferred) or late service (high priority, due now); neither action marks a room clean or ready. Turndown and lost property are not part of this release.

Checkout still requires `checked_in` status and zero folio balance, completes the active assignment, records the checkout timestamp, marks the room dirty, and creates a single Housekeeping turnover task.

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
- `GET/POST /api/front-desk/reservations/:id/service-condition` (DND; local unreleased)
- `GET /api/staff/reservations/:id/readiness` (includes the active local eligibility gates)
- `GET /api/staff/occupants` (restricted emergency occupancy list; local unreleased)
- `/api/staff/room-discrepancies` and `/api/front-desk/room-discrepancies` (local unreleased)
- `/api/staff/guests/merge/preview` and `/api/staff/guests/merge` (Manager/Owner; local unreleased)
- existing protected payment, folio, cancellation, no-show, and checkout endpoints

## Deliberately unresolved dependencies

The local unreleased occupant extension provides staff-recorded DOB or exact age evidence from official ID; minimum-age enforcement is still unavailable in the deployed application until the migration, matching release and explicit effective date are active. Child/extra-person pricing remains undefined pending approved property rates and age bands. Real card/e-wallet capture and refund execution need provider credentials and webhooks; manual references remain auditable but are not presented as gateway settlement. Final notification delivery needs an email/SMS provider. These gaps are explicit configuration/provider dependencies, not duplicate placeholder workflows.
