# Haven landing page: complete hospitality UI/UX audit

Date: November 11, 2026 (Asia/Manila). Target: the current repository landing page, `app/(landing-page)/page.tsx`, and its public booking entry journey, rendered at `http://localhost:3014/`.

**Overall: 5.4/10. Production readiness: NOT READY for a real hotel's guest bookings.** The visual foundation and room comparison deserve to be retained. The immediate work is to repair booking controls, establish verified property truth, and make practical stay information accessible. A replacement aesthetic alone would leave the largest problems unresolved.

## Scope, evidence, and limits

The supplied brief retained a placeholder URL. The repository and its existing local app were therefore used as the target. This is an audit of the current local implementation, including existing uncommitted work; it is not a certification of an unspecified deployed website.

Evidence collected:

- Read the landing, navigation, booking-intent cards, experience gallery, motion, location, image, search, numbered-room, and account-handoff implementations, with relevant `SYSTEM.md` and `DESIGN.md` guidance.
- Inspected the actual app in the in-app Chromium browser at 1440×1000, 768×1024, 390×844, and 320×780 CSS-pixel viewports. Used screenshots, rendered DOM, and element geometry. Reloaded at narrow widths to distinguish fresh loads from resize behavior.
- Exercised navigation, the room photo viewer and next-photo action, Escape/focus restoration, mobile menu focus wrapping, experience selection, nearby category/search/empty-state recovery, and keyboard FAQ expansion.
- Followed November 20–22, 2026 / two guests through availability, Deluxe King, Room 101, and the sign-in page. Dates, party, room identity, and the ₱12,800 two-night estimate survived. No account was created, no credentials entered, no hold submitted, and no payment made.
- Checked the same dates with five guests using the known public search URL. The page returned zero results and advised different dates or fewer guests, despite the selector offering up to eight.
- `npm run typecheck`: passed. Focused Vitest: **70 tests / 9 files passed**. The Impeccable source detector returned `[]` for the landing files and shared search form. This is a bounded static result, not an accessibility or browser pass.

This is viewport-based browser QA, not testing on physical phones, synthesized touch gestures, iOS Safari, or an assistive-technology combination. Reduced motion was reviewed in source; its rendered variant was not exercised. No Lighthouse, field Core Web Vitals, throttled-network, 200% text-resize, completed authentication, deposit, or confirmation test was performed. Full `npm test`, build, and ESLint were not rerun for this documentation-only audit. The existing application server was reused, not started or stopped by this audit.

All problem references below inherit the severity in section 25. **Observed** means browser evidence; **source** means implementation evidence; **release prerequisite** means client facts or content are not established, rather than a proven technical failure. Conversion effects are expert judgments, not measured uplift predictions.

## 1. First impression

The first screen communicates a hotel through the HAVEN Hotel & Residences wordmark, resort-like pool photography, and availability form. It presents a calm, upscale leisure atmosphere. The large Playfair headline and restrained dark buttons establish a recognizable hierarchy.

It does not answer the guest's location or differentiation questions. “Find Your Haven,” “Extraordinary stays,” “Beautiful spaces,” and “Your own corner of calm” repeat a mood without naming a district, city, setting, or verifiable reason to choose this property (**F13 — HIGH**). The pool scene implies a coastal resort, but the location is a clearly labeled Manila landmark demonstration (**F01 — CRITICAL**, **F02 — CRITICAL**). A guest cannot establish which property the attractive image belongs to.

Keep the spacious photographic treatment, the single H1, and the date-led search. Replace repeated mood sentences with one concise property-specific sentence and a readable location line. Use actual property photography before accepting bookings. Keep the wordmark; repairing its 320px wrap is more useful than designing another logo (**F27 — MEDIUM**).

## 2. Hero section

The image has emotional appeal and a clear right-side focal area on desktop. The light left scrim supports dark text; it is an appropriate use of an overlay. The design reads as upmarket leisure accommodation, rather than a budget or predominantly business hotel. That positioning must be checked against the actual property instead of inferred from stock imagery.

The principal defects are factual specificity and the booking layer. The date popover is absolutely positioned inside an `overflow:hidden` hero, so its lower content is cut off (**F04 — HIGH**). On desktop/tablet the observed calendar ran approximately from y=543 to y=1010 while the hero ended at y=650. On a fresh phone load, lower dates and Cancel also extended below the hero boundary. Increasing its z-index cannot escape ancestor clipping.

Separately, resizing an already loaded desktop page to 390px left GSAP's desktop `translate(-50%, …)` inline transform on the booking wrapper. Its measured left edge was approximately **−152px**. Reloading at 390px restored an **18px** left edge (**F06 — HIGH**). Do not describe this as a failure on every initial phone load.

Recommended hierarchy: brand/navigation → verified district/city → short headline → one factual benefit sentence → availability action and room-exploration action → date form. Keep decorative slogans subordinate or remove them.

Example copy templates, requiring verified client facts before publication:

| Element | Proposed copy |
|---|---|
| Headline | Your Haven in [City]. |
| Subheadline | Haven Hotel & Residences in [district, city], with [one verified defining benefit]. Find the room and live rate for your dates. |
| Primary CTA | Check availability |
| Secondary CTA | View rooms |
| Supporting information | [Verified location] · Rates from [live catalog minimum] per night; final rate shown for your dates |

Do not substitute “beachfront,” “luxury,” breakfast inclusion, airport proximity, or a star classification without evidence. Preserve two-line phone headline behavior through copy length and available width, not miniature type.

## 3. Navigation

Desktop currently exposes Rooms, Experience, Amenities, Gallery, About, How to Go, Nearby, My account, and Book now. A drawer replaces the section links at smaller widths and includes FAQ and availability. The sticky scrolled header is already present; the page does not need a second competing sticky booking mechanism by default.

The menu's keyboard handling is a strength: focus moved into the drawer, Shift+Tab wrapped to its final Book now link, Escape closed it, body scrolling was restored, and focus returned to Open menu.

Information scent needs correction. Gallery targets one promotional image (**F14 — MEDIUM**); About targets service/QR cards rather than a property introduction (**F15 — MEDIUM**). Both desktop and mobile omit a direct Contact link; on phones, the visible header has only branding, Book now, and Menu (**F16 — HIGH**). Experience, Gallery, and About currently overlap in what they promise.

Recommended desktop structure: **Rooms · Amenities & dining · Gallery · Location · Contact**, plus a subordinate My account link and separate **Check availability** button. Place About inside a concise introduction or footer until it has meaningful property content. Combine How to Go and Nearby under Location rather than demanding two additional top-level slots. The mobile drawer should expose those same destinations, FAQ, and a verified tap-to-call action.

The shared Book now link also needs route-aware behavior: on `/booking/search` it targets nonexistent `#book`, while the real form target is `#book-form` (**F05 — HIGH**). The numbered-room route likewise has no `#book`. Preserve the current dates when moving to the correct form.

## 4. Booking conversion

Booking discovery is accessible without signing in. The homepage form has check-in, check-out, guests, a range-calendar trigger, and Check availability. Room cards provide base nightly rates. Exact numbered-room selection is an approved product capability and should remain.

Observed action counts exclude typing/selecting dates, scrolling, calendar navigation, and authentication itself:

| Path | Navigation actions before the account page |
|---|---|
| Hero search → type → numbered room | **3**: Check availability, Choose this type, Book Room 101 |
| Dates selected on landing → featured type → numbered room | **2**: choose the featured type, Book Room; source and rendered URLs retain dates/party |
| Featured type with no dates → availability → numbered room | **3**: choose type, check availability, Book Room; dates must be confirmed first |
| Header Book now | One anchor action opens the landing booking area; it does not itself create a booking |

These counts reach the account gate, not a completed reservation. The implementation then requires account access, guest details, review, deposit, and confirmation. This audit did not complete those steps.

Preserving Room 101, two guests, dates, and price across sign-in works. However, the mobile account handoff displays an entire large room summary before account controls; the sign-in form is absent from its first 390×844 screen (**F09 — HIGH**). Compress the summary and expose sign-in/create account sooner while retaining room context. Do not remove the account requirement casually; it is part of the current authorized workflow.

Other friction: the clipped calendar (**F04**), dead shared booking anchor (**F05**), unclear cancellation/deposit detail before entering the flow (**F07 — HIGH**), and a contradictory hold statement. Search says selecting a room starts a 15-minute hold, whereas the exact-room/account pages correctly say it starts after submitting guest details (**F34 — HIGH**). Align all callers with the actual hold event; never imply inventory protection early.

