# 2026-11-14 - Reports Role QA

## Scope

The user asked to fix the local environment so Reports could be checked under
each affected account after the UI redesign.

## Environment findings and fixes

- The checked-in Playwright config used port 3000 and the default `.next` build,
  conflicting with the already running app. The test server now uses a separate
  port/build directory, and its `NEXTAUTH_URL` follows the test origin.
- The repository pins Node 22.22.2; this workstation had Node 26 and no local
  Playwright Chromium. Node 22 and Chromium were installed only under ignored
  `.tmp/reports-qa-*` folders for this run.
- Saved auth states dated Oct 26 had expired. The configured npm auth setup
  script referenced a missing file. Added a dedicated setup config and runner,
  with optional `PLAYWRIGHT_AUTH_ROLES` selection and suppressed auth traces,
  screenshots, and video.

## Browser QA

- Front Desk, Manager, Admin, and Owner Reports views passed on desktop and at
  390px mobile. Checks covered role-specific content/actions, restricted action
  absence, and horizontal overflow.
- Manager's performance view waited for the Night Audit request to settle; the
  panel reported operating-day tracking inactive with no load error.
- Accounting could not authenticate using the configured local test credential
  against the configured auth service. Its Reports page remains browser
  unverified. No password was reset, report was submitted, or night-audit
  action was taken.

## Verification

- Reports browser checks: 4 passed.
- Auth setup for the four valid Reports roles: 4 passed.
- Typecheck, ESLint on touched Playwright files, and `git diff --check` passed.
- No build, commit, push, deployment, report submission, or night-audit action
  was performed.
