# Landing room comparison grid — 7 November 2026

The user approved the Current/Proposed design comparison before implementation.
The existing landing now shows all active catalog types in two desktop columns,
with split photo/details cards and rows determined by the real type count. The
current four active types therefore form a 2×2 grid. Tablet/mobile use one column;
phone cards stack media above content. Other landing sections are unchanged.

## Content ownership

Existing Admin/Owner **Room types & photos** is the editor. Description, bed/capacity,
size, amenities, base rate, visibility and ordered `photo_urls` remain authoritative.
Cards preview the first four amenities and first three photos. The shared full-screen
viewer exposes the complete gallery with keyboard navigation, zoom and focus return.
Uploaded photos take precedence over illustrative fallbacks. Failed card images are
removed; complete image failure retains the booking action and truthful empty state.

Successful catalog creation, details/photo updates, and rate-proposal approval
invalidate `/` so the next visit receives current content. Existing role, audit,
version, validation and rate-approval rules are unchanged. No migration or DB write
was made for this implementation.

Three approved generated Deluxe King samples were encoded as WebP without changing
resolution and saved in `public/room-samples/`: room (174,926 bytes), alternate angle
(124,920 bytes), bathroom (84,982 bytes). Existing public copy labels fallbacks as
illustrative. Other types retain their existing stock galleries. The shared resolver
keeps landing, booking search and stay summaries on the same photo chain.

## Verification

- `npm run typecheck`: passed.
- ESLint on touched TypeScript files: zero errors. Four existing warnings in the
  catalog editor remain (load effect and three existing plain image elements).
- Focused landing/gallery/catalog suite: 85 tests across eight files passed.
- Focused stay-summary/new landing behavior suite after updating its obsolete
  Unsplash-only expectation: 23 tests across two files passed.
- Final `npm test -- --maxWorkers=4`: **2,431 tests / 228 files passed**.
- Default `npm run build` (Turbopack): passed using isolated
  `HAVEN_BUILD_DIR=.tmp/room-card-build`. The first sandboxed attempt could not create
  a Sharp junction; the authorized outside-sandbox build passed. Generated
  tsconfig/next-env changes were removed afterward, preserving the prior files.
- Mechanical design detector on the changed component and stylesheet: `[]`.
- `git diff --check` on scoped changes: passed.

Real in-app browser checks used the **production build**, not the earlier prototype.
At 1440px: two columns, four cards, all room images loaded, no horizontal overflow.
At 768px: one column with split cards. At 390px and 320px: one column with stacked
media/details, no horizontal overflow; thumbnail heights were 66.4px and 49.8px.
Bathroom thumbnail changed the main image, the shared viewer opened photo 3/3,
Escape closed it and returned focus to its trigger. The room link navigated to live
booking search with Deluxe King, 13–15 January 2027 and two guests retained; booking
search showed that room as selected from the homepage. No reservation was created.

All three sample URLs returned HTTP 200 `image/webp`. Unauthenticated catalog GET
returned 401. A signed-in admin upload/save/revisit was **not** performed against the
hosted database; the existing save paths are reused, and component tests verify saved
copy, upload precedence/order, gallery changes and re-rendered catalog data.

## Artifacts and limits

- Running local application: `http://localhost:3013/#stay` (production server).
- Screenshots and logs: `.tmp/room-card-comparison/implemented-desktop.jpg`,
  `implemented-mobile.jpg`, `implemented-bathroom.jpg`, `full-tests.log`, `build.log`.
- Before/proposed comparison remains at `http://127.0.0.1:8768` and is a prototype.
- Visual review: follows the supplied reference, existing Haven colors/fonts and
  approved composition. No random direction draw was required for this section.
  Design/usability/content 8/10, creativity 7/10; remaining photography is illustrative.
- Local checks ran on installed Node 24.21.0; the project declares Node 22.22.2–22.x.
  Repeat release checks on the declared engine before a hosted release.
- No commit, push, migration or hosted application deployment was performed.
