# Guest Rewards Redesign — 2026-09-22

## Outcome

Rebuilt the customer Rewards page around HAVEN's executive customer-portal
language: branded hero, three financial/reward KPIs, selectable Silver/Gold/
Platinum comparison cards, and a polished points ledger.

## Implementation

- Preserved the guest-only API boundary and existing loyalty database model.
- Reused canonical loyalty helpers for thresholds, multipliers, next-tier
  progress, and the one-point-to-one-peso redemption value.
- Added defensive payload parsing, abort-safe loading, a retryable error state,
  shape-matched skeletons, and a guided ledger empty state.
- Tier cards are native buttons with visible focus and pressed state; current
  tier is independently labeled. The progress bar exposes numeric semantics.
- Ledger rows use hotel-time formatting, semantic transaction badges, shared
  pagination, and a labeled mobile reflow instead of horizontal page scrolling.
- Added component coverage and documented the surface in DESIGN.md.

## Verification

- npm run typecheck — pass.
- Touched-file ESLint — pass with 0 warnings/errors.
- Focused Rewards and loyalty suite — 20 tests passed.
- npm test -- --run — 156 files, 1,718 tests passed.
- npm run build — pass, 85/85 static pages generated.
- Impeccable layout detector — no findings.
- git diff --check — pass (line-ending notices only).
- npm run lint — pass with 0 errors and 70 unrelated repository warnings.

Authenticated browser QA was not performed because the repository has no
headless browser runner. Verify the authenticated Rewards route at desktop,
tablet, phone, dark mode, and reduced-motion settings before release.
