# HAVEN provisional business policies and workflow

Last implemented and deployed: 2026-08-28. These values are provisional, centrally configurable in `hotel_operational_policies`, and copied into each booking as an immutable operational policy snapshot. Updating the default changes future bookings only.

## Configured defaults

| Rule | Current provisional value |
|---|---|
| Hotel timezone | Asia/Manila |
| Check-in / checkout | 3:00 PM / 12:00 PM |
| Early check-in | Disabled unless the active hotel policy explicitly enables it |
| No-show cutoff | 11:59 PM on arrival date |
| Valid ID | Required before check-in |
| Minimum booking age | 18 |
| Online change request cutoff | 3 days before arrival |
| Deposit cancellation refund | 100% at 14+ days; 50% at 7-13 days; 0% under 7 days |
| Refund basis | Verified reservation deposit actually paid, never the full reservation total |
| Remaining folio and incidentals | Due at checkout; check-in currently also requires the pre-stay balance to be zero |
| Pets / smoking | Not allowed |
| Special requests | Recorded and routed but not guaranteed |
| Email verification | Disabled until a verified email provider and token flow are configured |

## Connected source of truth

All staff and website bookings use `reservations`; no second customer reservation store exists. Website inventory uses room type and blocking stays with half-open overlap `[check_in, check_out)`. A server-issued hold protects inventory during payment. Deposit verification confirms that same reservation. Guest records are linked to the authenticated account and deduplicated by account/email.

## Operational lifecycle

1. Website or staff booking creates a reservation and invoice. Website booking remains pending until its required deposit is verified.
2. Front Desk verifies ID and collects the outstanding pre-stay balance. Check-in atomically verifies status, arrival window in hotel time, deposit, ID, balance, room type, clean/available state, maintenance blocks, and overlapping assignment.
3. In-house staff post incidentals to `folio_charges`; lodging total remains unchanged while invoice amount and balance increase. Payments require a unique idempotency key and cannot exceed the balance.
4. Checkout requires a zero folio balance, marks the physical room dirty, and creates a housekeeping turnover task. Housekeeping completion restores availability unless maintenance remains open. Maintenance resolution leaves the room dirty and creates a readiness-clean task.
5. Cancellation uses the booking-time policy snapshot, releases inventory through terminal status, calculates eligibility only from verified deposit payments, and creates an Accounting refund request. Processing a refund adds a separate negative-flow payment record; original payment history is never edited or deleted.
6. No-show may occur only after the configured hotel-local cutoff. It records an audit event and retains the deposit under the current provisional policy.
7. Guest change requests are ownership-scoped and cutoff-controlled. They are staff-review requests; availability, repricing, and final approval remain manual until an approval workflow is implemented.

## RBAC boundary

| Capability | Roles |
|---|---|
| Reservation and guest operations | Owner, Admin, Manager, Front Desk |
| Cross-room-type upgrade authorization | Owner, Admin, Manager |
| Deposit verification and payment/folio visibility | Owner, Admin, Manager, Front Desk, Accounting |
| Refund queue and processing | Owner, Admin, Accounting |
| Housekeeping completion | Owner, Admin, Manager, Housekeeping |
| Maintenance resolution | Owner, Admin, Manager, Maintenance |
| Own reservations, cancellations, change requests, folios | Guest account owner only |

Every protected mutation verifies the NextAuth session server-side and sensitive state transitions execute through database functions with row locking and audit records. UI visibility is not treated as the authorization boundary.

## Deliberately unresolved configuration

The hotel’s final public address, support phone/email, payment gateway credentials, refund gateway, and email-verification provider have not been supplied. The application does not invent these values. Refunds therefore require a real Accounting transaction reference, and guest change requests require staff review rather than automatic repricing.