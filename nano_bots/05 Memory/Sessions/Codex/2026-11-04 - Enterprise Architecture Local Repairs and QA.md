# Enterprise Architecture Local Repairs and QA · 2026-11-04

Implemented the authorized baseline, PO and reservation-history scope and verified cash drawer, refund and night close. PayMongo Task 6 was deferred.

- Fixed Inventory wiring and outstanding receipt entry. Local browser found `20261104020000` had overwritten cumulative receipt behavior. Verified hosted ledger and definitions read-only before adding `20261104030000`, which combines the earlier protected partial receipt transaction with the stock-status update. No hosted migration or app deployment.
- Replaced stale reservation-history test assumptions with the actual date-scope control and verified a live local folio no-show refreshed once without leaving Full history.
- Baseline Node 22 full run 2,312 passed / 3 failed, including one QR source-scan timeout. Final 2,316 / 2,316, typecheck/build passed, touched lint zero errors. Real SQL and browser evidence for procurement, cash and operating-day close is recorded in `docs/qa/enterprise-architecture-acceptance-2026-11-04.md`.
- KI-021 still applies to physical cash refunds. Accounting's fictional noncash refund processed and correctly remained outside the drawer. The seeded refund fixture initially blocked close until its unused obligation was settled through the protected cancellation RPC. Browser then saved exactly one immutable day-close snapshot.
