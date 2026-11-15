# Auth Screen Fit and Shared Logo — 2026-11-13

## Requested and implemented locally

- Sign-in/create-account screen fit: replace the auth panel's independent
  scrolling and oversized stage minimum with a flexible, height-aware layout.
  Omit the generic photo/story below 901px; retain the shared logo in the header.
- Pair registration name and password fields. Keep 44px targets, 16px inputs,
  password visibility, mobile-country input and the existing submission logic.
- Remove duplicate account-switch prompts; the tabs retain callback/booking
  parameters. Use the existing Booking policy destination in a compact footer.
- Short windows omit optional descriptive/security copy. Errors, enlarged text,
  keyboards and expanded stay details can still grow the page; no overflow lock.
- All shared logo instances now use the landing page's transparent cropped asset.
  Replace the standalone app-header/loader symbols and the old H browser icon
  with that mark. Preserve existing dark-surface treatments.

## Verified

- Node 22.22.2 TypeScript check passes; touched TS/TSX ESLint passes without warnings.
- Focused Vitest: 41 tests / 4 files pass (navigation, phone input, payment branding,
  session expiry). Mechanical Impeccable detector returned an empty findings list.
- Scoped git whitespace check passes.
- Isolated production webpack build passes, including Next's TypeScript and
  page-generation stages. Full Vitest: 2,533 tests / 243 files pass (two workers).
- Production HTTP checks: `/login` and `/register` return 200, contain the
  canonical logo and Booking policy link, and retain two/seven inputs respectively
  (registration includes the hidden normalized phone). No legacy full-logo source.

## Verification limits and environment

- In-app browser connection to localhost timed out. Computer Use then stopped
  because it could not determine the native browser URL confidently. No rendered
  desktop/mobile screen-fit, keyboard/touch or signed-in browser QA is claimed.
- Two sandbox builds hit EPERM creating generated Next directories. Final build
  uses `.tmp/auth-screenfit` with the permitted sandbox escalation.
- Existing working-tree and concurrent homepage changes were preserved. No DB
  write, commit or hosted deployment.
- Local production preview: `http://127.0.0.1:3084/login` and `/register`.
- Preview runs on loopback outside the sandbox after sandbox socket access was
  denied. Build-added TypeScript includes were removed; pre-build generated
  Next type imports restored. Existing preview output was not replaced.
