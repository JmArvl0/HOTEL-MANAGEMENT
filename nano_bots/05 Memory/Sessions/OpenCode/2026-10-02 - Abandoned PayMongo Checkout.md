# 2026-10-02 - Abandoned PayMongo Checkout (Ghost Booking)

## Symptom
With PayMongo active (test mode, no completable payment method), pressing Back
after "Proceed to GCash Payment" left the system looking like it accepted the
payment with none made.

## Root cause chain (all source-verified)
1. `submit_gateway_deposit` creates the pending reservation + pending payment
   and flips the hold to `payment_submitted` BEFORE money moves (by design).
2. Back (browser, or PayMongo cancel URL) → payment page sees
   payment_submitted + reservation_id → redirects to confirmation
   (`payment/[token]/page.tsx:20`). Guest can never reach a payment screen.
3. Confirmation copy ("Your payment reference was submitted.") reads as
   accepted though nothing was submitted or paid.
4. Ghost is immortal: expiry only touches `active` holds; gateway rows carry
   `payment_due_at=NULL`. Blocks inventory forever; pollutes staff queue where
   one verify click would confirm a zero-money stay (verify checked amounts
   only). No cancel/retry path existed.

## Fix (20261024070000, pushed + live-verified; UI via git)
- `cancel_gateway_attempt` RPC (guest-owned, idempotent) + `POST
  /api/account/reservations/[id]/cancel-attempt` + `GatewayPendingActions`
  (cancel → back to room search with same dates).
- `expire_booking_holds` gateway-only 24h lapse (manual rows untouched).
- `verify_reservation_deposit` raises `GATEWAY_MANUAL_VERIFY_FORBIDDEN` on
  gateway rows; route maps to 409; queue shows "Awaiting provider", Review
  hidden (Reject + View kept), dialog hides Verify with explainer note.
- Confirmation gateway-pending copy: "No payment received yet."

## Gates
typecheck clean; eslint 0 errors (2 pre-existing warnings); paymongo 40/40;
full 1928/1929 (1 pre-existing unrelated password-reset-audit failure); build
clean. Live: ledger `20261024070000`, cancel fn present, guard live.
