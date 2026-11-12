# Scroll-aware public navigation — 2026-11-12

Request: move the navigation indicator with page scrolling, update the nav,
and provide a quick return to the top.

Implemented in the existing shared LandingNav and public styles:

- Section geometry drives current location instead of hashchange alone.
  Passive scroll events are coalesced with requestAnimationFrame. Resize
  observation handles header/content reflow; cleanup removes listeners.
- A single gold underline moves between actual link positions and resizes
  with the layout. Desktop includes FAQ. The drawer shares aria-current;
  published visibility and secondary-page active links remain supported.
  The demo omits Contact because that anchor duplicates Location.
- A floating 56px Top button appears beyond 60% of the viewport (at least
  320px). It hides during the drawer, clears only the fragment, preserves
  query/history state and returns keyboard focus to the brand. Reduced
  motion uses instant scrolling and removes decorative travel.
- Browser QA found an extra 100px anchor margin on Booking, Amenities,
  Dining and FAQ in addition to root header padding. These targets and
  Contact now use the same 2px remaining margin as Rooms/Gallery/Location.
  At 390px, FAQ lands at 74px and correctly marks FAQ current.

Verification:

- Final Node 22.22.2 production build, standalone typecheck and touched
  TypeScript ESLint passed. Isolated build artifacts are in .tmp/nav-scroll.
  Sandbox junction creation failed first; the permitted local build passed.
  Removed QA-only generated TypeScript paths after building.
- Full-suite checkpoint: 238 files / 2,480 tests passed. Final focused
  navigation/hero/FAQ/gallery/location run: 5 files / 32 tests passed.
  Geometry is supplied only for jsdom layout; real components/events run.
- Production CUA browser inspection at 1440x960, 768x1024, 390x844 and
  320x740 found no horizontal document overflow. An additional 1081px
  check verified header controls fit before the drawer breakpoint.
  Checked active line alignment, drawer state/scroll locking, FAQ landing,
  visible Top control and focus/query/fragment handling. Physical devices,
  iOS Safari and browser OS reduced-motion settings were not tested.

Design verification used the supported browser surface instead of the
skill's separate browser driver. Impeccable's detector returned no findings.
Taste source lint reported 42 FAIL / 22 WARN across the existing shared
styles (eyebrows, outlines, shadows, glass, etc.); this is not a clean style
gate. Existing branding/chrome and the requested gold indication were kept
within scope; no full-page restyle or direction draw was appropriate.

Scoped screenshot critique: existing Haven identity preserved; one clear
current-location underline and a readable Top action. Subjective design 8,
usability 8.5, creativity 7, content 9 (overall 8.1). The mobile drawer shows
current location when opened; desktop links remain in the established
header and mobile retains its compact header.

Evidence: .tmp/nav-scroll/final-{1440,768,390,320}.png,
build-final.log, focused-final.log and full-tests.log. SYSTEM.md and
DESIGN.md describe the behavior. No database writes, commit or deployment.
