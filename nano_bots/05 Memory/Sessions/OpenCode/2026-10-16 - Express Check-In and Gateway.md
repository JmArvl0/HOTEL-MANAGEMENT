# 2026-10-16 - Express QR Self-Check-In & Gateway Integration (OpenCode)

Approved reversals: 9A manual-only (real PayMongo provider selected) and the
no-self-check-in rule (pre-verified + zero-balance + ready-room exception).
ID uploads queue for Front Desk review; upload alone never verifies.

## Added
- Migration `20261016010000_express_checkin_and_gateway.sql`: gateway columns
  + unique indexes on payments, `digital_key_hash` on reservations,
  `guest_id_documents` table + private `guest-ids` bucket,
  `submit_gateway_deposit` / `confirm_gateway_payment` /
  `express_qr_self_check_in` RPCs (service-role-only, null-safe guest guard),
  `ai_interactions.feature` extended with `guest_concierge` (fixes a latent
  concierge-session bug: inserts would fail the check live).
- Reused, not duplicated: `identity_status` (+ existing verified_by/at),
  SHA-256 hex QR scheme, folio transport itemization, `verify_guest_identity`.
- Routes: `POST /api/booking/payments/gateway` (hold-token flow),
  `POST /api/webhooks/payments` (HMAC-first, replay-safe 200s),
  `POST /api/qr/express-checkin` (guest, speakable 409s),
  `POST /api/staff/reservations/[id]/verify-id` (front-desk),
  `POST /api/account/reservations/[id]/id-document` (magic-byte upload).
- UI: `app/checkin/kiosk/page.tsx` + `components/checkin/express-kiosk.tsx`
  (jsQR + manual fallback, success/digital-key card, Front-Desk routing card),
  `PreArrivalIdUpload` (embedded in reservation detail when confirmed +
  unverified), `PaymentMethodSelector` (gateway beside manual GCash).
- Tests: `lib/express-checkin.test.ts` (HMAC, event mapping, webhook domain,
  migration contract incl. all 8 eligibility codes); 9A block of
  `lib/ota-readiness.test.ts` rewritten for the reversal.

## Gates
`npm run typecheck` clean, `npm run lint` 0 errors, `npm test` 1612/1612,
`npm run build` compiles, `git diff --check` clean. Env needed for live use:
`PAYMENT_GATEWAY_SECRET_KEY`, `PAYMENT_GATEWAY_WEBHOOK_SECRET`.

## Lesson
PowerShell 5.1 `Set-Content -Encoding utf8` round-trips corrupt non-ASCII
chars in files without BOM (mojibake broke `change-request-redesign.test.ts`).
Prefer the Edit tool; when patching via shell, write bytes back as
BOM-less UTF-8 and re-run the affected tests.
