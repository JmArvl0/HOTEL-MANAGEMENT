# Transportation production rollout

Production Supabase applied only migration `20261120030000_confirmed_transportation_folio_fares`.
The readback confirmed 154 recorded migrations, the Front Desk fare RPC's service-role
permissions, and the unique folio idempotency index.

GitHub `main` advanced from `69d16de` to `0571c25`. Vercel reported Production
success at 11:38 Manila time on 2026-11-20. The release contains the reviewed
transportation implementation, SQL migration, tests, and transportation sections
of SYSTEM.md. The separate Supabase Preview check reported failure.

The production login returned 200. Both guest and staff transportation APIs
returned 401 without a session. Fleet health returned 200. The Haven production
callback and photo endpoints returned 503 with Fleet staging unavailable, and
the hosted database had zero attempted Fleet legs and zero applied fare events.

A synthetic PostgreSQL transaction on hosted Supabase exercised the existing
Fleet fare receiver and the newly deployed posting RPC. Replaying the same
callback and fare confirmation left one PHP 321.23 transportation charge and
raised the synthetic folio balance from PHP 200.00 to PHP 521.23. The transaction
rolled back. A fresh read verified that the test reservation, ride, and charge
were absent. The canary did not contact Fleet or submit a payment.

Live partner verification requires Haven's Fleet staging connection and a
coordinated synthetic ride on the hosted Fleet service. Follow the existing
credential exchange instructions in `docs/integrations/FLEET_HOSTED_READINESS_2026-11-13.md`.
See [[2026-11-20 - Transportation Booking and Folio]] for the implementation and
local verification. Scoped release evidence is under `.tmp/transportation-production-release`.
