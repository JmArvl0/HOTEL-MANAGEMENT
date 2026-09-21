# 2026-09-19 - Redesign Phase 1 Design Tokens

Official system-wide redesign (Modern Luxury Hospitality SaaS) — Phase 1 only:
shared tokens and components. No page restyled, no workflow/RBAC/schema change.

## Visual authority

- `reference/` holds 10 generated dashboard images; (1) Executive Overview and
  (2) Executive Operations analyzed as the primary refs. Same family, different
  content. Mascot, fictional figures, sample modules NOT reproduced.
- User decisions: dark toggle kept with light default; text spec + images are
  joint authority; teal band on major headers only, compact headers elsewhere.
- Visual approval granted; build mode authorized phase by phase.

## Changes (5 files)

- `components/ui/Navigation.tsx` — `PageHeader` gains `variant="default" | "band"`.
  Reused the existing unused component; same markup either way.
- `components/ui/Modal.css` — `.page-header.band` (fixed deep-teal surface,
  both themes by design) next to the existing page-header rules.
- `app/design-tokens.css` — `--hero-*` component tokens.
- Deleted `components/ui/DataTable.tsx` (620 lines, zero consumers) + index
  exports. `@tanstack/react-table` dep left in package.json (lockfile churn
  deferred).
- `DESIGN.md` §15 documents the official direction; new `page-header.test.tsx`.

## Deferred (by design)

Hex sweep → final consistency phase. Sparkline → first surface that needs it.
Brand-string extraction → Phase 2 shell unification. `ModuleSummaryCards`
stays in place as the canonical KPI grammar (no move, no re-export).

## Gates

typecheck clean, eslint 0 errors (6 pre-existing warnings), 1521/1521 tests
(131 files), production build clean, `git diff --check` clean. No browser QA
(Phase 1 adds no rendered surface yet — band variant is unverified visually).

## Next

Phase 2: unified configurable AppShell. Then surfaces 3→6 in approved order.

## Continuation (same day — continuous task, no phase stops)

User superseded phase-gate delivery: one uninterrupted run to completion.
Header convergence executed without rewriting dashboards:

- Manager Overview (all 5 staff roles) bespoke `.page-title` → shared
  `PageHeader variant="band"`; role-aware copy and Scan QR / New reservation
  actions preserved verbatim (permission branch intact).
- Owner `Title` (10 usages, all sections) → `PageHeader variant="band"`;
  official band replaces the owner gradient.
- Admin bespoke page-titles deliberately retained (consistent grammar +
  posture-card composition); customer `.customer-page-title` bands, booking
  heroes, landing, auth vault, recover card verified matching — unchanged.
- Transport/housekeeping/maintenance/accounting modules inherit via app-shell
  + ModuleSummaryCards + shared toolbar — no edits needed.
- No test pins header classes; working-tree regions avoided (manager header
  block untouched by parallel stream — verified via diff).
- Gates: typecheck, eslint 0 errors, 1521/1521, build, diff-check clean.
- Visual QA limit: no screenshot tooling in repo (jsdom only); verified via
  CSS inspection (band responsive stack, fixed-surface both themes) + DOM
  tests. Manual browser QA still pending per KI-005.
- Doc drift noted: SYSTEM.md references `app/scan` which has no page file.

## Verification round (continuous-task directive)

- Rendered prod build on :3100, curled 10 routes: `/`, `/login`,
  `/register`, `/booking/search`, `/booking/details`, `/recover/*`, `/verify`
  → 200 with expected shell markers (coastal-landing, haven-vault,
  booking-hero, auth-card). `/account`, `/manager_dashboard`,
  `/my-reservations` → 200 loading gate (shells mount post-auth; no data
  leak). Authenticated dashboards not screenshottable: no browser tooling in
  repo (jsdom only), no test accounts touched (live DB — no mutations).
- Structural evidence: all staff panels use ModuleSummaryCards +
  TablePagination + shared toolbar/empty states + module-title headers
  (51 grep hits); customer pages all on `.customer-page-title` bands.
- Small alignment fix: staff sidebar/button radius 4px→8px/6px to match the
  reference pill grammar (both themes; `manager-dashboard-theme.css` only).
- Gates: typecheck, eslint 0 errors (63 pre-existing warnings), 1522/1522
  (one transient single-test failure mid-run, green on re-run — KI-004 flake
  shape), build, diff-check clean.

## HostForge build env fix (Option B, same day)

- Root cause (verified against HostForge source): panel env has no
  build/runtime split; Nixpacks `--env` bakes secrets into the image, so
  Option A fails the security constraint.
- `lib/env.ts`: pairing rule now gated on `!isBuildPhase` (reuses existing
  `NEXT_PHASE` flag). Runtime strictness byte-identical.
- `lib/env.test.ts`: new describe, 4 cases (build URL-only/key-only → demo
  no-throw; runtime prod half-pairs → throw). Fixed adjacent pre-existing
  typo `unstubAllEnv` → `unstubAllEnvs` (was failing typecheck).
- Gates: typecheck, eslint 0 errors, 1525/1525 (131 files), build clean
  with URL-only env (the exact HostForge failure state).
- Runtime proof on compiled server: complete creds → boots, serves
  (login 200, protected API 401 from auth gate); URL-only → boot-time
  `EnvironmentError` (pairing + demo refusal), protected route 500.
  Only lib/env.ts + lib/env.test.ts touched. No push/deploy.
