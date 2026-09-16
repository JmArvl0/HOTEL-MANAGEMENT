# 2026-09-16 - Room Photo Lightbox

Find a Room (and public `/booking/search`) room photos now open a shared full-screen
viewer instead of only the small card/gallery images.

## What

- New `components/booking/room-photo-lightbox.tsx`: `RoomPhotoLightbox` (controlled
  `index`, looping nav, arrows/Escape in capture phase so the details modal underneath
  never double-reacts, Tab trap, opener focus capture + return, body scroll lock that
  restores the prior value, 100–200% zoom with clamped drag-pan, double-click toggle,
  broken-image fallback) + `RoomPhotoTrigger` (card overlay, server-component safe) +
  `RoomPhotoFigure` (details-gallery wrapper).
- Wired into `RoomResults` (card photo, `cursor: zoom-in`, "View photo" hint) and
  `RoomTypeDetailsBody` (main photo + every thumbnail; thumbnails now open the viewer
  at the tapped index instead of only moving the carousel).
- `room-details.css`: dark photo stage (`object-fit: contain`, 94vw / 68vh caps,
  safe-area insets, reduced-motion off-switch, 44px touch targets).
  `design-tokens.css`: `--z-index-lightbox: 1400` + print hiding.
- Data: DB `photo_urls` order preserved (`roomPhotosFor`); stock map is fallback only.
  No new tables, routes, or business logic.

## Decisions (user-confirmed)

- Landing `FeaturedStays` photos stay navigation links — lightbox scope is Find a Room /
  public search / View Details only. No fake gallery relationships.
- Mobile minimum is buttons + drag-pan + double-click; no pinch/swipe dependency.

## Verification

- Targeted: 24/24 (`room-photo-lightbox.test.tsx`, incl. 2 new: Tab trap, details scroll
  lock kept on viewer close). Full: 1161/1161. Typecheck clean. Lint 0 errors
  (71 pre-existing warnings; 0 in touched files). Build 64/64. Impeccable detector clean.
- Manual browser QA still pending (Flows A–D need a guest session; no browser runner here).

## Follow-ups

- Commit the tree (this feature + parallel-session work); coordinate first.
- Manual QA Flows A–D on desktop + mobile widths.
