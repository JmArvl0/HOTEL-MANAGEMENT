# 2026-09-24 - Room-Type Badge Color Workflow

## Work completed

Badge-color governance for room types — the workflow half of the feature, closing the gaps left
after a parallel session's first cut (see "Coordination" below).

- Migration `20260927010000_badge_color_governance.sql` (pushed + live-verified, all four RPCs
  recreated from live bodies, signatures unchanged so grants survive):
  - **Reservation scope** — a color is held by active types *and* types with a pending rate
    proposal. Rejection frees it automatically (derived scope). All four claim paths
    (`admin_create_room_type`, `admin_update_room_type`, `admin_propose_room_type_rate`,
    approve branch of `admin_review_room_type_rate_proposal`) take
    `pg_advisory_xact_lock(hashtext('rt-badge:' || key))` then an existence check; the
    20260925010000 partial unique index stays as the active-scope backstop.
  - **Approve = activate** — approving a still-inactive type's proposal sets the rate AND
    publishes the type (badge included) in one decision; color revalidated first; rate must be > 0.
  - **Active-type recolors are Owner/Admin-only** — `BADGE_COLOR_CHANGE_APPROVAL_REQUIRED` when a
    Manager changes an active type's color.
- `lib/admin-route.ts` — new error `BADGE_COLOR_CHANGE_APPROVAL_REQUIRED`; `ROOM_TYPE_COLOR_TAKEN`
  reworded for the widened scope.
- `components/catalog/room-catalog-panel.tsx`:
  - Color **required** on create (validation + `*` label; "No color" swatch removed — null is
    legacy fallback only).
  - `colorOwner` widened to the reservation scope (`item.active || pendingOf(item)`).
  - Manager editing an **active** type sees the badge read-only (mirrors the rate field).
  - Review dialog shows the badge color by name + "Approving sets the rate and publishes the room
    type … in one step"; approve toast distinguishes publish vs rate-only.
  - Catalog card heading shows the type's badge (the Owner's review surface).
- `app/api/catalog/rooms/route.ts` + `components/manager/room-roster-panel.tsx` — roster inherits
  the type color (`badge_color_key` in the roomTypes select; `<RoomTypeBadge>` per room, mapped
  name→key). No per-room color control.
- `app/api/catalog/room-types/route.ts` — POST `badgeColorKey` now a required enum (PATCH stays
  nullable — full-state resend).
- `lib/room-catalog.test.ts` — new/updated source-contract tests: required color, reservation
  scope, 4 advisory locks + 4 pending-scope checks in the migration, approve-activates branch,
  manager recolor guard, review copy, roster inheritance.

## Live verification (dev Supabase, inside rolled-back transactions)

- Manager creates pending type on `slate` → inactive + pending proposal. ✓
- Second create claiming `slate` while pending → `ROOM_TYPE_COLOR_TAKEN`. ✓
- Create claiming an active type's `gold` → `ROOM_TYPE_COLOR_TAKEN`. ✓
- Manager recolors active Deluxe King → `BADGE_COLOR_CHANGE_APPROVAL_REQUIRED`. ✓
- Owner approves pending → `base_rate=4500, active=true`, badge kept. ✓
- Post-approve claim of `slate` → `ROOM_TYPE_COLOR_TAKEN`. ✓
- Reject frees: claim while pending blocked; claim after reject allowed. ✓

## Verification

All four gates green after the parallel session's dashboard work landed (2026-09-27):
`npx tsc --noEmit` clean · `npm run test` **868/868** (77 files) · `npm run lint` 0 errors (71
pre-existing warnings tree-wide) · `npm run build` succeeds. Migration live-verified against dev
Supabase (probes above). Manual UI verification pending (needs Manager + Owner logins): create
form (swatches, required, preview), Owner review/publish, roster inheritance.

## Coordination

A parallel session implemented the badge foundation concurrently (`20260925010000` column +
palette + active-unique index + backfill, `lib/room-type-badge.ts`, `RoomTypeBadge`, CSS, swatch
selector, FormDialog/eligible-rooms adoption). This session verified their live RPC bodies matched
the file, then layered governance on top rather than duplicating. Their `20260926010000`
(approval execution fixes) is unrelated. Verify their dashboard work compiles/passes before
committing the shared tree.

## Recommended next action

1. Commit the shared tree (this feature + the parallel session's foundation are both complete
   and all gates are green).
2. Manual UI check: Manager create-with-color → Owner approve → roster badge inheritance.
