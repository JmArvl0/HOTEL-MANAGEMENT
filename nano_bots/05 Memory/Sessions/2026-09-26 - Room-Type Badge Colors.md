# 2026-09-26 — Room-Type Badge Colors

## Work completed

Each room type now owns a distinct, stable badge color everywhere staff see a room-type
pill — the Rooms & Availability card grid and the check-in **Select Room dialog** — managed
from a curated eight-color HAVEN palette in Room Types & Photos and stored as a semantic
key in the DB. Requested via `/impeccable /ui-ux-pro-max` brief "HAVEN — COLOR-CODE
ROOM-TYPE BADGES".

- **Shared component (the only mapping in the codebase):** `lib/room-type-badge.ts`
  (`ROOM_TYPE_COLORS` + `roomTypeBadgeClass`) and `components/ui/RoomTypeBadge.tsx`.
  No scattered name→color conditionals anywhere; unknown/null keys → neutral pill.
- **DB:** migration `20260925010000_room_type_badge_colors.sql` (pushed + live-verified):
  `room_types.badge_color_key text` with a CHECK on the eight keys
  (sage/gold/ocean/plum/terracotta/slate/sand/lavender); **partial unique index**
  `room_types_badge_color_active on room_types(badge_color_key) where active and
  badge_color_key is not null` — unique among ACTIVE types only (inactive types' colors
  reusable; own color stays valid); backfill by NAME (Garden Twin→sage, Deluxe King→gold,
  Ocean Suite→ocean, Executive Suite→plum); both catalog RPCs recreated with
  `p_badge_color_key` — allowlist check `INVALID_ROOM_TYPE_COLOR`, active-conflict
  pre-check + `unique_violation` backstop `ROOM_TYPE_COLOR_TAKEN`, color in audit
  after_data. **Trap fixed:** `create or replace` with the new parameter created
  overloads — old signatures dropped live AND in the migration file (fresh replays stay
  clean); service_role-only EXECUTE verified.
- **API:** catalog routes validate `badgeColorKey: z.enum(ROOM_TYPE_COLORS).nullable()`
  and pass `p_badge_color_key`; `lib/admin-route.ts` maps both new error codes (409/400);
  `lib/staff-data.ts` rooms list and the eligible-rooms endpoint each fetch the
  name→key map once and attach `room_type_color` / `badgeColorKey`.
- **UI:** rooms grid + Select Room dialog render `<RoomTypeBadge>`; the catalog editor
  gained a "Badge color" radiogroup of swatches that render as the badge itself, with a
  neutral "No color" option, colors held by other ACTIVE types disabled with the owner
  named (visible, not tooltip-only), and a live preview; photo saves re-send the key
  (full-state PATCH must not clear it).
- **CSS:** dual-palette custom-property system in `manager-dashboard-theme.css` — each
  variant defines `--rt-bg/--rt-fg` (dark shell) + `--rt-bg-l/--rt-fg-l` (light theme +
  shared light modal panels); two surface-switch rules pick the pair. **Room-status and
  housekeeping colors untouched.**
- **Customer portal NOT redesigned** — it never used the badge component, so it
  inherits nothing. Arrival wizard's plain-text room-type labels left alone (user chose
  Select Room dialog only).
- **Owner approval:** exists only for `base_rate` (propose→approve); badge color is not
  a rate, so it rides the standard audited, version-checked
  `admin_update_room_type`/`admin_create_room_type` path with required reason. No new
  approval mechanism invented.

## Decisions

- Partial unique index chosen as the concurrency-proof authority for active-uniqueness;
  RPC pre-checks give friendly errors, `unique_violation` catch is the backstop.
- Create-mode pre-check is intentionally stricter than the index (rejects colors held by
  active types even for an inactive new type) so activation can't trap the type later.
- Semantic keys in the DB, not CSS classes or hex — palette curation stays in one lib
  and one CSS block.

## Verification

- `npx tsc --noEmit` clean; `npm run lint` 0 errors (71 pre-existing warnings);
  `npm test` **838/838** (30 new badge tests across `lib/room-type-badge.test.ts`,
  `components/ui/room-type-badge.test.tsx`, extended `lib/room-catalog.test.ts`;
  `lib/room-type-exception.test.ts` assertion updated for the new `room(item, colorKeys)`
  call shape); `npm run build` succeeded.
- Migration pushed with `supabase db push`, then live-verified over DIRECT_URL (node +
  `pg`): column, CHECK, index, all four backfills, new RPC signatures only, grants
  service_role-only.
- Manual visual check pending (needs logged-in staff accounts).

## Affected files

`lib/room-type-badge.ts`, `components/ui/RoomTypeBadge.tsx`,
`supabase/migrations/20260925010000_room_type_badge_colors.sql`,
`lib/admin-route.ts`, `app/api/catalog/room-types/route.ts`,
`app/api/catalog/room-types/[id]/route.ts`, `lib/staff-data.ts`,
`app/api/front-desk/reservations/[id]/eligible-rooms/route.ts`,
`components/manager/manager-dashboard-client.tsx`, `components/ui/FormDialog.tsx`,
`app/manager-dashboard-theme.css`, `components/catalog/room-catalog-panel.tsx`,
tests (`lib/room-type-badge.test.ts`, `components/ui/room-type-badge.test.tsx`,
`lib/room-catalog.test.ts`, `lib/room-type-exception.test.ts`), `SYSTEM.md` (§6
governance, §7.1, data dictionary), `DESIGN.md` §2.

## Next steps

- Manual UI verification: staff dashboard rooms grid + check-in Select Room in both
  themes; catalog swatch picker (taken colors disabled with owner names).
- Commit with the rest of the uncommitted tree.
