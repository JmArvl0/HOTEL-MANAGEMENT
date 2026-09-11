# 2026-09-22 - Session 06 - Module Quick-Overview Summary Cards

## Task

User report: on the staff dashboard, some modules (e.g. the staff/users pages) show only
long tables/cards, so judging a module's status required scrolling the whole list. Add a
quick-overview card (summary strip) per module — but only to modules that need one,
after analysis.

## Analysis outcome

Modules that already had a quick overview (untouched): Overview metric cards, both
Reservations views (queue chips + ArrivalLane), Approvals (`approval-summary` lane),
Housekeeping (grouped queue with counts), Transportation (`tp-kpis`), Guest Requests for
front desk/manager (queue chips), Staff & Duty (KPI cards), all five Accounting sections,
Predictive Insights, HAVEN AI, Reports, and the three catalog modules.

Modules that needed it (all render through the generic `ResourceView` table/grid):
**Maintenance orders, Rooms, Inventory, Deposit Verification (payments), Refunds,
Billing (invoices), Guest Requests** (the housekeeping/maintenance view — the front
desk/manager `GuestRequestsPanel` already had one).

Deliberately skipped: **Guests** — a reference list with no operational status; a status
strip there would be noise.

## Implementation

All in `components/manager/manager-dashboard-client.tsx` (+1 test), presentational only:

- New pure exported `moduleSummary(resource, items)` — status counts derived from the
  already-loaded rows (no new fetches, no server/API/RPC/CSS changes). Per-resource chips:
  maintenance (unclaimed / in progress / waiting parts / blocked rooms / urgent-critical),
  rooms (available/dirty/maintenance/occupied/reserved), inventory (healthy/low/out),
  payments (pending verification / failed-rejected), refunds (within-policy to settle /
  awaiting Manager approval / processed / failed), invoices (unpaid/partial/paid +
  summed outstanding balance), guest_requests (open/in progress/completed/escalated).
- Rendered in `ResourceView` above the search tools as a read-only
  `arrival-lane module-summary` strip reusing the theme-aware `arrival-chip` classes
  already used by the approvals summary (light + dark, no new CSS).
- Refund chips mirror `refundBasisBadge`'s server-side distinction
  (`exception_approval_id` presence).

## Affected files

- `components/manager/manager-dashboard-client.tsx` (moduleSummary + ResourceView strip)
- `components/manager/module-summary.test.tsx` (new — 4 counting tests)

## Verification

- `npx vitest run components/manager/module-summary.test.tsx` — 4/4.
- `npm run typecheck` — clean. `npm run lint` — 0 errors (70 warnings, pre-existing).
- `npm test` — **763/763** across 65 files. `npm run build` — passes.
- Manual UI check pending (needs staff logins): strip appears on the seven modules, not
  on Guests; light/dark themes; narrow width (lane flex-wraps).

## Decisions / notes

- No new decision entry — presentation-only; SYSTEM.md §7.9 updated with one sentence.
- Counts derive from `items` (all loaded rows), not the filtered view — the strip stays a
  module-level overview even when filters narrow the table.
