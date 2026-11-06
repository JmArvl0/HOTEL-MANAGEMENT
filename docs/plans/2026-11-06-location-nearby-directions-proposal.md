# Hotel location, nearby places and directions — audit and proposal

Status: implementation approved November 6, 2026; implemented locally. The scoped
location migration is applied and the integrated app on3008 renders published demo
content. Hosted application release and final real-browser implementation QA pending.

The initial source audit and design proposals below led to the approved premium
photo layout and live Google iframe. Source integration, independent content
migration, Admin/Owner editor, private image uploads and behavior tests are now
present. Verification/release status is recorded separately in
`docs/qa/location-content-implementation-2026-11-06.md`; only the location schema
was pushed (17 unrelated migrations excluded); no application deployment.
Earlier preview verification remains historical.

**Scope clarification:** these are additional features on the existing landing
page. Preserve its hero/booking search, featured stays, amenities, experiences,
story, smarter-hospitality teaser, reviews, contact block, FAQ and footer.
Insert the two new sections after Guest experiences and before the existing
contact block. This is an addition to `/`, not a replacement landing page or
replacement contact section.

## Confirmed product context

Haven is a fictional placeholder brand while the team has no client hotel.
There is no real Haven address, verified hotel coordinate or established list
of nearby businesses. Do not infer a hotel location from Makati references,
the public telephone number, coastal stock photos, or transport seed values.

The future client hotel's display name, address, entrance notes, coordinates,
map embed, nearby destinations, categories, route origins, copy, images,
publication and order must be configurable through the authorized editor.
Single-property deployment remains the existing architecture; changing the
client's configuration does not require a multi-tenant platform.

## Existing-code audit

| Area | Verified current implementation | Consequence |
|---|---|---|
| Stack | Next.js 16.3.2 App Router, React 18, TypeScript, handwritten CSS, Zod, Lucide, Supabase/Postgres; `package.json` | Reuse current stack; no new framework, CSS library or Maps SDK. |
| Public route | `app/(landing-page)/page.tsx` is an async server component with 300-second revalidation. Room types/reviews are read server-side. | Render published location content on the server; restrict filtering to a small client component. Failures must remain local to these sections. |
| Current location UI | `#location` is the contact block: phone, email, hotel name and `https://www.google.com/maps/search/?api=1&query=Haven+Hotel`. No street address, embedded map, route guides or nearby-place catalog. | Retain the contact block and its `#location` anchor. Add distinct new sections immediately above it. Its Maps link can use the same configured destination without changing the contact layout. |
| Navigation | `components/landing/landing-nav.tsx` has Rooms/Experience/Amenities/Gallery/About on desktop; FAQ/availability are additional drawer items. The footer links to `#location`. | Add clear How to Go and Nearby access without displacing the booking/account actions; retain old anchors. |
| Brand | `DESIGN.md` and `app/(landing-page)/landing.css`: light-only public surface, neutral ink `#111827`, white/gray ground, Playfair Display/Inter and rounded dark actions. | Extend the present public identity. The proposed editor uses the existing staff light-theme vocabulary, with equivalent production dark support planned. |
| Existing imagery | `lib/room-images.ts` uses illustrative stock photographs. `public/hotel-hero.png` is an existing concept illustration. | Neither proves a real hotel's surroundings. The preview labels the local illustration as photo placement only. No Tugatog photo, name, distance, route or business list is reused. |
| Existing geographic fields | `supabase/migrations/20260904040000_transfer_vehicle_fares.sql` introduces `transfer_hotel_lat`, `transfer_hotel_lon`, `transfer_hotel_label` on `hotel_operational_policies`; its comments explicitly call the initial values placeholders. | Do not publish these seeds as verified data. Do not change transport fare or reservation settings as part of this content feature. |
| Data access | `lib/supabase.ts`, SYSTEM §5/§13: shared service-role client in server code, no browser-direct database reads. | Public readers return an explicit published-field allowlist; editor data uses authenticated server endpoints. |
| Authentication | `lib/auth.ts`: NextAuth Credentials/JWT with live account/session enforcement. | Reuse current authentication; no separate CMS login. |
| Admin authority | `guardAdmin()` in `lib/admin-route.ts` accepts Owner/System Administrator, checks session and fresh active/non-recovery account. `guardCatalog()` additionally accepts Manager. | Use `guardAdmin`, not the broader catalog guard, for the requested authorized admin CRUD. Recheck the actor inside write RPCs. No guest, operational staff or Manager mutation authority is implied. |
| Admin shell | `components/admin/admin-dashboard-client.tsx` groups configuration modules and loads scoped views. No website location module exists. Owner has a separate shell. | Add one Location & Places module under Configuration; reuse a separate editor component and expose it in Owner governance with the same guard. Avoid another dashboard or generic resource CRUD. |
| Shared controls | Existing Modal, `useActionDialogs`, HavenSelect, data controls, ToastStack and staff theme. | Reuse them for forms, delete confirmation, ordering, status and feedback. Keep public presentation separate. |
| Existing photo upload | `app/api/catalog/photos/route.ts`: broader catalog guard, JPEG/PNG/WebP MIME allowlist, 5 MB limit, UUID objects in public `room-photos`; existing validator trusts browser MIME. `lib/payment-proof.ts` already demonstrates byte sniffing for private proofs. | Reuse visual upload interaction and byte-validation concepts; do not reuse the broader permission or private proof storage. New content images need their own role-guarded, byte-checked flow and owned object keys. No unrelated room-upload refactor. |
| Storage/schema | Migration `20260904010000_room_catalog_photos.sql` provisions `room-photos`; business tables generally enable RLS and revoke public access. No public hotel-location/nearby/route tables were found. | Add only the content tables and storage configuration actually needed, with matching revoke/grant rules and transactional audited writers. |
| Work in progress | The initial tree already contained substantial unrelated uncommitted source/migrations/memory changes. | Preserve them. The proposal creates isolated review artifacts and documentation only. |

