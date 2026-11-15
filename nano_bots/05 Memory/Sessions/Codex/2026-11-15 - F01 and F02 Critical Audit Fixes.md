# 2026-11-15 - F01 and F02 Critical Audit Fixes

- Blocked generic guest-request POST and PATCH while preserving the role-scoped list. Guest and staff routes continue to submit, review, route and fulfill requests.
- Added one reservation amendment transaction for guest self-service, Manager review and Front Desk execution. Notes preserve the exact assignment, paid amounts and the folio. Changes to dates or room type apply the frozen lodging delta to the existing invoice and preserve retained nightly rates and ancillary charges. A conflicting exact room requires Front Desk to confirm a replacement with the guest and supply the selected room.
- Changes that affect dates, type or party wait while online checkout is pending. Notes can still be saved. The amendment takes inventory locks without waiting behind a concurrent checkout while it holds the reservation row.
- Checked the hosted migration ledger read-only through 20261114020000. The next local version after 20261114030000 is 20261115010000. No hosted application or migration rollout.
- Replayed 142 migrations. Passed 9 guest-request and amendment cases, 26 inventory cases, 14 Xendit cases, 13 hotel operations cases and 36 enterprise boundary checks. All six Xendit SQL definitions matched the earlier replay.
- F01 and F02 are addressed locally. Twenty original audit findings remain open.
- TypeScript, scoped ESLint, production Webpack build, and five actual local HTTP responses passed.
- Full Vitest suite passed with 2,540 tests across 251 files.
## Production deployment

- The user authorized deploying F01 and F02 with their migration. Release `17e7c5580c8bd04ec2b88ec74ba8eae9f24acb98` isolates ten files atop production `0f81105`. Node 22 production build and 124 focused tests passed in the release checkout.
- Supabase dry-run and apply each selected only `20261115010000_reservation_amendment_integrity.sql`. Production ledger, amendment entry points, helper access, and associated column were verified. Checkout mode remained Xendit. Fingerprints of Xendit and shared payment functions matched before and after the deploy.
- GitHub main advanced to `17e7c55`. Vercel deployment `GsVPT5SJXHsPpz65ZHcdT9armi8d` completed. Canonical site `https://haven-hotel-management-ten.vercel.app` passed all six post-deployment Xendit checks.
- The existing synthetic GCash deposit and Maya full-payment sessions independently remained completed and matched the paid ledger. Both authenticated retries returned their confirmed bookings without adding or modifying payment rows. The hosted webhook returned 401 without a token and 200 with the valid test token for an unmatched health event.
- No new wallet payment was initiated. The earlier payment retirement changes were outside the deployed F01/F02 source scope.
