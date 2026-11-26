# Guest UI, usability and accessibility audit

November 24, 2026 · [Audit index](GUEST-EXPERIENCE-AUDIT.md) · [Test results](GUEST-QA-TEST-RESULTS.md)

## Visual assessment

The desktop landing page establishes a distinct hotel identity through room photography, editorial typography, an Ermita location cue and a prominent date planner. The 390 px composition keeps the headline readable, retains the two-date layout and puts the primary search action in the first screen. The gallery, amenities, dining, location, FAQ and contact are separate points in the landing-page journey. Keep those landmarks and the visual relationship between landing and room search. The current sample names and photography are development content. [Desktop](evidence/2026-11-24-guest/landing-desktop.png) · [Mobile](evidence/2026-11-24-guest/landing-mobile.png).

Guest authentication retains the booking context and supplies a clear account path. Mobile gives the full reservation summary precedence over the authentication controls. Once signed in, My Stay prioritizes a current or upcoming stay, its status, actions and a payment summary. The condensed header and wide Express Pass layout need the most attention on phones. [Authentication](evidence/2026-11-24-guest/booking-sign-in-mobile.png) · [My Stay in dark mode](evidence/2026-11-24-guest/my-stay-dark.png).

## Detailed findings

### GUEST-002

**Online checkout availability is communicated too late and contradicts the CTA.** Exact-room selection · UX / functional accessibility · High · P1 · Small · Confirmed with checkout disabled.

