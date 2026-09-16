# 2026-09-16 - Choose Dates Availability Guidance

Find-a-Room (and public search) browse cards: "Choose dates" now guides to Check Availability
with a smooth scroll, one gentle teal pulse, a helper line, and smart focus — no navigation,
no booking-logic change.

## What changed

- New `components/booking/availability-guide.tsx` (owns scroll+glow+helper+focus via a
  `haven:choose-dates` window event; 1.8s auto-clear, re-triggerable, reduced-motion static
  fallback through `usePrefersReducedMotion`) and `choose-dates-button.tsx` (same look as the
  anchor it replaces; no-JS still jumps to `#book-form`; `preventDefault` + event with JS).
- `room-results.tsx` browse CTA uses the shared button; "Select room" branch untouched.
- Both pages wrap their `#book-form` container in `AvailabilityGuide` (find-room page,
  public `booking/search` page — shared component, consistent UX).
- `guest-booking.css`: `#book-form` scroll-margin-top 96px, single-pulse keyframes
  (border + sea-glass shadow only, no transform), `.availability-hint` + customer-shell mirror.
- Tests: `availability-guide.test.tsx` (12: idle silence, scroll/glow/helper/focus order,
  auto-clear, re-trigger, reduced motion, shared handler, no-op on normal edits, source
  contracts for details/photo/logic/CSS pins).
- No edits to `lib/booking.ts`, pricing, reservation creation, auth, form validation,
  View Details, or photo viewer. "Choose dates" vs "Select room" distinction already existed.

## Verification

typecheck clean · lint 0 errors (71 pre-existing warnings) · **1173/1173 tests (105 files)** ·
build clean (both `/account/find-room` and `/booking/search` routes present).

## Pending

Manual browser QA A–E (no dates / partial / complete-unchecked / repeat / details+photo
no-glow) on desktop, tablet, mobile + reduced-motion. The photo lightbox
([[2026-09-16 - Room Photo Lightbox]]) owns photo clicks; this work leaves it untouched.
Working tree uncommitted — coordinate with parallel sessions before committing.

## Related

`SYSTEM.md` §7.2 (intent-aware room discovery) · `docs/ui-motion-guidelines.md` §3–4, §6
