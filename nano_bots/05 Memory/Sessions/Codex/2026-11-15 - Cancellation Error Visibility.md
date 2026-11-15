# Cancellation error visibility — 2026-11-15

The guest cancellation review dialog now renders submission errors above its action buttons in the footer. The refund details and reason field retain their own scroll area. After an interrupted submit, the dialog retains the reason and accurately advises guests to check reservation status before trying again.

The regression test failed before the placement change and passed afterward. Edge touch emulation used the production preview and a simulated cancellation connection drop. The complete alert and both buttons were in view at 390 × 844 and 320 × 568 in light mode, and at 390 × 844 in dark mode. The test measured a 100% intersection ratio for all three elements with the dialog body at scroll position zero. Each attempt sent one submit, retained the reason and displayed no success notification. No browser runtime errors occurred.

Full Vitest passed 2,602 tests in 259 files. Typecheck, isolated production build and lint on the two touched TypeScript files passed. The mechanical detector reported an existing CSS finding outside the cancellation styles. Screenshots and logs are in ignored `.tmp/error-ux-implementation/cancel-footer-20261115/`. No real reservations or hosted services were used.
