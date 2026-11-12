# Rooms and Gallery screen fit — 2026-11-12

User requested one-screen sections after clicking Gallery and then Rooms in the
homepage nav. Gallery fit was completed first. Rooms now fits all four catalog
types in the desktop 2×2 comparison; tablet/phone uses a horizontal snap track
with full cards and native touch/keyboard access. Responsive spacing, optional
chips/thumbnails, readable title/description blocks and the price/action row
share the height remaining below the header. Short landscape/zoomed windows use
normal flow; extra desktop types stay reachable inside the region.

Changed `hotel-rooms.css`, its homepage import and the Featured Stays region's
focusability. Gallery sizing stays in `hotel-gallery.css`. Existing catalog,
photos, room selection and retained booking intent remain authoritative.

Final Node22 build, typecheck, touched lint, focused15/3 and full2463/237 pass.
Production Edge Rooms9 sizes and Gallery10 sizes pass actual nav/drawer clicks,
section/CTA/text bounds and no horizontal page overflow. Actual phone swipe,
native keyboard browsing, last-type access and the room-photo viewer pass.
The second look repaired clipped room headings before the final build. CSS
detector returned `[]`; all final viewport captures inspected. Earlier sandbox
Gallery test worker/reminder timeouts passed isolated and outside-sandbox reruns.

Evidence/limits: `docs/qa/landing-screen-fit-2026-11-12.md`, `.tmp/rooms-fit/` and
`.tmp/gallery-fit/`. Preview3042/#stay or/#gallery, Node22 session33030. Temporary
dev3041 stopped. Own generated type includes removed; concurrent location/type
changes preserved. No commit/push/deployment, migration or DB write.
