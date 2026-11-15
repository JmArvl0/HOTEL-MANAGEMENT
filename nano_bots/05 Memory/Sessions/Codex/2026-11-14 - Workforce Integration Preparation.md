# Workforce integration preparation

14 November 2026. User approved implementation after clarifying that Workforce
Management, within HRMS, owns attendance/schedules/duty. Hotel integration
preparation was requested. No external Workforce contract was supplied.

## Implemented locally

- Proposed versioned `haven-workforce-v1` JSON contract/schema and setup guide.
  Dedicated server-only bearer credential, activation flag and contract gate.
  Receiver authenticates before DB access and bounds bodies to8KiB.
- Additive migration20261114030000, numbered after live read of ledger140/
  latest20261114020000. Reviewed source/property/employee links to existing Hotel
  accounts, complete expiring availability and durable replay/version receipts.
  No account creation, role grants, payroll or Hotel attendance/time-clock writes.
- RLS, service-only protected writes, Admin/Owner mapping/settings with reason,
  versioned configuration and exact-link revocation. Unlink removes cached
  availability and retains assignment/audit history. Versions and observation
  ordering survive remapping. Replays never extend freshness.
- Automatic checkout task selection is disabled by default. When explicitly
  enabled, an insertion trigger chooses mapped, active/recovered Housekeeping
  with fresh Workforce employment/department/clock-in/current-shift evidence.
  Least unfinished Housekeeping workload, random tied minimum, serialized
  automatic selections. No eligible staff leaves pending/unassigned work.
  Accepted updates or activation distribute up to200 pending checkout tasks.
  Existing manual assignments, cleaning/inspection and room readiness persist.
- Admin Users & Staff integration controls, Manager team availability separate
  from operational task activity, Housekeeping personal shift/update display.
  Staff API rechecks actor and restricts ordinary employees to own evidence.
  Thirty-second refresh, explicit unknown/expired/unavailable states, scoped
  mobile forms and contained table scrolling. Configured assignment suggestions
  also filter to Workforce-eligible teammates.

## Verification

- Node22.22.2 TypeScript noEmit passes. Touched ESLint exits0 with2 effect warnings
  (one existing StaffDuty effect and the similar new fetch effect).
- Final full Vitest2618/2618 across250 files, maxWorkers2. Focused contract/API/
  parent-panel tests initially61 passed. Added Manager compact-scope regression
  is included in the final full run. Initial default-worker full run had2 scan
  test timeouts while building concurrently. Both files passed standalone45/45,
  followed by the fully passing final suite.
- Real disposable loopback PostgreSQL13 scenarios pass: default off, mapping/
  role guards, scoped/idempotent events, ordering, clock-out/leave/break/inactive/
  mismatch/expiry/recovery/shift end, backlog assignment, lowest workload,
  concurrent/tied selections, audit, inspection/readiness, RLS/grants, disable,
  config conflicts and unlink/remap freshness. Generated clone is dropped.
- Final production Next webpack build succeeds in isolated
  `.tmp/workforce-build`. First sandbox build hit Windows EPERM. Escalated retry
  and final revision build succeeded. Latest generated output includes the new
  routes. Removed only the build-added tsconfig include entries, retaining the
  pre-existing dirty config. Generated next-env remains local/previously dirty.
- Actual production localhost HTTP: unconfigured inbound POST503, unauthenticated
  staff GET/POST401. Temporary production server3127 stopped afterward.
- Impeccable detector returned[]. Browser inventory reported no browser access.
  Desktop/mobile visual and physical-device QA are pending, not claimed.

## Delivery boundary

No hosted migration, environment update, remote employee/task write, commit,
push or deployment. Preserve the large unrelated working tree. Added only the
Workforce insertions to already-dirty queue/admin/docs/config files. New schema
must be deployed before publishing these UI/API changes. Do not bulk-push the
root migration directory. Receiver and automatic assignment remain off until
source/property IDs, employee mapping, dedicated credential, contract agreement
and joint sandbox tests are ready. Guide:
`docs/integrations/WORKFORCE_MANAGEMENT.md`.

## Follow-up — user requested active testing

Added `scripts/workforce-http-db-test.mjs` and passed9 scenarios against the
existing local production build with real NextAuth logins, actual protected HTTP
routes, local PostgREST and a disposable PostgreSQL clone. Simulated Workforce
messages exercise Admin/Owner linking, staff/Manager scoping, authentication,
wrong property/unmapped employee/invalid department, replay/conflict protection,
lowest-load checkout assignment visible in the real Housekeeping queue,
start/complete/inspection through sellable readiness, clock-out/stale version,
backlog assignment on clock-in, simultaneous tied checkout requests, evidence
expiry, shift end, break/leave, unlink and explicit disable. No application fix
was needed. Initial harness startup needed the PostgreSQL DLL directory on PATH.
The corrected harness passes and cleans up its child services and clone.

Reran all13 SQL scenarios and36 focused contract/API/UI tests successfully.
Browser inventory still reports local browser access unavailable, so no desktop/
mobile visual verification is claimed. The loopback Supabase-prefix adapter and
simulated Workforce sender are the test substitutions. No live Workforce,
hosted gateway, Vercel writes, migration/deploy or real employee data were used.
