# Cash & Shifts prototype integration

Ported the approved Cash & Shifts preview to the shared Front Desk and
Accounting workspace. The drawer card shows expected cash and the float,
collections and payouts. Record cash count opens an inline editor. Review
count opens the final confirmation. Draft persistence, stale count handling,
variance explanations and safe retries still use the cash shift endpoints.
The two panels beside the drawer show readiness and handover. Below them,
cash activity has search and filters, and shift history opens an inline
summary with links to the full record and activity. Accounting retains the
reconciliation controls. The workspace follows the system theme.

Typecheck, ESLint on touched TypeScript files, and 43 targeted tests passed.
Chrome checked the signed-in Front Desk and Accounting pages with the actual
closed drawer state, live activity/history controls, both theme palettes and
390px layout. A browser-only open drawer fixture verified inline entry, count
confirmation and return to the editor at desktop and mobile widths without
saving or closing a real drawer.
