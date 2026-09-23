# Operational Module Layout Audit

Date: 2026-09-23
Status: Complete locally

## Scope

Audited the authenticated customer and staff module structure against `DESIGN.md`, `HAVEN_UI_STANDARDS.md`, and the shared `HavenDataToolbar` contract. The system already has a strong shared visual foundation; the recurring inconsistency was a set of operational and catalog modules still rendering search and filters as separate legacy rows.

## Implemented

Migrated these modules to the shared transparent, responsive data toolbar:

- Guest Requests: search, queue badges, visible result count, and one clear action.
- Transportation: search, quick queues, service filter, result count, and clear action in the canonical inline hierarchy.
- Housekeeping: search plus labeled work-type and task-status controls, result count, and clear action.
- Staff & Duty: search plus labeled department and duty-state controls, result count, and clear action.
- Room Types, Request Types, and Transfer Vehicles: standardized search-only toolbars with live result counts and clear actions.
- Shared staff resources: Reservations, Rooms, Guests, and other resource tables now use the same toolbar; Manage rooms is placed with page actions.
- Accounting: every ledger section now uses the shared search toolbar with result count and clear action.

Existing filtering, permissions, actions, pagination, alphabetical ordering, and business logic were preserved. Shared responsive CSS handles stacking at narrow widths; no new component or styling abstraction was added.

## Verification

- `npm run typecheck`: pass.
- ESLint on all eight touched modules: 0 errors; pre-existing warnings remain.
- Focused Vitest: 5 files / 42 tests pass.
- Full Vitest: pass (existing jsdom environment notices only).
- `npm run build`: pass, 85 static pages generated.
- Impeccable detector: no findings.
- `git diff --check`: pass (line-ending notices only).

Authenticated browser QA remains pending.