# 2026-10-19 - FleetOps Reference Design Audit (report-only)

- Task: design-reference audit requested by the user. Reference = FleetOps web dashboard
  (`C:\Users\areva\Downloads\fleet-transpo`, `src/` only); target = this Haven repo.
  No Haven or FleetOps application code was modified; no dependencies installed; no commits.
- Created `docs/qa/reference-design/` (new subdir; existing `docs/qa/` files untouched):
  1. `reference-system-design-audit.md` - FleetOps stack (Tailwind v4 + Radix + cva, one
     global stylesheet over semantic tokens), token/type/component catalog (Button cva,
     StatCard two-variant-one-shell + tactile physics in `globals.css:215-266`,
     StatusBadge entity maps, chart-tokens.js single source), named rules, module
     inventory with per-module depth explicitly sampled vs NOT INSPECTED.
  2. `haven-reference-comparison.md` - Haven baseline strengths kept, the drift table
     documenting same-function components used by multiple roles with divergent formats
     (7 KPI/card families incl. `.mod-kpi/.sd-kpi/.report-kpi-card/.haven-ai-kpi`/
     tailadmin StatCard/`.loyalty-kpi-card`/`.folio-kpi-card`, 3 status-pill systems,
     PageHeader at 5 consumers, 2 sidebar paint systems), ADOPT/ADAPT/KEEP/AVOID verdicts.
  3. `haven-unified-design-system-proposal.md` - one canonical format per function across
     all roles (user mandate): shared KPI card, badge resolver, page header, Honest Feed
     state set, CSS ownership rules, `[R]/[H]/[P]` labeling, anti-drift test convention
     extending the existing `.mod-kpis` guard tests.
  4. `reference-design-adoption-roadmap.md` - Stages 0-6 with dependencies, risks,
     rollbacks, test + manual browser checklists. Not executed.
- Key discovery: Haven already adopted the FleetOps palette/typography token scheme
  (`app/design-tokens.css` is effectively the same scheme); remaining work is component
  consolidation in Haven's vanilla-CSS idiom (Tailwind/Radix stack AVOID by policy).
- Verification: static source reads only (no dev server/browser in harness); all
  rendered-visual claims labeled NEEDS BROWSER VERIFICATION / SOURCE-ONLY in the reports.
- Follow-ups: user must review + approve the roadmap before any Stage 0+ work.

## Appendix (same day): Stage 0-1 implemented after roadmap approval

- Re-verified stale claims against the tree before coding: HUI-003 sub-9px is FIXED upstream
  (byte scan finds zero sub-9px in staff-theme/guest-booking); comparison report rows
  corrected; payments pills + TailAdminPageHeader removal from B-H2/B-H4 noted there.
- Stage 1 (FleetOps chart-token pattern): new `lib/chart-tokens.ts` single source for
  recharts hexes (values shipped unchanged), consumers = manager-dashboard-client overview
  chart, predictive-insights-panel, performance-reports, haven-tailadmin-visual-template;
  new `lib/chart-tokens.test.ts` pins values + forbids raw hex stroke/fill/stopColor
  attributes in those 4 files. `app/design-tokens.css` gained the status-tint grammar
  comment (10% fill + 700/800 fg variant text). `DESIGN.md` dated update appended.
- Gates at this checkpoint: `npm run typecheck` clean; `npm test` 186 files / 2072 tests
  PASS (baseline 2070 + 2 new); eslint touched files 0 errors (pre-existing warnings only);
  `npm run build` compiles successfully. Nothing committed; user tree changes untouched.
- Next when user approves: Stage 2 shared KPI/overview card consolidation (largest,
  ~20 panels; roadmap says multiple separable commits per family).
