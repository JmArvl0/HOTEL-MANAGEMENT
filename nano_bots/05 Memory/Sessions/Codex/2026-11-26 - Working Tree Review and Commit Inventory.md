# 2026-11-26 Working tree review and commit inventory

Reviewed the accumulated booking, Front Office, finance, analytics, governance,
and audit changes. No unresolved merge markers or broken local links were found
in the reviewed documentation. The suspected credential match was an isolated
browser fixture value. The generated PDF template preview stays local.

- Reconnected Housekeeping's existing Do Not Disturb and guest-declined or late
  service handlers to the work queue. Removed the unused Room Rack navigation
  callback and an unused analytics test import.
- Scoped the exact-hold inventory regression to its test room type. Updated the
  amendment regression to expect the specific hold error while still verifying
  that the existing assignment survives. The CI database job now runs these
  checks and the stay-extension retry test.
- Typecheck passed. Vitest passed 2,761 tests across 278 files. The five
  targeted regression suites passed 62 tests after the housekeeping change.
  Source lint found zero errors and reported warnings in the existing codebase.
- A clean PostgreSQL replay and sixteen local database suites passed, including
  the two corrected scripts on rerun. The isolated production build passed.
  The Edge smoke verified Front Desk, Manager, Owner, and Guest sessions.

The review used local sample data. No remote migrations, deployment, or real
payments were performed.
