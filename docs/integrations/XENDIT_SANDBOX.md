# Xendit sandbox reservation payments

**TEST MODE ONLY**. No real wallet deductions are permitted.
The existing manual GCash and PayMongo history remain supported. Fleet code is unchanged.

## What you must configure later

Put these in your ignored `.env.local` and the deployment's server environment settings:

```dotenv
XENDIT_SECRET_KEY=
XENDIT_WEBHOOK_TOKEN=
APP_BASE_URL=
```

- `XENDIT_SECRET_KEY`: a **secret Test Mode** key beginning `xnd_development_`, with the required money-in read/write permissions. Public and live keys are rejected. Do not paste it into chat or client code.
- `XENDIT_WEBHOOK_TOKEN`: the verification token shown under Xendit Dashboard → Settings → Webhooks. This is separate from the API key; copy it into the server environment, never a frontend field.
- `APP_BASE_URL`: the public **HTTPS origin only**, with no path/query, for example `https://your-test-hotel.example`. The app builds return URLs from this configured origin, never a request's Host header.

Restart the local app or redeploy after changing environment settings. Choose **Xendit sandbox** in Owner → Payment Settings or Admin → System Health → Payment Configuration and save an audit reason. Merely configuring secrets does not switch the hotel's active payment method. Manual account name/number/QR are not required for Xendit.

## Exact Dashboard webhook settings

Switch the Xendit Dashboard to **Test Mode**. Under **Settings → Webhooks**, configure both topics below with the same POST destination:

| Dashboard topic | Event | URL |
| --- | --- | --- |
| Payment Session – Completed | `payment_session.completed` | `<APP_BASE_URL>/api/webhooks/xendit` |
| Payment Session – Expired | `payment_session.expired` | `<APP_BASE_URL>/api/webhooks/xendit` |

Use **Test & Save**. Xendit supplies `x-callback-token`; it must match `XENDIT_WEBHOOK_TOKEN`. Authenticated sample events with no corresponding local reference are acknowledged as `ignored_unmatched_reference`; they do not create payments or confirm reservations. Missing/incorrect tokens return 401. Invalid details return 400. Temporary provider/database failures return 503 to request redelivery. The integration does not use legacy Invoice/Payment Link webhook topics.

The return URLs are generated per reservation:

- Success: `<APP_BASE_URL>/booking/confirmation/<reservation-id>?checkout=returned`
- Cancellation: `<APP_BASE_URL>/booking/confirmation/<reservation-id>?checkout=cancelled`

Neither URL changes payment status. Only the authenticated webhook, cross-checked using the test API credential and settled transactionally, confirms a reservation.

## Database rollout

Apply `supabase/migrations/20261114010000_xendit_sandbox_sessions.sql` before `supabase/migrations/20261114020000_xendit_payment_choice.sql`. Both migrations are additive. Check the current hosted ledger at rollout. Both migrations were applied to hosted Supabase on November 14, 2026.

Review the target ledger and `supabase db push --dry-run` before rollout, then use the official **`supabase db push`** workflow. Use the release branch and review the pending migration list before applying a database change. Use the repository's isolated/scoped CLI release procedure for the agreed app/schema baseline. Never run `npm run migrate`. Deploy the compatible app and schema together; verify PostgREST sees the new RPCs.

The migration reuses `payments`, `reservations`, `invoices`, `booking_holds`, and immutable audit logs. It adds provider reference, checkout URL, expiry, creation-claim time, transaction ID, requested/actual channel and update time. Session IDs use the existing `gateway_reference_id`; paid time uses `verified_at`. Provider reference and external transaction IDs have uniqueness constraints. Existing payment states are reused: `pending_verification`, `paid`, `failed`, `expired`; no duplicate payment-status enum is introduced.

## Local and deployed test procedure

1. Use Node **22.22.2** and a migrated test database. Configure an HTTPS tunnel that forwards to the local app, or a separate HTTPS deployment. Set `APP_BASE_URL` to that public origin. For a local tunnel, set `NEXTAUTH_URL` consistently and open the public origin so sign-in cookies and return URLs stay together. Run `npm run dev` locally.
2. Register both webhook topics above against the tunnel/test deployment. Ensure the endpoint is reachable without deployment login protection. Do not disable guest authentication on booking routes.
3. Sign in as a guest, select an available room, enter details, review the server-calculated deposit, then select GCash or Maya and **Proceed to Payment**. The browser must open `dev.xen.to` or `checkout-staging.xendit.co`.
4. Use only Xendit's supported **sandbox authorization/simulator**. Do not enter a real wallet PIN, approve a real-wallet deduction, or change to Live Mode. If the wallet requires a real account or a channel is missing, stop that channel test and check Xendit account/partner restrictions.
5. Complete the simulated payment when offered. Inspect Dashboard webhook delivery and the guest confirmation. Verify one paid deposit, transaction reference, `verified_at`, updated invoice totals and a confirmed reservation; the existing receipt surface should become available.
6. Test both **Pay deposit** and **Pay in full** with GCash and Maya. Check that the summary, pay button, and Xendit amount agree. A verified full payment should leave a zero balance. Also test decline/cancel, retry, double-click, close/reopen checkout, expiry, webhook replay, and the success URL before payment. Confirm no duplicate charge or external creation claim, no confirmation from the URL, and room release on expiry.
7. Inspect payment history and Accounting's existing reports. Gateway rows cannot be manually verified. For a failed attempt within an active session, retry reopens that session; Xendit controls wallet authorization. An expired/cancelled session releases the reservation and the retry link starts a newly available room hold.

