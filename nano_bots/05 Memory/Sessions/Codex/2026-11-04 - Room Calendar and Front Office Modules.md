# Room Calendar and Front Office Modules — 2026-11-04

User requested a new room-board format showing assigned customers across following
days and distinct Room Management / Reservations / Guest Management modules.
User explicitly selected the seven-day calendar with guest names (D-035).

## Implemented locally

- Room Management defaults to a full-width seven-day calendar; Cards remains
  available. Named, clickable stay bars use existing `barsForRoom` allocation
  segments and half-open night ranges. Recorded room moves appear in the right
  rooms, overlaps receive separate lanes, and unassigned stays stay separate.
- Sticky room/date headers, contained horizontal scrolling, current room status,
  explicit stay statuses and existing date/type/status/floor/search controls.
  Searching a moved guest can match recorded room assignments.
- Separate navigation entries for Room Management, Reservations and Guest Management.
  Front Desk Reservations opens the existing revised ledger directly; Manager and
  Accounting keep their role-specific views. Dashboard/summary links route between
  modules; stale entries cannot show the ledger under Room Management or vice versa.
- Authorized room-roster entry is retained; Front Desk permissions are unchanged.
  Guest Management retains current guest profiles/history without inventing CRUD.
- No API/migration/business-rule changes. Existing working-tree changes preserved.

## Verification

- 66 calendar/navigation focused tests pass, including sequential guests, checkout-day
  reuse, recorded room moves, overlapping lanes, unassigned review and module entry.
- Full suite: 2252 pass / 2 previously recorded Windows exact-text failures in
  password-reset-audit and transportation. Typecheck passes. Touched-file ESLint:
  0 errors / 4 existing hook warnings.
- Isolated outside-sandbox production build passes. Temporary build include paths
  removed; typecheck passes after cleanup.
- Chrome inspected actual component fixtures with sample data: 1366px light,
  390px light and 1024px dark; page overflow absent, calendar scrolling contained,
  guest/date spans inspected. No authenticated live operational E2E claimed.
- Temporary visual-export test removed; preview server stopped at session end.

No production writes, migration, deployment, commit or push.
