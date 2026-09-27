# 2026-09-26 — Admin Module CSS Scoping Fix

## Work completed

Diagnosed and fixed why layout edits to the Admin → System Health tables (prompted
through OpenCode) appeared to be ignored. There was no build bug and no blocking
element — the module rendered correctly. The cause was a CSS cascade leak.

- **Root cause 1 — unscoped selectors in a globally-hoisted stylesheet.**
  `components/admin/system-health.css` is imported by
  `components/admin/admin-dashboard-client.tsx`, which renders *every* admin section,
  so Next.js hoists it into the route bundle and it applies app-wide. Five rules at
  the end of the file were not namespaced, despite the file header claiming they were:

  - `.panel-heading h3{display:flex;align-items:center;gap:10px}` — forced **every**
    admin panel `<h3>` into a flex row. No theme overrode it, because the themes that
    own that selector (`app/manager-dashboard-theme.css:323`,
    `app/staff-ops-theme.css:204,530`) only set `font-size`/`color`.
  - `.page-title h1{display:flex;...}` — a **specificity tie** at (0,1,1) with
    `app/globals.css`'s `.page-title h1{font:500 34px...}`. Ties are resolved by
    stylesheet injection order, i.e. by the bundler, not by which file was edited —
    so edits won or lost unpredictably, and `display:flex` survived regardless because
    the two rules set different properties.
  - `.page-title .title-actions{...}`, plus `.sys-card-name` (a duplicate of an
    earlier rule, contradicting it on `gap`).

- **Root cause 2 — table geometry was pinned, making markup edits no-ops.**
  `.system-health-table{table-layout:fixed}` + `<colgroup>` widths (190/120px) means
  the browser sizes columns from the colgroup and **ignores cell content**. Editing
  `<th>`/`<td>`, padding, or copy could not move the layout.

- **Root cause 3 — tests locked the stylesheet's literal text.**
  `components/admin/system-health-view.test.tsx` asserted
  `expect(css).toContain("table-layout:fixed")` and an exact `max-width:360px` match,
  so any refactor went red and read as "the change didn't register".

- **Fixed** by adding a `sys-health-title` scope hook to the page title, rescoping all
  five rules to `.sys-health-title` / `.sys-attention` / `.sys-automations` /
  `.system-health-ledger`; moving table geometry into `--sys-col-version/status/time`
  custom properties; loosening the two geometry-locking assertions; and adding a leak
  guard that scans both admin module stylesheets.

- **Cross-module fallout caught before shipping.** The leaked `.panel-heading h3` rule
  was *accidentally providing* icon spacing to five Security Configuration headings
  that carry an unwrapped icon (`<Send/>`, `<Lock/>`, `<ShieldCheck/>`, `<History/>`,
  `<KeyRound/>`). Grepping `<h3[^>]*><[A-Z]` found exactly those five — all under
  `.sec-panel`. Removing the leak without this would have collapsed their icon/label
  gap. `.sec-panel .panel-heading h3` now declares that layout in
  `security-config.css`, the module that owns it.

  The other two leaked rules turned out to be inert for other sections: a grep of all
  11 `.page-title` blocks in the admin dashboard showed only System Health has an icon
  in its `h1`, and the file contains exactly one `.title-actions`.

- **Secondary bug fixed** — the Pending Migrations modal clipped its Filename column.
  It used `table-scroll`, which carries a global `table{min-width:560px}` floor
  (`app/responsive.css:33`) wider than the 560px modal cap, and
  `.sys-pending-scroll{overflow-x:hidden}` hid the overflow instead of scrolling it.
  The class was dropped (removing the specificity tie) and the rule changed to
  `overflow-x:auto`.

## Decisions

[[D-029 — Admin module stylesheets are global; every selector must be namespaced]]

## Affected files

- `components/admin/system-health.css` — rescoped 5 leaked rules; `--sys-col-*` vars;
  `.sys-pending-scroll` overflow
- `components/admin/admin-dashboard-client.tsx` — `sys-health-title` class on the
  System Health page title (line 560)
- `components/admin/security-config.css` — `.sec-panel .panel-heading h3` now owns the
  icon/label flex layout
- `components/admin/pending-migrations-modal.tsx` — dropped `table-scroll`
- `components/admin/system-health-ledger.tsx` — colgroup comments pointing at the vars
- `components/admin/system-health-view.test.tsx` — dropped 2 geometry assertions,
  added the leak guard

No logic, API, schema, or migration changes.

## Verification

- `npx vitest run components/admin/system-health-view.test.tsx` — 33/33.
- `npm run test` — **160 files, 1791/1791 passing**.
- `npx tsc --noEmit` — no errors in touched files.
- Leak guard proven non-vacuous: the three regexes return `true,true,true` against the
  pre-fix stylesheet and `false,false,false` against the current one.
- Compiled CSS verified in the running dev server's chunks (the bytes the browser
  actually receives, not just source):
  `.next/dev/static/chunks/components_admin_system-health_css_1igg3k2._.single.css`
  contains `.sys-health-title h1`, `--sys-col-version/status/time`, and
  `.sys-pending-scroll{overflow-x:auto}`, with **zero** bare `.page-title h1` /
  `.panel-heading h3` rules; the security-config chunk contains
  `.sec-panel .panel-heading h3` and zero bare `.panel-heading h3`.

## Unresolved

- **Manual browser verification not done.** No browser tooling was available in the
  session. Static, test, and compiled-CSS evidence all confirm the cascade fix, but
  these still need an eyeball: (a) the five Security Configuration headings still show
  an icon/label gap, (b) System Health renders unchanged, (c) the modal's Filename
  column is fully visible, (d) changing `--sys-col-version` in devtools now visibly
  moves the column.
- `security-config.css:20-23` still carries 8 `!important` declarations with hardcoded
  hex for the `.sec-badge-off/on` badges. Properly scoped under `.sec-wrap` so nothing
  leaks, but any restyle must match `.app-shell .sec-wrap .haven-status.sec-badge-*`
  **and** carry `!important`. Left as-is.

## Next recommended action

Run the four visual checks above against the running dev server on `:3000`. No
credentials are needed for the Security Configuration and System Health layout checks
(they are static-render views), though reaching those sections still requires an Admin
session.
