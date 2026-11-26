# Front Desk QA fixes — 2026-11-16

## Scope

Owner requested fixes for KI-033, KI-034, and KI-035 after the read-only
cross-module QA. The earlier QA report and other unfinished work were preserved.

## Verified changes

- KI-033: `getDashboard` now uses `roomRackStays` for Front Desk readiness,
  matching the room board. A future assigned booking regression test passes.
- KI-035: Bookings and Transactions compare a payment to existing receipts and
  route an existing one to Financial Documents. `getStaffReservation` now
  selects document `payment_id`. Focused UI and projection tests pass.
- KI-034: The owner confirmed orphaned `RSV-1046` is a demo booking and chose
  archive plus credit reversal. The local demo seed row was removed. An initial
  guarded deletion migration rolled back on the live database when it found an
  immutable +174 loyalty entry. No partial write occurred. The revised guarded
  migration passed a disposable PostgreSQL replay of all 151 migrations from
  compatible `origin/main`, including altered/linked state rejection and
  idempotence. Only `20261116020000` appeared in the linked dry run; it was
  applied through the isolated compatible worktree.
- Linked readback: reservation is `cancelled` with a retirement reason and
  `checked_out_at=null`; guest points and lifetime spend are 0; ledger retains
  the original +174 and adds -174; one retirement audit entry exists. Gold tier
  was retained because tier downgrades are disallowed and the tier's origin was
  not established.
- Signed-in local browser retest showed Dashboard, Room Management and Bookings
  all at 8 ready rooms. The sample paid booking and its transaction both routed
  to the existing `RCP-261115-020E85` receipt and ₱8,960 preview. The retired
  booking appeared cancelled with its closure note. Its detail still derived a
  ₱17,400 balance from the booking total despite having no invoice; a new
  regression test exposed that fallback. The UI now says “No folio recorded for
  this booking” and withholds folio adjustment, verified after browser refresh.
- Final post-display verification passed: TypeScript, scoped lint, focused
  tests, full Vitest (236 files / 2,458 tests), isolated production build, and
  `git diff --check`.

## Follow-up

Historical duplicate documents are still KI-013; drawer-less demo cash is
still KI-032. The original QA did not exercise live write flows. See
`docs/qa/front-desk-cross-module-qa-2026-11-16.md`.
