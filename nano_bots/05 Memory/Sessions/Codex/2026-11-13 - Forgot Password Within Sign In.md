# Forgot Password Within Sign In — 2026-11-13

## Request and local change

- Keep Forgot password within the sign-in layout, replacing the form content.
- `/login?view=forgot-password` reuses `AuthVaultShell`; its account tabs become
  Back to sign in. Both directions retain callback and booking parameters.
- Reuse the existing email → code → sent flow with shared auth field/button/error
  styles. Recovery instructions stay visible in compact height layouts.
- `/forgot-password` redirects to the shared login view, preserving safe context.
- Reset endpoints, email transport, recovery token/selfie rules and DB unchanged.

## Verified

- Node 22 typecheck and touched ESLint pass; focused Vitest 57 tests / 4 files pass.
- Impeccable detector reports no findings; scoped whitespace check passes.
- In-app browser: sign-in → Forgot password → Back to sign in works. A callback
  of `/account` and `booking=1` survive both directions.
- Recovery screenshot/DOM checks at 1366×768 and 320×568 show document height equal
  to viewport height, with no horizontal overflow. Default 562×883 preview checked.
- Isolated production webpack build passes. Full Vitest: 2,533 tests / 243 files pass.
- Production `/forgot-password` redirects to the login recovery view. Its default
  562×883 screen also fits without scrolling. Screenshot: `.tmp/auth-forgot-password.png`.
- Production preview3084 refreshed; temporary dev server stopped. Generated
  TypeScript additions removed and prior type imports restored.

## Limits

No live reset email, code verification, password change, physical-device keyboard
or selfie completion was exercised. Existing recovery governance stays in place.
Prior/concurrent work preserved; no DB write, commit or hosted deployment.
