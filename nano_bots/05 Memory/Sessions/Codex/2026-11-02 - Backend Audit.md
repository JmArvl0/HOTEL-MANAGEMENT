# Backend Audit — 2026-11-02

User requested an audit of backend problems. One-agent review, no delegated work.

- Scope: checkout `5f3994a` plus existing working tree; inventory of 141 API
  routes and 100 migrations, with deep review of identity/ownership, booking,
  money, inventory, loyalty, QR, notifications, analytics, and verification.
- Output: `docs/qa/backend-audit-2026-11-02.md`, 24 source findings
  (9 P1 / 15 P2), evidence, scope limits, and repair order. No fixes claimed.
- Reproducer: `docs/qa/backend-audit-probes.mjs` executes actual domain helpers
  and installed NextAuth encoding; three intended-behavior probes fail.
  Provider-shaped paid events are ignored; JWT renewal resets the absolute-age
  basis. Entirely offline, no hotel records or emails touched.
- Verification: full vitest retry passed 189 files / 2097 tests with workspace
  TEMP/TMP (initial sandbox cache-renaming failure prevented test imports).
  Backend eslint passed with 0 errors / 2 warnings. Typecheck failed in generated
  `.next/dev/types/routes.d.ts`; build failed on Google Fonts network fetches.
- Read-only DB metadata under `service_role` and service-role ledger API probes
  could not connect. No live function/ledger consistency claim is made.
- Existing unrelated edits retained; no application source or migration changes,
  no commit/deployment. Handoff refreshed, KI-016 linked. Existing frontend
  browser-QA requirements remain unchanged. Temporary audit caches/logs removed.

Remediation remains outstanding; the report distinguishes runtime reproductions,
static SQL findings, environment blockers, and unverified deployment behavior.