The current contact block was also inspected in the local app. Its remote pool
image failed to load under this execution environment; the capture preserves that
failure honestly. No production outage is inferred. Unrelated operational UI was
not exercised. SYSTEM §7.1 contains older review-fallback wording that disagrees
with the current honest empty-state implementation; that unrelated drift is
outside this proposal.

## Proposed public UI

- **How to Go:** concise heading and intro, hotel address/entrance notes beside
  a lazily loaded Google Maps embed, then image-led route cards. Each card has
  an independently configured origin and uses the current published hotel
  destination. Mobile leads with address and action, then map, then route cards.
- **Nearby:** one featured destination, category buttons for Dining, Shopping,
  Landmarks and Transport, followed by readable place cards. Categories remain
  admin-managed; defaults are category names only. No business is seeded.
- Keep `#location` on the existing contact block. Add `#how-to-go` and
  `#nearby` to the two additional sections, with corresponding navigation. The
  order is existing reviews → How to Go → Nearby → existing contact → FAQ →
  footer. All earlier sections remain. New content stays on `/`;
  no duplicate landing page or mandatory authenticated public access.
- Use semantic headings/address, keyboard controls, visible focus, image alt
  text and 44 px touch targets. Respect reduced motion and reserve map/image
  dimensions to avoid layout shifts. Add accurate structured hotel/address data
  only when configured, verified and published; never emit invented SEO data.
- No coordinates: no arbitrary destination, working-looking navigation or
  invented geographic map. Show address/contact if available and a useful
  missing-map state. Empty publication, loading and retrieval failure have
  distinct presentation and do not break room discovery or booking.
- Categories filter only published records. Unknown distances display no
  number. Optional name search and distance sorting can follow the core UI;
  they are not necessary for the initial approved scope. Distance sorting must
  place unknown values last and must never mix road and straight-line distance
  without a named, consistent basis.

The comparison uses unmistakable sample labels, no claimed real businesses,
coordinates, fares, distances or travel times. Its navigation buttons explain
the intended destination behavior instead of opening a fictitious map.

## Premium refinement — additional proposal for review

The user requested a premium, modern and easier-to-read refinement using
UI/UX Pro Max, compared with the current proposal. This does not approve a
design for application integration. The original comparison remains intact;
the new `haven-premium-comparison.html` in the chat's visualization directory
compares its public section composition with the refined alternative.

