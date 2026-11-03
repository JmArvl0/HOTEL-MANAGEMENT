# Hotel operations implementation candidate — 2026-11-03

**Historical implementation checkpoint.** The subsequent staff walkthrough is
complete locally and found/fixed additional integration bugs. Final verification is
2,201 tests and build/typecheck pass, with 11 lint warnings. The final remote
preflight now fails due to missing remote migrations and version collisions;
the four-pending-file dry-run below is superseded. Use
`staff-walkthrough-2026-11-03.md` and the refreshed manifest for current status.

All applicable local implementation in P0–P10 is complete. P10 merge and P11
conditional features have explicit non-adoption dispositions below. **Production
rollout and controlled authenticated staff browser acceptance remain pending.**
No hosted migration, clock activation, financial close, operational test write,
guest merge, commit or deployment was performed. Normal local app configuration
continues to use the hosted Supabase project; isolated SQL tests never read `.env`.

## Candidate and migration boundary

Base HEAD: `d2ea413`. This is a dirty working-tree candidate containing earlier
remediation and preserved Housekeeping fixes; HEAD alone does not contain the
implementation. `hotel-operations-candidate-2026-11-03.json` records exact source
hashes and the production build ID. Review and commit the selected paired app/SQL
candidate before deployment; do not deploy an arbitrary later working tree.

Read-only hosted ledger inspection found 100 applied migrations, latest
`20261024130000`. The final linked `supabase db push --dry-run --skip-vault`
reported exactly this unapplied sequence, with no seeds or roles:

1. `20261102010000_backend_audit_remediation.sql` (earlier remediation).
2. `20261103010000_hotel_nightly_availability.sql`.
3. `20261103020000_hotel_operations.sql`.
4. `20261103030000_hotel_operating_day.sql`.

Live affected inventory/financial function definitions and execute grants were
read before numbering the new files. No application execute grant to anonymous
or authenticated clients was introduced. All 104 migration files replayed on
isolated PostgreSQL; historical migrations were not rewritten.

## Feature-to-evidence matrix

| Plan group | Implemented behavior | Verification |
|---|---|---|
| P0/P1 Housekeeping | Preserved Owner explicit assignment fix; disabled-session guard; worker ownership controls; checkout/clean/inspect/reclean/request/stock links | Route/UI tests; 27 real SQL checks including concurrent completion/inspection, one stock effect and rollback |
| P2 availability | Peak nightly demand in TypeScript and all nine inventory RPCs; holds and own-claim exclusions; errors distinct from no availability | 30 arithmetic cases; 24 SQL checks, including 14 compiled TypeScript/SQL parity cases and final-unit races; public search browser checks |
| P3 readiness | Staff-scoped assessment at reservation/arrival review, candidate room, actual identity/money/date/room/inspection blockers | Real SQL assessment check, rendered UI and existing final atomic arrival gates |
| P4 room diary | Effective assignment episodes; remaining-night moves; stable booking reference; unknown historical boundaries labeled | Rack regression; real move, competing physical allocation and early-checkout SQL scenarios |
| P5 staying guests | Capacity/version/idempotency; primary anchored to registered identity; companions separate from account/folio ownership | SQL primary-replacement, capacity, stale and retry checks; profile privacy regression; draft preserved on conflict |
| P5 handover | Role/person assignment, due time, authorized links, separate resolve/archive, restore/reopen, audited history | SQL department/contact privacy, version/history and archive checks; desktop/mobile component QA |
| P6 operating date | Accounting activates current hotel day explicitly; server posting stamps; real clocks preserved; legacy dates stay unknown | SQL activation/no-backfill/lagging-day and posting checks |
| P7 close | Accounting-only, blockers, immutable snapshot and one-day advance; retries/concurrent closes; no force bypass | Real posting/close lock wait; operational-write conflict; injected failure rollback; competing close and immutable snapshot checks |
| P8 reconciliation | Labeled booked/live occupancy; frozen nightly accrual; receipts/refunds/charges/adjustments/outstanding; closing capacity basis | Real SQL metrics, missing-rate blocker, pre-cutover exclusion and Front Desk omission checks |
| P9 optional fees | Accounting catalog; server quote/version; frozen existing folio charge evidence; generic charge retained | SQL stale catalog, frozen price, payload/key collision; route role guards; existing financial suite |
| P10 review | Exact normalized email/shared account candidates, masked evidence, retained review decisions; no fuzzy merge | Positive/negative pure tests; read-only live aggregate demand 0/0 |

