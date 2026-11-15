# Booking policy reference QA — 2026-11-13

The later [screen-fit follow-up](booking-policy-screen-fit-2026-11-13.md)
supersedes the original section-jump, sidebar sizing and large footer described
below. This report retains the initial reference implementation evidence.

The user-supplied screenshot and pasted spec govern this scoped redesign.
The route inherits the existing public Inter/Playfair ivory/navy/gold identity.
It is a reading surface: the first screen exposes the four principal booking
facts, then the page explains confirmation, cancellation and arrival.

## Implementation

- Server-rendered `BookingPolicyPage` plus a scoped stylesheet. Shared public
  navigation/footer and the 300-second revalidation remain.
- Live policies populate all numeric facts. Disabled deposits explicitly say
  online deposits are unavailable; fixed deposits describe a per-reservation
  amount. Existing cancellation-summary logic supplies the separate rule lines.
- Published Website Content supplies property identity and contact email.
  Terms/privacy link to existing pages; deposit link jumps to cancellation.
  Contact our team uses the configured email; View FAQ links to `/#faq`.
- Four highlights stay fixed in count. At <=900px they become a two-column
  grid, content stacks and a native details/summary supplies section links.
  The duplicate at-a-glance list is omitted on narrow screens.
- Botanical artwork is reused. New bell/hydrangea art is decorative and has
  its exact built-in-generation prompt embedded and documented in
  `public/decor/README.md`. Architectural decoration is geometric linework.
- Existing settings/CMS ownership remains; no new schema, DB write or migration.

## Verification

- Node22.22.2 `npm run build`: final production build passed outside the
  sandbox. Initial sandbox Turbopack junction creation and webpack output
  mkdir were denied; these were environment errors, not bypassed silently.
- `npm run typecheck` and ESLint on the three touched TSX files passed.
- Focused Vitest:6/6, including three new UI behavior tests. Full
  `npm test -- --maxWorkers=2`:2525/2525 across242 files. jsdom emits existing
  unsupported navigation/canvas notices. Tests exercise real rendering and
  alternate policy inputs; they do not call a live database.
- Impeccable mechanical detector returned `[]`. The user's explicit reference
  owns the cards, dividers, muted gold labels and photo scrim. No randomized
  direction or animation quota was substituted for the supplied policy design.
- Real in-app browser, desktop1440x1000, tablet768x1024, phone390x844 and
  small phone320x740: no horizontal overflow. Desktop two columns; tablet/
  phone single column and 2x2 highlights. Artwork loads. Text remains readable.
- Native jump disclosure opens and cancellation link changes the fragment and
  brings its heading below the fixed nav. Keyboard Tab reaches the FAQ action
  with a visible2px outline. Support links measure44px tall. Reduced-motion
  CSS removes transforms/transitions; no separate reduced-motion browser
  emulation was performed. No headless browser suite was run.

## Finish review

In-thread visual review: ship. The reference's information order, type contrast,
sidebar proportions and support still life are present. Narrow layouts preserve
all unique facts and avoid a permanent sidebar. Decorative architecture uses
the site's linework language instead of introducing a property photograph.
The screenshot's wording is adapted to the authoritative policy summary and
published hotel identity. No material issue found in these scoped checks.

Production preview: `http://127.0.0.1:3083/booking-policy`.
Local screenshot evidence is stored under `.tmp/booking-policy-qa/`.
