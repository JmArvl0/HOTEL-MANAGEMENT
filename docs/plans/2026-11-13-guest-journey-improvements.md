# Guest journey improvements — implementation plan

Date: 2026-11-13 · Breakfast Phase A1 is implemented locally for Haven. Other phases remain proposed.

## Outcome and scope

Help a guest understand the price, finish authentication without losing their
selection, compare rooms, understand booking changes, and prepare for arrival.
Preserve Haven's ivory/navy/gold Inter/Playfair system and existing hotel workflows.

This plan covers the five original guest-facing improvements plus the breakfast
offer selection requested on 2026-11-13. It is
based on the current working-tree source, not a completed browser audit. The
earlier browser attempt timed out and Windows Computer Use stopped because it
could not determine the current browser URL confidently. The accompanying
Current/Proposed previews are schematic source reconstructions, not screenshots.
Their amounts, dates, room facts and policy examples are illustrative fixtures.

The breakfast implementation covers Haven offer publishing, booking and deposit
pricing, date-specific entitlement, the guest QR and PNG, and Front Desk lookup
and service recording. The restaurant team owns its own POS and scanner UI.
The Haven endpoint is disabled until onboarding. See the
[restaurant handoff](../integrations/RESTAURANT_BREAKFAST_HANDOFF.md) for the
wire contract, acceptance cases and message to send after setup.

## What already exists, and the actual remaining work

| Area | Verified current implementation | Proposed change |
| --- | --- | --- |
| Price | `BookingStaySummary` is shared by details, review, payment and confirmation. It accepts deposit/balance and nightly lines. Review shows deposit separately in `ReviewDepositTiles`. Selection shows a stay estimate; payment passes deposit and remaining balance into the summary. | Use a consistent financial hierarchy from selection onward. Pass the appropriate authoritative figures at each stage. Replace the hardcoded zero-tax/service-charge sentence with accurate policy/snapshot copy. |
| Account handoff | Public browsing exists. Selecting an exact room sends a logged-out guest to login. `callbackUrl` preserves room/dates/party through login, registration and OTP. Profile/owned-hold data prefills details. | Preserve this flow. Add the booking context to OTP, normalize booking-mode links and recovery paths, and verify interruption behavior. Do not introduce an earlier login gate. |
| Room choice | Cards already show beds, capacity, area, amenities and photos. Exact rooms expose floor and effective amenities, including physical-room additions/exclusions. | Add a compact comparison using existing facts. Clarify standard amenities versus room-specific differences. Show unknown facts honestly. |
| Booking changes | Cancellation preview, required reason, explicit final confirmation, automatic eligible refund request, and open-change status already exist. The exact-room screen already links to booking policies. | Surface a concise policy summary in review before payment and make existing request/refund progress easier to find. Keep all existing safeguards. |
| Arrival | Reservation detail already shows check-in/out times, balance, digital pass, policy information, and a Transportation tab. | Bring arrival essentials together above the detailed tabs, with published directions/contact and links to the existing transportation/payment views. |
| Breakfast offer | Website Content has global breakfast information, price and hours. Existing rate plans resolve nightly room rates; they are not a guest-selectable meal-package catalogue. | Add a structured Room only / Room with breakfast choice, server-priced and saved with the booking, with exact guest coverage and serving dates. |

Important correction to the preliminary feedback: these are primarily consistency
and discoverability improvements, not five missing modules.

## Shared design and data rules

- Keep existing routes, navigation, photo viewer, shared controls and responsive
  shell. Extend existing components before adding new ones.
- Guests can browse publicly. Authentication remains required before protected
  guest details/hold submission. The room is not held during account creation;
  the hold starts after successful guest-details submission.
- Before a hold, show a dated estimate from server-side availability and the live
  deposit policy. Once a hold exists, use its frozen rates, total and policy
  snapshots. After reservation creation, use the reservation/folio/payment state;
  do not replace the actual balance with `total - required deposit`.
- Reuse `calculateReservationDeposit`, `getRoomType`, rate-plan logic and the
  existing snapshot helpers. No second browser-side pricing engine. Display
  varying nightly rates individually; do not imply every night has the average
  rate. Keep centavo rounding and fixed-deposit caps.
