# 2026-10-02 — Confirmation Page Stay Summary Aside Removal

## Context

On the booking deposit confirmation page (`/booking/confirmation/[id]`), the guest is presented with a complete summary card (`section.confirmation-card.deposit-confirmation`) showing all stay details:
- Room type
- Check-in / check-out dates
- Nights / guest count
- Stay total
- Transportation request details
- Required reservation deposit
- Deposit paid
- Remaining balance
- Reservation status & payment status
- Payment proof thumbnail
- Check-in QR code and reservation actions

Directly below this card was an extra `<div className="confirmation-stay"><BookingStaySummary ... /></div>` (`aside.review-stay-card`), which duplicated the room name, dates, nights, guests, total, and balance, cluttering the confirmation screen unnecessarily.

## Changes

1. **`app/(booking)/booking/confirmation/[id]/page.tsx`**:
   - Removed the `<div className="confirmation-stay"><BookingStaySummary .../></div>` element (`aside.review-stay-card`) from this page only.
   - Removed unused import `BookingStaySummary`.
   - Removed unused `supabase` import and the query fetching `room_types.photo_urls` (`stayPhotos`), which was only needed by `BookingStaySummary`.
   - Removed unused `transportTotal` import and unused `transport` array assignment.
   - Preserved all other confirmation page logic, pending actions, proof thumbnail, and check-in QR code.

2. **`components/booking/booking-stay-summary.test.tsx`**:
   - Updated integration test assertion to verify that `app/(booking)/booking/confirmation/[id]/page.tsx` does NOT include `BookingStaySummary`, while details, review, and payment continue to use it.

## Verification

- `eslint "app/(booking)/booking/confirmation/[id]/page.tsx" "components/booking/booking-stay-summary.test.tsx"`: 0 errors, 0 warnings.
- `npm run typecheck`: clean (0 errors).
- `npx vitest run components/booking/booking-stay-summary.test.tsx`: 17/17 passed.
- `npx vitest run components/booking/ lib/paymongo.test.ts lib/customer.test.ts`: 17 files / 212 tests passed.
- `npm run build`: compiled successfully, all 88 pages generated clean.
