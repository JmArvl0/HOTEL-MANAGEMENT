# Hotel operations — first implementation batch, 3 November 2026

Scope: P0 baseline/release compatibility, P1 automated Housekeeping close-out, and P2
nightly availability/search recovery from the [implementation plan](../plans/2026-11-03-hotel-operations-and-housekeeping.md).
P3 onward is not implemented in this batch. The user delegated operating-day policy
choices; D-034 records a Haven-compatible direction for the later P6 work.

## Candidate and hosted baseline

- Branch `main`, starting HEAD `d2ea413` (`SYSTEM.md: document remediation contract changes`).
- Existing dirty Owner assignment/shared guard/queue fixes and unrelated analysis, QA,
  planning and memory files were preserved. No staging, commit, push or deployment.
- Local app configuration remains hosted Supabase. The isolated PostgreSQL server is
  only a disposable regression target; no Docker or app connection change was introduced.
- Fresh hosted metadata: 100 applied migrations, latest `20261024130000`. Inspected live
  definitions/signatures/grants of all nine type-inventory RPCs plus Housekeeping
  completion and room sellability. Anonymous/authenticated execute grants were absent.
- Dry-run before work listed only `20261102010000_backend_audit_remediation.sql`.
  Final candidate dry-run lists that migration followed by
  `20261103010000_hotel_nightly_availability.sql`. Neither was applied.

## Implemented and demonstrated

- TypeScript calculates minimum nightly free inventory using checkout-exclusive boundaries.
  Same-day cleaning/maintenance/administrative gates, expiry, statuses and frozen pricing
  are preserved. Three newly failing arithmetic regressions passed after the correction.
- One SQL helper applies the same arithmetic to hold creation, Front Desk booking, manual
  submission/verification, gateway submission/settlement, customer change requests,
  Manager review and Front Desk change execution. Conversion excludes its own claim;
  Front Desk now also respects outstanding website holds. All share the normalized lock key.
- The additive migration patches only the verified count blocks in current function
  definitions, failing on unexpected structure. It preserves authorization and the live
  Housekeeping completion body. It is replayable and retains service-role-only execution.
- Seven real SQL assertions failed before the correction. The candidate passes all
  workflow checks, a 14-case matrix against the **actual compiled TypeScript function**,
  grant/body preservation and replay. Actual concurrent final-unit claims have one winner.
- A positive type count does not waive continuous physical allocation or its exclusion
  constraint. The staggered fixture assigns both old stays to Room A, leaving Room B
  continuously free; physical assignment gates remain in place.
- Public search distinguishes failed lookup from successful zero/nonzero results. Error
  display offers retry with dates retained; portal search shares the retry surface. The
  rendered error regression failed before the correction and passes afterward.
- Existing Housekeeping fixes remain intact. Extended route tests exercise real shared
  guards for anonymous/disabled sessions, forbidden roles and authenticated actors.
  Rendered queue tests cover ownership, independent inspection, Manager priority and
  Front Desk read-only access.
- Durable SQL lifecycle checks cover checkout, clean/inspect/fail/reclean/ready, DND,
  inactive assignees, two-connection starts/completion/inspection and retry, request linking
  before/after assignment, one-time attributed stock deduction, whole-transaction
  insufficient-stock rollback and Maintenance blocking after inspection.
- Fixed the pre-existing B-023 test fixture to derive its arrival dates in its chosen UTC
  policy zone. Its original use of the test cluster's UTC+8 `current_date` failed between
  local midnight and 08:00; production check-in policy is unchanged.

## Verification

| Check | Actual result |
|---|---|
| Targeted Vitest | 8 files / 138 tests passed |
| Full Vitest checkpoint | Final run: 197 files / 2,175 tests passed |
| Full migration replay/backend SQL | 23 regression cases passed; no SQL failures |
| Durable Housekeeping SQL | 27 checks passed |
| Availability workflow/parity SQL | 24 checks passed |
| Typecheck and touched-file lint | Final checks passed, including preserved Housekeeping source and new scripts/tests |
| Production build | Passed on filesystem-access retry; initial prerender hit Windows EPERM after compilation/typecheck |
| Browser | Public nonzero/zero searches passed in local production build; controlled operational walkthrough still pending |

Browser evidence: 10–12 November 2026 for two guests displayed four types / ten units.
Submitting the real form for eight guests returned zero results, with the same dates and
correct no-rooms copy. The availability-error/retry scenario was verified in rendered
component tests, not by inducing a hosted database outage. The local production server
is running at `http://localhost:3000` (process 9920). No hold, payment, checkout,
inspection or other hosted operational mutation was performed.

Commands used the installed Node.js v26.6.0. The repository declares Node 22.x; validate
the eventual release in that pinned runtime as well. Vitest emitted experimental
localStorage/jsdom navigation notices without failures.

Reproduce SQL sequentially, with the existing fixed loopback test cluster running:

```powershell
node scripts/backend-remediation-db-test.mjs
node scripts/housekeeping-workflow-db-test.mjs
node scripts/hotel-availability-db-test.mjs
```

The first harness recreates only `backend_remediation_test`. Each new harness owns a
randomly named clone and drops it on exit, including committed concurrency fixtures.
They never read `.env` or accept a remote connection override. Do not reset the template
while another script is cloning/using it. `--baseline` availability runs require a template
replayed before the nightly migration; the historical failing run is recorded above.

## Concrete rollout checklist — not executed

1. Select/review the exact app diff, including the earlier committed remediation and
   preserved Housekeeping fixes; exclude unrelated unfinished files. Record the eventual
   release commit. Current HEAD alone does not contain this batch.
2. Complete controlled-property role walkthroughs from P1C and P12A. Do not approve the
   real hosted pending inspections or consume real guest-request stock as test fixtures.
3. Refresh hosted ledger, function/grant inspection and the dry-run immediately before
   release. Review exactly the two SQL files named above and any newly applied remote work.
4. Use a maintenance window that gates **all writes**, including background/gateway event
   processors, during the paired remediation app/database transition. Preserve and replay
   queued events through their existing idempotent paths. Read health alone is not permission
   to reopen writes while old JavaScript and new DB fulfillment contracts coexist.
5. With writes gated, apply the reviewed migrations using `supabase db push`, deploy the
   matching reviewed app revision, then verify RPC signatures/grants, OTP/proof contracts,
   stock consumption once, search/commit parity and role gates. Reopen writes only when the
   paired contract and controlled smoke checks pass. Do not use `npm run migrate`.
6. If verification fails, keep writes gated and retain the reviewed pair. Forward-fix the
   affected contract; never independently roll back to the old JavaScript stock writer
   against the new consumption trigger. Do not use destructive down migrations or rewrite
   historical financial/stock rows. A specific restoration procedure must be reviewed for
   the actual deployment platform and release revision before release.

Release remains pending. No production operation, financial close, guest merge or excluded
PayMongo webhook-envelope change is included.
