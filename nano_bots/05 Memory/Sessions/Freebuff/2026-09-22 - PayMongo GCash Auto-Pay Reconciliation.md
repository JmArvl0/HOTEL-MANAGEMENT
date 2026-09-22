# 2026-09-22 - PayMongo GCash Auto-Pay Reconciliation (Freebuff)

Master task: automated GCash deposit confirmation via PayMongo gateway +
HMAC webhooks. Discovery: the DB backbone already existed (migration
`20261016010000`: gateway columns + unique indexes, `submit_gateway_deposit`,
`confirm_gateway_payment` with webhook-event replay) from the 2026-10-16
OpenCode session — a second schema migration would have been redundant
ceremony. The real gaps were wire-format accuracy, UI, and live-update wiring.

## Changed

- `lib/gateway.ts` — rewritten to PayMongo's real wire formats:
  `Paymongo-Signature` parser (`t`/`te`/`li`, HMAC-SHA256 over `"<t>.<body>"`,
  5-minute timestamp tolerance, `sk_test_`/`sk_live_` mode selection, legacy
  bare-digest still accepted), `resolveGatewaySecrets()` with `PAYMONGO_*`
  primary + `PAYMENT_GATEWAY_*` aliases, `toCentavos()` (₱1,500.00 → 150000,
  sub-centavo rejection), `createGCashCheckoutSource()` (GCash-only by default),
  `gatewayEventRef()` now handles v1/v2 payment.paid + reference fallback,
  new `gatewayEventAmountCentavos()` (direct amount or line-item sum).
- `lib/gateway-store.ts` — explicit paid-event list
  (`checkout_session.payment.paid`, `payment.paid`, `source.chargeable`);
  payload amount verified against the pending payment before the RPC.
- `app/api/webhooks/payments/route.ts` — canonical `paymongo-signature`
  header (legacy x-* aliases kept), `{received:true}` responses.
- `app/api/booking/payments/gateway/route.ts` — uses the new client +
  `toCentavos` (no more `Math.round(x*100)` float risk).
- Migration `20261021010000_paymongo_gcash_automation.sql` — idempotent
  re-assertion of the gateway surface + one real hardening: same-reference
  already-settled payments now return existing state (PayMongo delivers both
  `checkout_session.payment.paid` and `payment.paid` for the same money;
  previously the second channel dead-looped `GATEWAY_REFERENCE_CONFLICT`).
- UI: `payment-method-selector.tsx` rewritten (GCash Instant Auto-Pay card
  with amount + 3 steps + branded button, manual-verification card beside it);
  broken one-line import in `payment/[token]/page.tsx` fixed;
  `gatewayConfigured()` replaces the raw env probe; new
  `payment-status-poller.tsx` (5 s poll of the new guest-scoped
  `GET /api/account/reservations/[id]/payments`, router.refresh on flip,
  aria-live, reduced-motion-safe pulse) mounted on the confirmation page;
  `.gateway-*` + poller CSS in `guest-booking.css`.
- Truth: `.env.example` PayMongo section (endpoint + events documented),
  `SYSTEM.md` §4 env list, §7.2 flow pointer + new §7.2.1, honest Phase-9A
  gap rewrite.

## Tests

- New `lib/paymongo.test.ts` (29): centavos, header parsing (docs examples,
  empty te/li, bare-hex rejection), signature verification (valid te/li,
  tamper, wrong secret, expired timestamp, legacy digest, empty inputs),
  event ref across all real shapes, amount extraction, paid-only mapping,
  amount-mismatch rejection, idempotent replay through the RPC stub,
  migration contract. Updated `ota-readiness.test.ts` + `deposit.test.ts`
  for the relocated manual-honesty copy.

## Gates

typecheck clean; eslint 0 errors on touched files (3 pre-existing warnings
elsewhere); **1704/1704 tests (153 files)**; production build green;
`git diff --check` clean. Not done here: `supabase db push` (explicit
deployment task), PayMongo dashboard webhook registration, browser QA
(no runner — KI-005).

## Env for live use

`PAYMONGO_SECRET_KEY` (sk_test_/sk_live_), `PAYMONGO_WEBHOOK_SECRET`
(legacy `PAYMENT_GATEWAY_*` names still work). Register
`POST <NEXTAUTH_URL>/api/webhooks/payments` subscribing to
`checkout_session.payment.paid` + `payment.failed`.