Implementation files are linked by the plan tracker and `SYSTEM.md` §7.16.
Small shared DTO/guard modules replace redundant per-feature scaffolding; no
new financial ledger, auth account type or external dependency was added.

## Policy and transaction contracts

- Front Desk prepares/resolves operations; Accounting governs fee definitions,
  activates tracking and performs close; Manager/Owner review. Disabled sessions
  fail before mutation, and SQL rechecks the live active actor and role.
- The first operating date is the current hotel-local calendar day at explicit
  activation. Migration alone does not activate it. Existing paid history retains
  NULL posting dates and is excluded from stamped period receipts with an explicit
  pre-cutover count. Booking/auth timers remain real-time.
- Late postings and existing authorized corrections use the currently open day.
  They do not backdate or rewrite a closed snapshot. Closing the current calendar
  day is blocked until it has ended; the configured no-show cutoff also applies.
- Financial writers acquire the policy-row shared lock before existing entity
  locks, with statement/row stamping defenses. Close acquires the exclusive date
  lock, then nonwaiting SHARE locks on operational assessment input tables. An
  already active operational write yields `OPERATIONS_CHANGED_RETRY`; this avoids
  waiting on a writer that could itself await the date lock. No partial close is
  saved. The real regression first failed before this protection was added.
- Unresolved arrivals/departures, open/unreconciled cash shifts, invoice mismatch
  and missing frozen rates block close. Inspection/handover warnings carry forward;
  close never marks guests no-show, inspects rooms or releases inventory.
- Booked room accrual follows contracted frozen nightly rates. Physical occupancy
  is the rack at assessment/close; capacity is closing active/serviceable inventory,
  not reconstructed historical inventory. Received money, assessed fees and signed
  adjustments are distinct. Snapshot time uses `clock_timestamp()` after waits.
- Fee catalog entries start empty. Property Accounting supplies actual fees rather
  than imported reference-hotel prices/taxes. Existing authorized financial
  adjustments/refunds handle corrections; historical fee evidence is immutable.

## Verification and browser limits

Final checks use official Node **22.22.2**, matching `package.json`; its downloaded
binary was verified against the official SHA256 manifest. System Node was not changed.

| Check | Result |
|---|---|
| Full Vitest | 202 files / 2,196 tests passed on final run |
| Typecheck | `npm run typecheck` passed |
| Touched TS/TSX/MJS ESLint | 0 errors, 10 existing warnings (not warning-free) |
| Production build | `npm run build` passed with type checking enabled |
| Complete migration replay + backend regression | 104 files replayed; 23 backend cases passed |
| Housekeeping real PostgreSQL | 27 passed |
| Availability real PostgreSQL | 24 passed |
| Operations real PostgreSQL | 13 scenario groups passed |
| Local production HTTP | Public home/login 200; 9 staff GETs and 6 mutation probes rejected anonymous access with 401 |
| Candidate integrity | 68 changed/new source hashes verified; `git diff --check` passed |

Reproduce database verification sequentially using the loopback cluster documented
in `docs/plans/2026-11-02-backend-remediation.md`:

```powershell
node scripts/backend-remediation-db-test.mjs
node scripts/housekeeping-workflow-db-test.mjs
node scripts/hotel-availability-db-test.mjs
node scripts/hotel-operations-db-test.mjs
```

