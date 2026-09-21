# 2026-09-20 - Action Card Standardization (HavenActionItem)

System-wide standardization of the staff `icon | title + description | chevron`
action-card family. Presentation + component structure only; no logic, RBAC,
navigation, or data changes. The Front Desk "Needs attention" fix was
generalized to every role sharing the pattern (D-025 presentation family).

## Work completed

- **New shared primitive** `components/ui/haven-action-item.tsx` —
  `HavenActionItem` (exported from `components/ui/index.ts`). Props: `icon`,
  `title`, `description`, `tone` (amber/green/rose/neutral), `variant`
  (row | stat), `quiet` (zero-count: muted, card kept as shortcut),
  `onAction`, `actionLabel`, `trailing` (custom node, e.g. Review button).
  Renders `<button>` only when actionable; informational cards are plain
  `<div>`s so nothing looks clickable that isn't. Layout is
  `grid-template-columns: auto minmax(0,1fr) auto`, 36px/8px-radius tinted
  icon chip, 16px icon–text gap, 4px title/description gap (single deliberate
  exception to the 8px scale), 12/16px padding, semibold 14px title, muted
  12px description with line-clamp-2, ChevronRight 16 aria-hidden with 2px
  hover nudge, 2px ink focus-visible ring.
- **CSS** `.haven-action-item` family in `app/staff-ops-theme.css` §7b —
  light theme on `--ops-*` tokens; dark-theme block alongside the existing
  dark overrides (same token names); reduced-motion gates cover the card +
  chevron. Staff-scoped; no customer/landing/auth exposure.
- **Migration 1 — manager dashboard** `components/manager/manager-dashboard-client.tsx`:
  Overview "Room readiness activity" + "Needs attention" panels (served to
  front_desk, housekeeping, maintenance, accounting, manager from one markup
  site) → `HavenActionItem`. Zero-count cards get `quiet`; data, copy,
  icons, and `setSection` targets unchanged; the CSS-rotated-ChevronDown hack
  replaced by real `ChevronRight`.
- **Migration 2 — admin dashboard** `components/admin/admin-dashboard-client.tsx`:
  Quick actions (row variant), System health cards (`variant="stat"` keeps
  their 104px metric proportions + tone mapping attention→rose, caution→amber,
  healthy→green), governance posture banner kept custom (it is a header band,
  not a card) with its Review button. Dead legacy rules for
  `admin-quick-actions>button` and `admin-health-card/copy/arrow` removed
  from `app/manager-dashboard-theme.css` (grep-verified zero remaining
  references); responsive + reduced-motion overrides trimmed accordingly.
- **Dead CSS** `.quick-panel`/`.quick-icon` rules and their light/dark
  overrides removed from `app/globals.css` + `app/manager-dashboard-theme.css`
  after migration left zero consumers (grep-verified).
- **Tests** `components/ui/haven-action-item.test.tsx` (5): labels/description
  as button, quiet zero-count stays reachable, informational div w/o chevron,
  custom trailing action, stat variant. `lib/admin-governance.test.ts`
  contract updated to the new markup (`HavenActionItem`, `admin-quick-actions`).

## Verification

- typecheck clean; eslint 0 errors on touched files (2 pre-existing
  react-hooks warnings in untouched code); **1552/1552 tests**; build clean;
  `git diff --check` clean (CRLF warnings only).
- No rendered-screenshot/browser QA possible (no runner, KI-005). Verification
  was component contract tests + CSS-cascade reasoning. Manual visual check of
  the five role dashboards (light + dark) still pending.
- Fixed a cross-session compile break in `haven-data-controls.test.tsx`
  (missing `node:fs`/`node:path` imports in the parallel toolbar stream's new
  test) to unblock the shared typecheck gate; their later edit reconciled the
  rest of that test with their CSS themselves.

## Files

- New: `components/ui/haven-action-item.tsx`, `components/ui/haven-action-item.test.tsx`
- Modified: `components/ui/index.ts`, `components/manager/manager-dashboard-client.tsx`,
  `components/admin/admin-dashboard-client.tsx`, `app/staff-ops-theme.css`,
  `app/manager-dashboard-theme.css`, `app/globals.css`,
  `lib/admin-governance.test.ts`, `components/ui/haven-data-controls.test.tsx` (imports only)

## Next

- Manual per-role browser QA (light + dark) — needs human/real browser.
- Consider migrating the posture banner onto the shared component if its
  band context ever becomes a standalone card.
