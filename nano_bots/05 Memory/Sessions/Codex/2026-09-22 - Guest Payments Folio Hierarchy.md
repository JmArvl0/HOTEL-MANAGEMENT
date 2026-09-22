# Guest Payments & Folio Hierarchy — 2026-09-22

## Outcome

Refactored the customer Payments & Folio page to use the required visual and
DOM hierarchy: hero banner, three financial KPI cards, transparent compact
filter controls, and folio cards. The summary reports the currently visible
record count, outstanding balance, and paid total.

## Implementation

- Added a small client-side PaymentsFolioPanel boundary for immediate local
  stay/payment/search filtering while retaining server-rendered folio content.
- Reused canonical HavenDataToolbar, HavenSearchInput, and HavenSelect.
  The repository standard explicitly prohibits Radix/Shadcn dependencies.
- Added a compact toolbar layout that puts search and advanced filters on one
  row when space permits and stacks responsively without a card surface.
- Preserved filter values in the URL with history.replaceState, avoiding a
  route reload.
- Updated DESIGN.md with the new canonical Payments & Folio structure.

## Verification

- npm run typecheck — pass.
- Touched-file ESLint — pass with 0 warnings/errors.
- npm run lint — pass with 0 errors and 70 unrelated repository warnings.
- npm test -- --run — 154 files, 1,709 tests passed.
- npm run build — pass, 85/85 static pages generated.
- Impeccable layout detector — no findings.
- git diff --check — pass (line-ending notices only).

Authenticated browser QA was not performed; the repository has no headless
browser runner. Verify the page manually at desktop and mobile widths with
real folio data before release.
