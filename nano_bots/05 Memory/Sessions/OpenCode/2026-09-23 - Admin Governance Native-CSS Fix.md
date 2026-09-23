# 2026-09-23 - Admin Governance Native-CSS Fix

## Outcome

FIXED locally, all gates green. Two prior refactors emitted Tailwind
utilities this Tailwind-less repo never compiles, so System Health cards
stacked unstyled. All markup now uses native design-system classes; icons
shed dead utility classes; security `dl` rows are borderless key-values.

## Changes (3 files, no logic changes)

- `components/admin/admin-dashboard-client.tsx` — System Health 8-card
  grid `grid grid-cols-1 sm:…` → `metric-grid` (native 4-col, responsive
  collapse free); automations×alerts wrapper → `admin-report-lower`
  (native 2-col → 1fr ≤1000px); tablist gains `insights-tabs` (pill
  buttons, active fill, focus ring, mobile scroll — zero new CSS);
  stripped 6 dead icon class strings (`h-*/text-emerald/text-muted/…`,
  `size` prop governs). Security strip/cards already native
  (`metric-grid`, `admin-security-grid`) — untouched.
- `app/manager-dashboard-theme.css` — scoped key-value rows for
  `.admin-security-grid` cards (`section>dl` + `div.data-panel>dl`):
  borderless, `dt` muted left, `dd` right-aligned tabular, hairline
  separators. No toolbar-wrapper selectors touched (D-026 walk safe).
- `components/admin/system-health-view.test.tsx` — `metric-grid` +
  `metric-card` count assertions, `insights-tabs` + `active` tab state,
  whole-tree no-Tailwind assertion.

## Gates

typecheck clean · eslint 0 errors (2 pre-existing warnings) ·
**159 files / 1762 tests pass** (incl. D-026 stylesheet walk) · build green.

## Pending

Manual browser QA (KI-005) — jsdom cannot see the cascade; verify 4-col
grid, 2-col pairs, tab pills, and key-value rows in a real viewport.
