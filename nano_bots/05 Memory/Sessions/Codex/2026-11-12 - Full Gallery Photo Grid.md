# Full gallery photo grid — 2026-11-12

User requested a complete image collection when clicking See full gallery,
rather than a one-photo slideshow. The homepage CTA now links to `/gallery`.
That route renders all published photos in order in a responsive3/2-column grid,
initially All Photos, with category filters and photo/source disclosures.
Selecting a tile opens the existing uncropped viewer; Close/Escape restores its
focus. A return link leads to the homepage gallery. CMS data and homepage
carousel/screen-fit behavior remain connected; no new assets/schema/data changes.

Changed `hotel-gallery.tsx`, its CSS/tests and `/gallery/page.tsx`; refreshed
DESIGN/SYSTEM. First browser look caught duplicated header spacing, fixed before
the final build. First three grid images load eagerly; others stay lazy.

Node22 production build, standalone typecheck and touched ESLint pass. Focused
gallery15/2 and full2467/237 pass. Final production Edge1440/1024/768/390/320
passes real CTA navigation, all tiles, image/heading/column/overflow bounds,
filters, selected viewer/wrapping/focus, credits and return link. Native phone
grid scrolling/category swipe pass; no page errors. All final captures inspected.
Source detector `[]`; browser inspector's four false-positive/request-conflicting
failure rules were assessed and allowed individually, with raw reports retained.
See `docs/qa/full-gallery-grid-2026-11-12.md` for evidence and limits.

Production preview3046/gallery, Node22 session66949. Dev3047 and prior3046 stopped;
own generated type references removed without replacing concurrent changes.
No physical-device/hosted CMS publication QA, commit, push, release or DB write.
