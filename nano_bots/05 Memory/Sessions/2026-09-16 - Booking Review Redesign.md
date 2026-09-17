# 2026-09-16 - Booking Review Redesign

Customer `/booking/review/[token]` rebuilt from the flat label/value grid into the
approved reference hierarchy: guest-profile header, five descriptor/value sections,
deposit tiles, and a deep-teal Your Stay card — then corrected to the wide premium
workspace (1320px stage, larger type, no mid-word email breaks).

## What

- New `components/booking/booking-review.tsx` (pure, server-safe): `ReviewGuestCard`
  (avatar + eyebrow + serif title + Edit link; Personal / Contact / Arrival /
  Preparations / Special-request rows, nationality footnote), `ReviewDepositTiles`
  (sea-glass Due-now + warm-neutral Remaining, equal height), `ReviewStayCard`
  (photo band + teal body, icon rows, per-night breakdown when frozen rates vary,
  strong total, unchanged tax note).
- `app/(booking)/booking/review/[token]/page.tsx`: same gates/redirects/math; JSX
  rewired to the three components; one read-only `room_types.photo_urls` lookup for
  the stay photo (teal fallback, never stock); transportation block kept verbatim.
- `app/guest-booking.css`: 1320px stage (`1fr 330px`, gap 26px, stage-inner + nav
  overrides), 31%/69% rows at 24px rhythm, full-width name block, `.review-email`
  no-mid-word-break, 9px-radius preparation rects, 72px-min quote, 23px deposit
  amounts, 170px stay photo, warm-cream stay eyebrow, 29px room name, 21px total.
- `components/booking/booking-review.test.tsx`: 24 tests (values passthrough,
  empty states, Edit/hold/CTA behavior, teal fallback, varied-rates rows,
  workspace/photo/chip/email/total CSS contracts, no-logic-in-presentation scan).

## Decisions (user-confirmed)

- No reference image on file — text spec treated as the visual target.
- Missing room photo = elegant teal fallback; stock Unsplash never used here.
- Stay photo reuses the shared `RoomPhotoTrigger`/`RoomPhotoLightbox`; no second viewer.
- Warm-cream stay eyebrow follows the brief over the sea-glass default (brief wins).

## Verification

- Targeted 24/24 → full 2426/2426 (216 files). Typecheck clean. Lint 0 errors
  (140 pre-existing warnings; 0 in touched files). Build 64/64.
  Impeccable detector clean (`[]`).
- Manual browser QA still pending (1920×1080 + tablet/mobile need a guest login +
  live hold; no browser runner here — KI-005). Checklist left with the user.

## Follow-ups

- User-side visual QA at desktop/tablet/mobile widths (see report in session).
- Commit the tree (this + parallel-session work); coordinate first.
- No SYSTEM.md change (presentation-only); no Decisions.md entry (no business rule).
