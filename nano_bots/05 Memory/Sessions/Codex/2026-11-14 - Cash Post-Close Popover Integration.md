# Cash post-close popover integration

The approved standalone preview at
`public/prototypes/cash-post-close-popover-preview.html` now informs the live
shared Front Desk and Accounting Cash & Shifts page. The in-flow handover
`details` was replaced with an anchored native popover. Its existing
accounting status, operational handover, and daily report actions still use
the live handlers and data. The panel scrolls internally on a phone, closes
with Escape or outside click, and leaves the Current Drawer card and Recent
cash activity in place.

Typecheck, touched TypeScript ESLint, 14 targeted Cash & Shifts tests, and
`git diff --check` passed. Signed-in Chrome checks at 1440x920 and 390x844
passed for Front Desk and Accounting, including stable layout, dismissal,
placement and mobile footer reachability. No financial writes were made.
Full Vitest finished with 2 unrelated failures in Billing and role navigation
(2423 passed, 2 failed). `npm run build` stopped on the existing Windows
Turbopack sharp junction access-denied error.
