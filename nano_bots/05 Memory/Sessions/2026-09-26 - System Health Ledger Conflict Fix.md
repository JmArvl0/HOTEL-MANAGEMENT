# 2026-09-26 — System Health Ledger Conflict Fix

Follow-on to [[2026-09-26 - System Health Module Redesign]]: that session fixed the
module's scale and hierarchy, this one fixes what was still visibly wrong inside the
ledger panel specifically (Applied Migrations / Payment Configuration / Audit Trail).

## Work completed

The user reported the ledger "still looks messy" and asked whether something was
**conflicting** with it. Three independent style conflicts, each with a named
mechanism. The mechanism matters — none could be reached by editing the markup, and
none was a taste problem.

Markup shape (`components/admin/system-health-ledger.tsx`):

```
section.system-health-ledger
├─ div.data-panel.system-health-ledger-tabs      ← only child is the tab strip
└─ div.data-panel.system-health-ledger-content
    └─ div[role=tabpanel] ×3                     ← .panel-heading lives HERE
```

- **A child combinator never reached the headings.** `manager-dashboard-theme.css:1749`
  resets headings as `.app-shell .admin-workspace .data-panel>.panel-heading`
  (`padding:15px 16px;margin:0;border-bottom`). `>` requires a **direct** child; the
  ledger's headings are grandchildren (inside `[role=tabpanel]`, which is required so
  each tab carries its own heading). So they got no padding, no `margin:0`, no
  separator, and fell back to the themes' 13–16px `margin-bottom` — while the cells
  one level down *were* inset 14px by the same theme file (`:1752-1753`). Heading at
  x=0, cells at x=14, inside one card.

- **`.data-panel` has no padding anywhere, and the tabs card has no `.panel-heading`
  child.** Every other panel in the app is inset *by its own `.panel-heading`*, which
  supplies the padding. Checked all four stylesheets that style `.data-panel`
  (`globals.css:4`, `manager-dashboard-theme.css:12`, `:1748`,
  `staff-ops-theme.css:280`, `:583`) — none sets padding. The tabs card's only child
  is `.system-health-tablist`, also unpadded, so the three pills were drawn **on the
  card's own border**, and `:1748`'s `overflow:hidden` + `border-radius:10px` clipped
  their corners and the `outline-offset:2px` focus ring. The clipped focus ring is an
  **accessibility defect**, not just cosmetics.

- **The tables had no mobile step.** `table-layout:fixed` with
  `--sys-col-version:190px` + `--sys-col-status:120px` = 310px of locked columns and
  **no `@media` rule for the tables at all**. At 390px the card is ~358px, so the
  Name column was handed ~48px and wrapped to a sliver.

## Ruled out with evidence (deliberately not changed)

Recording these so they are not re-investigated:

| Suspect | Verdict |
|---|---|
| `manager-dashboard-theme.css:1784-1788` `dl>div` layout | Requires a `.admin-security-grid` ancestor; `.system-health-config` has none |
| `.system-health-config dt{flex:none}` + the long Owner label | The 680px column flip (`system-health.css:108`) plus the full-width card means it is never squeezed |
| `table{min-width:560px}` (`app/responsive.css`) | Scoped to `.table-scroll table`; the ledger is deliberately outside `.table-scroll` (locked by `system-health-view.test.tsx:400-403`) |
| `.system-health-tablist button.active{background:#084b55}` hardcoded hex | **Correct as-is.** `--admin-accent` is `#69cfc8` in dark (`manager-dashboard-theme.css:1715`) — white on that is ~1.9:1, so swapping to the token would *regress* contrast |
| `[hidden]` defeated by an author `display` rule | No such rule exists |

## The change

All four edits in **one file**, `components/admin/system-health.css`. No markup change,
no theme-file change, no new token, no migration.

1. `.system-health-ledger-tabs{margin-bottom:0;padding:12px 16px}` — insets the strip,
   unclips the focus ring.
2. `.system-health-ledger-content .panel-heading{padding:15px 16px;margin:0;border-bottom:1px solid var(--dl)}`
   — restates the theme's reset at the depth the headings actually live, at the theme's
   own values.
3. `.system-health-searchrow{margin:12px 16px}` (was `margin:12px 0`) — **`margin`, not
   `padding`**: the D-026 guard (`system-health-view.test.tsx:386-387`) asserts that
   exact rule carries no `padding`/`background`/`border`.
4. A `@media(max-width:680px)` block setting `table-layout:auto` and the three
   `.col-*{width:auto}`. It **must sit after** the `--sys-col-*` width rules — those
   selectors tie on specificity and source order decides.

Result: one inset rhythm (16px for chrome, 14px for cells) instead of five competing
left edges.

D-029 is intact — the new selector is anchored on `.system-health-ledger-content`, so
it cannot match outside the ledger, the same shape as the existing
`system-health.css:126`. It passes the leak guard (which bans only line-anchored
`/^\.panel-heading h3\{/m` and the two `.page-title` forms).

`SYSTEM.md` gains one sentence on this, for a specific reason: the restated padding
looks like a duplicate of the theme rule, and the failure mode is a future reader
deleting it as redundant and reintroducing the bug.

## Affected files

- `components/admin/system-health.css` — the four edits
- `SYSTEM.md` — the Admin System Health bullet

Neither `lib/system-health.ts`, `app/api/admin/data/route.ts`,
`system-health-ledger.tsx`, nor any test changed.

## Verification

- `npx vitest run components/admin/system-health-view.test.tsx` — **35/35**, including
  the D-026 search-row guard and the D-029 leak guard.
- `npm run test` — **160 files, 1793/1793**.
- `npx tsc --noEmit` — clean. `npx eslint` — 0 errors (CSS is not in the eslint config).
- **Compiled chunk verified**, not just source. Flattened
  `.next/dev/static/chunks/components_admin_system-health_css_1igg3k2._.single.css`
  was checked with newline-tolerant greps (the dev pipeline pretty-prints, so a plain
  `grep -oE "rule\{[^}]*\}"` silently returns nothing and makes a fresh chunk look
  stale). It carries `padding: 12px 16px`, the new
  `.system-health-ledger-content .panel-heading { … padding: 15px 16px; }`,
  `margin: 12px 16px` with no padding, and the 680px `table-layout: auto` + three
  `width: auto` overrides.

## Unresolved

- **Browser QA still not done** (KI-005) — System Health needs an Admin session. The
  three things to eyeball are listed in [[Next Tasks]].
