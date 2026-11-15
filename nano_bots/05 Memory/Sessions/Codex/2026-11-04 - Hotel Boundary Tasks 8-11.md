# Hotel Boundary Tasks 8–11 — 2026-11-04

## Authorized scope

User requested Tasks 8–11 and testing. One agent, no delegation. Retained prior
dirty work. PayMongo remains deferred, hosted rollout stopped. Used Computer Use
for local Brave QA because the browser connector was disabled. Read UI/UX Pro
Max and DESIGN for the scoped metric UI review, preserving the existing design.
The search produced no applicable count-specific recommendation, so metric
requirements came from the plan, source behavior and observed records.

## Completed locally

- Task 8: seven-area screen/source/authority/role map and official alias in
  `docs/ENTERPRISE_BOUNDARIES.md`, with references verified. Preserved navigation.
- Task 9: local principal/staff mirror mapping, temporary provisioning and disable
  procedure. Six new actual JWT-callback regressions verify inactive/recovery/
  version/removal/current-role/client-update boundaries. Actual SQL tests cover
  assignment/action denial, grants and guest conversion with preserved history.
- Task 10: traced five installed quantity writers, including the legacy
  service-only adjustment, into the Hotel ledger. Added opening/count/PO mapping,
  writer pause, acknowledgment, correction, outage and switchback worksheet in
  `docs/integrations/ENTERPRISE_CONTRACTS.md`.
- Task 11: recorded independent room dimensions, retained local Maintenance
  authority, linked recurrence and Facilities opening mapping. Real SQL verifies
  technical safety, two repairs, discrepancy/inspection independence, occupied
  cleanup and preventive work preserving sold assignments.

## Reproduced bugs and changes

- `lib/staff-duty.ts`: two active repairs were reported as one in-progress work
  item. Count all active work items while each working person counts once.
- `lib/data.ts`: role filtering zeroed operational metrics its department UI
  displays. Allow only relevant Housekeeping/Maintenance counters, preserving
  financial redaction. Two aggregation/role cases reproduced the error.
- `components/manager/manager-dashboard-client.tsx`: maintenance summary counted
  work orders rather than unique blocked rooms, omitted out-of-service diagnosis
  and counted ended orders in active severity totals. Narrowed to active states,
  valid room identity and the appropriate distinct-room/severity measure.
- Regressions first failed before each repair, then passed. Layout, workflow
  permissions, financial transactions and database functions remain unchanged.

## Verification

Node 22.22.2 formal checkpoints. `npm test -- --maxWorkers=3`: 2,327 tests in 217
files pass. Final `npm run build` and `npm run typecheck` pass. Touched lint has
zero errors and five existing dashboard warnings. Earlier targeted suites have
189 passes in 11 files, final affected component/aggregation/navigation set has
73 passes in eight files. Logs are under ignored `.tmp/tasks8-11/`.
345 document assertions and `git diff --check` pass. The previous oversized
handoff was preserved verbatim in its dated Archive snapshot, retaining current
sections and adding this result within the live handoff's compact scope.

Fresh Node 22 backend migration replay has zero SQL failures. New
`scripts/enterprise-boundaries-db-test.mjs` passes 36 actual PostgreSQL cases.
Existing housekeeping 27 checks, HMS integrity 19 checks and partial-receipt suite
pass against owned clones. SQL is not presented as browser evidence.

Actual local NextAuth/PostgREST/PostgreSQL browser: Manager sees two work items
and one working technician. Housekeeping issue changes ten to eight, creates one
movement and rejects nine without further deduction. Direct Finance URL refuses
access, actual authenticated HTTP refund/adjustment POSTs return 403. Protected
disable neutralizes the existing HTTP session and browser reload returns to login.
Browser resolves two repairs for one room, retains the other block after the
first, creates exactly one cleanup after the last, and keeps the room unsellable
until cleaning and passed inspection. Second-connection readback confirms each
stage and final clean/available/sellable state with repair history retained.

All data was fictional in loopback-only services. Browser clone discarded, owned
PostgreSQL stopped with no other local client connections. Removed generated
Next QA-build references and the Next-generated AGENTS append. Existing unrelated
changes were preserved. Manual steps and detailed evidence are in
`docs/qa/enterprise-architecture-acceptance-2026-11-04.md`.

## Remaining gates

Technical local work for Tasks 8–11 is complete. Role sign-off, HR maximum
staleness/outage acceptance, SCM mappings/opening totals/operating limits and
Facilities partner acknowledgment remain Pending. Existing local authorities
remain in use. Actual HR/SCM/Facilities adapters are Tasks 19–21. Local recurring
repair uses a new linked work order, not an implemented external versioned reopen.
Phone/Safari/touch and wider role acceptance remain Task 14. No new migration,
hosted write, deployment, commit/push or PayMongo work in this session.
