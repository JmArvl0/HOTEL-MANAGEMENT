# Hotel Breakfast Implementation

Date: 2026-11-13. User authorized Haven implementation and asked for a written
restaurant handoff. The restaurant POS and its onboarding are partner work.

- Verified the configured migration ledger through `20261113020000` before
  numbering `20261113030000_hotel_breakfast.sql`. Added governed offers, atomic
  hold pricing and conversion, dated entitlements, and locked, audited redemption
  with request replay. No hosted migration or application deployment.
- Offers are per room type with one approved date range and daily hours.
  Optional offers default to room only. Included offers add no charge. The
  breakfast choice survives auth in the booking callback. Review, payment and
  reservation details render the frozen breakdown. Existing room amendments
  that change price, dates, type or party size are blocked for breakfast stays.
- Guests can open the separate pass from My Reservations or booking confirmation
  and save a PNG for each eligible day. Front Desk and Manager can check a code
  or read the PNG locally and confirm meals served. The scoped outlet adapter
  defaults disabled. See `docs/integrations/RESTAURANT_BREAKFAST_HANDOFF.md` for
  setup, the request/response contract and the unsent partner message.
- Local Node 22 webpack production build, typecheck, touched ESLint error check,
  design detector, focused tests and real PostgreSQL replay/transaction checks
  passed. The initial full Vitest attempt had worker timeouts during concurrent
  checks. Rerun with three workers passed all 2,533 tests in 243 files.
  SQL evidence covers manual and gateway payment, room-only/included,
  failed replacement rollback, future and cancelled passes, checkout morning,
  partial redemption, accepted replay and simultaneous requests. The PNG test
  decodes at 900px and 390px. Inspected a generated PNG. Local HTTP smoke passed
  login redirects and 401/403/503 route gates. No signed-in browser walkthrough
  or POS sandbox round trip was performed. The browser tool reported that local
  browser access was unavailable. The default Turbopack build hit a Windows
  junction permission error. The webpack production build succeeded.

## Follow-up: actual guest browser test

Signed-in Edge/Playwright walkthrough now passes against the production build
and real disposable PostgreSQL/PostgREST: choose breakfast, preserve it through
password login, compare room-only/combined totals, submit Guest details, review,
upload synthetic proof, verify through the real Accounting RPC, navigate My
Reservations and download both dated PNGs. Each downloaded QR matches its DB
code at 900/390px. Stable mobile layout has no horizontal overflow and the
download control is unobstructed; no unhandled browser errors. Inspected desktop,
mobile and saved pass images. No application source changes were required.

Only fixture setup/test selectors changed while debugging the local runner.
PostgREST needed PostgreSQL runtime libraries first on PATH and the clone
needed Supabase's baseline service-role table grants. Storage was substituted
in memory and OTP was disabled in the fixture. No hosted mutation or real
payment. Partner acceptance remains pending. Recorded two polish observations
(room-only sidebar alongside combined totals; cramped mobile header) and
complete limits/evidence in `docs/qa/breakfast-guest-browser-2026-11-13.md`.