A party of five receives a date-oriented no-availability message even though every currently displayed type accommodates at most four (**F12 — MEDIUM**). Explain the capacity limit and offer verified Front Desk assistance for separate-room planning. Do not bolt an unsupported multiroom cart onto this system.

## 5. Hotel content structure

The current sequence is hero/availability → rooms → amenities → experience plus guest-account promotion → QR arrival/photo-story/welcome cards → technology/statistics → reviews → location/arrival routes → nearby guide → contact/final photographic CTA → FAQ → footer.

Rooms appear early, which is appropriate. Location and practical stay information are delayed by several promotional blocks (**F17 — MEDIUM**). The measured desktop page was approximately **7,182px** tall; a fresh 390px version was approximately **13,256px** tall. Length itself is not the defect: the intervening account/technology content does little to resolve first-booking questions.

| Existing content | Disposition | Reason |
|---|---|---|
| Navigation | IMPROVE | Correct destinations and contact access; retain sticky behavior |
| Hero | IMPROVE | Preserve composition, establish real property/location |
| Availability bar | KEEP + IMPROVE | Strong booking entry; repair clipping, keyboard, resize |
| Featured Stays | KEEP + IMPROVE | Useful four-type comparison; verify imagery and inclusions |
| Amenities | IMPROVE | Replace generic service labels with verified availability/inclusion |
| Experience selector | KEEP + MERGE | Integrate useful real dining/pool imagery with amenities/gallery |
| Guest-account promotion | MOVE + SIMPLIFY | One short benefit note near booking/FAQ is enough |
| QR arrival card | MOVE + MERGE | Place under arrival information or account help |
| Single-image story labeled Gallery | MERGE | Use inside an actual property gallery |
| Small details / warmer welcomes | REMOVE or MERGE | Replace repeated atmosphere copy with a specific introduction |
| Smarter hospitality / 48–8–1 | REMOVE from landing | Operational vocabulary and weak statistics obstruct guest decisions |
| Reviews | CONDITIONAL KEEP | Show real reviews when present; collapse the empty promotional shell |
| How to Go / map / route guides | KEEP + MOVE + IMPROVE | Put location earlier and replace demonstration content |
| Nearby feature / finder / list | KEEP + SIMPLIFY | Specific verified places; remove unnecessary duplicate feature |
| Contact / photographic booking CTA | KEEP + IMPROVE | Add complete address and verified contacts; reduce repeated slogans |
| FAQ | KEEP + EXPAND | Add actual stay, family, dining, payment, and cancellation answers |
| Footer | IMPROVE | Full property/contact/policy information instead of another slogan |

The complete purpose/work/problem/impact review for every unit appears in section 26.

## 6. Rooms and accommodation UX

The active catalog rendered these comparisons; these are observed local catalog values, not an independently verified hotel price list:

| Type | Beds | Size | Capacity | Landing rate |
|---|---|---:|---:|---:|
| Garden Twin | 2 twin beds | 32 m² | 2 | From ₱5,800/night |
| Deluxe King | 1 king bed | 36 m² | 2 | From ₱6,400/night |
| Ocean Suite | King bed and lounge | 52 m² | 3 | From ₱8,900/night |
| Executive Suite | King bed and sofa bed | 60 m² | 4 | From ₱11,600/night |

All four types have a description, amenity highlights, thumbnails, a photo viewer, price, and a next action. The desktop 2×2 arrangement supports comparison well. At 768px it becomes one column while maintaining photo/details side by side; at 320/390px the photo stacks above details. Keep this established component.

Photography is the serious weakness (**F02**). The fallback registry combines Unsplash and generated concepts; Executive Suite uses the generic fallback. The current Garden Twin photo does not clearly establish the advertised twin-bed arrangement. This is a need for verified room photography, not proof that the hotel's actual beds are wrong. Caption the actual view/bed/bathroom subjects and make each room's images a coherent set.

Add rate inclusion and tax clarification (**F23 — MEDIUM**), breakfast information (**F24 — MEDIUM**), and relevant family/extra-bed guidance (**F25 — MEDIUM**). Preserve “From” until actual dates determine a quote. Do not display fabricated “available tonight” counts on undated landing cards.

On the exact-room page, all numbered rooms reuse their type's photo set. Make representative type photography clear if room-specific imagery does not exist; avoid suggesting the image documents Room 101 specifically. Retain number and floor. Show additional differences only when they are real, maintained data.

## 7. Visual design

The restrained ink, white, and light-gray palette; serif/sans pairing; rounded photography; and dark booking actions form a reasonably coherent system. Buttons are identifiable, photo treatment is consistent within the room grid, and most page sections share a clear outer frame. This does not require a wholesale visual reset.

The clearest measurable inconsistency is between the core landing and the location additions (**F21 — MEDIUM**). Core section headings cap at 38px; location headings cap at 52px. Core section padding is 32px vertically, while the location sheet introduces 62px top padding and up to 80px bottom padding. The local guide consequently acquires more visual weight than the room decision. Use the same heading and section-spacing roles, allowing a deliberate location feature without changing the scale of the whole page.

The room card's 24px radius, other cards' 16–22px radii, and pill controls are not automatically errors: they follow different roles. Standardize by component role instead of forcing all elements to share one radius. Limit rest-state effects and remove the decorative tilted slogan if that frees space for location. Retain familiar amenity icons, but tie each label to useful hotel facts rather than adding more decorative icon cards.

## 8. Typography

Inter and Playfair Display are bundled locally and match the intended calm editorial identity. The landing has one H1, section H2s, and room H3s. Strong headline hierarchy and generous paragraph line height should be preserved.

The density is achieved partly through very small text (**F19 — MEDIUM**): desktop room facts 11px, descriptions 13px, booking labels 9px, and captions 10px. On phones, room facts remain 11px, descriptions 13px, amenities 10px, and some scene labels 9px. This makes facts guests use to choose rooms much harder to scan than the marketing headings. A 6px brand subtitle is also largely decorative rather than useful reading text.

Use approximately 16px body and form-entry text, 14px room facts/supporting copy, and 12–13px only for genuinely secondary notes; keep flexible line height around 1.5–1.7. These are readability recommendations, not a claim that WCAG defines a 16px font minimum. Check text enlargement and localized/wider copy before release. A logo's contrast exception does not make tiny functional labels acceptable.

## 9. Calls to action

| Current CTA | Actual destination | Recommendation |
|---|---|---|
| Book now | Landing `#book`; broken on shared booking routes | Check availability; resolve to the current route's real form |
| Discover your stay | `#stay` | View rooms |
| View all rooms | Undated catalog browse | Keep; preserve deliberate browse behavior |
| Choose this type | Type page / room-number selection | Choose a room, with the named type in its accessible label |
| Explore your stay | Amenities | View amenities, if this remains necessary |
| Explore your account | Account/authentication | My account in utility navigation; shorten promotional treatment |
| View your reservation | Reservations/authentication | Retain in account or arrival help |
| Discover the experience | Back to the experience selector | View hotel photos once a real gallery exists |
| Meet us at Haven | Contact block | Contact the hotel |
| Find your stay / Book your stay | Either `#book` or search, depending on placement | Check availability for equivalent search actions |
| Let's talk | Phone link | Call Front Desk, with verified contact details |
| Directions / Open in Maps | External map | Keep explicit directions wording; use the real hotel destination |

The issue is unnecessary interpretation and inconsistent destinations (**F22 — MEDIUM**), rather than insufficient CTA quantity. The header, hero, cards, review header, contact photo, and footer already provide repeated booking opportunities. Add a phone bottom bar only if device testing demonstrates that the existing sticky header is insufficient; avoid covering content with a second persistent strip.

## 10. Photography and gallery

Hotels need a coherent visual promise of the specific building and rooms. The current imagery is polished in isolation but its mixed stock/concept origin cannot establish that promise (**F02 — CRITICAL**). The room caption acknowledges illustrations, and the local guide is explicit about AI concepts. These are honest demo disclosures; they do not turn concept imagery into a production property gallery.

The main Gallery link leads to one photograph with another link back to Experience (**F14 — MEDIUM**). The three experience tabs are morning/pool/evening mood selections, not a full property gallery. There is no independently established photographic coverage of this hotel's exterior, entrance, lobby, bathrooms across each type, restaurant, fitness facility, parking, or actual views.

Commission or obtain owner-approved photographs: exterior/entrance first, a whole-room view showing the bed arrangement for every type, bathroom, relevant view, lobby, dining/breakfast, and verified facilities. Place one representative real property image in the hero, real room sets in room cards, and a concise categorized gallery after rooms/amenities. Use consistent thumbnail ratios and preserve uncropped full-image access in the existing viewer. Label property images by subject, not “photo 1” alone when known content can be maintained.

