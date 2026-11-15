# Breakfast guest browser QA

Date: 2026-11-13. Result: the tested breakfast booking and PNG download flow passed.

## Environment and limits

Used real headless Microsoft Edge through Playwright against the existing Node 22
webpack production build at loopback port 3091. PostgREST 16.5 connected to a
unique disposable PostgreSQL 18 clone containing the project migrations. The
clone received the baseline service-role table grants supplied by Supabase.
No hosted database, real guest, wallet, payment, email or restaurant was used.
Storage uploads/downloads used an in-memory local HTTP substitute.

The guest signed in through the actual password form. Login OTP was disabled
only in this disposable fixture; OTP and account registration were not tested.
Accounting verification used the real `verify_reservation_deposit` SQL RPC
with a synthetic Accounting actor, rather than the staff browser screen.
The test runner closed Edge, stopped its Next/PostgREST servers and dropped
its unique database clone on completion. No application source fix was needed.

## Verified steps

1. Open the exact-room page for November 25–27, 2026, two guests. Select the
   breakfast booking action and sign in. The callback retained the room,
   dates, party size and selected offer; breakfast remained selected.
2. Switch between Room only and Room with breakfast. Room-only total was
   ₱5,000, deposit ₱1,500, balance ₱3,500. Breakfast added ₱450 × 2 guests ×
   2 mornings = ₱1,800: total ₱6,800, deposit ₱2,040, balance ₱4,760.
3. Complete Guest details, create the actual hold, open Review and proceed
   to the deposit page. PostgreSQL confirmed the combined hold total and deposit.
4. Upload a synthetic PNG receipt through the browser and submit a synthetic
   GCash reference. Payment was stored as ₱2,040 / `pending_verification`.
   The pending confirmation did not expose a View breakfast pass link.
5. Verify the deposit using the SQL RPC and reload the guest confirmation.
   Navigate through My Reservations → reservation → View breakfast pass.
   The selected day displayed Breakfast for 2 guests, 0 of 2 used and a QR.
6. Select each breakfast date and click Download pass image. Edge emitted
   real download events with filenames `haven-breakfast-2026-11-26.png` and
   `haven-breakfast-2026-11-27.png`. Decode each downloaded PNG at 900px and
   390px: every QR matched its corresponding database entitlement code.
7. At a 390 × 844 viewport, wait for the sidebar transition, confirm the
   download control is unobstructed and verify no horizontal document overflow.
   Inspect the stable mobile screenshot, desktop pass and downloaded PNG.
   The successful run recorded no unhandled browser errors.

## Guest-facing observations

- The pass and optional download are easy to find inside the reservation.
  Date buttons distinguish each morning, and the saved image shows its covered
  guests, date, hours and venue. Live remaining usage stays on the web page.
- Guest details still has a separate room-only sidebar estimate beside the
  combined breakfast estimate. It is explicitly labelled, but synchronizing
  that sidebar would make the total easier to understand.
- The shared mobile header title is cramped beside the menu control. The
  breakfast content and download remain usable; header polish is separate work.

## Evidence

Local, ignored artifacts are under `.tmp/breakfast-browser/`: the prepared
`run.mjs`, `01-guest-details.png`, `02-review.png`, `03-pending.png`,
`04-my-reservation.png`, `05-breakfast-pass.png`, `06-pass-mobile.png` and
the two downloaded PNGs. Screenshots contain synthetic data only. The first
mobile capture caught a sidebar transition; the final screenshot was recaptured
after the transition completed.

Hosted deployment, live Supabase Storage delivery, OTP/registration,
real payment processing, physical-camera scanning and restaurant/POS sandbox
acceptance remain outside this check.
