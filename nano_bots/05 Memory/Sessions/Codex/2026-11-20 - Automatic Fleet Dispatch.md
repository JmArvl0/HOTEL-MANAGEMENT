# Automatic Fleet dispatch

My Stay and room checkout collect ride preferences and explicit sharing
permission alongside existing trip details. My Stay pre-fills passenger contact
from the guest record. Checkout snapshots the mobile number on the hold and
files the ride at confirmation. Front Desk can search existing guest accounts
and select an eligible stay for a walk-up ride.

Migration `20261120040000` queues one durable event per ride leg. The booking
trigger files the new snapshot after the stay-update invalidation trigger.
Immediate delivery runs after submission or payment confirmation. Eligible
retries reuse the original event on a guest revisit or the daily sweep.
Automatic rides stay out of the hotel-operated assignment and fare workflow.

Verified 2,669 Vitest tests, migration replay, the new PostgreSQL dispatch and
fare cases, and 19 Fleet wire SQL cases. The local production build and
authenticated Edge test used real PostgreSQL and a synthetic HTTPS Fleet. My
Stay dispatched on submit. Checkout dispatched after settlement. Front Desk
searched and booked from stored guest details. The fare callback and
confirmation replays left one PHP 321.23 charge and a PHP 521.23 balance from
PHP 200.00. Local browser evidence is in `.tmp/fleet-auto-qa`.

## Production verification

Supabase dry-run listed only `20261120040000`. Applied it and read back the
155-entry ledger, dispatch RPC, queue marker, confirmation trigger and
existing fare idempotency index. GitHub main advanced to `c7c7166`. The
Vercel deployment was Ready at 23:28 Manila and the production domain
served the new staff route. The separate Supabase Preview check failed.

The production QA reservation `HVN-261120-9A30A6` had zero rides before its
Xendit sandbox deposit was verified. Checkout queued Fleet ride `611`.
The authenticated guest submitted My Stay ride `612`. Front Desk searched
the existing guest, used prefilled contact, and booked walk-up ride `613`.
Live Fleet acknowledged all three with one attempt each. The open folio
balance was PHP 4,060 with zero transportation charges.

An isolated hosted transaction exercised the automated queue and fare
RPC across callback and confirmation retries. One synthetic fare posted
within the transaction, and rollback left no rows. The real partner fare
test is waiting for Fleet to complete the simulation and record a fare
on ride `612`. Scoped rollout evidence is in `.tmp/haven-auto-prod-release`.