- Breakfast opening hours or the global dining flag do not prove a specific
  offer includes breakfast for a particular party. Existing room amenities are
  not a structured meal entitlement. Show verified offer inclusions only;
  otherwise use "Breakfast inclusion not specified for this offer" until Phase
  A1's explicit offer data is available. Do not
  invent extra-person pricing or accessibility guarantees.
- Preserve historical amenity/policy snapshots. Current published address,
  phone, email and directions are operational contact information; fetch them
  through existing published-content server readers. Do not hardcode Makati,
  mock phone numbers or a real-client location.
- Deposit proof submitted does not mean paid or confirmed. Manager approval of
  a booking change does not mean the new stay has been executed. Transportation
  requested does not mean scheduled. Reflect those differences in every preview
  and implementation state.

## Implementation sequence

### Phase A — consistent price and policy presentation

**Work:**

1. Inventory the existing summary callers and document which values they can
   authoritatively display before hold, during hold and after conversion.
2. Extend `BookingStaySummary` with presentation props for estimate/frozen/folio
   context, truthful tax/service-charge copy, inclusions and payment timing.
   Leave calculation and data fetching on the server.
3. In exact-room selection show stay estimate, required deposit estimate and
   balance estimate together near the primary booking action. With no dates,
   retain the base-rate "From" state and omit deposit/availability claims.
4. Pass deposit and remaining amounts into details/review consistently. On review
   remove or simplify duplicate deposit blocks so one clear amount is primary.
   Preserve legacy transport lines, frozen nightly rates and existing discounts
   wherever applicable. No new transportation sale. Breakfast selection and its
   charge follow the separately specified Phase A1 below.
5. Add a concise "Changes and cancellations" disclosure beside the review
   action, derived from the hold's frozen operational policy and deposit policy.
   Keep full policy/terms links and existing payment acknowledgements.
6. If live price/availability changes before the hold, show the updated summary
   and require the guest to review it. Never silently commit a different price.

**Main targets:** `components/booking/booking-stay-summary.tsx`,
`components/booking/booking-review.tsx`, the exact-room/details/review/payment
pages, `lib/public-booking-information.ts`, and scoped guest-booking styles.

**Done when:** the same hold shows the same total/deposit/balance in review and
payment; estimates are labelled; fixed and percentage deposits, varying rates,
disabled deposits, unknown inclusions and nonzero policy percentages have truthful
copy. No tax amount or breakfast benefit is inferred from incomplete data.

### Phase A1 — breakfast offer selection (added user scope)

**Plain-language behavior:** after selecting a room and dates, a guest can choose
Room only or Room with breakfast when the hotel publishes both. The room itself
and its inventory claim are the same; only the meal entitlement and price change.
If the room's offer already includes breakfast, show that coverage without adding
another breakfast charge. If there is no room-only offer, do not imply that
declining breakfast creates a cheaper rate or an automatic refund.

**Proposed first version, for hotel-policy review:**

- Offer an optional breakfast add-on for all booked guests on every covered
  morning. Default to Room only when the add-on costs extra; no preselected paid
  add-on. Display the covered guest count before selection. Use one explicitly
  published per-guest price; do not infer adult/child discounts from a guest count.
  If differentiated child pricing is required, collect the necessary party ages
  and define pricing rules before offering it. Partial-party and selected-day
  breakfast purchases are later extensions, not hidden assumptions.
- Proposed serving dates are the hotel-local mornings after each booked night:
  for a 20–22 November stay, 21 and 22 November. The checkout morning is covered;
  check-in morning is not. Validate the published serving calendar for those
  dates. A disabled/closed/unavailable morning must be explained before purchase;
  do not silently sell fewer meals. A different service calendar must show its
  actual dates and recomputed price before confirmation.
- Example fixture only: room ₱2,500 × 2 nights = ₱5,000. Breakfast ₱450 × 2 guests
  × 2 mornings = ₱1,800. Room with breakfast = ₱6,800. Under a sample 30% deposit
  policy the deposit is ₱2,040 and remaining balance ₱4,760. Room only remains
  ₱5,000 / ₱1,500 deposit / ₱3,500 remaining. These are not adopted hotel prices.
