# Guest Booking Workflow

## Connected flow

`/` → `/booking/search` → room selection → `/login` or `/register` when needed → `/booking/details` → `/booking/review/[token]` → `/booking/payment/[token]` → `/booking/confirmation/[id]` → `/my-reservations`.

Authenticated guests skip login. Unauthenticated guests return to the exact selected room and stay through a validated internal `callbackUrl`; external and protocol-relative redirects are rejected. Dates, guest count, room type, capacity, rates, totals, ownership, and availability are validated again on the server.

## Availability and inventory

Availability groups physical `rooms` by `room_types`. A type is offered only when its capacity fits and at least one usable unit remains. `pending`, `confirmed`, and `checked_in` reservations block inventory. `cancelled` and `checked_out` stays do not. Overlap uses `existing.check_in < requested.check_out AND existing.check_out > requested.check_in`, so same-day turnover is allowed. Maintenance rooms never count; a same-day arrival also requires a clean room state.

## Holds and concurrency

Guest details create a 15-minute `booking_holds` row through `create_booking_hold`. PostgreSQL advisory transaction locks serialize holds per room type. Expired holds are ignored and marked expired. Final confirmation uses `confirm_booking_hold`, locks the hold and room type, rechecks inventory, and uses the hold UUID as an idempotency key. Duplicate submissions return the existing reservation rather than creating another.

## Reservation and payment behavior

Website bookings use the same `reservations`, `guests`, and `invoices` tables as Front Desk. They receive a public `HVN-YYMMDD-XXXXXX` confirmation number, `source = Website`, `status = confirmed`, and a separate `payment_status`. No payment provider is configured, so the supported guarantee methods are pay at hotel and cash guarantee. Both create an unpaid invoice; they do not pretend that a payment was captured. Taxes and service charges are currently configured as zero.

## Ownership and guest management

Every website reservation records `user_id`. `/my-reservations` and its detail route filter by the authenticated user ID. The general resource API applies the same ownership restriction to guest reservation and invoice reads, and guests cannot create or patch operational records. Guests cannot change dates, prices, room assignment, payment fields, or lifecycle status online.

## Front Desk and check-in

Confirmed website bookings appear in the existing reservation module with confirmation number, source, and payment state. Online booking reserves a room type; no physical room is assigned to the guest. Authorized Owner, Admin, Manager, or Front Desk users use the protected Assign & check in action. `front_desk_check_in` requires the correct room type, an available and clean room, no open maintenance order, no overlapping room assignment, and a current stay window. It assigns the room and changes both reservation and physical room state atomically.

## Assumptions and limitations

- Check-in is 3:00 PM and check-out is 12:00 PM for guest-facing information.
- Hotel address and direct contact values are not finalized, so the landing page labels them as pending configuration.
- Parking and airport transfer are subject to availability.
- Cancellation is handled by Front Desk; no automatic refund or guest-side status mutation is implemented.
- No card processor, email provider, or PDF generator is configured. The system therefore uses pay-at-hotel guarantees and does not claim to send email or generate a downloadable confirmation.