| Current proposal | Refined alternative |
|---|---|
| Separate white hotel card and pale map panel | One connected arrival block, with a dark address/action area and a clear map region. |
| Large empty route-image positions | Compact origin choices and an independent Google Maps action for each route; selected guide copy follows the origin. When real route images exist, display them in the guide; do not fill missing-image space with oversized placeholder boxes. |
| Smaller supporting text and several repeated rounded cards | Larger body text, stronger type hierarchy and a continuous place list with consistent directions actions. |
| Category filters only | Category filters plus local name/category/description search, live result count, clear-filters and no-match states. |
| Smaller featured image/copy | Larger editorial image treatment and simpler featured-destination introduction. |

Retain the current Playfair Display / Inter identity and neutral ink palette.
Use UI/UX Pro Max's editorial composition guidance without replacing the hotel's
brand system. Photos, map and location details remain illustrative/unconfigured;
the proposal introduces no real coordinates, travel-time estimates or nearby
business claims. All future content remains database-backed and admin-managed.
The original admin editor proposal and authorization/data plan are unchanged.

The two designs share a comparison surface. Review-only location/placement
annotations are hidden in the copied earlier view so the visible sections can
be compared directly; the source proposal file is not rewritten. The comparison
offers Compare / Improved / Current proposal and Desktop / Phone views.

Refined preview verification: 37 behavior assertions, both scripts ESLint
0 errors / 0 warnings, desktop/768/390/320 browser review, distinct airport/city
route actions, search/filter/no-match/error recovery, native dialog Escape and
focus restoration. No horizontal document/content overflow at the narrow check;
all checked headings fit within two lines at 320 px. This is preview evidence,
not a backend CRUD, real Maps routing or production-build claim. See
`nano_bots/05 Memory/Sessions/Codex/2026-11-06 - Location UI Premium Comparison.md`.

## Proposed admin workflow

One Location & Places editor, with Hotel location / Nearby places / Categories /
Route guides tabs. Featured destination is a flag/selection on an existing place,
not a duplicate destination record. The editor allows create, edit, publish,
unpublish, reorder and confirmed removal where applicable. The hotel is a
singleton setting: clear/unpublish requires confirmation; deleting it must
not erase booking, transport, guest or financial data.

Drafts may be incomplete. Publish requires valid text, current verified
geography, safe media ownership and an allowed destination. Preserve drafts
after server failure. Show save-in-progress, success, unavailable, validation
errors and version-conflict/reload feedback; never turn a failed save into
success. Admin/Owner can see draft/public status; guests receive only the
published projection. Removing a category used by places must be rejected
until those places are reassigned or explicitly archived.

Changing the hotel pin is significant: route links resolve the new hotel
destination centrally, and existing nearby claims/manual distances must be
marked for re-verification before publication at the new location. A stale
nearby guide from a previous client/city must not quietly remain public.

## Data proposal — additive, timestamp pending ledger verification

| Proposed record | Minimum fields |
|---|---|
| `hotel_location` | fixed singleton key, display name, address, notes, nullable paired latitude/longitude, optional place ID, vetted Google embed URL, verification evidence/date, location revision, publication state, order/version/timestamps and audit actor |
| `nearby_place_categories` | id, unique slug, label, publication state, sort order, version/timestamps |
| `nearby_places` | id, category FK, name, description, nullable paired coordinates, optional place ID, verification source/date, distance value/unit/basis and manual maintenance label when supplied, location revision, image object key/alt text, featured selection, publication state, sort order, version/timestamps |
| `route_guides` | id, origin name/description, paired origin coordinates and optional place ID, travel mode, image object key/alt text, verified-for location revision, publication state, sort order, version/timestamps. Hotel destination comes from `hotel_location`; do not duplicate it per route. |

The table names are proposed, not created. Constraints validate finite latitude
−90..90/longitude −180..180, coordinate pairs, nonnegative distance/order,
allowed publication states and lengths. Zero is a valid coordinate. Enforce
featured uniqueness consistently, including draft versus published selection.
Protected write RPCs recheck active Owner/Admin, validate the expected version,
own the transaction and append safe before/after audit data. Set search_path
explicitly; revoke public/anon/authenticated table and RPC privileges and grant
only the required service-role access.

