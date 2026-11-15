# Remaining port review and release

The user asked Codex to check GLM's continuation and merge/push to main when
the review passes. The reviewed branch is
`codex/remaining-backup-items-20261115`, based on `794eca8`. GLM committed the
port as `b1b97a2` and its verification notes as `7f5579b` and `628ea2c`.
The scope is the ten missing old commits and missing parts of the two partial
commits. The existing published 38-commit release is already in its base.

## Review corrections

- Two new breakfast errors were absent from the existing safe-message registry,
  so `publicJson` replaced them with generic conflict wording. Reused the
  approved breakfast messages and added the distinct breakfast permission
  mapping. Existing API status, actor-bound attempt recovery, checkout guards,
  payment authority and email delivery remain intact.
- Added route and form regression cases for optional/included breakfast,
  unavailable/changed offers, permission rejection, uncertain outcomes and
  recovery of the same attempt after a lost response or feature-flag change.
- Added a real SQL scenario through `create_booking_hold_attempt` with concurrent
  retries, unchanged pricing, changed-payload rejection, Xendit settlement and
  exactly two dated breakfast entitlements.
- The 320px browser check showed the cancellation tab breaking inside a word.
  Adjusted the narrow-screen tab columns and padding, then verified the full
  word occupies one text line at all compact widths.
- Removed a duplicate breakfast section from `SYSTEM.md` and updated the
  retained section to the current attempt-based, Xendit-only guest workflow.

## Verified before release

Node 22.22.2. All 2,647 Vitest cases across 266 files pass. The first full run
used a synthetic database URL and timed out in five tests expecting demo mode.
After correcting the isolated runner's test environment, the complete suite
passed. No test timeouts or assertions were weakened.

Typecheck passes. Scoped ESLint reports zero errors and nine existing-pattern
warnings, plus one generated-file ignore warning. The final Next.js production
build passes after the mobile CSS correction. The design detector reports no
findings for the changed policy stylesheet.

Real disposable PostgreSQL checks pass for breakfast (6), partial inventory
receiving (1), Xendit (14) and audit business rules (20). These use the existing
149-migration local template. The branch changes no migration or dependency.
The local PostgreSQL server was stopped after testing.

Installed Edge checks pass at 1440, 768, 390 and 320px for the actual production
homepage and policy page. Verified compact tabs, keyboard navigation, complete
tab labels, no horizontal overflow, no JavaScript runtime errors, terms/privacy
redirects, the disabled Restaurant adapter and unauthenticated staff rejection.
Ten homepage elements animate once and stay visible on the second scroll.
Screenshots were inspected. Evidence and synthetic runner scripts are ignored
under `.tmp/review-glm-20261115/`.

These browser checks use a local preview and mobile emulation. Authenticated
breakfast behavior is covered by component/API tests and real local SQL. Live
Restaurant/POS acceptance and physical-device testing remain unverified.
The existing breakfast and Restaurant enable flags retain their defaults.

The candidate is ready for the user-authorized fast-forward release using the
configured `ro-mee` identity. Preserve the old backup branches. Check the remote
head and clean working trees immediately before releasing.
