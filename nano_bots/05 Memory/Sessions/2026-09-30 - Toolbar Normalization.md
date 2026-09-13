# 2026-09-30 - Toolbar Normalization (search-first)

System-wide search/filter toolbar audit + normalization. CSS + DOM only; no new
component (per user decision — existing `.approval-search`/`.table-tools`
primitives were sufficient); no logic/RBAC/API/pagination changes.

## Work completed

- **Pattern A (search-last + stretch) fixed in 4 toolbars**: Admin Users & Staff,
  Room Configuration (the reported page), Audit/Security, Manager Approvals —
  `label.approval-search` moved first in DOM; `.approval-search` bounded to
  `flex:1 1 300px`, `min-width:240px`, `max-width:480px` (was `flex:1`, unbounded).
  Approvals status-pills row stays above (cards → chips → search vertical order).
- **Heights unified**: `.approval-search input` + `.approval-filters select`
  `min-height:34px` (touch/iOS rules in `responsive.css` still win ties —
  stylesheet order verified).
- **Transportation search row** constrained (`max-width:480px`, full-width below
  its breakpoint automatically); standalone `.table-tools` rows already
  search-first and bounded (`width:min(360px,60%)`) — untouched.
- **Catalog panels in scope**: Transfer Vehicles + Request Types gained the missing
  `aria-label`s; rows already search-first.
- **Mobile (≤720px)**: search full-width; non-search filter labels stack
  `flex:1 1 100%` with full-width selects (full-width-stack default per decision).
- **Tests**: 4 new search-first DOM-order assertions (Users/Rooms/Audit/Approvals).
- **DESIGN.md**: short Data Toolbar convention (search-first, bounded search,
  compact selects, responsive stack, a11y, no logic changes).

## Verification

- typecheck clean; lint 0 errors (71 warnings, baseline); **994/994** (990 + 4 new);
  build clean. Dev-server curl: `/login` + `/manager_dashboard` 200.
- No rendered-screenshot pass possible in this environment (no browser tooling,
  KI-005) — verification was jsdom DOM-order + CSS-cascade reasoning + gates.
  Recommend a quick human eyeball of Room Config at 1440px + 390px.
- Commit `fda0ced` — `normalize search and filter toolbars across HAVEN`
  (9 files, +55/−14). No push. Tree clean after commit.

## Next

- Nothing pending for this task. Owner/customer surfaces have no search toolbars
  (verified absent); `DataTable` search is dead code (unused component) — left alone.
