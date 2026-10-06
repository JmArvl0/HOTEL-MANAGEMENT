# Cancelled Stay Refund Explanation & Policy Modal

**Date:** 2026-10-06  
**Scope:** Customer Reservation Detail (`/my-reservations/[id]`)  
**Status:** Completed & Verified  

---

## 1. Problem & Request
In the customer reservation detail view (`components/customer/reservation-detail-view.tsx`), when a stay is cancelled and no refund is due:
```html
<section class="crd-refund-status" aria-label="Refund status">
  <p class="crd-change-eyebrow">Refund</p>
  <p class="crd-change-state">No refund due</p>
  <p>This cancellation is not eligible for a refund under the policy that applies to this reservation.</p>
</section>
```
Guests need clear, informative insight into *why* no refund is due rather than an unexplained generic dead end. The user requested adding a **"See more"** button in this section that opens an informative modal.

---

## 2. Changes Made

### 1. Trigger Affordance in `reservation-detail-view.tsx`
- Added `<button type="button" className="customer-inline-action crd-refund-more-btn" onClick={() => setRefundInfoOpen(true)}>` directly within `<section className="crd-refund-status">` when `!activeRefund`.
- Accompanied by `HelpCircle` icon and `aria-label="See more details about why no refund is due"`.

### 2. Informative Refund Policy & Eligibility Modal
- Rendered using Haven's accessible `<Modal>` primitive with `headerVariant="branded"`, `size="md"`, and `portal={true}` for full-viewport backdrop dimming.
- Features:
  - **Dynamic Contextual Reason Card**:
    - **No payments or deposits collected** (`money.paid === 0`): Explains that no reservation deposit or stay payments were recorded on the folio before cancellation, so there is no collected payment balance to return.
    - **No-show forfeiture** (when cancellation reason mentions no-show): Explains that reservations marked as a no-show past property check-in cutoff forfeit the reservation deposit.
    - **Non-refundable notice window** (`money.paid > 0`): Explains that cancellations requested inside the notice cutoff window (< 7 days before scheduled arrival) forfeit the deposit to compensate for reserved inventory held off the market.
  - **Reservation Financial Breakdown Card**:
    - Total Stay Folio
    - Amount Paid
    - Balance Outstanding (`₱0.00`)
    - Eligible Refund Due (`₱0.00` highlighted)
  - **Booking Cancellation Policy Rules**:
    - Visual chip breakdown of 100% full refund window, partial refund %, non-refundable cutoff, and no-show arrival cutoff.
  - **Extenuating Circumstances Guidance**:
    - Advises guests on support options in case of medical emergencies or travel disruptions, with a direct CTA to `/account/help`.

### 3. Server Page Snapshot Forwarding
- Updated `app/(booking)/(customer)/my-reservations/[id]/page.tsx` to pass `cancellationPolicy` snapshot object (`fullRefundDays`, `partialRefundDays`, `partialRefundPercent`, `noShowCutoffTime`, `hotelTimezone`) directly to `ReservationDetailViewData`.

### 4. Styles in `app/guest-booking.css`
- Added button reset and focus-visible rings for `button.customer-inline-action`.
- Added styles for `.crd-refund-more-btn`, `.crd-refund-modal`, `.crd-refund-reason-card` (info and warning variants), `.crd-refund-summary-box`, `.crd-refund-policy-section`, and responsive mobile layouts (`@media(max-width: 540px)`).

---

## 3. Verification Outcomes
- `npm run typecheck`: 0 errors.
- `vitest`: 184 test files passed, 2,052 tests passed.
  - Added test coverage in `lib/cancel-reservation.test.tsx` verifying:
    - "See more" button renders and is accessible.
    - Clicking "See more" opens the dialog with reason explanation and financial breakdown.
    - Closing via "Close" button closes the dialog cleanly.
    - Renders zero-payment explanation when `money.paid === 0`.
- `npm run build`: 88/88 static and dynamic routes compiled successfully with Next.js Turbopack.
