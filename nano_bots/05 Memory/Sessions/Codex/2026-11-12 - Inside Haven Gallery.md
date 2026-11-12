# Inside Haven gallery — 2026-11-12

Implemented the user's supplied editorial carousel/gallery reference in the
actual homepage and shared `/gallery` route. Written Exterior-first behavior
overrides the reference image's selected bedroom.

- Ivory/navy/gold, centered featured image, side peeks, category pills,
  five-photo thumbnail/position windows, CTA/count and subtle wave decoration.
- Manual arrows, keyboard/Home/End, touch swipe, 44px targets, reduced motion,
  truthful empty/error states and full-screen viewing with focus/scroll recovery.
- Existing Owner/Admin Website Content now edits optional category/caption
  fields in its existing JSON document. No migration or DB publication.
- Nine-photo untouched fictional demo: seven new locally generated WebP
  concepts plus existing room/bathroom concepts. Any gallery edit/removal or
  client publication opts out; actual uploaded content remains authoritative.
  Asset provenance/prompts: `public/website-samples/gallery/README.md`.

Verified final code with Node 22.22.2: production build, typecheck, touched-file
ESLint and all 2,458 tests / 236 files pass. Focused tests: 17 in four files.
Final production Edge at 1440/768/390/320 passes image/overflow/filter/navigation,
thumbnail selection, focus trap/Escape/restoration, gallery/viewer touch swipe,
reduced motion and `/gallery`, with no page errors. Impeccable detector `[]`;
skill-directed read-only finish review: Ship, no material fixes.

Sandbox output/junction and browser-launch restrictions were resolved by running
local build/browser verification outside the sandbox. Taste inspector/lint also
ran, with user-pinned ornamental-style conflicts and pre-existing page findings
documented rather than misreported as clean. No unrelated UI was redesigned.

Details/evidence/limits: `docs/qa/landing-gallery-2026-11-12.md` and ignored
`.tmp/gallery/`. Physical-device and authenticated hosted CMS publish QA remain
unperformed. Existing unrelated working edits preserved; gallery-only automatic
type includes removed, prior audit type references retained. Earlier temporary
servers stopped; final local production preview: `http://localhost:3023/#gallery`
(session 88004). No commit, push, deployment or database write.

## Follow-up — one-screen gallery

User requested that clicking Gallery fit the complete section beneath the nav.
Changed only gallery CSS: viewport-height flex composition, flexible image area,
smaller height-based spacing, corrected double anchor offset and a compact short-
phone layout. Full credits expand naturally; short landscape windows preserve
readability through normal page flow. Main overlay text caps at two lines while
the viewer retains full text.

Node22 build/typecheck and CSS detector pass. Actual production nav/drawer clicks
at1910×942,1920×1080,1440×900,1366×768,1280×720,1024×768,768×1024,700×900,
390×844 and320×640 verify the complete section and CTA/credit fit, clear nav and
no horizontal overflow. Category/arrows/viewer/Escape/expanded credits also pass.
Evidence: `.tmp/gallery-fit/`; current Node22 preview3024/#gallery (session61177).