- Show breakfast service hours, venue, number covered, serving dates and included
  versus additional charge together. "Breakfast included" does not mean unlimited
  people or that every room offer includes it. A meal package does not increase
  room occupancy. Breakfast sold at the restaurant after check-in follows its
  own hotel-defined availability and price; a room-only guest has no entitlement
  until that separate purchase is recorded.

**Implementation work:**

1. Define structured, versioned, publishable breakfast offer data scoped to room
   type/offer and effective dates: unavailable / optional / included, unit price,
   covered guests/quantity rule, serving calendar/hours/venue, tax treatment and
   modification/cancellation/no-use terms. Manager proposes and Admin approves
   commercial prices using the existing rate-governance ownership pattern;
   Website Content describes published truth rather than authorizing charges.
   Confirm ownership against SYSTEM.md before implementing; no new permission
   is granted by this plan. Avoid overloading existing seasonal/day-of-week room
   rate plans with a meal choice they do not currently represent.
2. Verify the live migration ledger, then add SQL extending authoritative
   pricing, holds, reservations and offer snapshots. Migration
   `20261113030000_hotel_breakfast.sql` follows verified live `20261113020000`.
   Apply only through the coordinated rollout. Existing/historical
   bookings without a meal snapshot remain unknown/room-only only when supported
   by their actual data; do not retroactively promise breakfast.
3. Add the selector to the exact-room/guest-details journey. Preserve an offer ID
   through login/register/OTP and safe navigation. Client inputs identify a
   choice only; the server validates price, eligibility, guest count and service
   dates, including an offer changed or unpublished during authentication.
4. Extend the atomic hold pricing path, including `create_exact_booking_hold`
   and its delegated pricing RPC, to record room subtotal, breakfast line,
   entitlements/dates, combined total and frozen offer/policy snapshot together.
   Reuse the current deposit rule on the combined eligible total; if the hotel
   wants a separate deposit basis, that requires an explicit policy decision.
   Do not accept a browser-supplied breakfast amount or update totals after
   creating a hold in a second, race-prone step.
5. Carry the same frozen breakdown through manual deposit and gateway conversion,
   reservation, folio, receipts, confirmation and Before you arrive. Apply the
   existing hold expiry, room locking, ownership, amount checks and idempotency.
   Ensure breakfast enters accounting once, including any existing discounts
   and tax-inclusive/exclusive basis. Website content changes do not reprice
   an existing hold or reservation. The preview's arithmetic is illustrative;
   production estimates and charges still come from server-side pricing.
6. The first version blocks automated repricing of breakfast stays through legacy
   room-only amendments. Guests are directed to Front Desk for options. Existing
   cancellation policy still applies to the booked total/deposit, with no separate
   unused-meal refund. Breakfast-aware amendments require the date, guest count,
   price and entitlement to be updated together in a future phase.
7. Front Desk and Managers can verify a guest's code or read a saved PNG in
   Haven Breakfast service. They explicitly record the number served. The same
   SQL handles future outlet calls and concurrent requests. The external team
   owns its scanner and restaurant UI. The restaurant operations concept from
   the design preview is reference material for their team.

**Main targets:** published offer configuration and its governance UI, relevant
`supabase/migrations` pricing/hold/conversion functions, `lib/booking.ts`,
`app/api/booking/holds/route.ts`, exact-room/details/auth context,
`BookingStaySummary`, confirmation/reservation/folio/receipt rendering and a
the authorized hotel breakfast service view. The settled payment receipt keeps
its existing payment amount. The booking and reservation details show the
breakfast breakdown alongside the total.

**Dedicated breakfast QR and guest entry (UI proposal, 2026-11-13):**

- Guest path: **My Reservations → select the stay → View breakfast pass**.
  Place a visible breakfast section beside arrival essentials, separate from
  the existing Digital Express Pass. Proposed owned route:
  `/my-reservations/[id]/breakfast`. A reminder may deep-link to this protected
  page; it should not expose the pass token in email or public links.
- Use a dedicated breakfast-purpose QR, never the existing check-in token.
  Scope it to the owned reservation and service date; the QR encodes an opaque
  reference, not guest names, prices or a receipt. One date-specific allowance
  can cover two guests, including separate arrival and partial consumption.
  Server validation, not the image or screenshot, determines eligibility.