The first script rebuilds only its fixed test template; subsequent scripts create
random owned clones, use actual transactions/connections and discard their clones.
Do not reset the template concurrently with these scripts. No script accepts a
remote database override or loads production credentials.

Public nonzero/zero search was verified in the earlier local production browser
pass. The new real React components were visually checked in an explicitly labeled
isolated fixture preview: desktop handover; mobile close/blockers; Front Desk with
zero close controls; mobile guest party/readiness. Fields/buttons have 44px touch
targets and layouts fit 390px. This is **component visual QA, not authenticated
staff end-to-end acceptance**. Error/retry, conflict preservation and role behavior
also have rendered tests. No real hosted checkout, inspection, payment or close was
used as a fixture. Perform the controlled role walkthrough before release.

A parallel build/test attempt produced two existing guest-request UI wait failures;
the focused suite passed unchanged. The final full test run uses Node 22 throughout
and no competing build. Earlier Windows sandbox/cache/CLI permission failures and
an encoding-test file-enumeration race were harness/environment failures, not
silently counted as passed. No assertions or timeouts were weakened.

## Explicit conditional dispositions

Task 10B requires demonstrated merge demand. Read-only live aggregate counts were
zero for exact-email and shared-account candidate groups. Review tooling is complete;
merging is not adopted. No names/phones-only matching, identity relinking or account
ownership merging is implemented.

P11 scheduled future moves, special early-departure repricing, returnable-item
tracking, active-cleaning timers, refundable security collateral, day-use and extra
tax rules have no supplied property need/policy. They are explicitly not adopted
under P11's allowed conditional completion. Existing room changes, checkout,
extensions, DND, requests, booking downpayments and tax controls remain applicable.
The previously excluded PayMongo webhook-envelope change remains excluded.

## Coordinated release checklist — not executed

1. Select a controlled test property and review the source-hash manifest, exact
   app diff and all four SQL files. Commit the paired revision; record its SHA,
   build ID, deployment environment and migration versions. Keep `.env*` secrets
   out of artifacts. Normal hosted local configuration must not be switched for
   convenience while preparing isolated tests.
2. Complete staff browser flows with controlled identities/data: Front Desk
   arrival/party/readiness/fee; Housekeeping ownership, clean/inspection/reclean/DND;
   Maintenance blocking; handover links/history; Accounting catalog, clock,
   reconciliation/close/retry; Manager/Owner oversight with forbidden execution
   attempts. Verify historical diary and fee/financial evidence remains stable.
3. Refresh the live ledger, affected function bodies and grants, and exact
   `supabase db push --linked --dry-run --skip-vault`. Stop if versions/bodies
   differ from the reviewed candidate. Use `supabase db push`, never `npm run migrate`.
4. Establish the Vercel/property maintenance window and database backup/restore
   point. Gate **all affected writes**, including gateway/background processors;
   retain queued events for existing idempotent replay. The earlier remediation's
   JavaScript/DB stock-consumption transition is incompatible if released separately.
5. With writes gated, apply the four reviewed migrations and deploy the paired
   reviewed app. Recheck signatures/grants/health and controlled search/commit,
   stock-once, proof/OTP contracts and role flows before reopening writes. Clock
   activation is a separate explicit Accounting action after verification.
6. If any smoke fails, keep writes gated. Prefer a reviewed additive forward fix.
   Never deploy the old JavaScript stock writer against the new consumption trigger,
   use destructive down migrations, or rewrite historical financial/audit rows.
   Restoring an older app requires restoring a compatible reviewed DB contract under
   the gate; record/reconcile any intervening events before reopening.
7. Record release/deployment evidence and controlled test outcomes. Historical
   stock/loyalty reconciliation remains separate reviewed work.

P12B is pending the environment/window selection requested from the user. No
automatic completion claim includes production release or controlled staff E2E.
