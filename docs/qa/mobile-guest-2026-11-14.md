# Hosted guest mobile review — 2026-11-14

Result: the main guest layouts reflow and remain usable, but mobile readiness
is partial because several shared controls overlap or clip content.

## Environment and scope

- Site: https://haven-hotel-management-ten.vercel.app/
- Interactive Chromium in-app browser; viewport overrides of 390×844,
  320×568, and selected 430×932 checks. This was browser viewport testing,
  not a physical phone or synthesized touch-gesture test.
- Created and automatically signed in to one **Mobile QA** guest account after
  the user explicitly requested creation. Synthetic contact information and
  a generated password were used. No credentials are stored in this report.
  The account remains created and the preview remains signed in.
- No reservation, inventory hold, payment, ride, or service request was submitted.
- The hosted auth/policy presentation differs from the current local working
  tree. Findings describe the deployed site; local equivalents require separate
  verification. Existing unrelated working-tree changes were preserved.

## Verified findings

| Priority | Surface | Evidence and impact | Recommended repair |
|---|---|---|---|
| P1 | Registration country picker | At 320px the open country list paints behind the following email/password fields, hiding choices. Country search accepts input, but the filtered option is still obscured. Flag images also have zero natural width. | Fix the dropdown stacking context or render it in an appropriate overlay; ship the referenced flag assets. |
| P2 | Shared guest header | At 320, 390 and 430px the fixed hamburger covers the beginning of the page title. Reproduced on Dashboard, Reservations, Transportation, Payments, Requests, Rewards, Help and Find a Room. | Reserve inline space for the mobile menu in the shared header. Local counterpart: `components/customer/customer-shell.tsx:72`, `.customer-mobile-menu` and `.customer-content-header`. |
| P2 | Guest notifications | At 320px, Recent notifications has x=-34px, width=281px, right=247px. The left of the title/content is offscreen even though the page itself does not horizontally overflow. | Clamp the popover to viewport gutters rather than positioning it only against the bell. Counterparts: shared customer shell and `components/ui/haven-notifications.tsx:138`. |
| P2 | Public dated room search | At 390px, both “Check availability” and “Book” display together, squeezing HAVEN and Book across lines. Reproduced after submitting dates twice and remained visible on a later capture. The undated search and policy page showed the compact Book control correctly. | Fix scoped responsive visibility and brand flex sizing on dated results. Counterparts: `components/landing/landing-nav.tsx:193` and booking-search CSS. |
| P2 | Signed-in Find a Room | At 320px date inputs measure 94px wide and visibly clip the date/year. At 390px the reservation assistance note occupies only the left grid column and becomes unnecessarily tall. | Stack date fields where native controls cannot fit; make the assistance note span the form grid. Counterpart: shared booking search form and guest form CSS. |
| P2 | Public FAQ floating action | At 320×568, the floating Top control covers part of the expanded Breakfast question row/action area. | Provide clearance or move the floating action away from FAQ controls. |
| P2 | Hosted sign-in screen fit | At 390×844 the large decorative photo remains above the form. The email input starts below roughly 700px and Sign in is at y=937px (50px high), requiring scrolling. Inputs themselves are 16px/50px and remain usable. | Verify/deploy the existing local compact auth treatment; avoid duplicating local repairs based solely on hosted behavior. |

The guest header controls measured 38×38px, with a 36×36px account button.
These are below the project's preferred 44px mobile targets; this alone does
not establish a WCAG AA target-size failure.

An additional content observation, outside responsive scope: the public catalog
still advertises a QA Turnover room type with temporary checkout-test copy and
a ₱100 rate. An operator should review whether it should remain publicly active.

## What worked

- Guest registration completed and automatically entered the guest dashboard.
- Dashboard, reservation empty state, transportation, payments empty state,
  requests empty state, rewards, and support content stack into one column.
- No page-level horizontal overflow in measured room-selection (320),
  payments (390), rewards (320), Find a Room (320), and dashboard (430) checks.
  Clipped/fixed overlays can still fail independently of this measurement.
- Public and signed-in range calendars open within the phone viewport.
  Public selection of November 16–18 and availability search preserved dates
  and party size through room-type, numbered-room, and sign-in handoff.
- Garden Twin room details open with a visible close control, scrolling body,
  and bottom booking action. Numbered-room details expand correctly.
- Public gallery opens/closes and its nine images load after initial placeholders.
- Public mobile menu opens, scrolls, and navigates to FAQ; FAQ expansion works.
- Rewards Gold selection updates its selected state and privilege summary at 320px.
- Guest support FAQ expands; profile modal fits and retains a visible close
  control with an independently scrollable body at 320px.
- Concierge panel opens/closes within the 320px viewport. No chat was submitted.
- Booking policy content remains readable in the selected 430px check.

## Evidence

The captures of the dashboard, notifications, country picker, search, Find a Room, FAQ, rewards, profile and sign-in are in the ignored local archive under `.tmp/worktree-cleanup-20261115/`.

## Limits and next pass

New-account empty states do not validate populated reservation cards, actual
folio tables/receipts, transportation forms/tracking, stay change/cancellation,
or confirmed-stay service requests. No physical-device, Safari/iOS keyboard,
touch drag/swipe, dark-mode, zoom, contrast or performance audit was performed.
There is no defensible full accessibility/performance/theming health score from
this focused responsive check.

No application source was changed, so typecheck, ESLint, Vitest and build were
not run. This report records actual browser observations only.

Recommended order: `$impeccable harden` for the country overlay/assets,
`$impeccable adapt` for shared header/popover/form sizing, then
`$impeccable polish` and a repeat hosted mobile review. These commands can be
run separately or together; a subsequent audit should include an existing
guest test account with populated stays.