- Pass UI shows venue/hours, date, room when assigned, covered quantity, used
  and remaining meals. States include ready, partially used, fully used,
  upcoming, no breakfast entitlement, ineligible reservation and unavailable
  verification. Upcoming dates show their allowance and future validity;
  room-only/pending/ineligible states never pretend to offer redeemable meals.
- Add an optional **Download pass image** PNG action near the QR with "Save a
  PNG, or show this screen" copy and a preview of the actual saved image. Each
  service date has its own file containing venue, date, service hours/timezone,
  room/reference, covered guest count and the same purpose-bound QR for that
  date. Upcoming confirmed meal entitlements can be saved in advance; their
  tokens still fail validation outside the authorized service date/window.
  A download does not redeem, extend validity or guarantee restaurant access.
- The saved image is a static entitlement document. Do not print a live
  "remaining meals" or "ready now" claim onto it. Restaurant verification
  remains authoritative after partial use, cancellation or entitlement changes.
  Use stable date-scoped references suitable for saving rather than silently
  rotating the token on every view/download. Any required revocation/reissue
  invalidates earlier references on the server even if the image remains saved.
  Hide the download action for closed/ineligible/fully consumed current passes;
  valid future dates remain independently downloadable. No auto-download.
- Generate the PNG from one server-authoritative pass document, not a screenshot
  of the portal: preserve QR quiet zones, readable type and a clear service date;
  omit unrelated personal/financial data. Follow the current download-menu/image
  renderer patterns where useful, while keeping the breakfast image distinct
  from the check-in QR-only export. Verify QR decoding in the generated image
  and after realistic phone resizing. Handle generation failures truthfully;
  trigger download only on the guest's explicit action. PNG download on mobile
  must not claim it automatically saved into Photos.
- Restaurant scanning is a read-only entitlement check. A separate staff
  confirmation records the chosen number of diners in an authorized atomic,
  idempotent operation. Require fresh verification after a redemption. Scope
  the integration to meal information and approved restaurant operations;
  token possession is not staff authorization. Invalid check-in/wrong-date
  tokens cannot redeem meals. Cancellation or entitlement changes invalidate
  old allowances/tokens as defined by the booking lifecycle.
- If the restaurant is a separate system, use a least-privilege server API to
  Haven's authoritative entitlement record. Do not share service-role database
  credentials or duplicate the meal counter independently. Failed verification
  or an uncertain redemption response must not silently claim success; use the
  defined reconciliation/fallback flow. This proposal creates no integration.

The premium preview includes guest reservation entry, a photographic green/ivory
breakfast ticket, date selection and the matching restaurant lookup/confirmation
screen, plus date-specific downloadable PNG pass samples. Existing generated
breakfast art is disclosed as illustrative. Its QR
contains harmless design-preview text and cannot redeem a real meal. Browser
layout/camera/backend redemption remain unverified; local interactions alone
do not prove production authorization or concurrency.

**Hotel acceptance:** Room only adds zero meal charge. Optional choice adds the exact
published guest/morning quantity; included packages never charge twice; changes
survive auth and hold conversion; snapshot totals agree with payment/folio;
the offer covers the full service date range and preserves its original price
after publication changes; staff can verify date-specific entitlements without
duplicate redemption. The current offer uses one rate for all booked guests and
a contiguous daily service calendar. Child rates and selective days are outside
this version. Hotel setup and browser QA remain release steps.

### Phase B — booking continuity through authentication

**Work:**

1. Keep the validated internal callback as the navigation source of truth.
   Continue using `safeInternalPath`; never trust browser-saved room IDs/prices.
2. Use the existing `bookingAccountContext` on booking-related OTP screens as
   well as login/register. Make all login/register/retry links retain booking
   presentation consistently. Currently OTP explicitly uses `booking={false}`,
   and the register footer's login link omits `booking=1`.
3. Preserve compact room/dates/party information and the "hold starts after
   guest details" explanation. Offer Change room or dates without clearing the
   selected stay unexpectedly. Keep existing registration fields/security.
