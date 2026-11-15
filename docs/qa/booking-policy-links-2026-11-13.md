# Booking policy navigation cleanup — 2026-11-13

The user requested one Booking policy destination, removing the Quick links
block and the separate public Booking terms/Privacy policy pages.

- Removed the block and its unused icon/CSS. The sidebar retains overview and
  at-a-glance facts; short windows prioritize the facts over the generic intro.
- Shared website footer replaces Privacy policy, Booking terms and Deposit &
  cancellation with one Booking policy link. The compact policy-page footer
  does the same. Both point to `/booking-policy`.
- Landing page retains its existing brief disclosure beside the booking form,
  with a single Booking policy link. No long policy section added to homepage.
- Legacy `/terms` and `/privacy` route files now redirect to Booking policy,
  preserving older bookmarks. Real browser navigation confirms both arrive
  at `/booking-policy`; streamed/static redirects may return an HTTP200 with
  browser redirect metadata rather than a Location header.
- Policy values/contact/identity still use their previous sources. Saved CMS
  legal draft fields are retained; they no longer populate separate public
  pages. No schema, database or operational policy changes.

Verification: Node22 production build, standalone typecheck and ESLint on seven
touched TSX files pass. Focused19/19 and full2528/2528 across242 files pass;
the full suite retains its jsdom navigation/canvas notices. The detector
returned `[]`. No headless browser suite was run.

Real in-app browser verified: no Quick links/terms/privacy links on the policy
page; the homepage footer has one Booking policy link, which opens that page;
both legacy page redirects work. Existing narrow-screen tabs remain available.
Final production checks at1440x900,1366x768,1280x720 and631x883 show document
height equal to viewport height, no horizontal overflow and zero legacy links.
Screenshot evidence: `.tmp/booking-policy-links-qa/footer.jpg` and
`.tmp/booking-policy-links-qa/policy.jpg`. Preview remains
`http://127.0.0.1:3083/booking-policy`.

No DB write, commit or hosted deployment. Existing unrelated changes preserved.
