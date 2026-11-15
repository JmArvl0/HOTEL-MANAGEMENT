# 2026-11-15 - Validation Audit Retest

The user requested another test of the remaining 20 audit repairs. Verification used the current working tree, Node 22.22.2, a new isolated PostgreSQL replay, and the isolated production build. No application source repair was needed. SHA-256 fingerprints confirm all 1,045 captured source/config/migration files stayed unchanged during verification.

## Results

| Check | Result |
| --- | --- |
| Full Vitest | 2,581 tests across 256 files passed, four workers, 270 seconds |
| TypeScript | Standalone `tsc --noEmit` and production build typecheck passed |
| Scoped ESLint | 145 code files, zero errors, seven warnings |
| Migration replay | All 148 migrations applied to a new local audit database; all 103 public tables have RLS |
| Real PostgreSQL | 118 checks passed across six suites |
| Actual localhost HTTP | 27 checks passed against the production build, without browser API interception |
| Installed Edge | 13 checks passed, including layouts at 1440, 390 and 320 px, with no runtime errors |
| Production build | Isolated Next production Webpack build passed |

The real SQL checks comprise 20 audit scenarios, 14 Xendit scenarios, 26 inventory/availability scenarios, nine F01/F02 request/amendment scenarios, 13 hotel-operation scenarios and 36 enterprise-boundary checks. They cover concurrent retries, lost hold responses, account identity collisions, rate budgets, capacity conflicts, reports exceeding 1,000 records, uncertain Xendit sessions, late captures and duplicate events.

Actual HTTP checks verified guest/Accounting authorization, cross-origin and Fetch Metadata rejection, unsupported browser write formats, malformed JSON handling, invalid international phones, bcrypt's Unicode byte boundary, scheduled-job authorization, and Xendit callback authentication. Eight retired payment actions still returned HTTP 410, including PayMongo, manual guest deposits/balances and manual Verify/Reject.

The browser used synthetic API responses for the booking, registration and reconciliation components. Field errors, focus, canonical international phone input and overflow checks passed. The reconciliation actions submitted the selected payment/session or evidence, released busy state, and recovered after a failed refresh. Mobile screenshots were inspected. The fixture navigation is QA-only and does not ship.

A subsequent user-requested screenshot review found the standalone desktop reconciliation fixture occupying the empty sidebar column. Its preview-only wrapper was corrected for capture; application/payment code was unchanged. The earlier width checks asserted no horizontal overflow and did not establish correct desktop column placement. Full signed-in staff-shell visual verification remains separate. The requested preview PNG files were displayed and then deleted as instructed; earlier test evidence remains in the retest directory.

## Scope and evidence

Logs, 40 combined HTTP/browser assertions, screenshots, source fingerprints and `summary.json` are in ignored `.tmp/audit20/retest-20261115/`. SQL suites cloned and discarded their own loopback-only fixture databases. No hosted database writes, real wallet transactions, live email, push or deployment occurred. Provider responses in the local webhook/browser tests are synthetic; hosted Xendit verification of these new repairs remains pending their rollout. The prior release checkout remains at `d95d14b`.

Implementation and migration details remain in [[2026-11-15 - Remaining Validation Audit Repairs]].
