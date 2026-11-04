# Dashboard label rename — 2026-11-03

Renamed the Overview module label to Dashboard in shared staff navigation,
Admin and Owner navigation, guest desktop/mobile navigation and command search.
Staff module header also reads Dashboard. Internal overview keys are preserved.
Updated SYSTEM.md and the existing Owner navigation assertion.

Verified: typecheck and production build pass; touched-file ESLint has no errors
(36 existing component warnings). Navigation/composition/RBAC: 40 tests pass;
Owner governance: 12 pass after updating the old label assertion. Full run before
that assertion update: 2238 pass / 3 fail; the other two are the previously
recorded password-reset-audit and transportation exact-text failures.
No browser QA or deployment performed.