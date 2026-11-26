# All Account Dashboards

Applied the approved Manager overview design to Front Desk, Housekeeping,
Maintenance, Accounting, Admin, Owner, and Guest. The account home screens
share the dashboard heading, metric strip, panels, and money visibility
control. Their queues, shortcuts, and data remain role-specific.

Front Desk shows the authorized open drawer summary, Accounting shows the
daily financial aggregates, Owner shows executive totals, and Guest shows
the selected stay’s finances. A fresh visit starts masked. Housekeeping and
Maintenance show their operational room and task counts. Guest refund
notifications link to payment details for the amount.

Chrome verified all eight roles and the API read boundaries against a fresh
local PostgreSQL database. The checks covered both themes at 320, 390, 768,
and 1,440 px, the Front Desk room filter, and reveal and reset behavior on
each dashboard with amounts. The changes are local to the branch.

Final verification: `npm test` passed (232 files, 2,420 tests); the production
build passed, including its TypeScript check; lint on touched TS/TSX files had
0 errors and 6 existing hook warnings in Manager/Owner. A final Guest mobile
Chrome check confirmed the header and action label layout after the CSS fix.