Use one new content image storage area rather than copying the room catalog
module. The implementation must settle draft visibility explicitly: keep
draft uploads private and serve authorized previews; publish only approved
public media and prevent orphan/double-delete issues. Unpublishing removes
public references. Do not promise revocation of files already downloaded or
cached by visitors. Coordinate storage creation with the content migration.

Before writing/numbering the migration, inspect the actual linked migration
ledger and pending local migrations. Existing SYSTEM/handoff records explicitly
warn against blindly pushing the root directory. No DB push is authorized by
this visual-review step. Verify clean and upgrade replays before coordinated
application/schema release.

## URL and image rules

Build links using URL/URLSearchParams from validated fields, not arbitrary admin
HTML. Route links use `https://www.google.com/maps/dir/?api=1` plus the route's
own origin and hotel destination (optional place IDs/travel mode). Place
directions start from the configured hotel and end at that place. Hotel
navigation may omit the origin to use the visitor's current location in Maps.
No browser location permission is needed merely to open Maps.

Do not accept arbitrary iframe markup. Allowlist HTTPS Google Maps embed hosts
and exact permitted paths; reject credentials, lookalike hosts, script/data URLs,
unexpected ports and malformed URLs. Verify that an operator-supplied embed
represents the configured hotel/location revision. Label and retain an ordinary
navigation fallback if an iframe is blocked or times out. Do not make server
requests to arbitrary URLs to test them. External navigation uses appropriate
noopener/noreferrer protection.

No paid Google Maps API is required for ordinary Maps links. Start with Google's
supported Share → Embed a map workflow and navigation URLs, with a verified map
pin and safe iframe configuration. Do not add geocoding, Places, live fares,
route-distance computation or traffic/travel-time claims. A coordinate-derived
distance, if later included, must say **straight-line distance**, not travel
distance; a manual distance must say **manually maintained** and identify its
basis/review date.

Images: JPEG/PNG/WebP only, nonempty and ≤5 MB, server byte signatures matching
type, bounded dimensions/decoded resource limits, generated filenames,
non-overwriting owned keys, authorized cleanup and image alt text. Reject SVG,
HTML, spoofed MIME, corrupt/truncated files and unsafe external image URLs.
Never move guest IDs/payment proofs into public storage. Reuse an available
decoder only after checking deployed-runtime support; do not introduce a new
dependency simply for a preview.

## Implementation order after design acceptance

1. Freeze the approved composition and final permission scope. Add two sections
   between existing reviews and contact. Preserve all existing landing sections,
   contact anchors and booking actions. No real address is needed to
   implement the configurable empty state.
2. Verify the live ledger, then author one scoped additive migration and role-
   guarded audited RPCs. Implement tests for publication, validation, version
   conflicts, reference integrity and service-role-only privileges.
3. Add a small server-only content reader/writer module and pure URL/validation
   helpers. Add scoped `/api/admin/location/*` CRUD/media endpoints using
   `guardAdmin`; do not extend generic operational resource mutation.
4. Add separate `components/admin/location/*` editors inside the existing Admin
   and Owner shells. Reuse shared controls, dialogs, toasts and upload patterns.
5. Add `components/landing/*` presentation with a server-published payload and
   a small category-filter client. Integrate into the current page/navigation
   with scoped CSS and immediate cache invalidation after publication.
6. Complete component, route, SQL and real-browser checks; document results and
   limits. Release the schema and application together only within the approved
   migration/deployment process. Do not change reservations, billing, inventory,
   transportation pricing, or check-in/out.

## Verification gates for the implementation

