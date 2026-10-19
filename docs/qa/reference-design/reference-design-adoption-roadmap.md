# Reference Design Adoption Roadmap (Haven)

Date: 2026-10-19. Planning only - no stage is executed until separately reviewed and approved.
Source reports: `reference-system-design-audit.md`, `haven-reference-comparison.md`,
`haven-unified-design-system-proposal.md`.

Environment constraints honored by every stage: no browser automation exists in this repo
(jsdom + manual browser checks); verification = `npm run typecheck` + eslint on touched files
+ targeted vitest + full `npm test` + `npm run build` at checkpoints, with a manual browser
checklist per role/theme/viewport. Work must remain additive to `docs/ui-motion-guidelines.md`
and preserve all workflows, RBAC, and guest flows.

---

## Stage 0 - Baseline verification and screenshots

- Scope: freeze evidence before any change. Snapshot current renders of: staff dashboard
  (manager/owner/admin), one staff module with KPI strip, guest account overview, loyalty,
  folio, booking search, landing, login - light and dark staff where applicable - at
  1440px, 768px, 390px, 360px.
- Produce: screenshot manifest + DOM checklist entries in `docs/qa/browser-qa-checklist.md`.
- Risk: none (read-only). Rollback: n/a.
- Acceptance: every later stage has a before/after pair to compare.

## Stage 1 - Token foundations and the 700-variant status rule

- Scope: add missing AA-safe status text tokens (700/800 variants) if absent per surface;
  document tint grammar (10% fill + 700 text); add one shared chart token module;
  codify radius/shadow vocabulary comment blocks in `design-tokens.css`.
- Depends on: Stage 0. Benefit: removes ambiguity before component work; sets up the
  typography-floor remediation.
- Risk: low. Rollback: token-file revert (single-file diff).
- Tests: existing vitest palette/scope tests + one new unit test enforcing shared-selectors
  single-home (from the proposal's convention, extended in later stages).
- Manual checks: badges on both portals unchanged visually except where a chip text was
  using base status color below 14px (slightly darker ink - document each).

## Stage 2 - Shared KPI/overview card (the standard bearer)

- Scope: build the one canonical card (vertical grammar, tone variants, interactive vs
  resting shells, responsive grid) in `components/ui` (e.g. `kpi-card`) + one CSS home;
  migrate consumers in priority order: ModuleSummaryCards content slots first (no visual
  change intended beyond shadow/tonal normalization), then `.sd-kpi`, `.report-kpi-card`,
  `.haven-ai-kpi`, tailadmin template `StatCard`, then guest `.folio-kpi-card` and
  `.loyalty-kpi-card` (tone-variant treatment instead of separate families).
- Depends on: Stage 1. Benefit: collapses 7 families; makes guest/staff monkey-see
  consistency automatic for future modules.
- Risk: medium - touches 17+ staff panels and 2 guest panels; loyalty gradient/gold and
  AI panel layout differences need approved tone/slot variants.
- Rollback: per-family migration commits kept separable; revert single family without
  touching the shared component.
- Tests: ownership/single-home test for `.kpi*` selectors; render tests per migrated
  panel (existing panel tests updated); visual-diff checklist per panel from Stage 0.
- Manual browser checks: staff overview + reports + AI + duty panels (dark/light),
  guest folio + loyalty, KPI button-filter behavior (`aria-pressed`) and focus rings,
  390px wrap behavior for extreme values.

## Stage 3 - Shared UI components, all families (same-function = shared)

- Scope: continue consumer consolidation beyond KPI cards per the comparison verdicts:
  1. StatusBadge entity-map unification (retire `.badge.*` spans + `--st-*` pills).
  2. PageHeader adoption completion (raw `.page-title` variants retired chrome-by-chrome).
  3. Empty/loading/error via one component set per Honest Feed Rule (toolbar empty state,
     skeleton family, named error alerts) for staff and guest panels.
  4. Buttons/toolbar metrics already canonical (HavenSelect/search/pagination) - only
     surface re-declaration cleanup here.
- Depends on: Stage 2 conventions. Benefit: one interaction grammar everywhere.
- Risk: medium-high per breadth; decompose per family (3a/3b/3c/3d commits).
- Rollback: per-family revert.
- Tests: single-home selector tests per family; consumer render tests; full suite.
- Manual checks: a representative staff panel and its guest counterpart side-by-side
  (e.g. reservations module vs my-reservations page), all dialogs open/escape, toasts.

## Stage 4 - Sidebar, header, notification chrome consolidation

- Scope: single sidebar paint implementation fed by tokens (staff/customer theme variants),
  notification bell component extraction (already recommended by `important-review.md`;
  deletes the two largest `!important` walls - about 178 of 466), inline script theme
  bootstrap untouched.
- Depends on: Stage 3 (badge/bell shared). Benefit: removes cascade fights: future
  staff-theme/customer edits stop colliding.
- Risk: high visual surface (both shells, all collapse states) - gated on browser QA.
- Rollback: must keep both old paint paths behind a feature flag during QA [P].
- Tests: bell component tests (existing notification tests), sidebar persistence tests,
  `aria-current`/`aria-expanded` assertions.
- Manual checks: all 8 roles' nav (role matrix), collapse persistence, mobile drawers
  at <= 1000px, light/dark, contrast spot checks.

## Stage 5 - Typography floor + responsive/a11y remediation

- Scope: retire 66 sub-9px sizes (staff-theme 52, guest-booking 14 + loader) to the agreed
  floor (11px interactive / 9px minimum) [floor value needs explicit sign-off]; normalize
  the 15 ad hoc breakpoints toward the documented scale where safe WITHOUT breaking
  layouts; verify touch floors and focus visibility on dark gradient banners.
- Depends on: Stages 2-4 (density moves with components). Benefit: readability + a11y.
- Risk: medium (dense staff tables may reflow) - browser QA mandatory per surface.
- Rollback: per-sheet font-size commits.
- Tests: existing `staff-fitting.test.ts` style guards extended to the floor.
- Manual checks: staff tables on 390px, pricing/report overlays, customer brand slogan,
  guest tables at 720px, marquee/toast motion under `prefers-reduced-motion`.

## Stage 6 - Regression testing and visual QA closeout

- Scope: full manual matrix (each role x theme x 4 viewports on key pages), full
  `npm test` + `npm run build`, update `DESIGN.md` + `DESIGN-STATUS.md` +
  `SYSTEM.md` to the new shared standards, write the post-adoption UI audit report,
  reopen/retire the relevant HUI findings.
- Depends on: all stages. Acceptance: proposal section 7 criteria met; audit score
  re-run improved; no PR contains shared-selector duplication.
- Rollback: n/a (documentation), components via stage flags.

## Sequencing summary

Critical path: 0 -> 1 -> 2 -> 3d (states) -> 4 -> 5 -> 6. Families 3a-3c can run in
any order after 2. Loyalty/folio migration is deliberately LAST inside Stage 2 so the
interactive-card behavior is battle-tested on staff surfaces first.

Sizes are estimates from consumer counts: Stage 2 is the largest single change (~20 panels);
keep it in multiple worktrees/commits per the repo's one-agent, no-subagents rule.
