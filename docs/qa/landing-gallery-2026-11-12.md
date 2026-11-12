# Inside Haven gallery — 2026-11-12

Implemented the user's pinned editorial gallery reference directly in the
homepage and existing `/gallery` route. The written spec's Exterior-first default
takes precedence over the screenshot's bedroom selection.

- Large central image, previous/next peeks, real category buttons, five-photo
  thumbnail/position windows, navy CTA and actual collection count.
- Warm ivory, muted-gold details/waves and Inter/Playfair follow the supplied
  direction. Manual navigation only; no autoplay.
- Keyboard arrows/Home/End, visible focus, 44px controls, touch swipe, polite
  selection announcements and reduced-motion support.
- The full-screen viewer opens the entire collection from the selected photo,
  contains focus, locks/restores page scrolling, supports arrows/swipe, closes
  with Escape and restores the opener. Full images use `object-fit: contain`.
  Failed images have a recoverable viewer state.
- Optional category/caption fields are editable in existing Owner/Admin Website
  Content and retained by Zod in the existing versioned JSON document. The SQL
  writer already accepts these fields; no migration, DB write or publication.
- Unchanged fictional seed content uses nine concept images (seven newly
  generated local WebPs plus existing room/bathroom samples). Any saved gallery
  edit/removal or client-mode document opts out. Empty categories never substitute
  unrelated images. Alt text, photo disclosure and viewer identify concepts.

Asset paths and the built-in image-generation prompt set are documented in
`public/website-samples/gallery/README.md`. No third-party photos were added.

## Verification

- Typecheck and ESLint on all touched TypeScript files: pass.
- Focused model/content/component/editor tests: 17 pass in four files.
- Full Vitest checkpoint after the final code changes: 2,458 tests / 236 files
  pass. Existing jsdom navigation/canvas notices remain informational.
- Final `npm run build`: pass outside the Windows sandbox. Sandboxed Turbopack
  initially could not create a Sharp junction; sandboxed webpack could not
  create an output directory. These were environment restrictions, not compile
  errors. The required cached Node 22.22.2 runtime also passes the production
  build, typecheck, touched-file lint and all 2,458 tests / 236 files.
- Final production Edge automation at 1440/768/390/320: no horizontal overflow,
  Exterior selected, imagery loaded. All six filters, previous/next, keyboard,
  thumbnails, main-photo/CTA viewer, focus trap/Escape/restoration, native mobile
  touch swipe, reduced motion and `/gallery` pass; no browser page errors.
- Reduced-motion computed values: transition `0s`, animation `none`.
- Screenshots in `.tmp/gallery/`: `gallery-{1440,768,390,320}.png`,
  `lightbox-{1440,390}.png`, `reduced-motion-390.png`, and full-page captures.
  Lightbox captures settle entrance animations; initial partial-opacity captures
  were replaced. The existing page boot overlay was allowed to clear before
  actual touch input; no application boot behavior changed.
- Impeccable detector: `[]`. Taste lint/production inspector also ran; they flag
  the user-requested thin gold rules, outlines, cream, shadows/count formatting
  and neutral photo scrims, plus unrelated existing homepage issues. These checks
  are not reported as zero-failure gates and did not expand this task's scope.

## Visual review

ROUND 2

Seen in one second: Haven's arrival facade, with spaces to explore.

Idea: the fictional hotel's arrival becomes the start of a navigable visual stay.

Live thing: category selection and a manual photo journey with full-screen viewing.

Layout: heading/filter row → dominant photograph with peeks → thumbnail window →
position controls → CTA/count. Mobile uses a taller photograph and scrolling rows.

Scores: design 8 · usability 8.5 · creativity 7 · content 7 → overall 7.9 against
the pinned brief. The skill's default ornamental-style caps conflict with that
brief and are not presented as an independent award-style score.

Top three findings addressed: 44px dot targets; suppressed all scale/hover travel
under reduced motion; image-error/retry state. Browser captures confirm readable
overlay text, balanced framing, visible selection and an uncropped lightbox.

Physical iOS/Android testing and authenticated hosted CMS save/publish QA were not
performed for this change. Local unit tests verify field persistence; existing
publication permissions and uploaded-property-photo requirements remain intact.
No commit, push or deployment was requested or performed.

The skill-directed read-only finish review returned **Ship**, with no material
fixes, after inspecting all seven gallery/lightbox/reduced-motion captures and
the scoped source. Temporary dev/earlier production servers were stopped. The
initial local preview was at `http://localhost:3023/#gallery`.

## Follow-up: fit Gallery navigation to one screen

The user reported that navigating to Gallery hid its lower controls beneath the
viewport. The original stage/spacing grew with screen width; its full header
scroll margin also duplicated the root scroll padding.

The homepage now uses a flex column at `100svh` minus the header reservation.
The main photo takes the remaining space, while the title, filters, thumbnails,
44px position controls, CTA/count and collapsed credit remain in view. The anchor
adds only the remaining 2px to the existing root scroll padding. At phone heights
up to 740px the optional flourish/thumbnails are omitted. Windows under 560px
high retain readable controls in normal page flow; expanded credits also grow
naturally. Main-photo captions/titles show at most two lines; the viewer retains
the full text.

Actual production Gallery nav/drawer clicks passed at 1910×942 (user reference
size), 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768, 768×1024, 700×900,
390×844 and 320×640. Measured section/CTA/credit bottoms stay within the viewport,
the heading clears the nav and no horizontal page overflow occurs. Gallery is
the active nav item. Category switching, arrows, viewer/Escape and expanded
credits also passed. Evidence and viewport captures: `.tmp/gallery-fit/`.
Node22 production build/typecheck pass; the CSS design detector returns `[]`.
Final preview: `http://localhost:3024/#gallery` (Node22).
