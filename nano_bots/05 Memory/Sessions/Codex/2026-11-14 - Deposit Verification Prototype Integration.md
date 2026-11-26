# Deposit Verification prototype integration — 2026-11-14

The approved standalone prototype is now the live Deposit Verification section for Accounting and Front Desk. `DepositVerificationWorkspace` replaces the generic payments table with metric cards, searchable queue/filter chips, an inline payment/proof/reservation review, mobile queue/detail navigation, and confirmation/rejection dialogs. Only Accounting can request the signed proof or decide; Front Desk sees details read-only. PayMongo remains provider-settled with no manual verify. Refunds remain in their own module. The existing verify/reject API routes and Billing's `PaymentDetailsDialog` are unchanged.

Verification: targeted UI/payment tests passed (57); full Vitest passed (233 files, 2,423 tests). Typecheck, touched-file ESLint (no errors), and `git diff --check` passed. Default Turbopack build failed on Windows junction access; isolated Webpack compile succeeded, then Next route type generation failed on unrelated existing exports `transportVehicleTypeColumns` and `QR_BUCKET`. Local Chrome browser QA could not connect to the dev server from the available sandbox. No hosted writes or deployment.

Follow-up: browser-check Accounting and Front Desk desktop/mobile when the local browser can reach the dev server; resolve the two route export build errors in their own scope if a production build is required.