| Area | Required evidence |
|---|---|
| Public UI | Published-only projection, category switching, no-match/empty/error/loading, missing image fallback, optional image, valid semantic structure. |
| Geography | Zero/boundary coordinates, missing pairs, NaN/infinity/range errors; manual distance label; location change invalidates stale nearby/route verification. |
| Maps | Two guides produce different origin parameters and the same current destination; place links point to the place; hotel pin updates all callers; URL encoding and absent coordinates work correctly. |
| URLs | Reject script/data/http, fake google.com suffixes, userinfo, malformed URLs, unsupported ports/path; blocked embed retains fallback. No unsafe URL fetches. |
| Admin | Create/edit/confirm-delete/publish/unpublish/reorder/featured changes persist and reread correctly; failed saves retain input; stale versions conflict; dependent category removal is prevented. |
| Media | Real valid files and bad bytes/MIME/oversize/zero-size/SVG/corrupt dimensions; draft access and cleanup ownership; failed uploads do not leave published broken references. |
| RBAC | Unauthenticated 401, guest/Manager/operational roles denied, disabled/recovery accounts denied, Owner/Admin allowed; directly invoke RPC as unauthorized actor to prove the second gate. |
| Responsive/a11y | Real-browser public and editor at desktop, 768, 390 and 320 px, keyboard/focus/dialog cancel, long names/address, no horizontal overflow; editor light/dark. Physical mobile remains separately identified if unavailable. |
| Regression | `npm run typecheck`, touched-file ESLint, targeted Vitest, full `npm test` and `npm run build` at implementation checkpoints. Clean/upgrade SQL replay and scoped privilege checks. |

This proposal does not claim those backend gates have passed. Preview-only
verification is recorded in the session note and final response. Full application
tests/build are intentionally not rerun for an unintegrated visual study.

## Preview verification completed

The isolated comparison passed 54 behavior assertions and repository ESLint
(0 errors/0 warnings). Real-browser review covered desktop, 768, 390 and 320 px,
category filtering, local hotel-name/address changes, delete confirmation and
cancel, error/retry and the navigation placeholder dialog. No horizontal
document overflow was observed. A narrow state picker was corrected and checked
again. The follow-up comparison explicitly shows the two additions and retained
contact/FAQ/footer, with source-identity and section-order checks. These are
preview checks; backend CRUD, real uploads, RBAC, SQL migrations
and live routing are not implemented or claimed as tested. Session evidence:
`nano_bots/05 Memory/Sessions/Codex/2026-11-06 - Location Nearby Directions UI Proposal.md`.

## Photo and temporary map-pin follow-up

User explicitly requested sample photos, distances, route-origin photos and an
arbitrary Google Maps pin while there is no client. A new isolated preview,
`haven-location-demo.html`, adds six ImageGen concept assets: café, shopping,
garden, transport, airport and city. Nearby and route distances are clearly
labeled **sample / manual** values; they are not verified travel distances or
times. Generic nearby concepts link to Google category searches rather than
claiming to navigate to invented businesses.

The temporary public-landmark pin is **Rizal Park, Ermita, Manila**, coordinates
14.5826446, 120.9786887, verified on Google Maps. This is not a Haven address.
Google's Share/Embed map was inspected in a real iframe. The inline review uses
an uncropped map capture with Google attribution and live-map links because
the conversation preview restricts third-party iframes. No paid Maps API or key.
Both directions links have their own origin (NAIA Terminal 3 / Manila City
Hall) and the same named Rizal Park destination. A coordinate-only directions
URL resolved to another nearby place label during QA, so the demo directions
use the verified landmark name. Future production helpers still require the
current configured hotel destination and optional verified place ID.

74 real-fragment checks and inline-script ESLint 0/0 pass. Previous proposal
and premium source hashes are preserved. No runtime/schema/deployment change.
Detailed browser evidence and image prompt/path manifest are recorded in
`nano_bots/05 Memory/Sessions/Codex/2026-11-06 - Location Demo Photos and Map.md`.

Follow-up: the user requested a live interactive map. Standalone
`haven-interactive-map.html` uses the same verified official iframe with native
Google pan/zoom, responsive height, accessible title and fallback link. Expanded
directional controls shown during QA are collapsed in the delivered default;
the native Google launcher remains. Local preview runs on loopback port8769.
74 preview assertions and script ESLint0/0 pass. This is still review-only.

## Sources reviewed

- [Hotel Tugatog reference](https://www.hoteltugatog.com/): reviewed the structure
  of its nearby and arrival sections; content/assets are not copied.
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started):
  required `api=1`, distinct origin/destination, URL encoding, no API key for links.
- [Google Maps sharing/embedding help](https://support.google.com/maps/answer/7101463?hl=en):
  supported operator Share/Embed workflow.
- Installed Next.js docs: server/client component guide and route-handler guide
  under `node_modules/next/dist/docs/01-app/01-getting-started/`.
