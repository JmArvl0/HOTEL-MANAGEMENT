# 2026-11-15 - Guest Payment Retirement

- Retired PayMongo checkout and callbacks, manual guest deposit and stay-balance submissions, staged payment proofs, and Owner destination and QR updates in the application. Retired routes return HTTP 410.
- Owner and Admin share an audited Xendit or Off control. Previously selected Xendit keeps its checkout, wallet options, webhook, and guest status polling. Later guest balances are collected through Front Desk.
- Existing payments and proof remain readable. Accounting can verify prior manual submissions. Staff collection and refund workflows continue. Shared database functions and migration history were retained.
- 201 focused Vitest tests and 14 isolated PostgreSQL Xendit scenarios passed. TypeScript and scoped ESLint passed. No hosted deployment or payment was made.
- Audit F05 and F10 are addressed by retirement at rollout. 23 findings remain open, including F03 and F20.
- The isolated production Webpack build passed on Node 24.21.
- 12 localhost HTTP checks passed on the isolated build.
- Full Vitest suite passed with 2,546 tests across 250 files.

## Accounting follow-up

- Retired Accounting's manual approval and rejection routes for guest deposits and stay balances. Old calls return HTTP 410.
- Payment History and Transactions retain recorded status, references, and proof access. The sidebar workload badge, SLA alerts, and policy editing control for manual review were removed.
- Unsettled legacy guests see Front Desk guidance with their original payment reference. Existing payment rows and SQL history were retained. No automatic payment decisions or cancellation were applied.
- Xendit remains provider-settled. All 14 isolated PostgreSQL scenarios and 395 focused tests passed.
- Audit F03's affected app routes are now retired. Together with F05 and F10, that leaves 22 open app findings.
- TypeScript, scoped ESLint, isolated build, 16 localhost HTTP checks, and Accounting browser checks at 1440 px and 390 px passed.
- Full Vitest suite passed with 2,534 tests across 250 files after the Accounting follow-up.

## Payment retirement production release

- GitHub main advanced to `d95d14b7a68dd305fc3fa9b6cb7bf9de332039a9`. Vercel deployment `BrfqJedmEfGtef2SaD1gquHsSY3u` completed.
- A read-only preflight found four pending manual payments and zero pending PayMongo payments. Legacy status and proof remain accessible where authorized. No payment records were changed.
- Twelve hosted retired actions returned HTTP 410. The unauthenticated guest payment-status read returned 401.
- The hosted Xendit sandbox GCash deposit and Maya full-payment fixtures matched provider and paid-ledger records. Both retries returned the original confirmations and made no duplicate payment. The webhook rejected a missing token and accepted the valid sandbox token for an unmatched health event.
- Hosted checkout mode is Xendit and Xendit/shared payment SQL fingerprints match. This release required no migration or new wallet payment.
- The isolated Node 22 production build, TypeScript, and payment regressions passed. Full Vitest finished with 2,426 passing tests and the same four failures reproduced on the production baseline, covering sidebar grouping, purchase orders, and landing-page reviews.
