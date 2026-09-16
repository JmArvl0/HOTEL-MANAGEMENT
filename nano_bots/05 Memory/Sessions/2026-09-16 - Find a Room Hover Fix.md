# 2026-09-16 - Find a Room Hover Overlay Fix

Follow-up to [[2026-09-16 - Room Photo Lightbox]]: hovering a room card photo showed a
large white/cream block instead of the photo.

## Root cause

`app/guest-booking.css` had a generic element selector written for the availability
chip — `.available-room-image span{…background:#fff…left:18px;top:18px…}`. It also
matched the lightbox trigger's `.room-photo-open-hint` span and beat it on specificity
(0,1,1 vs 0,1,0). Combined with the hint's own `right/bottom` offsets the pill
stretched across nearly the whole photo; hover faded it to opaque white. Portal-only
(public search scopes its chip selectors explicitly, so it never had the bug).

## Fix (presentation-only, 3 files)

- `app/guest-booking.css`: re-scoped to `.available-room-image .room-availability-chip`
  (chip look unchanged; also stops leaking padding/background onto the Next/Image
  wrapper span).
- `components/booking/room-details.css`: trigger keeps transparent `inset:0` coverage +
  `cursor:zoom-in`; hover/focus-within adds `rgba(0,0,0,0.14)` tint, hint pill fades in
  with `translateY(3px)→0`, photo scales 1.02 inside new `overflow:clip` cell;
  reduced-motion kills all of it. Search page keeps its own stronger zoom (higher
  specificity, untouched). Availability badge stays under the tint per user call —
  readable, whole photo clickable, no dead corner.
- `room-photo-lightbox.test.tsx`: +5 hover-regression tests (no generic white-span
  rule, transparent trigger + dark tint, cue styling, 1.02 scale + reduced-motion,
  full-photo click still opens viewer).

## Verification

- Targeted 29/29. Full 1215/1215 (109 files). Lint 0 errors (71 pre-existing warnings;
  touched files clean). Build 64/64. Detector clean.
- `npm run typecheck` FAILS on 3 pre-existing errors in
  `components/catalog/request-types-panel.tsx` — a parallel session's in-flight,
  uncommitted work (`emptyDraft`/`inventoryName`); untouched by this fix. Re-run gates
  after that session lands.
- Note: parallel session committed `04b56ae` mid-work (lightbox + Tab trap now on HEAD);
  this fix sits uncommitted on top.
- Manual browser hover check still pending (no browser runner here).
