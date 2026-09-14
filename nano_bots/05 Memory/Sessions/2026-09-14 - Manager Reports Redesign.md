# 2026-09-14 - Manager Reports Redesign

Started by Codex (hit usage limit), finished this session.

## What Codex delivered

- Extracted the inline `Reports` function from `manager-dashboard-client.tsx`
  into `components/manager/performance-reports.tsx` (`PerformanceReports`,
  imported aliased as `Reports` — all role branches unchanged).
- Redesigned surface: report header (eyebrow/title/subtitle + print Export),
  3 decision KPIs (money / avg occupancy + 7-day change / readiness), 7-day
  occupancy AreaChart with `role="img"` label + `<details>` data table,
  room-status share bars; review queue (`FrontDeskReportsPanel`) visually
  separated below. Same `DashboardData`, no new metrics, no logic change.
- Theme CSS for the new classes (dark + light + ≤1050/≤760 + print).
- `performance-reports.test.tsx` (2 tests), unused `Download` import removed.
- Also in tree from Codex's pass: `LoadFailure` + `loadError` retry state on
  the dashboard client (fetch-resilience session covers the same ground).

## What this session did

- Fixed the 2 contract tests the extraction broke (test-only, invariants kept):
  - `lib/front-desk-reports.test.ts`: single-`window.print` invariant now
    asserts 0 in the dashboard client + exactly 1 in `performance-reports.tsx`.
  - `lib/front-desk-operations.test.ts`: overview-copy assertion follows the
    new approved subtitle in `performance-reports.tsx`.
- DESIGN.md §12 documents the surface pattern. Orphaned `.report-banner`
  CSS deliberately left in place (user decision).
- Full verification: typecheck clean, **1057/1057 tests (96 files)**, lint
  0 errors (69 pre-existing warnings), build 62/62 routes, detector clean.

## Pending

- Manual browser QA (Manager/Accounting/Front Desk Reports views, light/dark,
  laptop/tablet/mobile, keyboard, print output) — needs live role sessions.
- Commit the tree (shared with parallel sessions — coordinate first).
