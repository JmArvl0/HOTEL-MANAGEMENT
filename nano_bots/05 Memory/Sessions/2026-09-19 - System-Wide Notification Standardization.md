# System-Wide Notification Standardization

Date: 2026-09-19
Branch: `main`
Status: implementation complete; manual cross-role browser QA pending

## Outcome

- Added the shared `HavenNotificationBell`, `HavenNotificationPopover`,
  `HavenNotificationItem`, and `HavenNotificationModal`.
- Customer and operational staff use the same responsive presentation family with customer and
  internal density variants.
- Popovers are click-only, 380–430px, capped at seven, unread-first, and expose an in-place
  View-All modal rather than page navigation.
- The modal is 760px desktop / viewport-safe mobile, internally scrolls, and supports immediate
  All, Unread, Read, date, and sort controls.
- Customer layout seeds seven recent rows plus a separate aggregate unread count. The history API
  returns the same count, and `POST /api/account/notifications/read` supports scoped
  server-authoritative mark-all.
- Operational staff reuse `dashboard.notifications`; local read IDs remain keyed by user and
  role. No schema or business-semantic change was made.
- ToastStack behavior remains max-three and silent on initial staff load. Sidebar badges remain
  unresolved workload counts.

## Role scope

- Customer: durable notification table and API.
- Manager, Front Desk, Accounting, Housekeeping, Maintenance: role-filtered dashboard alerts.
- Owner and System Administrator: no persistent notification source exists; shared transient
  ToastStack remains in place. No audit/governance records were repurposed.

## Verification

- Focused notification suite: 80 tests passed across eight files.
- Full test suite: 1,461 tests passed across 127 files.
- Typecheck: passed.
- Lint: passed with 0 errors and 75 pre-existing warnings; `.kilo/worktrees/**` is excluded because
  it contains separate tool-managed checkouts with their own lint state.
- Production build: passed; 66 static pages generated.
- Impeccable mechanical detector: passed with zero findings across the changed notification UI.
- Manual browser QA: pending because no authenticated multi-role browser session was available in
  this coding environment.
