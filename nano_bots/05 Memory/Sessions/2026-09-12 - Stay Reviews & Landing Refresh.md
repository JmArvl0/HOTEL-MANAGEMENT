# 2026-09-12 - Stay Reviews & Landing Refresh

## What
- Replaced the `#smarter` teaser tiles' internal ops numbers (occupancy %, arrivals count,
  rooms-needing-attention) with safe public facts: 48 boutique rooms, amenity count (live
  `amenities.length`), 1 connected guest account. Removed the "Illustrative figures" caption.
- New landing **Guest stories** reviews section (`#reviews`, between `#smarter` and `#location`):
  static card grid, gold stars, guest first name + last initial, room type, stay month,
  "Verified stay" badge on real reviews only. Footer gains a Guest reviews link.
- Stay-gated reviews: `stay_reviews` table (UNIQUE on `reservation_id` = 1 review per stay) +
  `customer_submit_stay_review` RPC (`NOT_BOOKED` / `STAY_NOT_COMPLETED` / `ALREADY_REVIEWED` /
  `INVALID_REVIEW`; service_role only). Only `checked_out` stays reviewable.
- Customer portal: `StayReviewCard` (star picker with aria-pressed, textarea 10–1000 chars,
  read-only thanks state) rendered on `my-reservations/[id]` for checked-out stays only;
  `GET/POST /api/account/reviews` (guest-only, zod).
- Dummy fallback: `DUMMY_REVIEWS` in `lib/stay-reviews.ts` shown only while the table is empty;
  never mixed with real rows; no seeded rows in any migration.
- Design followed impeccable + ui-ux-pro-max guidance: static grid (no carousel), one-unit
  GSAP reveal mirroring `.coast-room-grid`, 44px touch targets, reduced-motion safe (no JS
  animation — CSS kill-switch covers it).

## Files
- New: `supabase/migrations/20260935010000_stay_reviews.sql`, `lib/stay-reviews.ts`,
  `lib/stay-reviews.test.ts` (9), `app/api/account/reviews/route.ts`,
  `components/customer/stay-review-card.tsx`
- Edited: `app/(landing-page)/page.tsx`, `app/(landing-page)/landing.css`,
  `components/landing/landing-motion.tsx`, `app/(booking)/(customer)/my-reservations/[id]/page.tsx`,
  `app/customer-portal.css`, `SYSTEM.md` (§7.1, §7.3), `HAVEN-Hotel-System-Guide.md`

## Gates
- typecheck clean; lint 0 errors (72 pre-existing warnings, none from new files);
  **977/977 tests** (88 files); `next build` clean (`/api/account/reviews` registered).

## Pending (not done here)
- `supabase db push` for `20260935010000` + live probe (checked_out submit → landing shows it;
  second submit → ALREADY_REVIEWED; pending submit → STAY_NOT_COMPLETED).
- Manual UI pass: landing `#reviews` desktop/mobile, past-stay review card submit flow.
- Working tree still uncommitted (pre-existing condition).
