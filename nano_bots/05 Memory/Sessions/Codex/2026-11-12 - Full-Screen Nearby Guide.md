# Full-screen Nearby Guide — 2026-11-12

Implemented the approved desktop and phone mockup through the homepage's
Explore Nearby Places button. The native full-screen dialog shows the published
area map next to the results on desktop. Phones open on the results and use
View map / View list to switch panes. The guide restores focus and page position
on Close or Escape, including when the search box has focus.

Results use the same highlight order as the homepage, followed by the remaining
published records. Search, category filters, directions, photo credits, client
arrival routes and reviewed distances use the existing location data. The Google
embed provides the area overview and its own pins. Place links open their
individual destinations in Google Maps. The dialog retains filters between opens.

Production build, typecheck, touched ESLint, 31 focused tests and all 2,467
regression tests in 237 files passed on Node 22.22.2. The isolated production
Edge check used 1440×900, 1024×768,
768×1024, 390×844, 320×640 and 844×390. It covered the real homepage entry point,
search and category combinations, empty results recovery, Google link wiring,
phone map/list switching, Escape, Close, focus and scroll restoration, and
horizontal fit. Evidence lives under `.tmp/nearby-guide/`. Preview runs at
`http://127.0.0.1:3048/#nearby`. Physical-device testing was not performed.

## Place-to-map follow-up

Selecting a place card centers the embedded map and highlights the card. The
map pins reviewed coordinates or searches the published demo destination.
Generic demo categories show search results. On phones selection opens the map
and focuses View list. Reset map restores the area overview. Directions and
photo credits remain independent controls.

Node 22 production build, typecheck, touched ESLint and 33 focused tests passed.
Edge verified the museum pin, a red pin at explicit coordinates, the map reset,
keyboard selection, phone touch and return to list. Updated preview runs at
`http://127.0.0.1:3050/#nearby`. Screenshots are in `.tmp/nearby-guide-pin/`.
