# 2026-11-18 - Lost & Found Dashboard

Rebuilt the hidden Lost & Found module as a custody dashboard for Manager,
Front Desk and Housekeeping, using the existing API and role gates.

## Shipped

- Removed `hidden: true` from the `lost_found` navigation entry; visibility is
  now limited to manager, front_desk and housekeeping by its existing roles.
- Added pure helpers in `lib/operations.ts`: `foundReference`, `FoundMetrics`,
  `foundMetrics` and `manilaDateKey`, with unit tests.
- Rewrote `components/manager/lost-found-panel.tsx`: four counted metric
  filters, newest-first register with search/status/location/date, pagination,
  selected-item facts, release readiness, chain of custody, role-gated actions,
  and a mobile queue/detail switch with focus restore.
- Added `components/manager/lost-found.css` scoped to `.lost-found` / `.lf-*`,
  using staff theme tokens and container queries. Desktop fills the workspace
  with independent queue/detail scrolling.
- Added `components/manager/lost-found-panel.test.tsx` covering sorting,
  search, KPI filters, page reset, role actions, hidden claim notes,
  selection after reload and the Manila-time timeline.
- Updated `SYSTEM.md` role table and Lost & Found workflow, and added a short
  `DESIGN.md` module pattern note.

## Verification

- `npm run typecheck` passed.
- `npx eslint` on touched TS/TSX files passed with zero errors.
- Targeted Vitest: 6 files / 51 tests passed; panel + helper focused run 14/14.
- Full `npm test`: 237 files / 2,469 tests passed.
- `npm run build` completed successfully (Next.js 16.3.2, Turbopack).
- Browser QA was not run (no authenticated session in this shell). No database,
  API, RPC, migration or dependency changes.

## Notes

- Housekeeping still receives no `claimant_note` from the API; the panel also
  suppresses the block defensively.
- "Released" remains the total released count from the latest 100 records, as
  the housekeeping event feed omits releases.
