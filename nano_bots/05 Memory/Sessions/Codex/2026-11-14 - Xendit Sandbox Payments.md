# Xendit sandbox reservation payments — 2026-11-14

User requested direct implementation of current Xendit Payment Sessions for GCash/Maya,
strictly Test Mode, preserving booking rules and unrelated modules. Follow-up: user has a
key but no webhook yet and wants setup requirements after implementation. No credentials
were requested in chat. One agent; no delegation.

## Implemented

- Follow-up adds **Pay deposit** and **Pay in full** to the GCash/Maya checkout with
  a live payment summary. `20261114020000_xendit_payment_choice.sql` retains the
  original amount on retry and allocates a completed full charge to the deposit and
  stay balance in one transaction. Existing deposit-based cancellation/no-show fee
  calculations continue to use the deposit allocation.
- Server-only `POST /sessions` with Basic `test-key:` authentication, PAY/PAYMENT_LINK,
  PHP/PH, automatic capture, actual frozen deposit, unique reference, configured HTTPS
  returns and documented GCASH/PAYMAYA channels. Live/public keys and live checkout
  hosts are rejected. Never silently falls back to real wallet transfer.
- Existing hold/reservation/invoice/payment architecture reused. New transactional
  checkout claim prevents duplicate external creation, including double-clicks and
  uncertain HTTP outcomes. Exact rooms, DNR, rate snapshots and optional breakfast
  pricing remain authoritative. No Fleet implementation was changed.
- Token-authenticated webhook independently retrieves the session under the test
  credential and validates reference/session/PHP amount/transaction. Atomic settlement,
  paid timestamp, transaction reference, replay protection, stale expiry and durable
  review outcome for late settlement. Existing states and immutable audit logs reused.
- Guest method selection, sandbox disclosure, loading/error/pending/cancel-return,
  retry and expiry screens; confirmation cannot be granted through a return URL.
  Existing status polling releases missed expired holds. Owner/Admin can select Xendit;
  manual staff verification and the PayMongo boundary cannot settle Xendit rows.
- Additive migration `20261114010000_xendit_sandbox_sessions.sql`. Hosted ledger checked
  read-only before numbering:122 entries/latest20261113020000. No hosted apply or deploy.
  Actual provider channel is stored only if supplied; selected wallet is separate.

## Verified

- Hosted release used a scoped Supabase CLI dry-run and push of exactly
  `20261114010000` and `20261114020000`. Ledger advanced from 138 to 140.
  Both RPCs and the saved charge amount exist, and guest roles cannot call the
  checkout RPC directly. App commit `bbea22d` was based on current GitHub main and
  pushed as a fast-forward. The release branch passed 98 focused tests and
  ESLint with 7 existing shared-component warnings. Local webpack type validation
  flagged two pre-existing route exports. GitHub's Vercel check later reported
  deployment complete. The public webhook returned 401 without a token, the
  checkout POST returned 401 without a guest session, and both wallet logos
  returned 200. Manual GCash remains the active setting. On follow-up, both
  Xendit Dashboard Test Mode callbacks returned 400 for the legacy SAVE/IDR
  sample. Deployed `6424807` with a minimal reference lookup before strict
  validation of known attempts. Both Dashboard callbacks then returned 200
  `ignored_unmatched_reference`; focused 23 tests and touched-file lint passed.
  With user authorization, enabled and left Xendit sandbox active. The deployed
  guest checkout rendered both amount choices and created test-hosted GCash
  deposit (₱3,840 of ₱12,800) and Maya full (₱11,600) sessions. On follow-up, both
  were completed via Xendit's eWallet Test Payment simulator. The hosted webhook
  audits recorded `payment_session.completed` and outcome `confirmed` for both.
  Booking RSV-C67EB787 has a partial invoice with ₱8,960 due. Booking RSV-D1628C3B
  has a paid invoice with ₱0 due. Verified timestamps and provider transactions
  were saved. Both sandbox bookings remain confirmed for review.
- Follow-up passed the isolated production build, signed-in HTTP smoke (initial
  summary, logos, rejection of a client amount, and full amount on retry), 14 Xendit
  SQL scenarios, 23 backend regressions, 17 cancellation/folio scenarios, typecheck,
  touched-file lint and the full 2,578-test suite. The
  browser tool was unavailable for the follow-up. Preview 3113 is local and uses
  disposable data and placeholder payment credentials.
- Node22.22.2 `npm run typecheck` and `npm run build -- --webpack` pass. Isolated build
  output `.tmp/xendit/build-final`; generated Next type paths restored exactly to the
  pre-task contents, preserving the user's earlier edits.
- Full `npm test -- --maxWorkers=4`:2,577 tests/247 files pass. Includes provider/auth,
  callback verification, invalid values, optional-null expiry fields, unmatched Dashboard
  samples, stale events, ambiguous timeout, guest input and UI double-click tests.
