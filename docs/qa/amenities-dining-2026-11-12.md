# Amenities and dining reference — 2026-11-12

The user requested implementation on the website using the supplied dynamic
UI specification and image as references, and explicitly removed amenity-card
arrows. Existing working-tree changes were preserved.

## Result

The homepage uses centered Playfair/Inter copy, an ivory canvas, botanical/gold
linework, a two-column amenities grid and forest-green photo dining card. The
dining card aligns to the top and grows only for its own content. Tablet layouts
place it below the facilities; phones use single-column cards. Descriptions grow
naturally so availability, supervision and fee information is not truncated.

The first eight enabled facilities appear in saved order. A native details/
summary disclosure exposes the remainder through the existing32-item limit.
Cards have no arrows, links or fabricated click affordances. The dining action
is a real internal link, defaulting to booking search.

Owner/Admin Website Content retains private draft/review/publish behavior and
adds optional facility icon, ordering, breakfast schedule, price caption and
action text/path controls. Optional fields are backward compatible; external,
protocol-relative and backslash action paths are rejected. The first Dining
gallery photo supplies client imagery. Only the unchanged fictional gallery
seed uses the disclosed generated breakfast image. No migrations or DB writes.

Generated assets and prompts are documented in
`public/website-samples/dining/README.md` and `public/decor/README.md`. The images
were created with the built-in image tool; they are not client photography.

## Verification

- Node22.22.2 production build, standalone typecheck and touched-file ESLint pass.
- Focused four-file checkpoint:16 tests pass. Full final suite:2486 tests across
  239 files pass using two workers. The first highly parallel run timed out in
  registration; the lower-concurrency full rerun passes without test changes.
- Actual production Edge page:1672,1440,1200,1100,900,768,680,390,320px. No
  horizontal overflow; all enabled content and fonts load; cards have no arrows.
- Component-rendered fixtures using production CSS:0,8,10,32 facilities,
  including longer descriptions and CTA. Keyboard Enter expands/collapses;
  all32 remain reachable; expanding the list leaves the dining height unchanged.
- Booking CTA navigation, focus outline and reduced-motion behavior pass.
- No browser page errors. Evidence: `.tmp/amenities/browser-results.json` and
  `.tmp/amenities/amenities-*.png` / `scenario-*.png`.
- Impeccable mechanical detector returns an empty findings list. The broader
  taste inspector ran on the full existing homepage. It flags the reference's
  requested card shadows, borders, divider and cream palette, plus unrelated
  existing homepage treatments. These are not reported as a clean taste gate;
  the explicit user reference and scoped behavior/layout checks take priority.

Local preview: `http://127.0.0.1:3078/#amenities`. No commit or hosted deployment.

## Visual critique

ROUND 1
Seen in one second: hotel facilities beside a breakfast feature.
Idea (one sentence): Haven's dining card anchors a flexible service list.
Live thing: native facilities disclosure and real booking action.
Layout words by section: amenities=two-column list / dining=photo feature.
Scores: design6.5 · usability8 · creativity6 · content8 → overall6.5.
Caps applied: the supplied reference intentionally uses resting shadows and
decorative rules; no gallery-wide redesign was requested.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. First desktop capture had too much header space; reduced top/header spacing.
2. Dining card was taller than necessary; tightened its internal spacing.
3. The reused botanical silhouette was flat; replaced it with generated cutout art.

ROUND 2
Seen in one second: the requested arrow-free amenities/dining composition.
Idea (one sentence): a readable dynamic list retains its dining anchor.
Live thing: all configured facilities remain reachable without stretching dining.
Layout words by section: desktop=split / tablet=stacked / phone=single-column.
Scores: design6.5 · usability8.5 · creativity6 · content8 → overall6.5.
Caps applied: intentional reference styling as above.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Narrowest breakfast time split AM from its time; kept each time value together.
2. Intro copy crossed a lighter food-photo area on phones; strengthened the scrim.
3. Long facility copy increases section height; retained readable natural growth,
   as required, instead of hiding operational information.
