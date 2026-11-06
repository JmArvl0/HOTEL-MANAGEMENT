# Location demo photos and map

November 6, 2026. Isolated landing-page design preview only.

## User request and scope

User requested sample nearby/background photos, distance values, photos on the
“Where are you coming from?” cards and an arbitrary Google Maps example pin
while there is no client hotel. This authorizes clearly labeled demo geography;
it does not turn fictional Haven into a real property. Preserve the two added
sections after reviews and the existing contact/FAQ/footer. No integration or
database-backed admin completion is claimed.

## Changes

- Generated six consistent, photorealistic tropical/wood/stone concept photos
  using the built-in ImageGen tool: café, shopping courtyard, garden, transit,
  airport and city arrival. All six were displayed and inspected. No reference
  hotel's assets were copied. Generic images are not presented as photos of
  NAIA, Manila City Hall, Rizal Park or actual nearby businesses.
- Nearby rows have images and sample manual distances (400 m / 1.2 km / 800 m /
  600 m). Featured garden has an 800 m sample distance. Airport/city cards have
  origin photos and 11.5 km / 1.2 km **sample / manual** values. No travel times.
- Temporary public landmark: Rizal Park, Ermita, Manila; verified Google Maps
  coordinates 14.5826446, 120.9786887. Google Share/Embed iframe was rendered
  locally. Inline preview uses a full uncropped capture, preserving attribution,
  with native links to the live map. Third-party iframes are restricted in the
  conversation preview. No API key, paid API, account save or business edit.
- Each route has its own origin and the same named Rizal Park destination.
  A coordinate-only URL reverse-resolved a nearby business label during QA;
  switched to the verified landmark name and confirmed Google resolves the
  correct park. Live route UI confirmed Terminal 3 → Rizal Park and Manila
  City Hall → Rizal Park. Google's live distances/times are not copied into the
  maintained sample claims.
- Generic nearby concepts open relevant Google category searches around the
  demo location. They do not claim directions to fictional POIs.
- Empty/loading/error states remove the demo map and hotel navigation action;
  retry restores the sample. Search, filters, per-origin selection, comparison,
  phone controls and previous proposal are retained. Improved view is default.

## Artifacts and reproducibility

Task-owned directory:
`C:/Users/Mark Rowell/.codex/visualizations/2026/11/06/01a1b07c-1438-7941-9419-251014228944/`.

- `haven-location-demo.html` (884,119 bytes): inline review.
- `haven-demo-template.html`, `assemble-demo.cjs`, `check-demo.cjs`:
  editable source, deterministic assembly and preview behavior checks.
- `demo-photos/manifest.json`: exact six final prompts, built-in tool mode,
  original/optimized image paths, byte sizes, dimensions and concept-only use.
  `prepare-demo-assets.cjs` copies original PNGs and encodes smaller WebP assets
  with existing Sharp. No dependencies added; generated originals preserved.
- `demo-map-metadata.json`: map source, coordinates and official embed URL.
  `demo-map.png`: full 720×480 capture with Google attribution.
- `demo.html` / `demo-icons.js` / `map-capture.html`: local inspection helpers.
- Screenshots: `demo-tablet.png` (final 768-width composition),
  `demo-compare-768.png`, `demo-compare-tablet.png`, `demo-mobile.png`
  (390-width Dining filter), `demo-mobile-320.png` (all four places).
- Earlier proposal SHA-256 remains
  `83cb7596a8c688651c56417f8a3fad30df94b86c8563a6e45dd29154a727c21f`;
  previous premium remains
  `bf3adb3a8d27ee6321e398b1e6d094f93def8f4f662224a4ceee8bf768ff1785`.

## Verification and limits

- 74 JSDOM assertions passed on the assembled fragment: source identity,
  concept image/alt labels, sample distance formatting, all ten canonical
  HTTPS Google URLs, safe external link attributes, distinct route origins,
  common destination, nearby search intent, filters/search/no-match/clear,
  selected origin, all states/retry, comparison/device controls and assets.
- Both inline scripts pass repository ESLint: 0 errors / 0 warnings.
- Real in-app browser inspected 1440-width initial photo composition, final
  768/tablet composition/comparison, 390-width Dining and 320-width all places.
  At 320: clientWidth/scrollWidth305, no overflowing refined elements; both
  section headings have two lines. At 390: scrollWidth375, all visible images
  loaded. At 768: scrollWidth753 before scrollbar changes, no overflow.
- Actual empty/no-pin selection removed all map links and hid hotel directions.
  Named Google route endpoints were verified live. No directions were sent,
  trip started, account accessed, location permission granted or survey accepted.
- Browser viewport override reset. Owned local read-only server stopped after
  QA. No application server, feature runtime, backend CRUD, SQL migration,
  storage upload, RBAC or production release was changed/tested. Full app tests,
  typecheck/build were not rerun for unintegrated design artifacts.

Plan/handoff updated selectively. Other dirty application/Fleet work preserved.
Next: review user design feedback; implement the accepted configurable sections
and authorized admin management against the existing audit/plan.

## Follow-up: interactive map and gesture-first default

User requested a real interactive map matching the supplied Google embed
reference, then asked to remove the expanded up/down/left/right buttons seen
during testing. New self-contained `haven-interactive-map.html` replaces the
static map image with the previously verified official Google iframe. Native
directional controls are collapsed in the delivered default view; zero “Move
up” buttons were present in the frame after reset. Google's own small camera
control launcher remains available. No custom directional control UI was added,
and cross-origin Google controls were not altered or claimed permanently hidden.

`assemble-interactive.cjs` validates the exact HTTPS Google embed host/path,
adds an accessible title, lazy loading, fullscreen permission, responsive
400/340 px iframe heights, and an Open in Google Maps fallback. All other public
content and prior previews are preserved. `check-interactive.cjs` reuses the
existing preview checks with live-iframe expectations: 74 assertions, script
ESLint 0 errors / 0 warnings. Real browser loaded the native map, verified zoom
(16z → 17z) and changed map center with pan controls; desktop and 320 px layout
checked. At 320: page width305/scrollWidth305, iframe width213. Native drag
automation reported a fractional-coordinate limitation; no physical-phone
pinch testing is claimed. Final screenshot: `interactive-map-clean.png`.

Local preview left running for the user at
`http://127.0.0.1:8769/haven-interactive-map.html#nr-arrival`, bound to loopback
only. Browser tab marked as deliverable; viewport override reset. Server:
`serve-interactive.cjs`, exec session60503. No application integration, paid API,
API key, database migration or publication. Full app checks were not rerun for
this isolated map-preview update.
