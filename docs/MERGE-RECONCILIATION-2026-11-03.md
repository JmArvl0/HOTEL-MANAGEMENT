# Merge reconciliation — 2026-11-03

Resolved the 22 unmerged paths between local `74ebf4d` and incoming `8581472`.

- Kept the approved sidebar logo sizing, removed redundant property pills, native scrolling, stock forms, canonical guest/ID flows, atomic payment/receipt collection and all three QA fixes.
- Retained incoming Hotel Operations, readiness/party/fee/night-audit views, bundled fonts, profile popovers, mobile navigation controls and backend remediation.
- Merged both navigation/type/access maps; each independent operational screen remains reachable under its existing role scope.
- Kept protected stock movement writes instead of restoring generic inventory quantity PATCH. Fulfillment handlers recognize both generations of stock error codes. Both DB consumption paths check existing source movements; the incoming legacy trigger skips an already-consumed request.
- Accepted incoming migration conflict formatting (blank lines and function terminator layout). No new migration or database push. Removed the empty retired inventory-helper module as requested by the incoming deletion; no imports remain.
- Preserved both original handoffs verbatim in Memory/Archive and combined current-status entries. Local QA issue IDs collided with incoming issues: local QA-01–03 now map to KI-018–020; historical notes retain old labels.

Verification on the combined working tree:

| Check | Result |
|---|---|
| Targeted workflow/route tests | 139 passed in 7 files |
| Full Vitest | 2,239 passed, 2 failed in 208 files |
| Typecheck | Passed after installing incoming declared dependencies |
| Production build | Passed with bundled fonts |
| Resolved TypeScript-file ESLint | 0 errors; existing hook warnings remain |

Full-suite failures: existing `password-reset-audit.test.ts` exact SQL-text assertion and `transportation.test.ts` exact CSS-text assertion. The transportation expected CSS matches after CRLF normalization; no CSS behavior change was made to accommodate the assertion. Logs under ignored `.tmp/hms-qa/merge-*`. Runtime reports Node 24 although package engines requests Node 22; checks above ran in the available environment.

This task did not perform browser E2E, combined database replay, a live ledger check, deployment or push. Production-cutover claims in incoming session notes were preserved as prior-session evidence, not reverified here. Held/local migrations must not be blindly pushed based on this Git merge.
