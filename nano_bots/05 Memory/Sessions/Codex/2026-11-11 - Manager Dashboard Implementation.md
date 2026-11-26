# Manager Dashboard Implementation

The Manager overview in `/manager_dashboard` uses the approved composition
with linked headline metrics, decisions and exceptions, room readiness,
booked occupancy, and today’s finances. The room partition includes Reserved
and uses the same current-week stay basis as Room Management. Unassigned
arrivals open the Manager reservation queue. Shift briefing opens Hotel
Operations. The shared chart calculation supplies the two seven-night
periods while Reports retain their trailing seven-night series.

The role-scoped overview returns four financial aggregates under D-039.
The eye shows exact centavos, and a fresh visit masks the figures after the
first digit. Accounting access continues to follow D-007.

Chrome and a fresh local PostgreSQL replay of 129 migrations verified seven
checks, including the money toggle with exact centavos, reload masking,
Manager ledger denial, the actual room and arrival filters, and light and
dark layouts at 320, 390, 768, 1,024, and 1,440 px. Front Desk still opens
its role-specific dashboard. The full suite passed 2,419 tests and the
additional aggregate regression passed in the 21-test focused run.
TypeScript and the production build passed. Touched-file ESLint had no errors
and three existing hooks warnings. The implementation is local to the branch.
