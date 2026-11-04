# HAVEN landing page — current and proposed

Local design study, November 3, 2026. Production landing components are unchanged.

## Current — V4 hotel reference study

User requested research of existing hotel landing pages. Reviewed seven accessible
official sites plus limited indexed Ace Hotel content. Scope, observed patterns,
source links and limits are in [hotel-reference-study.md](hotel-reference-study.md).
This is a representative review, not a claim to have audited every hotel site.

Current proposal opens with a two-part photographic hero, clear booking form and
dedicated interactive room-finder section. Earlier directory-first/collage V3 is
retained at `landing-proposed-v3.html`. No competitor assets or claims were copied.
Verified 1440/768/390px layouts with no horizontal overflow, Ocean Suite selection
updates its details/rate/link, and mobile menu/Escape works. Syntax and ESLint pass.
Production remains unchanged. No full app build/test rerun for this static study.

## Latest — room-first photographic design

The user rejected the cinematic V2 as generic, then found the initial room-directory
revision too plain. Current V3 uses warm paper/forest/copper tones, a large room
photograph, a smaller pool photograph layered into the composition, and four
thumbnail room selectors. Selecting a room updates the main image, name, capacity,
rate and search link together. The headline is “Make yourself at Haven.”

V1 and V2 are retained as `landing-proposed-v1.html` and
`landing-proposed-v2.html`; the current URL stays `landing-proposed.html`.
The current/proposed comparison screenshot has been refreshed. All imagery and
rate caveats remain. Mobile includes a direct Dates & guests link and account
access in the menu. The user has not approved this revision for implementation.

Checked desktop and mobile rendering with no horizontal overflow, and tablet
layout before the richer photographic refinement. Verified selecting Deluxe King
shows its name, ₱6,400 rate and matching search link. Generator/shared JS pass
ESLint and syntax checks. Production landing remains unchanged.

## Revision 2 — cinematic minimalism

The user requested a fresh redesign using UI/UX Pro Max, Impeccable and the taste
skill. The current proposal is V2: a deep-ocean canvas, centered hotel identity,
wide cinematic hero photograph, monumental HAVEN headline and warm ivory booking
bar. Rooms use larger staggered imagery; experience content reverses the first
proposal's composition. Amenities and FAQs stay on the continuous dark ground.
The account preview has a single quiet surface rather than nested card frames.

UI/UX Pro Max's hotel guidance matched the product; its glass effects and
testimonial pattern were not adopted because they conflict with the minimalist
brief and the absence of supplied verified review copy. Its minimalism guidance
informed the grid, contrast, clear forms and reduced-motion behavior. The taste
direction is name-as-monument; Impeccable informs restraint and visual QA.

The first proposal is preserved at `landing-proposed-v1.html`. The comparison
now shows the genuine production baseline beside V2. Original sections below
describe the initial analysis and first proposal; factual content limits still
apply. No production design reference or landing component has changed.

V2 checked in the browser at 1440/768/390px with no horizontal overflow. Room
navigation, experience switching and mobile menu/Escape were rechecked. New
generator/shared prototype JS pass ESLint and syntax checks. Desktop booking form
ends around 817px in a 1000px viewport; mobile around 716px before the final small
type refinement. All four rooms, eight amenities and four policy FAQs remain.

## Findings from the running page and source

- The hero simultaneously presents an eyebrow, main heading, serif subheading,
  body slogan, secondary link, decorative slogan, and booking form. These compete
  for attention. The strong background image loses clarity under its white wash.
- Room names, capacity and rate information are useful. Four similarly weighted
  cards make the collection feel compact. Deluxe King and Executive Suite reuse
  the same fallback photograph; real distinct room photos would improve confidence.
- Eight amenity tiles, portal promotion, service cards, technology statistics,
  reviews, contact and FAQs create a long sequence of similarly styled blocks.
- The technical paragraph names Gemini, forecasts and inventory operations. These
  are implemented capabilities, but are less relevant to a guest choosing a stay.
- Room pricing and policies must retain their existing database-backed behavior.
  Nothing in this prototype changes confirmation, deposits, staff review or access.
- Existing imagery is explicitly stock/illustrative in `lib/room-images.ts`.
  Contact details are retained from source, not independently verified. No precise
  location, rating, testimonial, award or promotion has been invented.

## Direction

Use the HAVEN name's promise of breathing room as the page's composition: quiet
ivory space around unevenly sized photographs, with a clear place for each action.
Preserve the established coastal ink/teal and Playfair/Inter type pairing. Chosen
from the frontend skill's three directions: uneven photographs, rather than a dark
gallery or oversized wordmark, because guests need clear date search and room detail.

The first screen explains the stay, shows existing illustrative photography,
and makes dates and guest count easy to enter. Rooms follow immediately. The
experience switcher demonstrates morning, afternoon and evening rather than
adding decorative motion. Amenities, account benefits, policy FAQs and contact
complete the journey. Published reviews may be retained in implementation only
when genuine review data is available; no reviews were authored for this study.

## Content and scope

- Rooms/rates captured from the running page: Garden Twin ₱5,800; Deluxe King
  ₱6,400; Ocean Suite ₱8,900; Executive Suite ₱11,600, per night. These are snapshot
  values, not availability or confirmed quotes. Production must use live data.
- All four rooms, eight amenities and four existing policy FAQs are represented.
- Booking form submits the current `checkIn`, `checkOut`, `guests` query contract
  to `/booking/search`. Submitting performs a search, never a booking/payment.
- Experience images and room images reuse the existing source URLs. Imagery is
  illustrative and must be replaced by verified property photographs for launch.
- Proposed descriptive headlines/body copy are design suggestions. Original
  reservation-policy answers and service caveats are preserved.
- Local self-hosted font files are copied from existing Next development assets.
- Only files under `public/prototypes/` and session memory are added/updated for
  this task. No landing implementation or site-wide design reference is replaced.

## Preview

- Comparison: `/prototypes/landing-comparison.html`
- Full proposal: `/prototypes/landing-proposed.html`
- Current page: `/`

The comparison uses genuine same-size desktop screenshots of the current page
and proposed prototype. It supports side-by-side and individual views.

## Verification

- Browser reviewed the proposed page at 1440, 768 and 390px. No horizontal page
  overflow; measured section headings remain within two lines at tablet/mobile.
- At 390px the complete booking form ends around 808px in an 844px-high viewport.
- Room next navigation moves the collection; previous becomes available.
- Selecting Afternoon updates the image, description and pressed button state.
- Date/guest selections propagate to room-search links. Selecting November 10
  sets checkout's minimum to November 11; November 10–12 / 3 guests are retained
  in the room-search query.
- FAQ expands to the unchanged deposit-confirmation policy. Mobile menu opens
  and Escape closes it and returns focus to its button.
- Comparison individual/side-by-side controls work; both screenshots load at
  matching dimensions with no cropping or page overflow.
- `node --check` and ESLint pass for the new JavaScript and generator.
- Confirmed no changes to production landing components, CSS or image mapping.
  No full app test/build rerun: this deliverable is an isolated static prototype.
