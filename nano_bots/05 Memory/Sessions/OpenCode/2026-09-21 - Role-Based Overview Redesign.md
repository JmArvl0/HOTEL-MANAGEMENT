# 2026-09-21 - Role-Based Overview Redesign

Staff Overview recomposed per role; customer/owner/admin audited and kept.

## What changed

- `components/manager/manager-dashboard-client.tsx` — `Overview` (now
  exported for tests): accounting gets a financial card set (pending
  verifications + oldest-age hint, past-SLA, pending refunds, collections,
  outstanding, refunds today); chart panel is now role-conditional —
  manager keeps the occupancy-area chart, front_desk / accounting /
  housekeeping / maintenance get actionable `HavenActionItem` queue panels
  instead; manager grid leads visually with `Decisions & exceptions`
  (`order:-1`, DOM unchanged); `Needs attention` retitled per role, gained
  insights (manager) + reconciliation/documents (accounting) links, and
  hides items duplicated by hk/mt queue panels; hk/mt duplicate
  room-activity branch removed (dead hk branches deleted after TS2367);
  pluralization fixed (refunds, escalated issues, balances, blocked rooms).
- `app/staff-ops-theme.css` — `.overview-role-manager` ordering rule;
  `≤1000px` stacks `.dashboard-grid` to one column (was crushed 2-col
  at 390px via specificity win over the shared breakpoint).
- `components/manager/overview-composition.test.tsx` — 6 jsdom tests:
  per-role structure, no chart for ops roles, no room creation for
  maintenance, action navigation.
- `DESIGN.md` §18 documents the composition contract.

## Preserved

Same `DashboardData` payload, same KPI values, same `setSection` targets
(existing sections only), same `access` map, no backend/RBAC/calculation
changes. Customer `/account` (dedicated dashboard) and `/my-reservations`
(history) unchanged — already compliant. Owner/Admin overviews unchanged.

## Verification

- `npm run typecheck` clean; eslint touched files 0 errors (1 pre-existing
  warning); `npm test` 139 files / 1574 tests pass; `npm run build` 73
  routes; `git diff --check` clean.
- Browser QA via real Chromium (playwright-core + cached binary) against
  the live dev server with a temporary fixture route (deleted afterwards):
  5 roles × desktop 1440 + mobile 390 × dark + light = 20 screenshots, no
  page errors, no horizontal overflow. Full in-app role walkthrough still
  pending (auth-walled; no credentials changed for screenshots).