**Evidence and steps** Search a sellable stay while online checkout is unavailable. Open the exact-room page. The room and summary say Available, the card action says Unavailable, and a separate message tells the guest to contact Front Desk. The message has no direct contact action. [Room evidence](evidence/2026-11-24-guest/checkout-unavailable.png) · [Exact-room UI](../../app/%28booking%29/booking/rooms/%5Btype%5D/page.tsx#L38).

**Expected / impact** Guests should be able to distinguish room availability from the booking channel and act on the restriction. The current combination makes a genuinely available room look sold out and leaves the guest to locate help.

**Root cause / fix / acceptance** Inventory state and checkout eligibility share the card action fallback. Keep the inventory badge accurate, surface the booking-channel restriction earlier, and provide Contact Front Desk beside the disabled action. With offline checkout, verify that an available room has a working assisted-booking path and a sold-out room still reads Unavailable.

### GUEST-003

**The privacy destination opens the booking policy.** Public footer/direct privacy route and registration · Privacy / missing information · High · P1 · Medium · Confirmed.

**Evidence and steps** Open `/privacy` signed out. It lands at `/booking-policy` and displays deposit, arrival and cancellation guidance. Open the account form. The booking-auth footer links the booking policy only. [Destination](evidence/2026-11-24-guest/privacy-destination.png) · [Privacy redirect](../../app/%28landing-page%29/privacy/page.tsx#L3) · [Auth footer](../../components/auth/auth-vault-shell.tsx#L80).

**Expected / impact** Guests should be able to read a property-approved privacy notice before entering their email and phone, and revisit it from public and account help. Booking rules leave guests without an explanation of how Haven handles their information.

**Root cause / fix / acceptance** `/privacy` is an alias for the booking policy and the registration shell has no privacy destination. Publish approved privacy copy under a dedicated URL, link it from registration, the public footer and account help, and verify the links in signed-out and authenticated views. Keep service-specific consent beside the applicable choices.

### GUEST-004

**A variable rate is written as a fixed nightly rate.** Room search and exact-room comparison · Pricing UX · High · P1 · Small · Confirmed.

**Evidence and steps** Search the local two-night stay priced at ₱2,500 and ₱3,900. The same card shows “2 nights · ₱2,500 / night” and “₱6,400 estimated total.” The stay total is correct. Exact-room cards consume the same minimum as a per-night value. [Browser evidence](evidence/2026-11-24-guest/mixed-rate-search.png) · [Rate calculation](../../lib/booking.ts#L340) · [Search card](../../components/booking/room-results.tsx#L63).

**Expected / impact** Once dates are chosen, the labels should explain how the subtotal was reached. A guest comparing costs can reasonably expect ₱5,000 and interpret the other ₱1,400 as an unexplained charge.

**Root cause / fix / acceptance** The server exposes a minimum nightly amount for varying prices, while the cards render it like a uniform rate. Expose a uniform/varied distinction and show “From ₱2,500 per night” plus a nightly breakdown or disclosure for variable stays. Verify seasonal and uniform fixtures against the frozen review and payment amounts.

### GUEST-005

**Guest details shows two current totals after breakfast is selected.** Booking details · Pricing UX · Medium · P2 · Medium · Confirmed.

**Evidence and steps** Continue to Guest Details with breakfast selected. The choice panel shows ₱6,800, while the primary stay-summary card still says Stay total ₱5,000 and relies on a room-only footnote beneath it. Switching to Room only restores agreement. The database freezes the selected amount when the hold is submitted. [Guest details](evidence/2026-11-24-guest/01-guest-details.png) · [Composition](../../app/%28booking%29/booking/details/page.tsx#L46).

**Expected / impact** The main summary should reflect the current selection. On mobile it is separated from the breakfast controls by the entire form, so the footnote is easy to miss while checking the final amount.

**Root cause / fix / acceptance** Breakfast state lives inside `GuestDetailsForm`, while its sibling summary receives a static room subtotal. Drive both displays from the same selected quote, show room and breakfast as distinct lines, and preserve the database as the authority. Toggle the plan both ways at phone and desktop widths and verify the hold matches the summary.

### GUEST-006

**Stay dates change from readable dates to raw dates mid-journey.** Guest Details, Review/Payment stay card, Confirmation · UX writing · Low · P3 · Small · Confirmed.

**Evidence and steps** Compare the mobile account interruption with Guest Details and Confirmation. Authentication shows “Dec 6 - Dec 8, 2026” while the checkout summary renders `2026-12-06` and confirmation renders an ISO range. The transportation confirmation also exposes a raw pickup date. [Authentication](evidence/2026-11-24-guest/booking-sign-in-mobile.png) · [Confirmation](evidence/2026-11-24-guest/confirmation-mobile.png) · [Stay summary](../../components/booking/booking-stay-summary.tsx#L75).

**Expected / impact** Guests should scan dates consistently when double-checking a purchase. The formatting shift makes it harder to compare the same stay across steps.

**Root cause / fix / acceptance** Templates print source fields directly. Use the existing date-only display formatter or one shared date-range equivalent, anchored to the hotel calendar. Verify cross-month, cross-year, and Manila timezone cases on all 390 px checkout screens.

### GUEST-008

**Refreshing Guest Details clears entered information before the hold.** Booking details · UX / resilience · Medium · P2 · Medium · Confirmed.

**Evidence and steps** Enter an address in Guest Details, then reload before submitting. The address field resets, while booking context still reflects the selected stay. [Form defaults](../../components/booking/guest-details-form.tsx#L124).

**Expected / impact** The guest should recover their progress or receive a clear boundary before losing it. A refresh during slow browsing can require re-entry of stay information.

**Root cause / fix / acceptance** Data is initialized from profile or a persisted hold. Edits before the first successful hold are local form state. Implement narrowly scoped, expiring draft recovery or a deliberate unsaved-changes flow. Keep the booking ownership, safe defaults and session expiry rules intact and clear temporary data on logout or completion. Verify refresh, failed submit, back navigation and new-booking isolation.

### GUEST-009

**A room with no uploaded photos is presented with unrelated imagery.** Landing room cards, detail/gallery and checkout · Configurability / content · Medium · P2 · Medium · Confirmed fallback. A blank remote image in checkout was observed under network isolation.

**Evidence and steps** Browse the synthetic active room type with empty `photo_urls`. The catalogue shows a stock room and the exact-room view reuses the same type-level gallery. Browser routes that load the remote stock photo directly show a broken-image box when external image requests are unavailable. [Catalogue](evidence/2026-11-24-guest/rooms-mobile.png) · [Guest Details](evidence/2026-11-24-guest/01-guest-details.png) · [Resolver](../../lib/room-images.ts#L36).

**Expected / impact** For a numbered selection, the guest should know whether a photo represents that exact unit, its type, or an illustrative view. An unavailable source should leave a deliberate empty state. The current labelling can imply that the image shows the selected room.

**Root cause / fix / acceptance** Missing media resolves to a generic gallery, and some booking views use raw image URLs without a recovery state. Label type or illustrative media accurately and make a branded image-unavailable treatment consistent. Verify configured photos, empty arrays, broken URLs and numbered units sharing a room type.

### GUEST-010

**Invalid search feedback disappears and drops the date context.** Availability search · Error handling / accessibility · Medium · P2 · Small · Confirmed.

**Evidence and steps** Open a search with the same dates or check-out before check-in. The site safely falls back to browsing and shows a timed toast with doubled punctuation, for example “check-out must be after check-in..”. The date inputs are initialized without the rejected dates and the notice auto-dismisses after six seconds. [Search rendering](../../app/%28booking%29/booking/search/page.tsx#L79) · [Toast timer](../../components/booking/booking-notice-toast.tsx#L35).

**Expected / impact** The guest should see a persistent reason beside the dates and be able to correct a single input. The fallback makes recovery harder for slow readers and guests returning through Back or a shared search link.

**Root cause / fix / acceptance** Invalid intent collapses to browse mode and error copy is concatenated in a transient toast. Keep valid fields, identify and focus the field to correct, and keep the feedback visible until corrected. Test past, equal, reversed and over-limit dates, a large party and keyboard recovery.

### GUEST-011

**Mobile sign-in delays the form and duplicates account creation.** Booking authentication · UX · Low · P3 · Small · Confirmed.

**Evidence and steps** On a 390 × 844 phone viewport, choose a room while signed out. The full photo and stay summary consume most of the first screen, while the account tab and a second Create a Haven account link both open the same registration step. [Mobile sign-in](evidence/2026-11-24-guest/booking-sign-in-mobile.png) · [Auth shell](../../components/auth/auth-vault-shell.tsx#L56).

**Expected / impact** The guest should see the authentication action promptly while retaining reassurance that the booking is intact. Returning guests must scroll through a summary they just accepted and first-time guests are given equivalent account controls.

**Root cause / fix / acceptance** The full desktop summary precedes the form on mobile and there are two same-destination registration links. Use a compact summary with a disclosure, one create-account route, and visible sign-in heading and first field at 390 px. Preserve the current callback context.

### GUEST-013

**A guest-cancelled booking is described as expired checkout.** Confirmation and cancelled stay · Business logic / UX · High · P1 · Small · Confirmed.

**Evidence and steps** Complete and verify a simulator deposit. Cancel the paid reservation in My Reservations, then revisit the original confirmation. The page shows “This checkout has expired” and offers “Retry payment with a new room hold,” while the record says Cancelled and the payment says Refund pending. [Cancelled confirmation](evidence/2026-11-24-guest/cancelled-confirmation.png) · [State mapping](../../app/%28booking%29/booking/confirmation/%5Bid%5D/page.tsx#L61).

**Expected / impact** A completed cancellation should confirm the cancellation and explain refund tracking. The wrong state may prompt a guest to start an unintended second booking or misunderstand whether their cancellation was accepted.

**Root cause / fix / acceptance** Confirmation treats every cancelled Xendit reservation as an expiry. Distinguish abandoned or expired checkout from guest/staff cancellation after settlement using the persisted state/reason. Verify pending, true expiry, settled, guest cancellation, staff cancellation and refund-in-progress variants.

### GUEST-014

**The mobile Express Pass collapses into unreadable columns.** Confirmation → Digital Express Pass · Responsive/accessibility · High · P1 · Medium · Confirmed at 390 CSS px.

**Evidence and steps** Complete the mobile test reservation and scroll to Digital Express Pass. The readiness label wraps over several lines, and “Use Express kiosk” wraps almost one letter per line. The evidence masks the credential image. [Mobile confirmation](evidence/2026-11-24-guest/confirmation-mobile.png) · [Pass component](../../components/customer/check-in-qr.tsx#L59).

**Expected / impact** A phone should display a scannable code with readable help and buttons guests can use at arrival. The layout forces an unusually tall panel and obscures the secondary action.

**Root cause / fix / acceptance** The horizontal pass is rendered inside an already narrow confirmation card. Switch to a stacked or container-query composition when the card lacks space. Verify readable labels, non-overlapping QR and controls, and keyboard and touch operation at 360, 390 and 430 px in both portal themes.

### GUEST-015

**Shared mobile shell controls crowd booking context.** Guest shell header and floating concierge · UI / responsive · Medium · P2 · Medium · Confirmed.

**Evidence and steps** Open Confirmation at 390 px. The header breaks “Confirmation” before its final letter, and the floating concierge covers the end of the deposit or date row in the captured viewport. Guest Details also places the floating button over the form’s right edge. [Confirmation](evidence/2026-11-24-guest/confirmation-mobile.png) · [Guest Details](evidence/2026-11-24-guest/01-guest-details.png) · [Customer shell](../../components/customer/customer-shell.tsx#L75).

**Expected / impact** The current step and financial values should remain easy to read while retaining access to help. Crowded chrome and a fixed overlay make key facts harder to check at mobile width.

**Root cause / fix / acceptance** Search, timer, theme, notifications, account and mobile navigation compete with the title. The floating button has no checkout avoidance region. Give the title protected width, move appropriate secondary actions into the drawer, and suppress or reposition the widget where it covers critical checkout content. Verify short and long titles plus scrolling and safe areas at 360, 390 and 430 px.

### GUEST-016

**Cancellation labels net folio application as the amount paid.** Confirmation after cancellation · Pricing UX · High · P1 · Medium · Confirmed UI discrepancy. No missing money was established.

**Evidence and steps** The confirmed page showed a ₱2,040 verified deposit. After cancellation, the same URL showed ₱1,020 under Amount paid, alongside a ₱2,040 required deposit and Refund pending. The template reads `invoice.paid`, while the original payment remains a separate transaction. [Before](evidence/2026-11-24-guest/confirmation-mobile.png) · [After](evidence/2026-11-24-guest/cancelled-confirmation.png) · [Summary](../../app/%28booking%29/booking/confirmation/%5Bid%5D/page.tsx#L153).

**Expected / impact** A cancelled booking should explain the original amount collected, fee retained and refund amount or state separately. The label can make the guest think their original payment was lower than it was.

**Root cause / fix / acceptance** The current folio net is rendered under the generic payment label. Use the authoritative cancellation and refund records for a cancelled-stay summary. Reconcile each displayed value to the original transaction and refund or fee record in unpaid, partial, pending-refund and refunded cases.

### GUEST-017

**Breakfast amendment restrictions only appear after submission.** Confirmed breakfast stay → Request a change · UX / policy · Medium · P2 · Small · Confirmed.

**Evidence and steps** On the confirmed breakfast stay, open Request a change, enter new dates and submit. The server returns HTTP 409 and correctly retains the original stay. The response tells the guest to contact Front Desk. [Guest action](../../components/customer/reservation-actions.tsx#L266) · [Server policy](../../app/api/account/reservations/%5Bid%5D/change-request/route.ts#L38).

**Expected / impact** Known restrictions should be visible before requesting dates and a reason. Guests currently enter information for an action that the application already knows is ineligible.

**Root cause / fix / acceptance** Action visibility is based on status and open request, while breakfast eligibility is checked in the route. Expose the policy outcome in the stay actions and offer assisted change with the reservation reference. Verify normal room-only and breakfast stays, including existing requests.

### GUEST-018

**Zero availability is presented as a priced room list.** Public room search · UX / recovery · Medium · P2 · Small · Confirmed.

**Evidence and steps** In a disposable property with one sellable fixture room, set that unit to maintenance and run the same date search. The inventory check correctly disables booking. The result heading stays “Rooms for your dates” with “5 room types · 0 rooms available,” followed by five priced cards and disabled booking actions. [Zero availability](evidence/2026-11-24-guest/zero-availability-mobile.png) · [Results heading](../../app/%28booking%29/booking/search/page.tsx#L118) · [Empty-state branch](../../components/booking/room-results.tsx#L29).

**Expected / impact** When the entire result is unavailable, put useful next actions before any optional catalogue. A guest currently needs to interpret a count and scroll past several dead ends on a phone.

**Root cause / fix / acceptance** The empty-state logic checks the number of matching room types and ignores zero sellable units across them. Give dated searches with zero availability a distinct heading and immediate Edit dates action, plus an accessible contact link. Verify maintenance, fully occupied dates, party over capacity and partial availability. Keep informational cards optional in the zero case.

### GUEST-019

**The cancellation reason can outgrow its stay card.** Cancelled reservation details · Responsive polish · Low · P3 · Small · Confirmed at 390 px.

**Evidence and steps** Cancel a confirmed synthetic reservation with a sentence-length reason and reopen it at 390 px. The reason appears inside a single-line red status pill whose edge extends past the summary card. [Cancelled stay](evidence/2026-11-24-guest/cancelled-stay.png) · [Status and reason markup](../../components/customer/reservation-detail-view.tsx#L283) · [Badge styling](../../app/guest-booking.css#L42).

**Expected / impact** The Cancelled status should stay concise and the reason should wrap within the card. A longer guest-entered reason can be clipped or difficult to read in the refund context.

**Root cause / fix / acceptance** The reservation view puts both status and free text into the same no-wrap badge. Keep Cancelled in the badge and allow the reason to wrap below it as body copy. Test the longest valid reason and long words at 360 and 390 px in both themes.

## Responsive and accessibility coverage

- Landing and room results had no document-level horizontal overflow at 360, 390, 430, 768, 1280, 1440 and 1920 CSS px. The local phone booking journey completed at 390 × 844. Payment summary currency also stayed on one line at 320, 390 and 1440 px. Document overflow metrics did not catch the Express Pass’s internal wrapping.
- The room detail modal accepted keyboard activation, placed focus inside, closed with Escape and restored focus to the activating control. The mobile landing date picker also opened via keyboard and restored focus on Escape. The registration short-password copy was linked to the corresponding field through `aria-describedby`. The reduced-motion browser preference was enabled during the journey.
- My Stay rendered the populated dark palette at 390 px. The landing keeps its authored public palette. Full contrast measurement, screen-reader output, mobile menu focus containment, hardware camera, real devices and page-by-page dark-theme acceptance remain open.
- Descriptive photos, a clear arrival flow and status text are strengths. The top changes are payment-state clarity, the compact mobile Express Pass and consistent pricing from discovery to confirmation.
