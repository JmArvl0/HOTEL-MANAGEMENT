# 2026-11-13 - Reports RBAC Prototype and Implementation

## Scope

Built the requested interactive Reports UI prototype without changing the
production report pages or their permission rules.

## Prototype

- Development-only route: `/prototypes/reports`.
- Role switcher previews Front Desk, Manager, Accounting, Admin and Owner.
- Each view lists its scope, included data and actions, plus its boundaries.
- Manager performance and daily report review are separate tabs, resolving the
  stacked two-frontend experience in one report workspace.
- Role switching and review/submit actions are local preview state only. The
  route reads no live data, calls no APIs, and is hidden outside development.
- Illustrative values are visibly labeled as sample data.

## Verification

- `npm run typecheck` passed.
- ESLint on the two TypeScript files passed with no warnings.
- Impeccable detector returned no findings.
- Local browser review visited all five role views and confirmed that Manager
  acknowledgement and Front Desk submission only change local prototype state.
- Visual review used the available in-app browser viewport (~788px wide); other
  breakpoints, tests and production build were not run.

## Approved implementation

- Front Desk keeps live daily snapshot generation, seven-day activity, submit,
  export, and immutable submission history. The detailed snapshot sections
  now collapse under a full-breakdown disclosure; print includes them.
- Manager now has one `Operations & review` page with pressed-button views for
  Daily report review and Performance. Only the selected workflow is mounted;
  the daily view pairs its queue with the selected immutable snapshot and
  Manager-only acknowledge/return actions.
- Accounting now has a dedicated report view based on the existing
  role-scoped ledger: settled collections, refunds, net receipts, reconciliation
  variance, seven-day ledger movement, settled totals by payment method,
  occupancy context, and read-only Night Audit. The ledger request is only made
  for the Accounting role.
- Admin and Owner keep their governance/executive aggregate data and gain
  print-based export actions. Their data routes and execution boundaries remain
  unchanged. Prototype sample data and role switching remain outside production.
- `npm run typecheck` passed. ESLint on all touched TypeScript files passed with
  `--quiet`; the non-quiet run showed six existing hook warnings in the large
  dashboard client and no errors. `git diff --check` passed. Tests and production
  build were not run.
- Browser review confirmed the Front Desk page at desktop viewport. The browser
  showed an existing “Operating day unavailable. Failed to fetch” banner while
  report data still loaded. No live Manager, Accounting, Admin or Owner session
  was available for browser review.
- No migrations, hosted writes, deployment, commit or push.

## Front Desk layout follow-up after browser review

The user reported that the Front Desk page still looked unchanged after refresh.
Inspection confirmed the first integration had only made the full preview
collapsible; it still placed the activity trend above the large preview. Updated
the page to lead with live arrivals, departures, reservations and collections,
then pair the seven-day trend with a compact live snapshot. The snapshot shows
open guest requests, occupied rooms, closed shifts and cash variance; full
details remain available on demand. Export and immutable submit stay separate.

- `npm run typecheck`, targeted ESLint and `git diff --check` passed.
- Localhost browser review after refresh visibly confirmed the metrics band and
  side-by-side trend/snapshot; existing actions and report-history area remain.
- Tests and production build were not run. No commit, push, deployment, or hosted
  write.
