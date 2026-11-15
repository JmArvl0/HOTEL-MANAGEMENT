# Error microcopy implementation — 15 November 2026

The approved audit changes are implemented locally. The [audit closeout](error-microcopy-implementation-2026-11-15/audit-closeout.csv) links all 82 reviewed rows to the repair or retained behavior. The original audit remains a historical source snapshot, not a runtime certification.

## What changed

- [Shared public messages](../../lib/error-messages.ts) and [error/validation helpers](../../lib/errors.ts) retain known distinctions and accept only registered or tightly structured field instructions. Internal field references lead to page/record recovery rather than UUID or version instructions.
- [Server responses](../../lib/server-errors.ts) preserve statuses, success payloads and legacy machine discriminators while adding safe metadata and field information. They filter exception objects, stack/details/hints and unknown messages. Existing flattened field shapes remain compatible. Sensitive diagnostics use allowlisted codes and random correlation references.
- [Browser requests](../../lib/client-errors.ts) handle rejected fetches, malformed responses and uncertain write results. Known definitive failures retain their specific instructions. A missing response never establishes that a booking, payment or cancellation failed.
- Guest booking, registration, account, cancellation/change, requests, transport, receipts and payment feedback use the shared boundary. Front Desk, housekeeping, maintenance, inventory, finance, Manager, Admin and Owner callers retain their domain messages and role checks. Machine Fleet/Workforce/webhook contracts remain separate.
- Walk-in, guest-request and transport retries retain their identity for unchanged details. The walk-in caller now sends a valid empty optional arrival-time value. Confirmed payment receipts survive a failed ledger refresh. Guest checkout headings and supporting copy no longer assert an unconfirmed reservation outcome.
- Field feedback was expanded in the audited guest, account, catalog and request forms. Native dialog field validation remains in place; legacy action-level consumers receive the first useful field instruction rather than being told to find highlights that they do not render.
- Errors and warnings no longer inherit success styling. Important feedback persists, queued notifications are promoted after expiry, duplicate queued IDs are suppressed, and each result has one live announcement owner. Modal catalog errors remain visible inside their dialog. Failed payment polling is bounded and provides a read-only status retry.
- Screenshot review corrected guest error contrast using the existing dark/light danger token and added compact checkout controls for enlarged layouts. Browser assertions check wallet-logo and payment-action containment as well as the dark error color.

## Verified results

| Check | Result |
| --- | --- |
| Runtime | Node 22.22.2 |
| Full Vitest | **2,601 passed across 259 files** |
| TypeScript | Passed; production build also completed TypeScript checking |
| Touched-file ESLint | **0 errors, 41 warnings**; remaining warnings include existing effect/unused-variable patterns. No claim that every warning predates this session. |
| Production build | Passed using installed Next.js 16.3.2 with webpack in an isolated source copy |
| Browser matrix | **29 checks passed, 0 browser runtime errors** |
| Mechanical UI detector | No findings in the eight inspected error/form components |
| SQL migrations/dependencies | No changes by this session |

The regression additions cover unknown diagnostics, default Zod failures, full nested field paths, internal identifiers, old field/response contracts, redacted logging, lost write responses, malformed HTML, binary downloads, stable guest-request/transport retries, queue promotion/deduplication, a confirmed payment followed by refresh failure, payment-poll limits, and checkout uncertainty. Existing business-rule and route tests remain in the full suite; source-wiring assertions and old copy fixtures were updated where the approved interfaces changed.

Browser checks use installed Edge with real application components in an **isolated local fixture** and synthetic HTTP responses. Booking, registration, checkout, password, vehicle and toast states were checked at 1440, 768, 390 and 320 pixels. Additional checks cover failed payment polling, dark checkout/password and 200% CSS zoom. Field focus, invalid associations, readable wrapping, queue delivery and absence of horizontal page overflow were exercised. See the [browser results](error-microcopy-implementation-2026-11-15/browser-results.json).

These checks do not establish physical-phone keyboard or screen-reader behavior, exhaustive rendered coverage of every role screen, or hosted provider readiness. No hosted database query/write, real payment, email send, migration, commit, push or production deployment was performed. Existing prior-session work was preserved. The application still needs the coordinated release described in the main project handoff; this repair introduces no additional migration.

## Review and release notes

The implementation spans shared error boundaries and their callers. Review it alongside the existing unreleased validation repairs. Local verification logs are in `.tmp/error-ux-implementation/`. Screenshots and historical fingerprints were archived outside Git in `.tmp/worktree-cleanup-20261115/`.
