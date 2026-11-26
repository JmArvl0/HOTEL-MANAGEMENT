# Billing QA — 2026-11-15

Read-only local Front Desk QA covered Billing navigation, 38 live folios,
search/filter/pagination, summary arithmetic, reservation and deposit
destinations, Transactions, Financial Documents, and 390px phone detail/back
focus. No financial write was made. The full evidence and resolution options
are in `docs/qa/billing-qa-2026-11-15.md`.

Four findings: three invoices report paid totals without attached paid history
(KI-029); 38 issued documents fall into eight identical-financial-snapshot
groups (KI-013, now reproduced, policy undecided); pending deposits disappear
from Billing's Payments filter (KI-030); cancelled folio detail omits its
status/settlement context (KI-031). Accounting browser actions and live
charge/adjustment/collection cases were unavailable in this data/session.

Typecheck, scoped ESLint, 77 targeted tests, and 2,428 full Vitest tests
passed. The isolated Webpack build first stopped on a sandboxed Windows
`EPERM`; with filesystem access it compiled, then Next route type generation
failed on two unrelated exported constants in transport and Owner QR routes.
Browser console errors: none. No source, DB, deployment, or remote changes.