Checkout initially lasts 16 minutes, allowing margin over Xendit's minimum ten-minute expiry. The saved provider expiry becomes authoritative. Existing availability/status reads sweep missed expiry notifications. A completed payment arriving after inventory release is retained with its transaction ID and **Accounting review required**, never used to revive an unavailable room. Review the `xendit_webhook` audit entries and payment notes; automatic refunds and reconciliation are outside this capstone integration.

An ambiguous create timeout remains pending, because the Sessions API does not document an idempotent create header. The integration deliberately prevents a second POST. An authenticated webhook can recover the binding by its precommitted reference. Otherwise wait for expiry or investigate the session in the Test Dashboard; do not generate a second link for that attempt. Definitive provider rejections permit a safe retry. Retrying an existing link preserves its original wallet.

## Verification and current limits

Automated tests use fixtures and real disposable PostgreSQL, with no provider credentials or money. They are not evidence of a completed Xendit wallet payment. Local `.env.local` had none of the three Xendit settings during implementation; actual Dashboard delivery, GCash/Maya simulator completion, and deployed end-to-end verification remain manual setup steps. Never substitute a frontend success simulation if a channel is unavailable.

GCash and Maya are requested using the documented `GCASH` and `PAYMAYA` channel codes. Actual transaction channel is stored only when supplied by the provider; the guest's selection is stored separately and is not mislabeled as a verified channel. Provider error messages are reduced to safe codes; credentials, callback tokens and raw customer payloads are not logged.

## Verified local results (November 14, 2026)

- Node22 TypeScript check and production webpack build passed; full Vitest passed **2,577 tests across 247 files**.
- Real migration replay and 23 existing SQL regressions passed. Twelve Xendit SQL scenarios passed, including both wallet channel mappings, frozen breakfast/deposit pricing, exact rooms, concurrent create claims, final-room competition, duplicate/out-of-order events, manual/provider boundary denial, invalid values, expiry and delayed settlement review.
- Interactive browser QA used a signed-in guest on a disposable PostgreSQL/PostgREST fixture. Sandbox labeling, GCash/Maya selection and phone checkout layout passed; desktop success-return stayed unpaid/pending, tablet cancellation stayed unpaid, and polling automatically switched to expired with the new-hold retry link. Widths observed: default desktop, 1440, 768 and 390 px, with no horizontal document overflow in the measured phone/tablet states. No provider checkout was submitted. Storage was substituted; email and real payment credentials were absent. Fixture and local servers were cleaned up.
- Feature source style lint: zero findings. The Impeccable detector could not scan the shared settings file during its first invocation; its UTF-8 issue was fixed and webpack/ESLint subsequently read it successfully. This is not recorded as a detector pass.
- ESLint on affected files: zero errors, seven existing warnings in shared Admin/Manager/Owner components. No hosted migration/deployment, credential creation or real wallet transaction.

## Files delivered

- Provider boundary and transactional adapter: `lib/xendit.ts`, `lib/xendit-store.ts`.
- New routes: `app/api/booking/payments/xendit/route.ts`, `app/api/webhooks/xendit/route.ts`.
- New guest control: `components/booking/xendit-checkout.tsx`.
- Updated payment and confirmation pages, payment-status poller, and guest status endpoint.
- Updated payment-method helpers, Owner/Admin settings and data routes, System Health type, and staff gateway-verification guards.
- `.env.example`, this guide, `SYSTEM.md`, and session/handoff/status notes.
- Focused provider/webhook/route/component tests and `scripts/xendit-sandbox-db-test.mjs`.

Exact modified application files:

- `.env.example`, `SYSTEM.md`, `lib/payment-destination.ts`, `lib/system-health.ts`
- `app/(booking)/booking/payment/[token]/page.tsx`, `app/(booking)/booking/confirmation/[id]/page.tsx`
- `app/api/account/reservations/[id]/payments/route.ts`, `app/api/admin/data/route.ts`, `app/api/admin/deposit-method/route.ts`, `app/api/owner/data/route.ts`
- `components/booking/payment-status-poller.tsx`, `components/owner/payment-settings-panel.tsx`, `components/admin/system-health-ledger.tsx`, `components/manager/payment-details-dialog.tsx`, `components/manager/manager-dashboard-client.tsx`

New tests: `lib/xendit.test.ts`, `lib/xendit-webhook.test.ts`, `lib/xendit-checkout-route.test.ts`, `components/booking/xendit-checkout.test.tsx`. This task's memory record is `nano_bots/05 Memory/Sessions/Codex/2026-11-14 - Xendit Sandbox Payments.md`; the live handoff and Current Status have a small linked update.

## Official references checked

- [Create Payment Session](https://docs.xendit.co/apidocs/create-session) and [retrieve session](https://docs.xendit.co/apidocs/get-session): hosted mode, peso amounts, allowed channels, HTTPS return URLs, expiry and Basic authentication.
- [One-time payment](https://docs.xendit.co/docs/payment-1) and [session webhook schema](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session): completion notification and transaction correlation.
- [Handling webhooks](https://docs.xendit.co/docs/handling-webhooks): callback-token authentication, duplicate/out-of-order delivery and retries.
- [Integration setup](https://docs.xendit.co/docs/payments-integration-setup): Test Mode, channel restrictions and Dashboard topics.
- [GCash](https://docs.xendit.co/docs/gcash), [available channels](https://docs.xendit.co/docs/en/available-payment-channels), [Maya](https://docs.xendit.co/docs/maya) and [API keys](https://docs.xendit.co/docs/api-keys).
