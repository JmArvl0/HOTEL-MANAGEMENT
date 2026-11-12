# Landing Hospitality UX Audit — November 11, 2026

User supplied a complete hospitality landing-page audit brief. Its URL remained
a placeholder; reviewed the current workspace landing and existing local app3014.
One agent; no implementation or deployment requested/performed.

Deliverable: [30-part audit and redesign blueprint](../../../../docs/qa/landing-ui-ux-audit-2026-11-11.md).
Overall5.4/10; NOT READY for a real hotel's bookings.34 findings:2critical,
11high,19medium,2low. Demo property/location/media are release prerequisites,
not alleged undisclosed fraud; preserve the existing honest demo treatment.

Verified in the in-app Chromium browser at1440×1000,768×1024,390×844,320×780:

- Hero clips the new absolute calendar below its boundary on desktop/tablet/phone.
- Shared Book now points at nonexistent `#book` on search/type routes.
- Resizing desktop→390 retains desktop GSAP translate(-50%); wrapper x≈−152px.
  Fresh390 reload restores x18px. This is a resize defect, not every fresh phone load.
-320px wordmark wraps; mobile date/guest entries measure32px, header CTA40px.
- Room viewer, menu focus wrapping/Escape/return, experience choice, nearby
  category/search/no-match/reset, and keyboard FAQ expansion work in the exercised cases.
- November20–22/two guests → Deluxe King → Room101 → sign-in retains dates,
  party, identity and ₱12,800 estimate. Mobile account summary hides form below
  first390×844 viewport. No credentials/account/hold/payment submission.
- Five-guest dated public search returns zero and date-oriented guidance;
  currently displayed room capacities max4 despite selector allowing8.
- Thumbnail DOM width≈92px, loaded source1600px, no srcset; no performance metric claimed.

Verification: `npm run typecheck` passed; nine focused Vitest files70 tests passed;
Impeccable source detector returned[] for selected landing/search sources. No full
suite/build/ESLint for documentation-only audit. No physical-device/touch/iOS,
rendered reduced-motion, text-zoom, Lighthouse/RUM, authenticated booking or payment QA.
Browser override reset and audit completed. Existing app server left running.

Reference correction: SYSTEM§7.1 said dummy reviews were displayed; current
`getPublishedReviews` returns[] and landing shows an empty state. Corrected that
sentence only. No runtime behavior changed. Current Status/Decisions/Project Memory
left alone because no implementation or approved product decision changed.

Next implementation, only if requested: fix high-severity controls and obtain
client property truth first; preserve approved room grid and exact-room selection.
