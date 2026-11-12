# Amenities screen fit — 2026-11-12

User requested that clicking Amenities show a single-screen section. Added a
homepage-only viewport frame below the existing fixed header, responsive compact
spacing and accessible native overflow areas. Default six facilities/dining fit
together at checked laptop/desktop sizes. Tablet/phone scrolls the combined
content within the frame, preserving all configured text. Editor stays natural-
height; no business/CMS/DB rule changes.

Desktop/drawer Amenities clicks reset the scroll areas. A regression found at
compact heights was fixed: the nested dining card no longer steals the Amenities
underline unless explicitly navigated to. Existing Dining/booking links work.

Node22 production build, standalone typecheck, touched ESLint and mechanical
detector pass. Full2487/239 checkpoint passes; final focused22 pass after the
underline fix. Production Edge11 viewport sizes, native touch, keyboard, smooth/
reduced-motion nav and8/10/32 component fixtures pass without page errors or
horizontal overflow. See `docs/qa/amenities-screen-fit-2026-11-12.md`.

Updated the existing local preview at `http://127.0.0.1:3078/#amenities`.
No database write, commit or hosted deployment; prior working-tree changes
preserved. Temporary generated-type includes removed from tsconfig.
