# Booking policy screen fit — 2026-11-13

User requested a screen-fitting page without needing to scroll. Their in-app
preview measured631x883, so desktop spacing alone would not solve their view.

## Result

- Desktop keeps all three policy sections visible with a250px sidebar. Fluid
  headings and tighter gaps recover space. Short windows omit the decorative
  subtitle, duplicated at-a-glance list and generic support sentence. The
  large site footer becomes a44px copyright/terms/privacy footer.
- At <=1100px, three tabs show Before you reserve, Cancellation & refunds or
  Arrival & departure. All copy is preserved; the repeated sidebar is omitted.
  Snapshot descriptions become a shared room-hold/timezone note. Contact/FAQ
  remain visible. Tablet/phone policy body text remains16px.
- Tabs support arrows, Home/End, selected state, roving focus and labeled
  panels. Fragment changes and direct links open their matching section.
  Desktop resizing exposes every section again. Without JavaScript, server
  markup keeps every section available. No forced height, clipping, line clamp,
  browser zoom or transform scaling hides policy content.
- Small phones, short windows and expanded policy copy use normal scrolling
  when required. This is intentional readability fallback, not an all-device
  no-scroll guarantee. Existing policy/CMS data ownership is unchanged.

## Verification

- Node22.22.2 production build passed using isolated
  `.tmp/booking-policy-fit-release`. Standalone typecheck and ESLint on the
  three touched TSX files passed. Temporary generated-type entries were removed,
  preserving pre-existing config/working-tree changes.
- Focused Vitest8/8; full checkpoint2527/2527 across242 files. Two new tests
  cover keyboard/pointer selection, responsive transitions, direct fragment
  arrival and later hash changes. Existing jsdom navigation/canvas notices
  remain. No live database writes were made.
- Impeccable detector returned `[]`. In-thread screenshot review retained the
  supplied ivory/navy/gold identity, serif hierarchy and hospitality artwork.
- Real in-app Chromium viewport checks:1440x900,1366x768,1280x720,1024x768
  and631x883 all measured document height equal to viewport height, with no
  horizontal overflow. Production1366x768 confirmed all three sections visible.
  Production631x883 confirmed every tab separately measured883px document
  height. Saved captures: `.tmp/booking-policy-fit-qa/laptop.jpg` and
  `.tmp/booking-policy-fit-qa/preview.jpg`.
- Real ArrowRight interaction selected/focused the next tab with a visible
  outline.390x844 and320x740 checks retain horizontal fit and readable body
  copy; their long sections scroll normally. These are resized browser checks,
  not physical-device or native-touch evidence. No headless browser run.

Local production preview was replaced at
`http://127.0.0.1:3083/booking-policy` using a hidden background process.
No commit, DB migration/write or hosted deployment. Unrelated concurrent
guest-journey planning notes were preserved.
