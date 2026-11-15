# 2026-11-15 - Remaining Validation Audit Repairs

Implemented the 20 findings remaining after the deployed F01/F02 fixes and guest-payment retirement. The repairs are local. Production remains at payment-retirement release `d95d14b`; no deployment or hosted database write occurred in this work.

## Verified implementation

- F04/F06. Actor and payload checks precede retry-result lookup. Booking attempts retain a stable key across lost responses and recover the original hold. Intentional separate attempts remain possible.
- F07/F08/F21. Shared calendar, hotel-local day, conditional transportation and arrival validation agree with SQL. Both transport legs must fit the stay. Online checkout requires configured Xendit and a positive active deposit policy.
- F09/F11/F12/F13. Strict numbers and cent precision, validated canonical international phones, bcrypt's 72 UTF-8 byte ceiling for new passwords, atomic hashed email/IP budgets, uniform deferred reset responses, purpose-bound OTPs, and registration without unverified historic CRM ownership claims.
- F14/F15/F18. Capacity changes serialize with live commitments. Merged amenities are normalized/capped. Public room photos are decoded and re-encoded; private evidence is decoded and dimension-bounded. Photo attachment/deletion serialize and protect references.
- F16/F17/F22/F23. One hotel-time SQL report snapshot avoids API row limits and verifies preview version at submit. Literal room lookups, deliberate route error classes, stock workflow enforcement, stale asset-write guards and room clearing, per-device idle authority and browser-write boundaries.
- F19/F20. Durable email outcomes require provider receipts and bounded explicit retries. Normal Xendit confirmation remains automatic. Provider-verified recovery handles missing callbacks; uncertain creations and late captures enter an Accounting exception queue with evidenced audited resolution. Released rooms are never revived. Manual guest-payment Verify/Reject stays retired.
- F24/F25 and UI. Auth failures release busy state and preserve inputs. Guest errors link to their fields and focus the first invalid input. Responsive layouts keep booking, registration and reconciliation controls readable.

New validation defaults are a maximum 365-night stay and check-in within 730 days. These are implementation choices for bounded quotes, not pre-existing approved hotel policy. Existing contact rows were not rewritten; a read-only preflight found four digit-normalization collisions. Existing password sign-in remains compatible.

## Verification

- Final complete Vitest run passed all 2,581 tests across 256 files on Node 22.22.2, with workers bounded to two. This includes device-isolation, lost-response recovery and form/network regressions. A prior concurrent build/test attempt hit local timing failures; the final run completed after the build, without those failures.
- Hosted migration ledger checked read-only before numbering; its latest entry was `20261115010000`. Six additive files `20261115020000` through `20261115070000` implement the remaining repairs.
- Clean replay of the exact final migration files applied all 148 migrations to a new isolated PostgreSQL database. All 103 public tables have RLS enabled. New helpers restrict service-role access and revoke anonymous execution.
- Disposable real SQL suites passed 20 audit scenarios, 14 Xendit scenarios, 26 availability scenarios, nine guest-request/amendment scenarios, 13 hotel-operation scenarios, and 36 enterprise-boundary checks. Audit cases include concurrent retry/budget behavior, CRM identity collision, more than 1,000 reporting rows, late payment capture, uncertain sessions, capacity conflicts and stale writes.
- Final isolated production Webpack build and TypeScript passed on Node 22.22.2. Scoped ESLint over 145 code files had zero errors and seven warnings; the final session test's follow-up lint passed.
- Installed Edge fixture checks passed for booking, registration, and reconciliation at 1440, 390 and 320 px, with no runtime errors. Mobile screenshots were inspected after spacing fixes. These checks use synthetic API responses, not live payment or email dispatch.
- Build, database, browser and test evidence is in ignored `.tmp/audit20/`. QA-only pages exist only in the ignored build snapshot. The original audit's external `payment-retirement-follow-up.md` maps all 20 findings to their implemented repairs.
- Refreshed the live handoff to a bounded current execution state. Its previous contents were archived verbatim in [[2026-11-15 - Handoff before Remaining Audit Closeout]], preserving unrelated and older session context.

## Release state

Application changes and all six migrations need a coordinated production rollout followed by hosted Xendit and access checks. This session did not send a live email, initiate a new wallet payment, modify hosted records, commit, push, or deploy. The root checkout includes extensive pre-existing unrelated work; the prior production release checkout remains at `d95d14b`. Preserve that boundary when preparing a release.
