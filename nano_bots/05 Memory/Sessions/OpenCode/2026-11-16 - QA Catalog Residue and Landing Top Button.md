# 2026-11-16 — QA catalog residue removal + landing "Top" button transparency

Scope: user asked (1) to remove the "QA Turnover 856c3b5d / Temporary checkout test"
card from the public landing catalog (residue from a 2026-11-14 checkout-flow QA
run; flagged in `docs/qa/mobile-guest-2026-11-14.md`), and (2) to make the landing
page's floating "Top" button transparent. User picked the button via a clarifying
question among four "top" candidates.

## Hosted data cleanup (verified, no code)

- Read-only inspection via `scripts/dbq.mjs`: two QA room types
  (`QA Turnover 856c3b5d` active, `QA Turnover ae17fdb1` already inactive), two
  synthetic physical rooms (`QA-856c3b5d` active, `QA-ae17fdb1` retired), two ₱0
  `checked_out` reservations under "QA Turnover Guest", zero booking holds, zero
  rate plans/proposals/breakfast offers referencing the types.
- Removal executed through governance RPCs so guards + audit rows applied
  (actor: the real owner account, Mark Cruz):
  1. `admin_update_room_metadata` — retired room `RM-2A89F9BE`
     (`administratively_active=false`, reason "QA residue cleanup…").
  2. `admin_update_room_type` — deactivated type `163ff808-…`
     (`active=false`, version 1→2, reason "QA residue cleanup…").
- Nothing deleted (repo policy: booking history stays in terminal state). The
  type was deactivated, not archived (`catalog_archive_room_type` is terminal in
  the schema guard); deactivation is reversible and matches the sibling's state.
- Verified by read-back: type `active=false`, audit_logs rows present for both
  actions. Landing/`FeaturedStays` queries filter `active=true`, so the card is
  gone after the page's 5-minute revalidation. The second type `ae17fdb1` was
  already invisible and was left untouched.

## Landing "Top" button → ghost style (one file)

- `app/(landing-page)/landing.css` lines 33–34: solid navy circle → transparent
  ghost: `color-mix` navy tint 16% + `backdrop-filter: blur(9px)` + 40% navy
  outline, navy text; hover raises tint to 30%/62% (replaces solid ink hover).
  Size, position, radius, motion, reduced-motion rule unchanged.
- Shared `LandingNav` also renders this button on Gallery/Policy/FAQ/booking
  search pages; the style change applies there too (same component). Note: the
  booking search page's `main` lacks `coastal-landing`, so this rule never
  styled its button — pre-existing, untouched.

## Verification (honest)

- `npm run typecheck` passes. Targeted vitest (`fleetops-surfaces`,
  `landing-hero-structure`, `booking-intent`) 21/21.
- Full suite: first run 33 failures/25 files, second run 4 failures/3 files,
  and the three failing files (`haven-data-controls`,
  `guest-requests-panel`, `cash-shifts-workspace`) pass 44/44 in isolation
  three consecutive times with the change applied. Matches [[KI-004]]'s
  documented intermittent-failure shape; not reproduced in isolation.
- No browser QA exists for the ghost button styling (no headless runner); the
  CSS is plain and mirrors existing `color-mix` usage elsewhere. Production
  build not re-run (CSS-only change) while a concurrent session was active.

## Concurrency observation (important)

Mid-session, previously-clean `git status` picked up another session's
unfinished work on branch `codex/preserve-worktree-tests-20261116`:
modified `components/front-desk/fused-room-rack-panel.test.tsx` +
`lib/purchase-orders.test.ts`, untracked
`components/manager/purchase-order-lifecycle.test.tsx`, and its session note
[[2026-11-06 - PO and Room Rack Test Repairs]]. None of it was touched.
Concurrent test runs likely contributed to the first full-suite failure count.
Next session: re-check `git status` before continuing either scope.
