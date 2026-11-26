# Front Desk Cross-Module QA — 2026-11-16

Read-only browser QA in the configured Front Desk session covered all 16
visible modules. A sample booking linked through Guest Management, Guest
Requests, Billing, Transactions and Financial Documents. API readbacks checked
39 reservations, 38 invoices, 48 payments, 49 documents, 11 cash shifts, 60
request items and 8 completed housekeeping tasks. No orphan linked IDs or
invoice/payment arithmetic differences were found in those checks.

New open findings: KI-033, Dashboard “Rooms ready” 6 versus Room Management and
Bookings 8; KI-034, checked-out `RSV-1046` without a folio; KI-035, Bookings
“View receipt” calls document issuance rather than opening the existing
receipt. Historical duplicate documents remain KI-013 and two drawer-less cash
payments remain KI-032. No application code or hosted business data changed.

`npm run typecheck` passed; full Vitest passed 234 files/2,452 tests; ESLint
reported 0 errors and 77 warnings; an elevated isolated Webpack build passed
after standard and isolated attempts hit Windows `EPERM`. See
`docs/qa/front-desk-cross-module-qa-2026-11-16.md` for the module matrix,
record samples and limitations. Live write paths remain
unverified end to end.
