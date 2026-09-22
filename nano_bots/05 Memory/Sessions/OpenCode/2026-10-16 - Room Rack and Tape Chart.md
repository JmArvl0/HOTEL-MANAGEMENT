# 2026-10-16 - Front Office Room Rack & Tape Chart (OpenCode)

Fused "Room Rack & Reservations" (`room_rack`) replaces the disconnected
Reservations table + Rooms card grid for front_desk/manager/owner. Old
sections stay defined but `hidden` (deep links keep working).

## Added
- `GET /api/rack` (front_desk/manager/owner): one batched read-only payload —
  rooms with readiness, window reservations with folio balances, unassigned
  queue derived client-side. Placed at `/api/rack`, NOT under
  `/api/front-desk/`, because `lib/owner-governance.test.ts` forbids the
  `"owner"` literal in any front-desk route guard.
- `lib/room-rack.ts` + tests (7): window days, unassigned predicate, bar
  layout/clamping, assignability matrix, summary counts.
- `hooks/use-front-office-rack.ts`: window state, 30s refresh, Manila today.
- `components/front-desk/fused-room-rack-panel.tsx` + tests (5):
  click-to-assign primary (drag as enhancement), assign confirm modal,
  bar click to folio, dirty-cell reclean dispatch via generic
  `housekeeping_tasks` POST, manager/owner read-only notice.
- `config/role-navigation.test.ts` (3): single visible surface contract.
- Dashboard wiring: `room_rack` icon, header title, render branch reusing
  `FrontDeskArrivalDialog` (check-in) + folio modal; `load()` skips fetch;
  `isResourceSection` excludes rack.

## Deliberate non-changes (contract-tested, verified by failing then reverting)
- Assign + check-in routes stay front_desk-only (`room-type-exception.test`
  pins the guard; owner-governance pins Owner out). Manager/owner rack is
  oversight + folio + dispatch. Panel gates `canAssign` on front_desk with a
  friendly notice — no dead 403s.
- Zero new RPCs/migrations: `front_desk_assign_room` already enforces
  type/clean/overlap/maintenance gates; panel pre-check mirrors, server
  re-validates.

## Gates
typecheck clean, lint 0 errors, `npm test` 1674/1674, build compiles,
`git diff --check` clean on touched files. Untouched: parallel sessions'
dirty files (DESIGN.md, SYSTEM.md, purchase-orders, etc.).
