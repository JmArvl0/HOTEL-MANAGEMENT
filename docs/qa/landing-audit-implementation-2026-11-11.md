# Haven landing audit, before and after

The [original audit](landing-ui-ux-audit-2026-11-11.md) records the observed baseline. The table maps its 34 findings to the implementation. The public page uses a configurable fictional Manila profile until an Owner or System Administrator publishes reviewed client content.

| Finding | Before | Implemented behavior |
| --- | --- | --- |
| F01 | Temporary pin and sample distances | Demo address and landmark pin are labeled. Fictional distances are hidden. Client publication requires a verified location. |
| F02 | Stock visuals suggested a real property | Demo property imagery is labeled. Publishing a real property requires uploaded property photographs for hero and gallery. Catalog type photos remain representative of numbered rooms. |
| F03 | Fixed contact literals | Published contact values feed the landing, drawer and footer. Account help points to the Contact section. Fictional channels are displayed as examples without call or email actions. |
| F04 | Hero clipped the date picker | A modal calendar opens outside the hero and scrolls within the viewport. Native date fields remain available. |
| F05 | Shared booking link missed the search form | Landing links target `#book`. Search and numbered-room links target their own `#book-form`. |
| F06 | Desktop scroll transforms survived resizing | Removed the landing scroll animation dependency and put the form in normal layout flow. |
| F07 | Terms appeared late | Public deposit and cancellation details appear before account entry. Booking continues to use the policy snapshot. |
| F08 | No public privacy and terms pages | Public Privacy, Booking terms and Booking policy pages are linked from the landing and account flow. Client copy needs client review. |
| F09 | Tall room summary delayed sign-in | The account handoff leads with room, dates and party size. A disclosure holds the photo, estimate and change-room link. |
| F10 | Unsupported facility claims | The editor configures facility visibility, hours, availability and fees. Demo facts are labeled. |
| F11 | Literal 48/8/1 proof figures | Removed the figures. Public room cards use the active catalog. |
| F12 | Guests above catalog capacity saw misleading empty results | Public forms derive capacity from the available type catalog or selected type. The form explains the single-room flow and links to Front Desk. |
| F13 | Generic hero omitted location | Hero names the district and city. Headline, introduction and image are editable. |
| F14 | Gallery link looped into a story section | The public gallery has ordered photos with captions and a full-photo viewer. |
| F15 | About was account and QR promotion | A configurable hotel introduction follows the booking essentials. |
| F16 | Contact was hard to find on mobile | Header, drawer and footer link to contact. Real published contact details enable call and email actions. |
| F17 | Operations and account promotion delayed hotel facts | Guest-facing order prioritizes booking, rooms, facilities, photos, location and arrival. |
| F18 | Empty review promotion | The review section renders only when verified stay reviews exist. |
| F19 | Small dates, facts and captions | Increased form, room fact, policy and caption text sizes. A formal 200% text enlargement run is pending. |
| F20 | Small mobile search controls | Date fields, party input, primary actions and photo buttons have at least 44px height in the landing styles. Calendar days fit seven columns on 320px phones. |
| F21 | Location heading and spacing felt detached | Location shares the public heading scale and section spacing. |
| F22 | Mixed or ambiguous calls to action | Explicit Check availability, View rooms, Choose this type, Contact and Directions actions. |
| F23 | Rate inclusion was unclear | Rates display VAT and service charge from operational policy, with a separate breakfast inclusion statement. |
| F24 | No breakfast specifics | Venue, breakfast hours, price and inclusion are configurable. |
| F25 | No child or extra-bed explanation | Configurable family and extra-bed copy appears in guest information and FAQ. |
| F26 | Physical accessibility unspecified | Editable access and assistance copy identifies what guests should confirm. |
| F27 | Wordmark wrapped at 320px | The short wordmark has a length limit and stays on one line. The mobile header keeps the booking and menu actions. |
| F28 | Thumbnails loaded full source images | Managed and sample images use responsive image derivatives. The photo viewer opens the full source on demand. Existing external catalog URLs retain direct delivery. |
| F29 | Public page received staff and customer CSS | Staff layout and CustomerShell load their own CSS. Production landing manifest CSS fell from 639,109 to 285,919 bytes, or 110,827 to 55,043 bytes when gzipped locally. This measures asset size, not page latency. |
| F30 | Calendar keyboard behavior and date names | Native dialog with a labeled heading, full date names, Escape dismissal and focus return. |
| F31 | Browser title read like staff software | Published hotel identity and city drive landing metadata. |
| F32 | Nearby feature repeated a place | A single filterable nearby list displays places once, including attributed photos of Rizal Park, the National Museum and LRT-1. |
| F33 | Check-in/out times missing | FAQ and Booking policy display the operational check-in/out times and timezone. |
| F34 | Search said selecting a room starts a hold | Landing, search, type page and account handoff explain that the hold begins on guest-details submission. |

The configuration entry points are **Admin → Configuration → Website Content** and **Owner → Catalog → Website Content**. Both offer a guest preview, private media uploads, a saved draft, before/after publication review and a required publication reason. Managers continue to configure catalog content and physical rooms within their existing permissions. Owner and System Administrator can archive eligible room types.

Room amenities inherit from the type. A physical room can add or exclude items without changing sibling rooms. The guest sees effective amenities on numbered-room choices, and reservation-time snapshots appear in booking review, confirmation, guest reservation detail and staff detail when present.

Browser checks verified 320px landing reflow, calendar range selection and Escape/focus return, contact-anchor navigation, the Rizal Park contact backdrop, and the three migrated Manila destinations. The actual editor component was verified in a disposable PostgreSQL fixture for all eight sections, 320px reflow, saved-draft isolation, before/after review and publication. Staff authentication and private Storage upload were not exercised through the browser. The browser tool later reported local browser use disabled even though the user confirmed it was enabled. The final account disclosure and form styling changes still need a browser pass.

Read-only HTTP smoke tests on the actual Next.js app passed for the landing, all three Manila destinations, policy and gallery routes, search and exact-room form anchors, the live numbered-room handoff to sign-in, and access denial for signed-out editor requests. Component tests covered the editor's conflict retention, draft review and publication reason. The production build and 2,446-test suite passed on Node 22.22.2, with 87 focused tests passing after the final changes. Final clean migration replay passed.

All four scoped Supabase migrations are applied, verified through `20261111050000`. In isolated PostgreSQL, both deactivate and retype reject a concurrent hold when the edit commits first. A hold that commits first blocks a competing reassignment. The hosted application release is pending.

Follow-up at the user's request removed guest-facing demo badges and placeholder contact details. The map presents the Manila area, and photo credits remain. The demo status and sample profile remain available to authorized editors. See the [Browser Use prompt](browser-use-staff-photo-prompt.md) for visual verification.

Authenticated HTTP checks used the running local app and real configured Supabase Storage. Owner, System Administrator and Manager signed in with disposable accounts. Owner/Admin could load the editor and preview the uploaded photo. Signed-out and Manager access were denied. An invalid JPEG was rejected, and a 1700 × 850 test JPEG was stored and served as a 1600 × 800 WebP. Public app and Storage URLs denied access to the unattached image. The app removed the test photo, the published version stayed the same, and the QA accounts were deactivated per account history rules. The checks used the configured password-only policy. Browser Use continued to report unavailable, so interactive staff login and thumbnail rendering still need a visual run.
