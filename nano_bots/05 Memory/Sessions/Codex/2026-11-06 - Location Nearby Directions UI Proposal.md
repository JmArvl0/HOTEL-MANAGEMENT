# Location, nearby places and directions UI proposal

Date: November 6, 2026. Design review only; not feature implementation.

## User scope and confirmed truth

User requested Hotel Location / Nearby / How to Go plus admin CRUD, but explicitly
asked for current-versus-proposed UI before implementation. They then clarified
that Haven is a fictional working name, with no client hotel yet. All locations,
hotel details, nearby places and route origins must be configurable. Continue
means finishing this review; the design has not yet been accepted.

Follow-up: user explicitly clarified these are **additional landing-page
features**. Updated the comparison and plan to show existing earlier sections,
two inserted sections after reviews, and the retained contact/FAQ/footer. No
replacement landing/contact page or live application change is authorized by
this clarification.

Follow-up verification: 54 preview assertions passed (the initial 51 plus
retained-contact/source identity and insertion/order checks); inline-script
ESLint remains 0/0. Browser review confirmed retained contact after Nearby and
the added context labels in desktop/phone preview. Evidence:
`landing-additions-retained-contact.png` and `landing-additions-comparison.png`.

## Verified work

- Audited the public page/navigation/CSS, server reader, shared controls, auth,
  active-account Admin/Owner guard, separate admin shell, room-photo upload,
  image-byte helper and actual geographic/storage migrations. Reviewed the supplied
  Tugatog site and official Google Maps linking/embedding documentation.
- Current `#location` is a contact block and generic hotel-name Maps search.
  There are no nearby/route content tables or management module. Existing
  `transfer_hotel_*` seed values explicitly describe placeholders, not a public
  verified pin; operational transport settings will remain independent.
- Added source audit, scoped schema/API/UI plan and implementation verification
  matrix at `docs/plans/2026-11-06-location-nearby-directions-proposal.md`.
- Created an isolated interactive comparison: captured current section, proposed
  public arrival/map/route/featured/category UI, proposed configurable admin
  forms, desktop/phone display and loading/empty/error examples. The existing
  local concept illustration is labeled; no real businesses, addresses,
  distances, travel times or coordinates are asserted.
- Admin preview applies edited hotel name/address to public headings, route
  copy and location display locally. Forms/delete/status/upload controls are
  demonstration UI, not persistent CMS operations. Navigation explains that a
  verified destination is needed rather than opening a fictitious property.
- Corrected SYSTEM's product-context paragraph using the user's clarification.
  Preserved all existing unfinished source, migration and memory work.

## Preview verification

- 51 JSDOM assertions passed on the actual fragment script: category filtering,
  state changes/retry, view switching, form opening, coordinate pairs/ranges,
  zero coordinates, missing-coordinate publication refusal, dynamic client
  display, literal text escaping and unsafe embed URL rejection.
- Extracted inline script passes repository ESLint: 0 errors / 0 warnings.
  Script syntax and embedded asset checks passed; fragment is about 367 KB.
- Real in-app browser: desktop comparison and admin, 768/390 public layouts,
  320 public/editor, category filtering, edited name/address read-back,
  confirmation cancel versus removal (4→4 versus 4→3 preview rows), error/retry
  and navigation explanation dialog. No document horizontal overflow. Fixed a
  clipped 320 px state picker and verified it fits its parent after the change.
- Inspected full desktop/tablet/mobile screenshots. Existing public image fetch
  failed locally and is identified in the current capture, not presented as a
  production issue. This is a faithful local-content review with that asset limit.
- No application typecheck, full Vitest, SQL, real file-upload security, backend
  RBAC, live Maps routing or build claim: application/runtime was not changed.
  These remain mandatory gates for implementation. No physical phone QA.

## Artifacts and continuation

Thread-owned artifact directory:
`C:/Users/Mark Rowell/.codex/visualizations/2026/11/06/01a1b07c-1438-7941-9419-251014228944/`.

- `haven-location-comparison.html`: inline review source, fonts/images embedded.
- `preview.html`: standalone local inspection wrapper with `preview-icons.js`.
- `build-preview.cjs`, `check-preview.cjs`, `lint-preview.cjs`: preview helpers.
- `comparison-cover.png`, `comparison-desktop.png`, `proposed-tablet.png`,
  `proposed-mobile.png`, `proposed-mobile-320.png`, `admin-desktop.png`,
  `admin-mobile-320.png`: inspection evidence.

The proposal inherits the existing public Playfair/Inter light identity; no new
direction draw was needed for these local section additions. Review: clear
address→map→route hierarchy, responsive stacking and readable actions. Limits:
map/route images are reserved positions; actual client photos and verified copy
do not yet exist, and an illustration is not a real nearby destination.

Next: collect the user's design feedback, then implement the approved scope.
Verify live migration ledger before choosing any timestamp. A hotel pin change
must re-review stale nearby distances/route descriptions before republishing.
Do not auto-publish Makati data or alter operational transport/fare settings.