## 11. Trust and credibility

Positive trust mechanics include real catalog-backed rates, an explicit deposit-verification explanation, a completed-stay review model, functioning contact protocols, and strong separation between demo directions and verified client-mode publishing. None of those establishes this fictional placeholder as a real operating hotel.

The release prerequisites are the real address/pin (**F01**), genuine property photography (**F02**), verified contact details (**F03 — HIGH**), approved facility claims (**F10 — HIGH**), and discoverable booking/personal-data terms (**F07/F08 — HIGH**). The contact number and mailbox are hard-coded; this audit did not call, email, or establish ownership/deliverability. Do not label them “broken” without that evidence.

The page's “48 boutique rooms” is a literal, not a catalog-derived or client-approved fact established by this review (**F11 — MEDIUM**). “8 amenities” is simply the number of static labels and “1 connected account” is a product count, neither persuasive hospitality proof. Remove the statistics or use an approved factual property introduction.

No review cards were displayed. Preserve the refusal to invent social proof. When the list is empty, suppress the large review promotion rather than emphasizing “No guest reviews” as a selling point (**F18 — MEDIUM**). Add verified external review attribution only when an actual source and display rights exist. Do not add fake payment badges, awards, star ratings, or best-price claims.

## 12. Location UX

The location implementation has useful structure: hotel/address panel, live embedded Google Map, external directions fallback, selectable origin guides, categories, search, result counts, and map links. The real iframe loaded in the browser. The location editor's verified client mode and publication safeguards should be preserved.

The current content is explicitly a **Rizal Park demonstration**, with generic AI destinations and manually maintained sample distances (**F01 — CRITICAL**). Directions to that pin are appropriate for the demo, not for guest arrival at an actual hotel. The hero's coastal imagery, Manila demo map, and hard-coded telephone information do not establish one consistent property identity.

Use a readable location summary near the hero and consolidate directions/contact into one destination. Desktop: real address and arrival instructions beside the map, followed by two useful route options and a short nearby list. Mobile: address + Get directions + Call Front Desk first, then a bounded lazy map and expandable arrival guidance. Prioritize airport/transport connections and genuinely useful nearby places based on verified hotel location. Do not invent distances or travel times; direct guests to Google Maps for current route estimates.

For four places, one featured garden plus the same garden in the list repeats content (**F32 — LOW**). Use the feature only when it contributes distinct information; keep a full finder when enough maintained places justify it. Real place names and route descriptions are needed; “A local café” and “A transport hub” are demo content rather than recommendations for a visitor.

## 13. Responsive experience

| Surface | Verified behavior | Required improvement |
|---|---|---|
| Desktop 1440 | All primary links visible; four room types in 2×2 grid; sticky header; calendar clipped at hero bottom | Repair overlay host and booking-route anchors; reduce competing pre-location blocks |
| Tablet 768 | Drawer navigation; single-column room list with photo/details split; booking bar remains horizontal | Calendar is still clipped; align location type scale; keep inputs comfortably tappable |
| Phone 390 | Fresh-load booking bar fits; room cards stack; sticky booking action remains available; menu focus works | Desktop-to-phone transform persists after resize; 32px form entries and small copy; contact shortcut missing; account form below tall summary |
| Small phone 320 | No horizontal document overflow in the measured fresh-load state; stacked room card remains usable | HAVEN wraps as “HAVE / N”; Book now wraps; 831.7px hero exceeds the 780px viewport; preserve concise branding and readable controls |

The document width was 305px at a 320px viewport and 375px at 390px because of the browser's scrollbar allocation; it was not wider than the viewport. Do not mistake that difference for overflow. Likewise, clipped off-screen content can exist even with no horizontal scrollbar because the landing uses clipping; the resize defect proves why width checks alone are insufficient.

Use a layout wrapper for responsive positioning and an inner wrapper for entrance motion so GSAP cannot retain desktop centering on mobile. Keep the current room-card breakpoints and image viewer. Verify rotation, short landscapes, on-screen keyboards, text enlargement, native date selection, map scrolling, and touch pan/zoom on physical devices before a mobile release.

## 14. Accessibility

The page includes semantic links/buttons, labeled date fields, a named form, a single landing H1, explicit focus styles, pressed states, image alternatives, native FAQ disclosures, and an accessible mobile drawer. The room viewer restored focus to its trigger after Escape. Keyboard Enter opened the FAQ disclosure.

The calendar's hidden lower controls are a functional access problem (**F04**). It also leaves focus on its trigger when opened, lacks an explicit panel relationship/name, and handles Escape only on the panel; Escape on the expanded trigger left it open in the browser (**F30 — MEDIUM**). Use a documented popover/dialog pattern, deterministic focus entry/return, accessible date names, and dismissal from the trigger and panel. Retain editable native date inputs as a fallback.

Mobile date/guest entries measured **32px** tall, and the header booking CTA measured **40px**, below this project's preferred 44px touch target (**F20 — MEDIUM**). Do not automatically classify these as WCAG AA failures: WCAG 2.2 AA Target Size (Minimum) is 24×24 CSS pixels with exceptions; 44×44 is the enhanced target. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

