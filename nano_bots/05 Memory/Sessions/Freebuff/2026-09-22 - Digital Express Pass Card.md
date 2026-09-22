# 2026-09-22 - Digital Express Pass Card (Freebuff)

Master task: replace the full-width standalone QR block on the reservation
detail page with a compact "Digital Express Pass" card anchored in the hero
grid's right column (Scenario A), stacking below the reservation info on
mobile.

## Discovery

- The spec's paths (`reservation-details-panel.tsx`,
  `app/(customer)/my-reservations/[id]/page.tsx`) do not exist. Real target:
  `components/customer/check-in-qr.tsx` (`CheckInQr`, sole importer
  `reservation-detail-view.tsx`), rendered full-width between the hero and
  the folio strip.
- Repo uses bespoke CSS (`--cp-*` tokens in `guest-booking.css` +
  `customer-portal.css` overrides), not Tailwind — Scenario A implemented
  with project tokens, same layout outcome.
- No tests/docs pinned the old QR markup; no hotel-name constant exists
  (static `HAVEN Makati` per spec).
- QR source is generated at 320px (`qrDataUrl` in `lib/qr/tokens.ts`), so a
  160px display stays crisp on high-DPI screens.
- Pre-existing defect: two jammed single-line statements in
  `reservation-detail-view.tsx` (double import; `openRequestRow`/`openRequest`
  on one line). Fixed as part of touching the file.

## Changes

- `components/customer/check-in-qr.tsx` — rewritten pass card: uppercase
  "Digital Express Pass" title + `HAVEN Makati`, centered high-contrast QR
  (160px, white inset figure), "Scan at front desk or kiosk", green
  "Ready for Express Check-In" status pill, full-width Download QR, honest
  validity note. `CheckInQrExpired` → `customer-checkin-qr-band` full-width
  modifier (notice strip, not a card).
- `components/customer/reservation-detail-view.tsx` — hero heading grid is
  now 3-column (`minmax(0,1fr) auto auto`, `align-items:start`); pass mounted
  via `.customer-checkin-qr-pass-column` as a direct grid child; standalone
  block deleted; folio strip unchanged, directly after the hero.
- `app/guest-booking.css` — pass-card styles replace the old two-column band;
  ≤900px the pass column stacks centered (max 320px); 560px band fallback
  kept for the expired notice.
- `app/customer-portal.css` — portal font floors remapped to the new classes;
  pass card joins the shared card radius; 44px download button target.
- `components/customer/check-in-qr.test.tsx` (new, 4) — pass anchors inside
  `.customer-reservation-heading` via the pass column; pass parts present
  (title/hotel/scan hint/ready pill/download, 160px img); folio strip is the
  hero's next sibling; terminal state renders "QR expired" band, never a pass.

## Gates (all actually run)

`npm run typecheck` clean · eslint on touched files 0 errors (2 warnings:
test stub param removed after, `<img>` kept deliberately — data-URL QR,
`next/image` would break the download snapshot) · vitest focused 4/4 ·
full suite **1713/1713 (155 files)** · `npm run build` · `git diff --check`.

## Honest limits

- No browser QA runner in repo (KI-005): visual pass-card stacking and the
  real download behavior need a manual click-through at ≥1024px and ≤900px.
- Booking-confirmation inline QR (if any) was out of scope; only the
  reservation-detail surfaces were touched.
