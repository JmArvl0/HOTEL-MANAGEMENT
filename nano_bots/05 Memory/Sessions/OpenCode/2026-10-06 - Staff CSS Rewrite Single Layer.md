# 2026-10-06 - Staff CSS Rewrite (Option C): one staff-theme.css

User complaint: front-desk modules look messy — broken layout, clutter,
inconsistent styling across modules. Root cause found in plan mode: FOUR
stacked staff theme layers styling the same selectors
(manager-dashboard 2156 lines / staff-ops 1049 / tailadmin 1359 / fleetops
240). Merge script measured **416 same-selector conflicts**. Last-import
only won where FleetOps defined a rule; elsewhere an older layer won —
every module looked like whichever layer styled it hardest.

## What was built

- `app/staff-theme.css` (new, ~324KB): mechanical merge of the four layers
  with **per-property newest-wins** (fleetops > tailadmin > staff-ops >
  manager-dashboard), so the merged cascade renders byte-identical to the
  old four-file cascade. Same-selector ties collapse to one definition;
  older losers are gone. `:root`/`.theme-light` blocks merged in order.
  Staff-ops §§20-23 fitting rules emitted last under a CONTENT FITTING
  banner (keeps the scope-protection test meaningful).
- Deleted: `manager-dashboard-theme.css`, `staff-ops-theme.css`,
  `haven-tailadmin-theme.css`, `fleetops-theme.css`. `layout.tsx` imports
  only `staff-theme.css` (last position, as fleetops was).
- Zero TSX/logic/RBAC changes. Class names frozen.
- Merge script: `C:\Users\areva\AppData\Local\Temp\opencode\cssmerge.py`
  (dedupes per-property, byte-stable minified emit for the
  stylesheet-walk tests). Source copies for re-runs sit beside it.

## Test migration (intent preserved, paths repointed)

- `app/fleetops-theme.test.ts` → `app/staff-theme.test.ts` (tokens,
  last-import, primitives, no-legacy-hexes now assert the merged sheet).
- 13 stylesheet-walk suites repointed (sidebar, toast, reservations,
  reports-print, sidebar-groups, approvals, action-item, fitting, owner
  layout, transportation, payment-display, front-desk-ops, fleetops-surfaces).
- Three deliberate expectation updates where the merge keeps the
  actually-rendered winner, not the fossil: nav-group-header width
  (tailadmin `100%`), `.mod-kpis` grid (tailadmin auto-fit), `--db/--dg`
  dark values (staff-ops `#0d1320`/`#7ea4e8`), owner `.owner-role-grid`
  single-selector form.
- Two real bugs fixed en passant: merge script doubled `@keyframes` to
  `@@keyframes` (16 build errors) — fixed the `@` prefix handling.

## Gates

Baseline (committed `3ec481d`): typecheck clean, 2062 passed / 7 failed.
After rewrite: typecheck clean, eslint clean on all touched files, full
suite identical 7 pre-existing failures (admin-governance, fetch-resilience,
2× guest-staff-conversion, refund-workflow, 2× security-policy — all
assert against admin-dashboard-client copy, unrelated to CSS),
`npm run build` clean (88 routes). Not committed.

## Rulings

- Cascade-equivalent merge, not hand-redesigned values: without a browser
  runner, inventing new values is guessing. The file makes every remaining
  conflict explicit in one place for follow-up tuning.
- Overrode the recorded Slice-D ruling that staff-ops-theme.css is KEPT
  (user chose full rewrite; ruling noted here).
- Manual per-role screenshot checklist still pending (no headless runner):
  light + dark, desktop + 390px, front-desk modules.