For text, validate normal text at 4.5:1 and large text at 3:1. No complete pixel-level contrast audit was performed, so this report does not declare all photographic overlays compliant. The basic dark-on-light button treatment is visually strong; changing experience images still needs per-image verification. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Test reflow at 320 CSS pixels without loss of information/function and test actual zoom/text resize, especially overlays and forms. The 320px fresh layout passed a width check, but that is not a complete reflow-conformance result. [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

Source includes a reduced-motion check that skips GSAP and CSS that removes transitions. This is positive, but the rendered reduced-motion variant remains untested. A skip-to-main/availability link would be useful keyboard polish; it is not recorded as a separate proven WCAG violation because landmarks and headings also offer bypass mechanisms.

## 15. Performance-related UX

The hero uses Next Image with priority, image sizes are supplied for scene images, local fonts use swap, room photos are lazy loaded, the map is lazy loaded, and GSAP is dynamically imported. There is no autoplay hero video or automatic experience carousel to remove.

The measured room thumbnails were approximately **92px** wide while their loaded images were **1600px** wide and had no `srcset` (**F28 — MEDIUM**). Use appropriately sized derivatives and responsive sources while retaining original resolution in the full viewer. Repeated use of an identical URL can be cached/deduplicated; do not claim every DOM image downloads an independent 1600px file. The unnecessary payload concern concerns each distinct oversized thumbnail source.

`app/layout.tsx` imports numerous staff/customer/operations styles for the root shared with the landing (**F29 — MEDIUM**, source-level performance risk). Measure production CSS and move route-specific styles into their owning layouts where safe. This is not evidence that current LCP or INP fails. Similarly, the layered experience images and page-wide reveals warrant a production network/CPU trace before adding effects.

Keep image aspect ratios/reserved space and stable loading geometry. Audit the real production build under mobile throttling; measure LCP, layout shift, and interaction latency. No performance score or transfer-byte total is invented here.

## 16. Content and copywriting

Room descriptions are brief and materially differentiate garden-facing, king-bed, ocean/lounge, and longer-stay space. The deposit-verification FAQ is more useful than the repeated atmospheric slogans. Retain the direct, factual room facts.

Repeated phrases such as “brighter,” “thoughtful,” “a little more,” “your stay,” “warmer welcome,” and “corner of calm” give multiple sections similar meaning (**F13/F17**). “Predictive insights and Gemini-assisted guidance,” occupancy, housekeeping, inventory forecasts, and QR-based operations describe the management system rather than a guest benefit (**F17 — MEDIUM**). The account screen's “Work or guest email” and “Role-based access” similarly reveal shared staff/guest implementation language; use “Email address” and reservation-centered help in the booking variant.

Suggested replacements, contingent on actual property facts:

| Current wording | More useful wording |
|---|---|
| Featured Stays / A space for every kind of escape | Rooms & suites / Compare beds, space, and nightly rates. |
| More Than a Stay | Amenities & services |
| Your next chapter starts here | Contact & location |
| Before you arrive | Useful information for your stay |
| Selecting a room starts a 15-minute hold | Your 15-minute hold begins after you submit guest details. |
| Payments and your folio | Payments and stay charges, when addressing a first-time guest |
| Let's talk | Call Front Desk |

For breakfast, parking, arrival times, deposits, and cancellation, use maintained policy/owner-approved content instead of attractive but unverified sentences. The provisional defaults in `SYSTEM.md` are not a basis to publish a new client promise without checking configuration.

## 17. Microinteractions and animation

The manual experience selector changes the image/headline, marks the selected option, and uses a polite announcement. This is sufficient interaction for that component; no autoplay is needed. Room photo selection and the full viewer are useful exploration tools. Buttons have feedback, and FAQ expansion uses familiar native behavior.

GSAP reveal effects operate on transforms/opacity and source skips them for reduced motion. However, the booking widget begins revealing at approximately 0.85 seconds in a longer entrance timeline, and several below-fold components are temporarily hidden until scroll triggers run. The resize defect demonstrates that motion currently owns layout positioning it should not own (**F06**).

Make the booking form readable and actionable immediately; retain brief motion on imagery or nonessential decorative elements. Keep text and interactive controls independent of scroll reveals where possible. Repair calendar dismissal (**F30**) and verify keyboard anchor navigation never lands on content left invisible by a reveal. Do not add new parallax, sliders, or hover effects as a substitute for factual content.

## 18. Footer

The footer has branding, room/experience/amenity/review/contact/FAQ/account links, a final booking CTA, and copyright. Its dark field provides a clear end to the page.

It lacks direct address, telephone, email, directions, privacy, booking terms, and cancellation links (**F03/F07/F08/F16**). The Contact link only scrolls to another section, forcing an extra step. “Good people. Brighter places.” repeats atmosphere rather than supplying property information (**F17**).

Use the hotel name, full verified postal address, tap-to-call and email, Get directions, room/amenity/location links, Privacy, Booking terms, Cancellation policy, and copyright. Include dining or social links only when the property operates the facility/account and its destination is maintained. A newsletter form, fake trust badges, and a large social feed are not required.

## 19. Hospitality-specific questions

| Guest question | Current answer | Required location / recommendation |
|---|---|---|
| Where is the hotel? | Only a clearly labeled demo pin | Verified hero location line, combined location/contact section, footer (**F01**) |
| What does it look like? | Extensive stock/concept imagery | Real hero, room sets, property gallery (**F02**) |
| Which rooms are offered? | Four types with meaningful facts | Keep comparison and exact-room continuation |
| What does a room cost? | Base rates; dated search quotes | Keep; clarify inclusions and tax treatment (**F23**) |
| How many guests fit? | 2/2/3/4 on cards; selector offers 1–8 | Explain single-room capacity and larger-party help (**F12**) |
| Which amenities are included? | Static list plus a general extra-charge warning | Verified included/paid/request-required facts beside amenities (**F10**) |
| Is breakfast included? | Not answered | Dining/room-rate inclusion and FAQ (**F24**) |
| Is parking available and what does it cost? | “Guest parking,” no practical detail | Verified facility/access/fee information (**F10**) |
| Is Wi-Fi available? | Claimed on page/menu | Verify availability and scope; explain only relevant limits (**F10**) |
| When is check-in? | ID/QR process, no arrival time | Live policy quick facts and FAQ (**F33 — MEDIUM**) |
| When is check-out? | Not answered on landing | Same policy quick facts and FAQ (**F33**) |
| What is nearby? | Generic demo places/distances | Specific verified destinations; no invented proximity (**F01**) |
| How do I get there? | Working map/route UI to demo | Real destination and maintained arrival instructions (**F01**) |
| What are cancellation terms? | Says terms appear later | Accessible policy summary/link before account/booking (**F07**) |
| How do I contact the hotel? | Deep-page hard-coded phone/email | Verify and expose in mobile menu/footer/location (**F03/F16**) |
| How do I book? | Dates → type → numbered room → account | Keep flow; fix calendar/anchor/handoff defects (**F04/F05/F09**) |
| Can children stay / can we add a bed? | Only undifferentiated guest counts | Explicit child/extra-bed/cot rules and assistance route (**F25**) |
| Can the property meet access needs? | No physical access information | Verified step-free/accessible-room details and contact route (**F26 — MEDIUM**) |

## 20. Remove unnecessary UI

Remove the technology/statistics section from this guest landing (**F17**, with factual concern **F11**). Merge the guest-account and QR explanations into short relevant help. Replace the generic welcome card with a useful property introduction. Merge the single-photo Gallery card into a real gallery. Suppress the empty review promotion until there are reviews (**F18**). Avoid showing the same featured nearby garden twice when four places are listed (**F32**).

Keep the room grid, photo viewer, availability form, sticky navigation, real map/directions mechanism, and FAQ. Those components address actual guest tasks. Their existing presence is not clutter merely because they are familiar hospitality patterns.

## 21. Missing information and justified additions

| Addition | Why / guest problem solved | Position | Actual content required |
|---|---|---|---|
| Concise property introduction | Establish which hotel and why to choose it (**F13/F15**) | Hero support or immediately after availability | Verified location, property type, one or two real advantages; no separate long About essay |
| Stay essentials / policies | Resolve practical and commercial uncertainty (**F07/F23/F33**) | Near availability/rooms; fuller FAQ near end | Configured check-in/out, deposit/confirmation summary, cancellation link, rate inclusions |
| Real property gallery | Let guests inspect rooms and facilities (**F02/F14**) | After rooms and amenities | Owner-approved room/bathroom/exterior/lobby/facility photos with useful captions |
| Dining / breakfast facts | Clarify the dining claim and breakfast costs (**F24**) | Within amenities unless a real restaurant merits its own section | Service hours, inclusion/charge, actual venue/menu only when maintained |
| Family and access guidance | Help families and guests with access needs plan safely (**F25/F26**) | Room details and FAQ; contact assistance nearby | Actual child/bed/cot and physical accessibility provisions |
| Direct mobile contact | Let an arrival/comparison guest reach the hotel (**F16**) | Drawer and combined location/contact; footer | Verified telephone/email and directions |
| Privacy and booking-policy destinations | Let guests inspect how data and bookings are handled (**F07/F08**) | Footer, account handoff, relevant booking steps | Approved readable content, with applicable booking terms retained in the flow |

These are missing answers, not a mandate for seven new full-height sections. Most fit into existing components. A restaurant page, destination magazine, news feed, loyalty promotion, or extensive attraction directory is not justified by current evidence.

## 22. Competitive quality assessment

This is a professional-pattern comparison, not a measured ranking against live competitor websites. No specific hotel's design or claims are copied.

| Reference class | Current comparison |
|---|---|
| Modern boutique hotel | Comparable typography/photo-led composition; lacks an unmistakable property story and coherent actual imagery |
| Professional local hotel | Useful room/rate presentation; falls short on verified address, practical arrival information, and direct contact |
| Resort | The hero signals this class strongly; actual resort facilities/location are not established |
| International hospitality site | Clear booking entry exists, but dead booking links, clipped dates, limited policy discovery, and account-handoff friction fall below expected task reliability |
| Modern accommodation platform | Preserves selected dates/room and shows capacities; lacks clear larger-party handling and verified comparison/inclusion detail |

The most valuable standard to adopt is evidence-backed decision support: real photos, transparent inclusions, dependable booking controls, readable room facts, and easy assistance. A carousel, luxury adjective, animation package, or generic review badge would not close those gaps.

## 23. Five guest journeys

| Journey | Entry and expected actions | Current friction / confusing steps | Improved flow |
|---|---|---|---|
| A. First-time room visitor | Hero → room types → rates/photos → dates | Strong mood but no real location/advantage; concept photography; calendar clipped (**F01/F02/F04/F13**) | Verified hero/location → usable dates → retained room comparison → named exact-room selection |
| B. Guest checking location | Header location/directions → address/map → route | Location exists, but only as demo; Contact and How to Go are separate destinations (**F01/F16**) | Location link → real address, directions, call action together → useful route options |
| C. Guest comparing rooms | Featured Stays → beds/capacity/space/photos → appropriate type | Comparison facts are good; breakfast/tax/child/access details absent, photography not property proof (**F02/F23–F26**) | Preserve 2×2 comparison → clear inclusion/occupancy help → verified photo sets → choose room |
| D. Guest trying to book | Dates → search → type → room → account → details | Calendar clipping, wrong shared Book now anchor, contradictory hold copy, form below large mobile summary (**F04/F05/F09/F34**) | Working date UI → current quote → exact room → compact account handoff → truthful hold event → review/deposit |
| E. Mobile visitor contacting hotel | Header/menu → call/email/directions | Menu omits Contact; contact section is deep below promotions and guide (**F16**); contact identity unverified (**F03**) | Mobile drawer Call Front Desk / Contact → verified protocols and address; same details in footer |

Booking continuation after account access is source-reviewed only. No claim is made that a complete booking or payment succeeded during this audit.

## 24. Severity rules

- **🔴 CRITICAL:** undermines the identity/trust needed for real bookings, or prevents essential use without an acceptable route.
- **🟠 HIGH:** significant functional, information, or conversion problem to resolve before release.
- **🟡 MEDIUM:** material clarity/readability/efficiency improvement with a workaround, or a source-backed optimization risk requiring measurement.
- **🟢 LOW:** limited-impact polish or simplification.

The register has **34 findings: 2 critical, 11 high, 19 medium, 2 low**. The two critical content prerequisites are valid for assessing real-hotel production readiness; they are not allegations that a deliberately disclosed prototype is fraudulent. A useful demo and a booking-ready property website are different maturity states.

## 25. Detailed audit table

| ID / Area | Issue and evidence | Severity | Why it matters | Recommended fix |
|---|---|---|---|---|
| F01 · Property/location | Rendered location is explicitly a Rizal Park demo; route/nearby content uses generic concepts and sample distances. `location-sections.tsx:36`; `SYSTEM.md` §7.1. | 🔴 CRITICAL | Guests cannot determine or navigate to the actual hotel. | Populate verified client location/routes/places through the existing editor; keep demo clearly separate until ready. |
| F02 · Photography/trust | Stock/generated scene and room fallbacks; the Gallery anchor is not evidence of this property. `lib/room-images.ts:1`, `page.tsx:42`, `booking-intent.tsx:57`. | 🔴 CRITICAL | The primary basis for room/property expectation is unverified. | Use approved actual property/room/bathroom photos; identify representative type images when exact rooms reuse them. |
| F03 · Contact identity | Phone/email are literals, not established client-approved contact channels. `page.tsx:110`, `page.tsx:112`. No call/email test performed. | 🟠 HIGH | Reservation and arrival assistance may reach an unverified destination. | Verify ownership and operation; maintain consistent approved details across public/auth surfaces. |
| F04 · Date calendar | Popover extends below hero, clipped by `overflow:hidden`. Browser confirmed at desktop/tablet/phone. `landing.css:43`, `stay-calendar.css:1`. | 🟠 HIGH | Lower dates and Cancel disappear; increasing z-index does not fix it. | Render overlay outside clipping geometry, or use a responsive in-flow/dialog presentation; retain native inputs. |
| F05 · Booking navigation | Shared Book now uses `#book` on search/type pages where that ID is absent. Browser confirmed search hash changed without reaching form. `landing-nav.tsx:93`, `:136`. | 🟠 HIGH | A primary booking action becomes inert in the booking journey. | Resolve the current route's form target, or navigate to the real booking entry preserving intent. |
| F06 · Responsive motion | Desktop GSAP transform remains after resizing to phone; booking wrapper measured x≈−152px. Fresh phone reload x=18px. `landing-motion.tsx:61`, `:77`; `landing.css:55`, `:159`. | 🟠 HIGH | Rotation/resizing can hide essential date fields and action. | Separate layout and motion wrappers or reinitialize motion by breakpoint; test both directions of resize. |
| F07 · Commercial policies | Landing promises deposit/cancellation terms later but offers no actual cancellation/deposit policy summary/link. `page.tsx:25`, `:114`. | 🟠 HIGH | Guests must proceed before deciding whether the financial terms suit them. | Expose maintained deposit/confirmation and cancellation summaries/links before account entry; retain frozen booking terms. |
| F08 · Privacy/booking terms | No public privacy/terms destination in footer/navigation; source route search found no corresponding public pages. `page.tsx:114`. | 🟠 HIGH | Guests lack accessible data-handling and booking-condition information before account creation. | Add approved readable destinations and link from footer/account/booking steps; do not fabricate legal content. |
| F09 · Mobile account handoff | At 390×844 a full photo/room summary precedes account controls; sign-in fields are below the first screen. `auth-vault.css:53`; booking variant of `auth-vault-shell.tsx`. | 🟠 HIGH | Guests who click Book Room arrive without an immediately visible way to continue. | Put compact stay summary and Sign in/Create account choices together; collapse secondary room detail. |
| F10 · Facility claims | Static dining/pool/gym/parking/transfer list; drawer asserts 24-hour Front Desk and Wi-Fi throughout. `page.tsx:19`, `landing-nav.tsx:140`. | 🟠 HIGH | Unsupported inclusion/hours/facility expectations can lead to disputes. | Owner-verify each claim and expose relevant fees, hours, restrictions, and request requirements. |
| F11 · Property statistics | “48 boutique rooms” is a literal; 8/1 tiles count list items/product accounts. `page.tsx:84`. | 🟡 MEDIUM | It resembles proof without demonstrating a meaningful verified benefit. | Remove the section or use approved property facts; do not equate static UI counts with hotel evidence. |
| F12 · Party capacity | Selector offers 1–8, while current catalog max is four; five-guest search returned date-oriented zero results. `booking-search-form.tsx:103`; rendered catalog. | 🟡 MEDIUM | Larger families may misread capacity incompatibility as date-specific sellout. | Explain single-room limits and provide assisted separate-room planning; no unapproved group-cart implementation. |
| F13 · Hero proposition | No district/city or concrete differentiator; several interchangeable mood phrases. `page.tsx:45`. | 🟠 HIGH | Visitors comparing locations cannot qualify the property in the first seconds. | Add verified location and one factual advantage; reduce repeated copy. |
| F14 · Gallery destination | `#gallery` is one promotional story image leading back to Experience. `page.tsx:77`. | 🟡 MEDIUM | Guests expecting property inspection receive another promotional loop. | Point Gallery to a real categorized photo collection using the existing viewer. |
| F15 · About destination | `#about` contains QR/photo/welcome cards, no clear property introduction. `page.tsx:75`. | 🟡 MEDIUM | Navigation implies information the destination does not supply. | Add concise real introduction or remove/rename the shortcut. |
| F16 · Contact discovery | No Contact link in primary/drawer navigation; mobile contact requires deep scroll or footer. `landing-nav.tsx:7`, `page.tsx:110`. | 🟠 HIGH | A time-sensitive arrival or comparison guest cannot quickly ask for help. | Add Contact and verified call access to drawer, location destination, and footer. |
| F17 · Content priority | Account promotion, QR card, generic welcome, and AI/operations section precede location. `page.tsx:72–88` (start at line 72). | 🟡 MEDIUM | Adds scrolling and distracts from location, facilities, policies, and booking. | Merge account/arrival help at relevant points; remove operations marketing from the guest landing. |
| F18 · Empty social proof | Large Guest experiences header/CTA surrounds “No guest reviews…” and a post-stay instruction. `page.tsx:91`. | 🟡 MEDIUM | Emphasizes absence rather than providing useful evidence. | Conditionally show actual reviews; collapse empty promotional treatment without invented replacements. |
| F19 · Reading size | Important facts/descriptions 11–13px; booking labels 9px; captions 10px; phone scene labels 9px. `landing.css:57`, `:75`, `:93`, `:159`. | 🟡 MEDIUM | Capacity, rates, and caveats are difficult to scan on phones. | Raise functional body/facts and form text; reserve small text for secondary metadata; verify text enlargement. |
| F20 · Touch comfort | Phone input/select entries measured 32px; header booking link 40px. `landing.css:159`. | 🟡 MEDIUM | Avoidable precision demands in the primary booking task. | Meet the project's 44px touch floor with spacing; distinguish that target from the WCAG AA 24px rule. |
| F21 · Visual rhythm | Location headings reach 52px vs core 38px; padding/spacing scales change. `landing.css:12`, `:62`; `location-sections.css:3–4` (start at line 3). | 🟡 MEDIUM | The guide outweighs more important room content and feels separately authored. | Share heading/spacing roles across landing and guide; retain intentional composition differences. |
| F22 · CTA language | Discover/Explore/Find/Book/Meet variants require interpretation and some repeat the same intent. `page.tsx:50`, `:72`, `:78`, `:110`. | 🟡 MEDIUM | Extra ambiguity about which action explores and which checks availability. | Use explicit View rooms, Choose a room, Check availability, Contact, and Get directions for their corresponding actions. |
| F23 · Rate inclusions | Landing shows “From / per night” without stating included tax/service-charge treatment. `booking-intent.tsx:86`. | 🟡 MEDIUM | Guests cannot compare full cost confidently. | Display inclusions from current pricing/policy truth; do not add new fees or hard-code provisional defaults. |
| F24 · Dining/breakfast | On-site dining is listed, but breakfast inclusion, hours, and dining details are absent. `page.tsx:19`, FAQ at `:25`. | 🟡 MEDIUM | A frequent hotel comparison question remains unresolved. | Add verified breakfast/rate inclusion and basic dining facts within existing amenities/FAQ. |
| F25 · Family rules | Occupancy is one guest number with no child/extra-bed/cot explanation. Room cards and shared form. | 🟡 MEDIUM | Families cannot establish the applicable setup/cost. | Provide approved family/extra-bed rules and a contact route; only add structured child fields when pricing supports them. |
| F26 · Physical accessibility | No established accessible-room, step-free, or relevant access information on landing. | 🟡 MEDIUM | Guests with access needs cannot judge property suitability. | Obtain verified physical-access details and publish useful assistance information; do not infer from photos. |
| F27 · Small-phone branding | At 320px HAVEN wraps as “HAVE / N”; Book now also wraps. `landing.css:159`. | 🟡 MEDIUM | First-screen branding looks broken and crowds primary controls. | Protect wordmark width/no-wrap; prioritize brand, booking, menu and test 320px with scrollbar allocation. |
| F28 · Image delivery | Rendered ~92px room thumbnails loaded 1600px images without srcset. `booking-intent.tsx:70`, `:82`; `room-images.ts:11`. | 🟡 MEDIUM | Distinct thumbnail sources can consume unnecessary mobile data/decoding. | Serve responsive derivatives for card/thumb roles; retain full resolution on demand in viewer. |
| F29 · Shared style payload | Root layout imports staff/customer/operations styles for the landing too. `app/layout.tsx:4`. Source-level risk; no measured latency failure. | 🟡 MEDIUM | Public entry may load CSS unrelated to guest discovery. | Measure production output and move safely scoped sheets to owning route layouts. |
| F30 · Calendar keyboard behavior | Opening leaves trigger focused; Escape on trigger did not dismiss; panel lacks explicit label/control relationship. `stay-calendar.tsx:9`. | 🟡 MEDIUM | Keyboard users get inconsistent overlay state and navigation. | Use an accessible popover/dialog pattern with focus, dismissal, relationship, and readable date names. |
| F31 · Search/browser identity | Browser title is “Haven Hotel Management.” `app/layout.tsx:27`. | 🟢 LOW | Public tab/search identity sounds like staff software. | Give the landing a guest-facing property/location metadata title using verified facts. |
| F32 · Nearby duplication | The featured garden also appears in the four-place list. `location-sections.tsx` featured/list rendering. | 🟢 LOW | Adds repetition without a second useful decision. | Remove duplicate prominence or make the feature distinct in content/purpose. |
| F33 · Arrival times | FAQ explains ID/QR but omits check-in and check-out times. `page.tsx:25`. | 🟡 MEDIUM | Guests cannot plan arrival/departure without entering the flow or contacting staff. | Publish current policy-derived times near stay essentials and in FAQ; verify early/late exceptions. |
| F34 · Hold expectation | Search says selection starts a 15-minute hold; type/account say hold starts after guest details. `search/page.tsx:149`; type page hold copy. | 🟠 HIGH | Guests may believe an unheld room is protected while authenticating. | Use the actual guest-details submission event consistently; preserve the server's hold behavior. |

Source paths in this table are repository-relative shorthand. Full paths for principal files are listed in the evidence appendix. Line references identify the audit snapshot and may move as the existing working tree evolves.

## 26. Section-by-section review

### Navigation

**Purpose:** orient discovery and offer a persistent booking entry. **What works:** clear wordmark, separate dark action, sticky scrolled state, functional focus-managed drawer. **Problems:** misleading Gallery/About, absent direct Contact, broken Book now on booking routes (**F05 HIGH; F14/F15 MEDIUM; F16 HIGH**). **UX impact:** task navigation promises more than some targets deliver. **Recommended changes:** five clear guest destinations, direct contact, correct route-aware booking. **Disposition:** IMPROVE.

### Hero

**Purpose:** establish property identity and desirability. **What works:** strong headline scale, photograph, readable scrim, recognizable hotel brand. **Problems:** no verified location/differentiator, concept scene, wrapped small-phone wordmark (**F01/F02 CRITICAL; F13 HIGH; F27 MEDIUM**). **UX impact:** attractive first impression does not qualify an actual property. **Recommended changes:** actual property scene, concise local proposition, stable brand layout. **Disposition:** IMPROVE.

### Availability bar

**Purpose:** begin a dated quote. **What works:** named date/guest inputs, native fallback, submitted values retained in booking links, explicit search action. **Problems:** clipped calendar, resize transform, small entry targets and inconsistent calendar dismissal (**F04/F06 HIGH; F20/F30 MEDIUM**). **UX impact:** guests can lose access to a primary control. **Recommended changes:** separate overlay/layout/motion ownership and repair keyboard behavior. **Disposition:** KEEP + IMPROVE.

### Featured Stays

**Purpose:** compare the four offered room types. **What works:** price, capacity, beds, size, descriptions, thumbnails, full viewer, responsive 2×2-to-stack layout. **Problems:** unverified image sets, small facts, missing inclusion/family/access guidance (**F02 CRITICAL; F19/F23/F25/F26 MEDIUM**). **UX impact:** comparison is useful, but guests cannot establish real appearance and all applicable conditions. **Recommended changes:** preserve cards and intent behavior; add verified media and concise inclusion links. **Disposition:** KEEP + IMPROVE.

### More Than a Stay / amenities

**Purpose:** show facilities and services. **What works:** compact labeled icon list and warning that some services cost extra. **Problems:** static unverified claims and insufficient specific inclusion/hours detail, especially breakfast (**F10 HIGH; F24 MEDIUM**). **UX impact:** general reassurance leaves common purchasing questions unanswered. **Recommended changes:** verify each amenity; show useful included/paid/request details and real dining facts. **Disposition:** IMPROVE.

### Experience selector

**Purpose:** communicate morning/pool/evening atmosphere. **What works:** manual selection, pressed state, changing heading, visual variety without autoplay. **Problems:** stock scenes and vague Explore your stay destination (**F02 CRITICAL; F22 MEDIUM**). **UX impact:** reinforces mood more than property knowledge. **Recommended changes:** real venue imagery with informative captions; merge into facilities/gallery where practical. **Disposition:** KEEP + MERGE.

### Your stay, beautifully organised / account promotion

**Purpose:** explain guest self-service. **What works:** the benefits correspond to actual reservations, requests, and payment functions; preview is labeled illustrative. **Problems:** a large account-software pitch precedes basic property/location information (**F17 MEDIUM**). **UX impact:** prospects are diverted toward authentication before choosing a hotel. **Recommended changes:** one concise management-benefit note near booking or FAQ, with My account in utility navigation. **Disposition:** MOVE + SIMPLIFY.

### A smoother arrival / QR card

**Purpose:** explain arrival support. **What works:** explicitly says Front Desk verifies details; does not promise unassisted check-in. **Problems:** prominent QR promotion without check-in/check-out times (**F17/F33 MEDIUM**). **UX impact:** explains the mechanism before the guest's practical arrival question. **Recommended changes:** merge with arrival FAQ; lead with times, ID, and assistance. **Disposition:** MOVE + MERGE.

### A place to slow down / single-photo Gallery card

**Purpose:** add emotional imagery. **What works:** photograph breaks up utility content. **Problems:** the Gallery navigation targets this single image, whose CTA loops back to Experience (**F14 MEDIUM**, imagery **F02 CRITICAL**). **UX impact:** disappoints visitors seeking inspection. **Recommended changes:** incorporate approved imagery into an actual gallery. **Disposition:** MERGE.

### Small details / warmer welcomes

**Purpose:** reassure guests about hospitality. **What works:** clear short text and contact destination. **Problems:** duplicates the hero's generic welcome language without a specific service fact (**F17 MEDIUM**). **UX impact:** consumes scroll without resolving a new question. **Recommended changes:** replace with a concise real property introduction or fold a verified service fact into amenities. **Disposition:** REMOVE or MERGE.

### Smarter hospitality / technology and statistics

**Purpose:** market management capabilities. **What works:** does not reveal private operational records. **Problems:** literal room count, weak 8/1 metrics, and Gemini/forecast/operations copy (**F11/F17 MEDIUM**). **UX impact:** reads like a hotel-system demonstration instead of evidence for a guest's stay. **Recommended changes:** remove from public landing; keep relevant operational explanation in appropriate product documentation. **Disposition:** REMOVE.

### Guest experiences / reviews

**Purpose:** provide actual guest proof. **What works:** completed-stay model, masked guest identity, no invented cards in the observed empty state. **Problems:** large selling frame around an empty list (**F18 MEDIUM**). **UX impact:** highlights absent proof. **Recommended changes:** display genuine reviews when available; collapse empty promotional frame, preserving any appropriate invitation in the guest account. **Disposition:** CONDITIONAL KEEP + IMPROVE.

### Find your way here / hotel map and route guides

**Purpose:** establish location and arrival routes. **What works:** working interactive map, clear address block, real external directions mechanics, explicit demo disclosure, useful route selection. **Problems:** temporary destination and sample guides; late location priority and oversized heading rhythm (**F01 CRITICAL; F17/F21 MEDIUM**). **UX impact:** good tooling still cannot guide a real hotel arrival. **Recommended changes:** verify content, move location summary earlier, combine contact, harmonize typography. **Disposition:** KEEP + MOVE + IMPROVE.

### A little beyond Haven / featured destination, filters, list

**Purpose:** help guests assess surrounding amenities. **What works:** category filtering, search, result counts, useful no-match reset, specific route/search links. **Problems:** generic sample destinations, duplicated garden feature, disproportionate interface for four entries (**F01 CRITICAL; F32 LOW**). **UX impact:** does not provide genuine local confidence and adds substantial scroll. **Recommended changes:** verified actual places; concise list first, finder only when maintained volume warrants it. **Disposition:** KEEP + SIMPLIFY.

### Find us / contact plus photographic final CTA

**Purpose:** contact and return to booking. **What works:** tap-to-call/email protocols, map link, distinct booking action. **Problems:** no actual postal address in this block, unverified channels, deep placement, repeated slogan and scene (**F01 CRITICAL; F03/F16 HIGH; F17 MEDIUM**). **UX impact:** assistance is harder to find and property identity remains unresolved. **Recommended changes:** merge with verified location; retain one concise final availability CTA after FAQ. **Disposition:** KEEP + MERGE + IMPROVE.

### Before you arrive / FAQ

**Purpose:** remove final booking/arrival uncertainty. **What works:** four concise native disclosures; confirmation-after-verification, ID, changes, and transportation are relevant; keyboard expansion worked. **Problems:** actual times, breakfast, cancellation detail, family/access rules absent (**F07 HIGH; F24/F25/F26/F33 MEDIUM**). **UX impact:** visitors still need to ask standard questions. **Recommended changes:** answer these from maintained policy and owner facts; retain native disclosures. **Disposition:** KEEP + EXPAND.

### Footer

**Purpose:** provide durable contact, navigation, and policy access. **What works:** readable end-of-page hierarchy, useful existing navigation and booking action. **Problems:** lacks address/direct contact/policy destinations; repeats another slogan (**F03/F07/F08/F16 HIGH; F17 MEDIUM**). **UX impact:** high-intent footer visitors still lack key trust information. **Recommended changes:** verified property details and clear policy links; reduce promotional heading. **Disposition:** IMPROVE.

## 27. Proposed final page architecture

1. **Navigation:** orient with clear Rooms, Amenities & dining, Gallery, Location, Contact; retain account utility and one booking action.
2. **Property-specific hero:** real property image, verified district/city, short promise, primary availability and secondary room exploration.
3. **Availability and stay essentials:** working dates/party inputs, concise deposit/confirmation and policy access; position the overlay outside hero clipping.
4. **Brief hotel introduction:** one real reason to choose this property; fold into hero/essentials if there is too little distinct content to justify a block.
5. **Rooms & suites:** retain the four-type comparison and exact-room continuation, with clear rates/inclusions and real photos.
6. **Amenities & dining:** establish actual facilities, breakfast and relevant fees/hours. A separate restaurant section exists only if the real venue warrants it.
7. **Property gallery:** show the physical evidence behind the preceding room/facility claims.
8. **Guest reviews, when available:** genuine proof follows the hotel's own claims; omit an empty promotion.
9. **Location, directions & contact:** real destination, arrival help, call/email actions together; the location summary is already visible above.
10. **Nearby essentials:** a short useful guide tied to the real destination, subordinate to arrival.
11. **FAQ and policies:** resolve remaining practical, family, access, payment, and cancellation questions.
12. **Final availability CTA:** concise return to retained dates, after answering objections.
13. **Footer:** repeat complete verified contact/address and provide stable policy access.

Account and QR benefits become short contextual help rather than independent promotional sections. No new feature is necessary merely to fill this architecture.

## 28. UI components actually needed

| Component | Decision | Reason |
|---|---|---|
| Sticky navigation and accessible drawer | Retain and repair links | Already supports persistent booking and keyboard use |
| Date/guest availability form | Retain; repair overlay, resize, keyboard, targets | Central conversion task |
| Room comparison cards | Retain approved layout | Four types are directly comparable |
| Existing photo lightbox | Reuse for room/property gallery | Already offers full-image inspection and focus recovery |
| Amenity icon list with factual details | Retain and enrich selectively | Fast scanning without another card-heavy section |
| Guest review cards | Conditional on real content | Useful proof only when evidence exists |
| Combined map/address/directions/contact block | Consolidate existing pieces | Answers location and assistance in one place |
| Nearby list and optional filters | Keep list; scale finder to real content volume | Four entries do not demand a large search experience |
| Native FAQ accordion | Retain | Simple, keyboard-friendly disclosure already works |
| Compact booking-account summary | Improve existing handoff | Preserve room context while exposing the account task on phones |
| Floating contact button / mobile bottom booking bar | Not required by current evidence | Existing sticky header can serve booking; first add direct menu/contact access and test |
| Hero video / automatic slider / new animation system | Not required | Adds no missing hotel answer and risks competing with booking |

## 29. Priority action plan

### Phase 1 — must fix before deployment

Resolve all critical/high findings before accepting real hotel bookings:

1. **F01/F02/F03/F10:** establish real property address/pin, media, approved contacts, and verified facilities/hours. Use existing client-mode/editor facilities; maintain demo disclosures until replacement is complete.
2. **F04/F05/F06:** repair calendar clipping, route-aware booking anchors, and responsive motion positioning. Test fresh loads and desktop↔phone resize; native-input fallback must remain accessible.
3. **F07/F08/F34:** expose approved commercial/privacy/booking terms and align hold messaging with guest-details submission. Preserve server pricing, policy snapshots, and actual hold timing.
4. **F09/F13/F16:** expose account continuation on phones, publish a verified hero proposition/location, and add immediate contact discovery.

Acceptance: calendar dates and dismissal reachable at 320/390/768/1440 and short landscapes; no clipped booking wrapper after resize; Book now reaches a real form on landing/search/type routes; date/party/room selection survives navigation; phone account task visible without scrolling past a large photo; directions reach the verified hotel; no unsupported public claims or absent policy destinations.

### Phase 2 — UX and conversion improvements

Address medium findings **F11/F12/F14/F15/F17–F30/F33**: simplify the page journey, provide real gallery and missing stay/dining/family/access information, improve factual text sizes/targets, harmonize guide typography, handle larger-party intent, improve calendar semantics, optimize image roles, and measure shared style payload before moving it. Preserve the existing room-card and exact-room capabilities.

Acceptance: a first-time visitor can answer location, beds/capacity, real appearance, full rate inclusions, breakfast, arrival/departure, cancellation, contact, and booking questions without guesswork. Complete guest/account/deposit QA separately with authorized test data; this audit did not do it.

### Phase 3 — visual polish

Resolve **F31/F32** and finish focused refinements: guest-facing metadata, remove repeated nearby prominence, tighten component spacing, and keep motion brief and optional. Avoid adding decorative sections or unverified social proof.

Suggested design-skill execution order, if implementing this report: `$impeccable harden` for overlay/links/state; `$impeccable clarify` for guest copy and hold truth; `$impeccable adapt` for phone handoff/targets; `$impeccable typeset` and `$impeccable layout` for consistent facts/guide hierarchy; `$impeccable optimize` after measurement; `$impeccable audit` for verification; `$impeccable polish` last. These are recommendations, not commands executed by this audit.

## 30. Professional verdict

Scores describe the observed local page's suitability for a real hotel, using expert judgment. They are not an analytics forecast or a completed accessibility certification.

| Dimension | Score /10 | Basis |
|---|---:|---|
| First Impression | 7 | Attractive hotel composition; location/value proposition absent |
| Visual Design | 7 | Coherent room/photo/button system; guide scale and small copy need work |
| Branding | 6 | Consistent name/type mood; generic content and mixed imagery weaken ownership |
| Navigation | 6 | Sticky/drawer behavior works; misleading destinations and contact gap |
| Information Architecture | 5 | Rooms early; practical content delayed by account/technology promotions |
| Hotel Content | 4 | Many core stay answers missing or demonstration-only |
| Room Presentation | 7 | Strong factual comparison and viewer; unverified photography/inclusions |
| Booking UX | 5 | Intent survives; calendar, shared CTA, hold copy, and mobile handoff defects |
| Trust & Credibility | 3 | Real property/location/media/contact prerequisites unresolved |
| Location UX | 3 | Useful implementation with a demo destination rather than actual hotel |
| Mobile UX | 5 | Responsive cards/menu; clipping, resize, small text/controls, long account preamble |
| Accessibility | 6 | Good foundations; calendar access incomplete and full audit not performed |
| Conversion Potential | 5 | Clear rates and search entry undermined by practical uncertainty/control defects |
| Overall Professional Quality | 6 | Suitable development foundation, incomplete real-hotel presentation |
| **Overall: arithmetic mean of the 14 dimensions** | **5.4** | 75 ÷ 14, rounded to one decimal |

Technical audit health, separately from hospitality readiness:

| Dimension | Score /4 | Assessment |
|---|---:|---|
| Accessibility | 2 | Good semantics/focus foundations, inaccessible clipped calendar and unverified wider coverage |
| Performance | 2 | Several optimizations present; oversized thumbnails observed, broader payload requires measurement |
| Theming | 3 | Coherent scoped light surface and two font families; literals and separate guide roles remain |
| Responsive design | 2 | Major layouts reflow; overlay and resize defects affect booking |
| Implementation integrity | 2 | Real catalog/intent/verification mechanisms; broken anchors and conflicting hold copy |
| **Total** | **11/20** | Significant work needed; no production-readiness pass |

Implementation integrity verdict: **not yet release-ready**. The page expresses a consistent product identity and real booking data, but its functional and factual inconsistencies matter more than the empty static-detector result. A light-only landing is intentional and was not penalized for lacking dark mode.

**Production readiness: NOT READY.** After replacing demo property truth, fixing high-severity controls, and completing remaining device/authenticated/production-performance QA, reassess. This verdict concerns the guest-facing landing and entry flow, not the readiness of every hotel-management module.

### Answers to the ten final questions

1. **Five biggest problems:** (a) no verified real hotel destination, (b) non-property stock/concept photography, (c) clipped date calendar, (d) booking navigation/hold-state inconsistencies, and (e) missing readily accessible hotel/policy/contact information. Mobile resize and sign-in handoff are additional release blockers, not cosmetic notes.
2. **Five strongest parts:** (a) early four-type price/capacity/bed/size comparison, (b) functional full-photo viewer, (c) preservation of date/party/exact-room intent into account access, (d) sticky navigation with verified menu focus recovery, and (e) useful map/filter/arrival mechanisms with honest demo labeling and client-mode safeguards.
3. **Redesign first:** booking bar/overlay and mobile account continuation; then replace the hero's generic proposition and move verified location/essentials into the primary decision path. Keep the room grid.
4. **What hurts conversion:** hidden date controls, inert shared booking action, uncertainty over what is actually being booked, financial/arrival information deferred, and too much pre-location software promotion.
5. **Missing hotel information:** real address/contact confirmation, approved facility details, breakfast/inclusions, check-in/out times, cancellation/deposit summary, family/extra-bed provisions, physical accessibility, and discoverable privacy/booking terms.
6. **Remove:** operational AI/statistics promotion, redundant welcome/account/QR blocks as standalone sales sections, empty review promotion, and needless featured-place duplication.
7. **Add:** verified property facts/media, a real gallery destination, short stay essentials, complete contact/policy access, and practical family/dining/access answers inside existing sections.
8. **What makes it professional:** one consistent real property story supported by actual photos and facts; dependable dated quoting and exact-room continuation; transparent policies; direct help; readable phone controls.
9. **Good enough for a real hotel client?** As a clearly labeled concept/development demonstration, yes, with its limits explained. As a booking-ready presentation of that client's actual property, no.
10. **Before showing it to an owner:** repair calendar and route actions, demonstrate a stable phone account handoff, remove the operations pitch, explain the remaining demo assets, and obtain a concrete list of missing owner facts/photos. Do not imply production readiness while that material is missing.

## Evidence appendix

Principal files, absolute paths in this workspace:

- Landing composition: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/app/(landing-page)/page.tsx`.
- Landing layout/type: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/app/(landing-page)/landing.css`.
- Navigation: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/components/landing/landing-nav.tsx`.
- Room intent/cards: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/components/landing/booking-intent.tsx`.
- Motion: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/components/landing/landing-motion.tsx`.
- Calendar: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/components/booking/stay-calendar.tsx` and `stay-calendar.css` in that directory.
- Location: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/components/landing/location-sections.tsx`, its CSS, and `website-location.tsx` in that directory.
- Imagery: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/lib/room-images.ts`.
- Public search: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/app/(booking)/booking/search/page.tsx`.
- Numbered rooms: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/app/(booking)/booking/rooms/[type]/page.tsx`.
- Account handoff: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/components/auth/auth-vault-shell.tsx` and `auth-vault.css` in that directory.
- Reviews: `C:/Users/Mark Rowell/HOTEL-MANAGEMENT/lib/stay-reviews.ts`.

Focused test command:

```powershell
npx vitest run components/landing/landing-nav.test.tsx components/landing/landing-hero-structure.test.tsx components/landing/experience-gallery.test.tsx components/landing/location-sections.test.tsx components/landing/website-location.test.tsx components/booking/booking-search-form.test.tsx components/booking/stay-calendar.test.tsx components/booking/room-photo-lightbox.test.tsx components/booking/room-results.test.tsx
```

The 70 focused tests are component/source coverage, not a real completed booking. No tests were written to mirror these findings. Reproduce the defects in browser first when implementing fixes, then add meaningful behavior coverage at the appropriate layer.

One verified reference drift was found: `SYSTEM.md` §7.1 described dummy review fallback, while current `getPublishedReviews()` returns an empty list and the page renders an empty state. The audit corrects that description only; it does not change review behavior. Other pre-existing documentation and working-tree changes are preserved.

## Recommended redesign blueprint

| Order / section | Main content | CTA placement / component | Desktop behavior | Mobile behavior |
|---|---|---|---|---|
| 1 · Navigation | Property brand; five clear guest destinations; account utility | Separate Check availability; accessible sticky nav/drawer | Compact links and one primary action | Protected wordmark, booking action, menu with Contact/call |
| 2 · Hero | Actual property image, verified location, concise factual promise | Primary availability, secondary View rooms | Editorial image/copy arrangement retained | Short two-line headline; readable supporting sentence; no overlapping controls |
| 3 · Availability + essentials | Dates, guests, current booking/policy explanation | Working form; policy link; overlay outside clipping | Compact form; calendar positioned within available viewport | Stacked touch-sized fields; accessible date presentation with native fallback |
| 4 · Property introduction, if distinct | One approved reason to choose this hotel | Optional location/amenity text link | Brief editorial text, not another generic card row | One concise paragraph; merge above if redundant |
| 5 · Rooms & suites | Four types, beds/size/capacity, real photos, from rates, inclusion link | Choose a room on each named type; existing viewer | Approved 2×2 comparison retained | Stacked cards with readable facts; retained dates/party |
| 6 · Amenities & dining | Actual included/paid services, breakfast and useful hours | Relevant details/contact; factual icon list | Compact amenity rhythm plus real facility photo where useful | Readable labels and expandable practical detail |
| 7 · Gallery | Real exterior, rooms, bathrooms, lobby and verified facilities | View all photos; reuse full-photo viewer | Concise categorized photo composition | Thumb-friendly categories/viewer; no automatic slide changes |
| 8 · Reviews, conditional | Actual completed-stay reviews with attribution | Optional availability after real proof | Compact review group only when populated | Readable vertical content; no empty promotional section |
| 9 · Location + contact | Real address/map, entrance notes, useful arrival origins | Get directions, Call Front Desk, email together | Address/contact beside bounded interactive map | Address/actions first; lazy map; route details below |
| 10 · Nearby essentials | A few verified places relevant to the real hotel | Directions per place; finder only when justified | Short list; avoid duplicated featured entry | Compact list before any optional expansion |
| 11 · FAQ + policies | Arrival/departure, breakfast, family/access, deposit, cancellation | Explicit policy/contact links; native disclosures | Two-column intro/answers where space supports it | Single readable accordion column and full-width actions |
| 12 · Final booking action | One concise invitation informed by answered questions | Check availability returning to retained stay intent | Small distinct closing band | Clear action without an additional persistent overlay |
| 13 · Footer | Verified property/contact/address; navigation and approved policies | Booking, directions, phone/email, policy links | Balanced factual columns | Stacked groups; direct contact before secondary links |

Preserve the approved exact-room selection after type choice. At the account step, carry the room/date/price context into a compact summary with immediately accessible sign-in/create-account controls. The finished experience should help a guest establish the real property, compare a suitable room, understand the terms, and continue booking confidently.
