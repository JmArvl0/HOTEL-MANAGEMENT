# HMS workflow prototype — 2026-11-03

Preview: http://localhost:3000/prototypes/hms-workflow-preview.html

Implements an isolated, fictional-data design preview of the focused repair plan. The existing dashboard CSS, HAVEN logo, navigation and header are reused as a familiar shell. Other modules are placeholders. Production source and migrations were not changed for this prototype.

## Reviewable workflows

- Inventory selection, supply issue, count correction, insufficient-stock validation and corresponding movement history.
- Guest payment, derived folio balances, sample receipt, shared drawer count, variance explanation, close and next opening float.
- Guest/account profile consistency, preservation of reservation name, paired document/identity review statuses and replacement-upload reset.
- Guest pending-request withdrawal, front desk acceptance/routing and operational handover creation, acknowledgement and resolution notes.

All state lives in browser memory. Reset preview or reload discards changes. Failure controls simulate a rejected save while preserving the draft. Retry controls explain intended behavior; they do not establish backend idempotency. Role labels are illustrative, not authorization enforcement. Atomicity, concurrency, live permissions, persistent audit and source-record validation remain production implementation work. HR, procurement, enterprise financials and restaurant operations are excluded.

## Design and verification

Applied UI/UX Pro Max form guidance, taste app-screen direction `accent-ladder` (seed 1787792315, existing type/palette retained), and Impeccable reference guidance. The explicit request to retain the dashboard header overrides the direction's header preference. Impeccable context engine was unavailable; read local reference documents instead.

Verified manually in the real in-app browser: stock deduction/history, insufficient quantity rejection, simulated failure with unchanged saved quantity and preserved input; payment/folio update; required cash variance note and close; guest/account name update with historical reservation name retained; paired ID verification; guest withdrawal; handover creation with owner. Desktop and 820px tablet inspected; 390px phone inspected and overflow corrected. Expanded/collapsed sidebar checked. No browser error logs at final desktop check.

`node --check public/prototypes/hms-workflow-preview.js` passed. Taste lint: 0 failures, 2 warnings for intentional toast/dialog overlay shadows. No full application tests/build were run for these isolated static assets; no backend guarantees are claimed. Screenshot: `public/prototypes/hms-workflow-assets/stock-desktop.png`.

To regenerate the shell after intentional production CSS changes: `node public/prototypes/build-hms-workflow-preview.cjs`. Custom prototype CSS and JS remain separate.
