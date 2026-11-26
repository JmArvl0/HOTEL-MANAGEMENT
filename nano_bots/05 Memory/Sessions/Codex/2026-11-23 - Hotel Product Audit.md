# 2026-11-23 Hotel Product Audit

The [product audit](../../../../docs/audits/2026-11-23-haven-product-audit.md)
and [module inventory](../../../../docs/audits/2026-11-23-haven-module-inventory.md)
cover 25 groups, eight roles, 36 page files, 212 HTTP handlers and 159 migrations.
The final dependency scan has zero critical and three high package entries
following Next.js 16.4.6, Sharp 0.35.5 and source-map-js 1.2.4 updates.

Manager booking rows preserve unknown balances, with regression tests for an
unavailable source and true zero. A malformed location response leaves the
homepage available and uses the existing guide retry state. Root lint ignores
the single generated guest preview path, with 74 source warnings and no errors.

The final build passed. Ten PostgreSQL acceptance suites passed against
disposable clones. Edge checked synthetic role sessions and the four viewport
sizes, with a separate final smoke for location fallback, Manager balance,
drawer scope and guest PDF ownership. Production deployment, hosted readiness
and partner acceptance were not performed in the audit.

Typecheck passed. The final Vitest run recorded 2,741 passes and one existing
Room Rack style failure, with no other failed test or suite. The seven focused
booking-balance and location-response tests passed.
