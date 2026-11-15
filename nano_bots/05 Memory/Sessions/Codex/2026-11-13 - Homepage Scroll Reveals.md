# Homepage Scroll Reveals

2026-11-13, Codex.

User asked to bring back the earlier appearance-on-scroll animation. The old
homepage imported `LandingMotion` for GSAP section entrances. The current Home
omits it, and its old hero transforms/section selectors belong to the earlier
layout. Gallery already has its own entrance.

## Implemented

- Added `components/landing/hotel-scroll-reveal.tsx` and composed the server
  homepage children through it. It renders the existing main element/classes.
- Headings, room cards, amenities, reviews when present, location, FAQ and
  closing content enter once with the shared 360ms duration, 12px travel and
  premium easing. The browser IntersectionObserver schedules native animations.
- Visible content at hydration skips the entrance. Styles remain visible until
  an animation actually plays. Reduced motion skips entrances and preference
  changes cancel active animations. Focusing inside an entrance cancels it.
- A scoped MutationObserver includes Location if it streams in later. Observed
  and completed elements are tracked separately for React effect replay.
- Existing Gallery motion remains independently owned. SYSTEM and DESIGN
  document the active homepage behavior.

## Verified

- `npm run typecheck` and touched-file ESLint passed, including the final run.
- Focused landing/motion Vitest passed 74 tests in 12 files.
- Full `npm test` passed 2,533 tests in 243 files.
- `npm run build -- --webpack` passed on Node24.21.0. Windows denied output
  directory creation inside the sandbox. The permitted elevated retry passed.
- Production Edge at 1440, 768, 390 and 320px recorded 15 one-time entrances per
  visit. Repeated scrolling added zero entrances. Section navigation, keyboard
  focus and room destinations passed. There was no document horizontal overflow
  or pageerror in those runs. Reduced-motion mode recorded zero new entrances.
- Reviewed the inspector's desktop/tablet/mobile screenshot sheets and the
  production Rooms/Amenities/Location/FAQ screenshots at1440 and390px.
- Impeccable detector returned an empty findings array. The broader taste scan
  reports 10 failures/13 warnings in incumbent typography, decoration, spacing
  and existing layouts. This scoped motion change adds no visual styles.
- With JavaScript disabled, Next's hidden streamed boundary prevents full-page
  display. The older `.next/server/app/index.html` also has the Rooms heading
  within hidden `S:0`. The new animation does not apply hiding styles to static
  markup. Full-page no-JS visibility remains an existing limitation.

Evidence and the temporary browser script are under ignored
`.tmp/haven-scroll-reveal/`. Production server uses its isolated build at
`http://127.0.0.1:3097/`. The task's dev server was stopped and its generated
tsconfig include entries removed, preserving prior configuration edits.

## Smoother follow-up

User requested smoother motion. Increased the entrance to the existing 900ms
cinematic duration and reduced travel to the existing 6px micro distance, with
the shared premium easing. The observer now starts 4% before the viewport edge,
preventing visible content from resetting to transparent after entering. Content
already within the viewport at hydration skips the entrance.

Typecheck, touched ESLint, focused74/12, detector and the webpack production build
passed. Final Edge1440/390 runs recorded 15 one-time 900ms entrances, working
anchors/keyboard, no pageerrors/document overflow and zero entrances in reduced
motion. Earlier full2533/243 and four-width checks remain the prior checkpoint.
No-JS streaming limitation remains as documented above. The same preview3097
now runs `.tmp/haven-scroll-reveal/smooth-build`. Browser control in this chat
could not bind the user's open preview, so the user needs to refresh that tab.
Evidence is `.tmp/haven-scroll-reveal/smooth-browser-results.json`.