4. Exercise refresh, back, login/register switching, resend, expired OTP and
   registration-success/sign-in-failure recovery. Revalidate the room when
   returning to details; sold-out selections return to room choice with the
   original dates/party and an explanation.
5. Optional enhancement after those checks: offer "Resume your selected stay"
   on the same browser tab using a versioned, expiring session draft containing
   only room/type/dates/party. No password, OTP, personal details, payment proof,
   price guarantee or hold token in that draft. Clear invalid/stale drafts and
   clear after successful conversion. URL callback recovery remains functional
   when storage is unavailable. Do not add this storage if existing navigation
   already satisfies the agreed interruption scenarios.

**Main targets:** `app/(auth)/login/page.tsx`, `register/page.tsx`,
`verify/page.tsx`, `components/auth/booking-account-context.tsx`,
`auth-vault-shell.tsx`, `register-form.tsx`, `login-form.tsx`, `verify-form.tsx`.

**Done when:** a selected room, date pair and guest count survive the supported
auth round trip; expired/invalid auth and unavailable-room paths offer recovery;
the UI never claims account creation reserves inventory.

### Phase C — room comparison using existing facts

**Work:**

1. Add "Compare room types" to discovery and a small comparison view for up to
   three selected types. Desktop uses aligned rows; phone stacks each factual
   attribute with its room name. Clear comparison selections remain local.
2. Show bed configuration, capacity, area when configured, effective amenities
   and estimated stay price for the same dates/party. Keep images labelled as
   representative; existing exact-room cards reuse type photography.
3. In physical-room selection emphasize verified differences such as floor and
   effective amenity additions/exclusions. Avoid repeating the entire type
   description on every card. Keep unavailable rooms visible and disabled.
4. Where the model has no structured accessibility or extra-person rules, omit
   a claim or provide a contact path. Do not mark an unknown feature "No".

**Main targets:** `components/booking/room-results.tsx`, `room-details.tsx`,
`app/(booking)/booking/rooms/[type]/page.tsx`, shared discovery callers,
`lib/room-amenities.ts` and scoped styles.

**Done when:** comparison preserves dates/party, does not promise inventory before
hold, clearly distinguishes missing data, and respects physical-room exclusions.
No schema change is required for this existing-facts comparison.

### Phase D — changes, refunds and arrival in reservation details

**Work:**

1. Keep Change reservation and Cancel reservation in the existing detail header.
   Add a compact policy explanation near them using that booking's snapshot.
   Link directly to the existing policy, active change and refund sections.
2. Retain existing cancellation preview/final confirmation and required reason.
   Preview loading/failure disables consequential submission as appropriate.
   Final mutation still recomputes eligibility server-side. No separate refund
   request button is introduced.
3. Present change progress with honest state labels: Under review, Approved —
   awaiting update, Change completed, Declined. Preserve the single-open-request
   guard, idempotency, staff execution and transportation constraints.
4. Add a focused `BeforeYouArrive` section for confirmed/upcoming reservations:
   check-in/out and ID/age from policy snapshot, current actual balance from
   the folio, published address/directions/contact and linked transport status.
5. Load published website/location data in the existing server page, passing a
   minimal serializable view model into the client view. Reuse
   `getPublishedWebsiteContent`, `getPublishedLocation`, `hotelDirections` and
   current transportation display mapping. No browser database reads.
6. A pending stay gets a booking/payment next-step message, not an arrival-ready
   pass. Checked-in stays get departure essentials. Cancelled/no-show/checked-out
   stays retain appropriate history/refund/review states without arrival prompts.
   Missing published contact/location and failed reads have honest fallback copy.

**Main targets:** `components/customer/reservation-detail-view.tsx`,
`reservation-actions.tsx`, `app/(booking)/(customer)/my-reservations/[id]/page.tsx`,
`lib/public-booking-information.ts`, existing published-content readers and scoped
customer-portal styles. Add one small arrival component only if it improves reuse.

**Done when:** a guest can find arrival time, ID requirement, actual balance,
contact, directions and transportation state without hunting through tabs. The
new summary does not contradict existing folio, QR or request/refund records.

### Phase E — optional, separate product changes

