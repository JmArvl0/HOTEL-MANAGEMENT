# Location screen fit — 2026-11-12

User requested the same one-screen nav behavior for Location as Rooms/Gallery.
The homepage overview now reserves the fixed header once, shares remaining
height between its photo/map and nearby highlights, and keeps Directions and
Explore Nearby Places visible. Phone photo/map stack; tablet/phone highlights
use native horizontal snap scrolling. Guide/photo notes expand into normal
flow; very short windows also use normal flow. Existing data, map controls,
disclosures, client contact and full searchable guide remain connected.

Scoped changes: `location-showcase.css`, two layout classes in
`location-sections.tsx`, focusable nearby group in `location-showcase.tsx`.
Updated DESIGN/SYSTEM descriptions; concurrent Location reference work and all
unrelated dirty files preserved.

Node22 production build, standalone typecheck, touched ESLint and focused14/3
pass; final full regression2463/237 passes. Production Edge actual nav/drawer
clicks at ten sizes (320×640 through
1920×1080) pass section/header bounds, all card copy, map and44px Directions.
Native touch/keyboard, final-card access, stable photo focus, full-guide search
and photo-note expansion pass; no page errors. All ten final captures inspected.
The first compact-phone check caught clipped summary copy; resolved before the
final build. CSS detector `[]`.

Evidence: `docs/qa/location-screen-fit-2026-11-12.md` and `.tmp/location-fit/`.
Preview3046/#how-to-go, Node22 session36833. Dev3045 stopped; own generated type
includes removed selectively. No physical-device/hosted CMS publication QA,
commit, push, deployment, migration or database write.
