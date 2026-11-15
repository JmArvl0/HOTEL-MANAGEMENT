# Error microcopy repairs — 2026-11-15

## Authorization and outcome

The user reviewed the earlier audit, asked for a layman explanation, then said “okay fix it.” Implemented the approved wording and shared error handling locally. The original audit remains a historical snapshot; `docs/qa/error-microcopy-implementation-2026-11-15.md` and its companion directory contain closeout, verification and selected screenshots.

## Implementation

- `lib/errors.ts`, `error-messages.ts`, `server-errors.ts` and `client-errors.ts` centralize safe copy, issue/path-aware validation, compatible JSON responses and browser transport recovery. Known business messages remain distinct; arbitrary exception text, raw field diagnostics, SQL details/hints/stacks and provider/parser responses do not become user feedback. Field shape and machine-response compatibility are regression-tested.
- Human-facing routes/guards and guest, staff, Manager, Admin and Owner callers use the boundaries. External machine contracts and historical migrations were preserved. SMTP setup guidance is separate from guest reset/receipt errors.
- Booking, cancellation/change, guest request/transport, hold release, withdrawal and payment feedback use truthful uncertainty recovery. Walk-in and guest request/transport forms retain a stable key for unchanged retries. Walk-in sends the valid empty optional arrival value rather than a prose note. A confirmed payment keeps its receipt when the follow-up ledger refresh fails.
- Field errors/focus were expanded in audited guest/account/catalog/request forms. Legacy action-level callers receive a useful first-field instruction; forms with inline fields own their summary announcement. Modal catalog errors remain inside the dialog. Explicit toast tones, expiry queue promotion, queued-ID deduplication and single announcement ownership are implemented. Repeated failed payment reads obey the attempt budget and leave a status-check action.
- Final screenshot review corrected customer error contrast with the existing theme danger token and compact checkout controls at enlarged widths. Browser assertions also check logo/action containment and dark error color; scheduled field focus is awaited before asserting it.
- Added behavioral mapping, privacy, compatibility, retry, polling, notification and payment-refresh regressions; updated existing source/copy fixtures for approved behavior without removing business-control assertions. Removed import-only changes from otherwise unaffected files.

## Verified checkpoints

- Full Vitest: **2,601 tests / 259 files pass** on Node 22.22.2 (`tests-complete.log`).
- Typecheck and isolated Next.js 16.3.2 webpack production build pass; scoped ESLint: **0 errors / 41 warnings**. Remaining warnings include existing effect/unused-variable patterns; not every warning was independently established as pre-existing.
- Installed Edge: **29 fixture checks / 0 browser runtime errors**, covering real booking, registration, checkout, password, vehicle and notification components at 1440, 768, 390 and 320 px, plus payment-status failure, dark checkout/password and 200% CSS zoom. Screenshots inspected and selected evidence copied to the report directory. This does not establish every hosted role screen, actual provider settlement, physical-phone keyboard behavior or screen-reader announcements.
- Mechanical detector: no findings in the eight inspected error/form components. No migrations or dependencies were changed by this session.

Ignored development evidence and the start-of-session source snapshot are in `.tmp/error-ux-implementation/`. Initial Windows sandbox output-directory restrictions required the local build to run with approved filesystem access. An invalid synthetic preview setting, mouse hover pausing the toast timer, missing guest-theme fixture styles and a scheduled-focus race were corrected in the test harness; final checks pass. No real keys were recorded.

## Release and continuity

No hosted database query/write, real payment/email, migration application, commit, push or deployment occurred. Preserve the earlier extensive dirty-tree work. Production/release state is still the earlier payment-retirement release and coordinated validation rollout described in the main handoff. This repair adds no migration. SYSTEM.md, Current Status and the live handoff reflect the verified local behavior; unrelated memory and earlier session records were preserved.