- Full migration replay and23 existing PostgreSQL regression scenarios pass.
  `scripts/xendit-sandbox-db-test.mjs`:12 real SQL groups pass, including both channel
  mappings, amount/snapshot preservation, exact room/final-room concurrency, duplicate
  claims/transactions, ownership/manual/provider denial, expiry and late-paid review.
- Interactive IAB browser, production build, signed-in disposable guest/PostgreSQL/
  PostgREST: default desktop/1440/768/390px observed. Wallet selection and phone checkout
  fit; success return remains unpaid/pending, cancellation stays unpaid, and polling
  changes the page to expired with a retry link after the fixture deadline is advanced.
  Phone/tablet DOM had no horizontal document overflow. No checkout was submitted to
  Xendit. Storage substituted, email disabled, dummy test configuration only. Owned
  fixture/servers removed and isolated PostgreSQL cluster stopped afterward.
- Feature source style lint0 findings. Impeccable detector's first invocation failed
  reading a shared settings file; the introduced UTF-8 encoding issue was corrected
  and subsequent webpack/ESLint reads succeed. No detector pass is claimed.
- Final affected-file ESLint:0 errors/7 existing shared-component warnings;
  evidence in `.tmp/xendit/lint-final.log`. Diff whitespace
  checks pass. No credentials or raw customer notification bodies logged.

## Remaining setup / limits

No Xendit environment settings were present locally. Actual hosted sandbox checkout,
GCash/Maya simulation, Dashboard delivery and deployed end-to-end behavior are not yet
verified. User will configure a secret Test Mode key, Dashboard webhook verification
token and public HTTPS app origin, then register Completed and Expired session topics
at `/api/webhooks/xendit`. Use the agreed scoped Supabase CLI release for compatible
schema/app; other pending migrations must not be accidentally pushed. Late-paid review
does not implement automatic refunds/reconciliation. No real money or live wallet use.

Complete files list, environment, Dashboard settings and local/deployed test procedure:
`docs/integrations/XENDIT_SANDBOX.md`. Existing unrelated dirty work and oversized memory
sections were preserved; this task adds small linked handoff/status entries only.

## User-facing local preview follow-up

User asked to run and open the implemented screen directly. Latest verified production
build is running at loopback3106 with a new disposable guest/room hold, shown directly
in a visible retained IAB tab. Sample total PHP5,000/deposit PHP1,500; no real provider
checkout submitted. Preview deliberately remains running for user inspection: owned
PostgreSQL55432, app3106, local proxy3107 and PostgREST3108. Ignored lifecycle receipt:
`.tmp/xendit/preview-fixture.json`; launcher `.tmp/xendit/serve-preview.mjs` (exec4620).
Hold expires on its normal15-minute timer. No hosted DB/env/deployment changes.

## Checkout UI refinement

User clarified that the UI reference should come from existing external payment
products, then supplied a checkout image with payment choices beside the bill.
Adapted the composition using Stripe's published Checkout/Payment Element examples
and the user's reference: rounded Haven surface, official GCash/Maya logo rows,
clear selected state, wallet-specific action and the existing authoritative stay
summary alongside. Summary stacks below900px. No gateway/pricing/status logic changed.
Logo sources and usage are recorded in public/payments/README.md. Added only the
scoped component CSS, selector markup and payment-stage presentation; existing
interaction test's action label updated. No generated brand art or fake card fields.

Browser observed desktop1440px light/dark, tablet768px, phones390px/320px. Both logos
load; native arrow-key selection and dynamic action work; choice78px/action48px.
Caught and fixed320px summary currency wrapping; final computed currency cells are
nowrap and document305px within viewport320px. Final build and serial regression
results are in .tmp/xendit/ui-build-final.log and ui-tests-serial.log. Earlier concurrent
build/full-suite run hit two5s source-scan timeouts; standalone32 guard tests passed.
Final checkpoint runs build then tests sequentially rather than weakening timeouts.

Current live preview: loopback3106 via .tmp/xendit/serve-ui-preview.mjs, development
output .tmp/xendit/ui-dev. New owned fixture receipt .tmp/xendit/ui-preview-fixture.json
contains lifecycle PIDs (PostgREST was restarted separately on3108 after its first
process exited). Proxy3107/DB55432. The prior preview fixture remains disposable;
no hosted writes. Sample hold refreshed through the normal booking RPC for inspection.

The final sequential production build and full suite passed (2,577 tests across
247 files). The two prior timeouts cleared. Final UI ESLint and Impeccable scan
were clean. Existing Next generated type paths were restored. Production preview
now serves the verified build on loopback3110 with proxy3111 and PostgREST3112,
using .tmp/xendit/ui-production-fixture.json for lifecycle tracking. The server,
active PHP1,500 sample hold and both local logo responses were verified. Browser
checks at the listed widths were completed in the earlier preview. The final
automated tab handoff was unavailable due to browser tool limits.
