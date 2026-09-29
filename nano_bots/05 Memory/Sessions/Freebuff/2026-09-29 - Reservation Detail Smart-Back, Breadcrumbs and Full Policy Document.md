# 2026-09-29 - Reservation Detail Smart-Back, Breadcrumbs and Full Policy Document (Freebuff)

Master task: on the customer reservation detail page, replace the flat
"All reservations" text link with a recognizable circular smart-back control,
add a breadcrumb trail for orientation, and expand the Policy tab from one
dense paragraph into a full structured policy document covering all policy
groups. Plan confirmed by the user in a prior session (history-aware back +
breadcrumbs; all 8 policy groups; keep the pending-verification notice).

## Discovery

- The hero's only way back was a small green text link
  (`.customer-back`, 9px in guest-booking.css) — easy to miss and it always
  hard-navigated to `/my-reservations` instead of using history.
- The Policy tab rendered one `policyText` paragraph: dense, repetitive, and
  missing house rules, changes window, and no-show terms that the booking
  policy snapshot actually carries.
- View is a pure client view over serializable props; policy resolution
  happens server-side in `app/(booking)/(customer)/my-reservations/[id]/page.tsx`
  via `operationalPolicyFromSnapshot`. Extending policy display therefore
  means extending the page's prop build, not the view's logic.
- Both `ReservationDetailViewData` fixtures (check-in-qr, cancel-reservation)
  satisfy the new optional `policyItems` prop by omission, so only the
  fallback path needed no change.

## Changes

- `components/customer/reservation-detail-view.tsx` — hero top is now
  breadcrumbs (`.crd-breadcrumbs`, `nav aria-label="Breadcrumb"`:
  My Reservations › {Room Type} › {Confirmation #}, last crumb
  `aria-current="page"`, links go to `/my-reservations`) above a circular
  smart-back button (`.customer-back-circle`: 44px round icon + "Back"
  label, `aria-label="Go back to the previous page"`). `goBack()` uses
  `router.back()` when `window.history.length > 1`, else pushes
  `/my-reservations` (direct-landing fallback). New exported
  `PolicyItem` type; `ReservationDetailViewData` gains optional
  `policyItems?: PolicyItem[]`; policy panel now renders eyebrow
  ("Booking policy for this reservation") → h2 ("What you agreed to when
  booking") → pending-notice callout (kept, per user decision) →
  grouped `crd-policy-list` sections with `<strong>`-highlighted crucial
  terms, falling back to `policyText` when items are absent.
- `app/(booking)/(customer)/my-reservations/[id]/page.tsx` — builds 7
  `policyItems` from the snapshot: Check-in & check-out, Valid ID,
  Balance & incidentals, Cancellation refunds (100% / partial bp / 0%
  tiers + no-show forfeit), Changes to your booking, Special requests,
  House rules (pets / smoking / early check-in). Crucial words wrapped in
  `<strong>` server-side. Removed the now-unused `formatPeso` import
  (was the repo's only eslint warning in this file).
- `app/guest-booking.css` — circular back button (44px round icon, green
  arrow, panel-2 fill, hover/focus-visible rings), breadcrumb trail
  (wrap-friendly flex, 32ch ellipsis on the current-page crumb), and the
  policy document styles: eyebrow, left-accent section rules
  (3px green mix on `--cp-line`), hairline row dividers,
  `--cp-green` `<strong>` emphasis. One set of rules, no leftover
  duplicates from the edit sequence.
- `app/customer-portal.css` — portal shell font floors: back label 13px,
  breadcrumbs 12px (`.customer-shell .crd-breadcrumbs`).

## Gates (all actually run)

Focused suites (check-in-qr, cancel-reservation, change-request-redesign,
encoding-guard) 48/48 · `npm run typecheck` clean · eslint on the two
touched TS files 0 errors 0 warnings (unused `formatPeso` removed) ·
`npm run build` 88 routes compiled · full suite **166 files / 1873 tests**
· `git diff --check` clean (CRLF warnings only).

## Honest limits

- Pending: manual browser QA (KI-005) — no headless runner exists. Check
  desktop + 390px: breadcrumb wrap, back-button focus ring, policy list
  reading order, pending-notice callout only for pending reservations,
  and `router.back()` behavior from a direct URL landing.
- The plan's fixture updates (check-in-qr.test.tsx:49,
  cancel-reservation.test.tsx:208) proved unnecessary: `policyItems` is
  optional and both fixtures intentionally exercise the fallback path.
- `.customer-back` (text link) remains for other customer pages; only the
  reservation detail hero uses the circle modifier.
