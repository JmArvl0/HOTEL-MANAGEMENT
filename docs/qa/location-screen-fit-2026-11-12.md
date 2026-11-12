# Location screen fit — 2026-11-12

The user requested the same single-screen homepage navigation behavior for
Location as Rooms and Gallery. Clicking Location now positions the complete
overview beneath the fixed header: heading, photo/directions, live map, nearby
highlights, photo-note disclosure and Explore Nearby Places action.

The homepage-only flex layout shares `100svh` minus the header between these
blocks. The existing photo/map composition stays side by side above680px and
stacks on phones. Below1100px, all three highlights remain reachable through a
native horizontal snap track with touch, keyboard and ordinary link focus.
Compact screens omit optional chips/intro copy; the smallest phone descriptions
use one line, with complete information available in the full guide.

Opening the full guide or photo notes grows the section naturally. Very short
windows (≤560px high) use normal page flow for readability. These are intentional
exceptions to the default one-screen overview. Published property/map/place
data, native Google controls, demo disclosures, existing photo focus stability,
full search/filters/routes and following client contact content are preserved.

Verified against the final Node22 production build on local port3046:

- Actual Location nav/drawer clicks at1910×942,1920×1080,1440×900,1366×768,
  1280×720,1024×768,768×1024,700×900,390×844 and320×640. Complete section clears
  the header and stays within the viewport, without horizontal page overflow.
- View Directions remains at least44px high inside its photo. Live map/iframe
  bounds stay inside the card (≥130px high even at320×640). Nearby copy fits
  within every card, including cards outside the visible horizontal track.
- Native phone touch input and keyboard ArrowRight scroll the nearby track;
  link focus reaches its last card. Focusing Directions does not scroll the
  decorative photo. Active Location nav state remains correct.
- Explore/Hide Nearby Places, full-guide expansion, museum search and expanded
  photo/sample notes pass. No page errors. Google map tiles and native controls
  were visible in the captured production page.
- All ten final viewport screenshots were opened for visual inspection. The
  first development check caught a clipped description at320×640; compact card
  height/spacing and a one-line summary resolved it before the final build.
- Focused Vitest:14 tests /3 files pass. Touched TypeScript ESLint, standalone
  TypeScript and Node22 production build pass. CSS detector returned `[]`.
- Final full regression suite:2,463 tests /237 files pass (Node22, four workers,
  15s test/hook ceilings, outside the Windows sandbox).

Evidence: `.tmp/location-fit/results.json`, production screenshots and check
logs. Browser checks used local headless Edge with screenshot inspection;
physical-device testing and authenticated hosted content publication were not
performed. The temporary development server3045 was stopped. Own generated
type references were removed while preserving other sessions' changes.
No commit, push, deployment, migration or database write.