**Choose a room for me:** not part of the core consistency work. Exact-room
selection is an approved current journey. If this option is accepted later, the
server selects a continuously available physical room of the chosen type, passes
the resulting exact `roomId` through the existing flow, and uses the existing
atomic exact-hold path. Never choose solely on the client or silently replace a
room already selected by the guest. If the choice becomes unavailable, explain
and ask the guest to choose/retry. Add concurrency/amenity-equivalence checks.

**Other structured inclusions/accessibility/extra-person rules:** optional
data work if the hotel needs precise, editable commitments. Define ownership,
offer scope, effective dates, publication and immutable booking snapshots first.
Breakfast is now explicitly covered by Phase A1 rather than this deferred item.
Verify the live migration ledger before choosing a new additive migration
number. Do not push held unrelated migrations or run `npm run migrate`.

## UI specification and review previews

The conversation preview includes six Current/Proposed screen comparisons:

| Screen | Current reconstruction | Proposed |
| --- | --- | --- |
| Price & review | Existing stay card plus separate deposit tiles | One financial summary with deposit/balance, honest inclusions and nearby policy disclosure |
| Account & OTP | OTP challenge with callback preserved but no booking-context panel | Same verification with room/dates/party and clear inventory-hold timing |
| Room choice | Exact-room facts repeated in separate cards | Aligned facts and emphasized physical-room differences; type-comparison entry |
| Changes | Existing actions and open-request status; policy in another tab | Same actions plus immediate summary and review/approval/execution distinction |
| Arrival | Facts distributed across Stay, Policy, Transportation and folio strip | Arrival essentials gathered above those existing detailed views |
| Breakfast offer | Global optional-breakfast description and hours, without a booking meal selector | Room only / Room with breakfast radios, covered mornings/guests and updated total/deposit/balance |

Use 44px minimum mobile controls, visible keyboard focus, native disclosures,
readable 16px body copy and proper headings. Desktop can pair content and stay
summary; mobile places the compact price/selection summary before long forms.
No fixed action may cover form errors, policy copy or the phone keyboard. Preserve
reduced motion. Design at 1440/768/390/320px, including long room names and errors.

## Verification and release gates

Planning/prototype validation is separate from application acceptance. Do not
report a planned check as passed.

1. Meaningful domain/component tests for fixed/percentage deposit rounding,
   frozen versus live policy, varying nightly rates, unknown inclusions and
   before/after-hold display. Reuse existing tests; avoid tests that merely copy
   markup or mock away the pricing/ownership behavior under review.
2. Auth navigation tests for valid/suspicious callbacks, login/register/OTP,
   retry/back/refresh, unavailable exact room, and expiry. No removal of OTP or
   server ownership checks. Do not automate real account creation/payment.
3. Reservation tests for pending/confirmed/checked-in/terminal states, paid
   versus proof submitted, actual folio balance, unknown address/contact,
   requested versus scheduled transport, and approved-but-unexecuted changes.
4. Run `npm run typecheck`, ESLint on touched files, targeted Vitest, then full
   `npm test` and `npm run build` at implementation checkpoints using the
   supported Node version in package.json. No application checks are required
   for this documentation/prototype-only deliverable.
5. Real-browser/manual QA: desktop/tablet/phone widths, keyboard-only navigation,
   focus restoration, summary wrapping, nightly-rate disclosure, long content,
   slow/error reads and interrupted booking. A Playwright config and scripts
   exist, but installed browser/runtime readiness must be checked before claiming
   automation is available; AGENTS.md currently warns about runner limitations.
6. Phase A1 additionally requires integration checks on real controlled,
   disposable DB data: no meal/double charge, included versus optional offers,
   guest and date changes, child-policy boundaries, serving-date closures,
   stale offer versions, fixed/percentage deposits, tax/discount composition,
   manual/gateway retries and duplicate meal redemption. Do not simulate away
   atomic pricing or settlement. Phase E room allocation also needs concurrency
   coverage if accepted. Existing locking/settlement protections must survive
   any financial changes. No database write/deploy is authorized by this plan.

Review and deploy Phase A1 through the hotel rollout in the restaurant handoff.
Phases A, B, C and D remain proposed outside the breakfast changes described
above. Evaluate E independently. The restaurant connection has its own sandbox
acceptance and enablement steps.
