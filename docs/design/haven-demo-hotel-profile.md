# Configurable fictional hotel profile — proposed comparison only

The user confirmed on November 11, 2026 that the current/proposed comparison
should use complete mock hotel information while there is no client. The user
explicitly limited this work to the proposed comparison. No application or database
settings have been changed.

The seed is [haven-demo-hotel-profile.json](./haven-demo-hotel-profile.json).
The latest comparison is the thread-owned `haven-current-proposed-photos.html`;
the earlier `haven-current-proposed-demo.html` is retained.
Its **Demo hotel settings** tab edits the same profile structure and applies it
locally to the proposed view. Settings are remembered by the preview host when
available; editing that tab does not write the JSON file or the application database.

## Sample content

Haven is modeled as a fictional city hotel in Ermita, Manila. It has a complete
introduction, sample address and contact details, dining/breakfast, practical
amenities, family/access information, and sample booking/privacy notices.
The address, telephone and facilities are fictional. Email uses `haven.example`.
Contact/navigation actions are disabled. The existing Rizal Park demonstration
pin remains explicitly a public-landmark orientation example, not the hotel.
No distances are asserted from the fictional address. Photos remain illustrative;
no guest reviews, awards or ratings were invented.

The November 11 photo follow-up adds a Rizal Park backdrop to the contact card,
plus actual area photos of Rizal Park, the National Museum of Fine Arts and the
LRT at Pedro Gil. These depict public places, not the fictional hotel. The
contact caption identifies the scene and a dark overlay keeps the copy readable.
The room/gallery images remain illustrative hotel references.

`media.contactBackgroundImageKey` and each `nearby[].imageKey`, name and
description can be edited in **Demo hotel settings**. Area-photo choices are
restricted to the three bundled Manila photographs; captions, alt text and
attribution follow the selected image. Older remembered profiles gain the new
photo fields while retaining existing hotel edits. Replacing assets for a future
client also requires updating their source/credit metadata.

Exact source pages, authors, licenses and modifications are recorded in
[haven-location-photo-sources.json](./haven-location-photo-sources.json).
Each photograph has an expandable credit with source and license links. The
LRT adaptation remains under CC BY-SA 2.0. Images are embedded and optimized so
the inline comparison works without image requests to Wikimedia.

The information architecture follows the property-specific format used by
[Hilton Manila's hotel information page](https://www.hilton.com/en/hotels/mnlphhi-hilton-manila-newport-world-resorts/hotel-info/):
arrival times, included or charged amenities, dining/breakfast, parking, family
information, access and booking policies. That is a content pattern, not a claim
that a particular price, inclusion or refund rule is an industry-wide standard.
[Marriott's hotel-information guidance](https://help.marriott.com/s/article/find-information-specific-marriott-hotel)
also directs guests to the particular property's amenities and policies rather
than treating them as universal across hotels.

## Booking defaults and ownership

The sample check-in 15:00, checkout 12:00, minimum lead-guest age 18, required ID,
30% deposit, 15-minute hold, and 14/7-day deposit-refund thresholds follow current
repository provisional defaults in `lib/hotel-policy.ts` and `lib/booking.ts`.
Refund language is explicit: 100% of the verified deposit at 14+ days, 50% at 7–13
days, and none below seven days, in hotel-local calendar days. Confirmation follows
deposit verification; the hold begins after guest-details submission.

Rates remain inclusive of configured VAT/service charge, matching current Haven
pricing semantics. Changing percentages changes the presentation of the included
breakdown; the preview does not add a second fee or change live room pricing.
Optional breakfast at ₱450/person, facilities/hours, parking and access provisions
are newly authored fictional content for this sample, not live hotel capabilities.

When implementing the actual website later:

- **Location, routes, nearby content and images:** reuse the existing Owner/Admin
  Location & Places editor and its demo/verified publication handling.
- **Rooms, capacity, base rates and room photos:** keep the existing room catalog;
  do not duplicate operational inventory in this profile. The shared
  [room-type lifecycle and amenity-inheritance plan](../plans/2026-11-11-room-type-lifecycle-and-amenity-inheritance.md)
  adds dynamic type lifecycle, room assignment/reassignment and inherited amenities
  with room-level additions/exclusions as a future implementation requirement.
  This addition changes the plan only, not the comparison prototypes.
- **Deposit, hold, tax and stay policies:** derive public copy from the existing
  authoritative policy modules and preserve reservation-time snapshots. Do not
  make this preview JSON a competing source of financial rules.
- **Identity, contact, amenities, gallery and editorial copy:** map the profile to
  the agreed public-content configuration/editor. This broader application editor
  is not implemented by the comparison-only change.
- **Client launch:** replace fictitious identity/contact/media, verify location
  and access/facility claims, supply approved legal notices, and run booking/device
  acceptance checks. Real reviews remain conditional on genuine completed stays.

## Verified preview behavior

All 34 comparison findings remain available. Applying name/city, arrival times,
deposit, hold and breakfast edits updates the relevant proposed components while
leaving the current comparison snapshot intact. Validation rejects invalid
percentages and inconsistent refund windows, escapes user-entered markup, and
preserves drafts against stale host-state echoes. Apply actions run locally;
they do not depend on sandboxed form submission or contact external services.
