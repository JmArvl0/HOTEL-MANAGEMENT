# Ownership Register and Task 7 Verification · 2026-11-04

Prepared Task 2's proposed acceptance register in `docs/ENTERPRISE_BOUNDARIES.md`.
It has 22 ownership rows with accountable role, named-person field, acceptance,
date and evidence. Matching detail rows specify requesters, permitted writers,
stable IDs, copied fields and correction authority. Seven Hotel areas and stock,
PO, maintenance, transport, Finance/Restaurant and document handoff conditions are
explicit. All names remain Unassigned and acceptance remains Proposed/Pending.
The task's technical preparation is complete; actual owner acceptance is pending.

Task 7 manual scope verified on Node 22 and loopback PostgreSQL 55432 after fresh
backend replay. Added a manual-only availability option and persisted final-room
postconditions, two Front Desk booking race, and retained manual proof after
availability loss. Integrity can now use an owned full-template clone. Added real
receipt/refund-attempt rollback, simultaneous refund retry and unchanged
invoice/charge assertions across competing day close.

Fresh SQL results include 24 backend, 25 availability, 19 integrity, 13 operations
and 18 cancellation cases, plus extended refund/drawer and procurement suites.
Targeted Vitest passed 136 tests. Detailed acceptance and repeatable commands are
in `docs/qa/enterprise-architecture-acceptance-2026-11-04.md`. Existing local browser
evidence was retained for unchanged UI; new concurrency evidence is real SQL.
Final full suite passed 2,316 tests; typecheck, touched-script ESLint and production
build passed. A Windows output-directory EPERM was resolved by building into a
fresh ignored directory. Generated type paths were restored; local cluster stopped.

G1 still needs named owners and sign-off. G2's automatic-provider scope and paid
recovery remain deferred with Task 6; operational owner acceptance is pending.
Hosted deployment remains stopped. No provider or hosted business writes.

Follow-up preference uses roles first in documentation. Removed the required
named-person column from the current register, labeled all 22 rows Pending
sign-off, and added role confirmation steps plus a blank evidence template.
Authorized representatives must still confirm the reviewed scope before an
Accepted status is recorded. Current QA and plan status reflect this revision.
Content validation passed for all 22 role rows, matching control rows, pending
statuses, evidence template, table widths and source paths. Whitespace check passed.
