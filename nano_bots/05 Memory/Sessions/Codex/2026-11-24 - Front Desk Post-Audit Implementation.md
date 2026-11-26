# Front Desk Post-Audit Implementation

## Local changes

- Migration `20261124030000` records a private stay-extension replay receipt
  with the original date, resulting balance and normalized-reason digest.
  The dialog reuses the request key during recovery.
- Dashboard counts open the daily booking queues. Departures use their own
  balance count and include a stay ending on the first calendar day.
- Bookings, Calendar and Room Management expose working rows on short
  desktop screens. Sidebar labels meet the contrast target. The bell
  carries new desk alerts and leaves the working area accessible.
- Duplicate synthetic electronic tender shows the authorized next step
  and keeps the original entry. The operator guide names the booking
  payment history and the current report submission RPC.

## Verification and release

Node 22.22.2 built the candidate. Edge passed 113 workflow and rendering
checks, including 48 desktop samples. PostgreSQL passed direct privileges,
legacy replay, payload binding and concurrent use checks. The expanded fixture
contained 150 rooms and 1,284 reservations.

See the [implementation report](../../../../docs/audits/front-desk/FRONT-DESK-POST-AUDIT-IMPLEMENTATION.md),
[register](../../../../docs/audits/front-desk/FRONT-DESK-IMPLEMENTATION-REGISTER.md),
and [regression evidence](../../../../docs/audits/front-desk/FRONT-DESK-POST-AUDIT-REGRESSION.md).
Database verification used disposable clones. Property approval, supported
browser acceptance, hosted peak load, physical ID capture, Finance and Fleet
remain release dependencies.
