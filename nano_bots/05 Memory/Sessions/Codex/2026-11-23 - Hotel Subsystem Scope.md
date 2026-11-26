# 2026-11-23 Hotel subsystem scope

The local Hotel app retires new staff schedules, procurement creation,
submission and approval, and equipment registry writes and preventive scheduling.
Staff retain operational handovers, legacy delivery receiving, authorized order
closure, and completion of existing linked maintenance work. Hotel still owns
the operational supply ledger, stock movements, room incident blocks and release.

Front Desk has a scoped cash drawer endpoint and stay-level billing. The wider
ledger is limited to Owner and existing Accounting operators. New Accounting
grants are removed from provisioning, role changes and conversion. Existing
operators retain refund, reconciliation and Hotel-day close authority until
there is a reviewed handoff. The Finance JSON download is a versioned aggregate
from an immutable close, with integer centavos and stable measure IDs.

Typecheck and the production build passed. Edge fixture checks signed in
through the normal flow for all eight roles and verified Front Desk drawer
access, retired Manager writes and the Accounting JSON download. The six
PostgreSQL suites covered Enterprise Boundaries, Workforce, Fleet, Restaurant
breakfast, inventory receiving and Hotel Operations using disposable clones.
ESLint reported zero errors and four warnings across 41 files. No migration
was added, and the hosted ledger was checked read-only. Partner systems
received no requests and no production changes were deployed.

The two focused Vitest runs passed all 211 tests. The full suite completed
with 2,727 passes and one pre-existing Room Rack style assertion involving
the `colorKey` prop in concurrent Room Rack work.

See [Hotel integration readiness](../../../../docs/plans/2026-11-23-hotel-integration-readiness.md).
