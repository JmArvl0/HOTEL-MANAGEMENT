# 2026-09-20 - Universal Search/Filter Standard

System-wide completion of the search-first, transparent-toolbar standard. The
layout work had largely landed in a prior (interrupted) session; this session
fixed the defects that meant the headline requirement was **still violated in
light theme**, removed a second surface box around the search input, and added a
mechanical guard so it cannot silently regress.

No logic, RBAC, API, pagination, schema, OTP, or landing-page changes.

## Root cause of the headline defect

The prior session appended de-card **overrides** at `app/staff-ops-theme.css`
(the last-loaded stylesheet) instead of fixing the source rules. Those
overrides were 4-class selectors; the light-theme rules they were trying to beat
were 5-class (`.theme-light .app-shell ...`). Specificity wins over load order,
so the white card still rendered in light theme. Per the standard's own rule
("correct the actual source, do not override globally") the source rules were
fixed and the redundant override block deleted.

Second defect: `.table-tools label` (specificity 0,1,1) outranked the shared
`.haven-search-input` (0,1,0), so the migrated search input rendered inside a
second white bordered box with doubled padding and a 360px/60% width cap. The
rules were dead — every `.table-tools` consumer now wraps only
`HavenSearchInput` — and one of them (`background:transparent` on
`.table-tools input`) was actively removing the shared input's own surface.

## Files changed (this task)

| File | Change |
|---|---|
| `components/ui/haven-data-controls.css` | mobile `@media(max-width:720px)` re-added `padding:14px` on the wrapper, contradicting the transparent wrapper — dropped |
| `app/manager-dashboard-theme.css` | de-carded `.reservation-filters` + `.owner-toolbar` at source; deleted their light-theme `background:#fff` rules and the dead `.table-tools label` rule; scoped the remaining `.table-tools label` rules to `:not(.haven-search-input)` and stopped them nulling the input surface |
| `app/staff-ops-theme.css` | deleted the redundant override block + the light-theme `.owner-toolbar` surface; unified the light-theme chip radius `8px` → `999px`; scoped `.table-tools label` to `:not(.haven-search-input)` |
| `app/globals.css` | deleted the dead `.table-tools label` / `.table-tools input` rules; kept the flex row so the sibling `Clear filters` button still aligns right |
| `app/customer-portal.css` | removed `box-shadow` from the live shared customer toolbar |
| `components/manager/manager-reservations-panel.tsx` | `All` moved to the head of `QUEUES` (it was 6th while the module default was already `all`) |
| `components/manager/front-desk-reports-panel.tsx` | "all" chip rendered lowercase `all` → `All`; added `aria-pressed` |
| `components/manager/manager-dashboard-client.tsx` | `aria-pressed` on the reservations and rooms chip rows |
| `components/manager/guest-requests-panel.tsx` | `aria-pressed` on the queue chips |
| `components/customer/transportation-request-list.tsx` | `aria-pressed` on the filter chips |
| `components/ui/haven-data-controls.test.tsx` | fixed a wrong assertion (`not.toMatch(/box-shadow/)` against a correct `box-shadow:none`) + new stylesheet-walking guard |

## The guard (why it exists)

The wrapper's transparency is a **cascade** property, not a component property —
jsdom renders no CSS, so no component test can catch a stylesheet re-drawing the
card. `haven-data-controls.test.tsx` now walks every `.css` under `app/` and
`components/` and fails if any rule whose selector *ends* at a toolbar wrapper
class (`.haven-data-toolbar`, `.reservation-filters`, `.owner-toolbar`,
`.tp-toolbar`, `.hk-toolbar`, `.sd-toolbar`, `.approval-toolbar`, `.table-tools`)
declares a non-inert `background`, `border`, `border-color`, `border-width`,
`box-shadow`, or `padding`. Selector-ending anchoring is what excludes child
rules like `.reservation-filters button`, which are supposed to keep surfaces.

Verified non-vacuous: a synthetic `.reservation-filters{background:#fff}` probe
file failed the test; the probe was removed.

**Maintenance rule:** if a new toolbar wrapper class is introduced, add it to the
alternation in that test. If this test fails, fix the offending source rule —
do not append a broader override.

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — **135 files / 1553 tests passing** (was 1552; +1 guard).
- ESLint on touched files — 0 errors; the 2 warnings are the pre-existing
  `react-hooks/set-state-in-effect` `setCollapsed` timer at
  `manager-dashboard-client.tsx:102`, untouched.
- `npm run build` server-rendered route table clean. `git diff --check` clean
  apart from the repo-wide CRLF noise.
- Post-fix recursive sweep: every remaining wrapper rule in shipping CSS is
  layout-only (`display` / `gap` / `margin` / `align` / `flex-*`).

**Browser visual QA was NOT performed** — no browser tooling in this environment
(see KI-005). A cascade-level mechanical substitute was used, and it is a
substitute: it proves no stylesheet draws a wrapper surface, not that the pages
look right. A human eyeball is still recommended (below).

## Standing rule recorded in the docs

`docs/HAVEN_UI_STANDARDS.md` gained the "toolbar wrapper is transparent" clause
(no background / border / radius / shadow / padding at any width or theme; each
control keeps its own surface; results containers are separate and keep theirs),
the real-filters / real-counts clauses, and the customer-vs-staff scoping clause
(shared pattern, own palette — Midnight Ink is not imposed on customer surfaces;
public booking is reviewed, not converted; landing page out of scope).
`docs/DESIGN.md` data-toolbar row updated to match.

## Known leftovers (deliberate, unrelated)

- Dead CSS with no JSX consumer, left untouched: `.owner-search`
  (`manager-dashboard-theme.css:1956-1959,2021`; `staff-ops-theme.css:724-725`)
  and `.reservation-history-controls` / `.reservation-filter-chip*`
  (`customer-portal.css:389-394`). Candidates for a future deletion pass.
- Not in scope by design: sidebar nav search (`Navigation.tsx:273`), walk-in
  dialog search, the public booking availability form, and navigation-as-chips
  (e.g. payments link chips) — none has a filter hierarchy to order.

## Next

- Human visual pass at desktop + 390px in **both themes** on: Manager
  Reservations, Manager Rooms, Transportation, Housekeeping, Approvals, Admin
  Users & Staff, Room Configuration, Audit, Owner modules, customer My
  Reservations. The specific thing to look for is a card/border reappearing
  around the search+chips row in light theme.
