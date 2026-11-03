# Housekeeping integration audit — 3 November 2026

The user asked to check all Housekeeping connections and use Open Hotel PMS as a reference. The existing Haven workflow was traced before editing. No reference source files or unrelated features were copied.

## Result

Housekeeping already connects to checkout, room state, guest requests, inspections and same-day room sellability. It was not an empty module. Three local defects were corrected:

1. **Owner's suggested assignment failed with HTTP 403.** The queue already offered Owner assignment and `SYSTEM.md` explicitly permits it, but the assign route accepted only Housekeeping. The route now accepts Owner assignment with an explicit worker selection. Cleaning, completion and inspection remain Housekeeping-only; Manager still coordinates rather than performs room care.
2. **Disabled sessions could reach Housekeeping handlers.** The shared guard now returns 401 before calling the database. Existing SQL active-account validation is retained.
3. **Another worker's tasks displayed unusable cleaning actions.** Cards now hide claim/start/complete/defer when assigned to someone else and explain the ownership. Inspection remains available according to the existing independent inspection policy. Database ownership checks remain authoritative.

## Actual connected flow

```text
Front Desk checkout
  → release room assignment and mark room dirty
  → create linked pending checkout_cleaning task
  → Housekeeping claims/starts task; room becomes cleaning
  → complete cleaning; room awaits inspection when policy requires it
  → inspection fails: preserve failed result and create child reclean task
  → reclean and inspect again
  → inspection passes: room available + clean + no blocking work order
  → room_is_sellable permits same-day inventory again
```

| Area | Connection checked | Evidence / verification |
|---|---|---|
| Checkout → task | `front_desk_checkout` updates reservation, assignment and dirty room, inserts source-linked turnover | Actual isolated SQL execution |
| Owner assignment | Existing suggested plan → assign API → `housekeeping_assign_task` | Route regression plus actual isolated SQL Owner assignment |
| Claim/start | Task ownership, room eligibility, cleaning state | Actual isolated SQL; another worker rejected |
| Complete | Worker/state validation; room/task state updated | Actual isolated SQL |
| Inspect | Requires completion; unauthorized department refused; inspection gates sale | Actual isolated SQL |
| Reclean | Failed result retained; new child task completes and passes separately | Actual isolated SQL |
| Stayover / DND | Defer records reason without checking guest out | Actual isolated SQL |
| Guest requests | Database trigger/ensure helper creates a linked request task; deferred room assignment links pending work | Source trace and existing workflow tests; not newly exercised against hosted data |
| Room issue / cleanup | Existing room-issue RPC and room-operation cleanup links | Source trace and deployed RPC metadata; no live repair/cleanup actions performed |
| Queue/UI | Role/action wiring, grouped tasks, inspection queue and refresh | Component/route tests and source trace; no browser end-to-end claim |

## Hosted read-only observations

The configured hosted Supabase was queried through a server-side service-role client. Only aggregate results are recorded; no credentials or guest/staff identities are included.

- Seven expected RPCs were advertised: checkout, assign, start, complete, inspect, defer and room-issue report.
- Six Housekeeping tasks existed, all `completed`; two still had `inspection_status=pending`.
- All six tasks had a room link. No dirty/cleaning/inspection/reclean room lacked corresponding open or pending-inspection work in the inspected rows.
- Two active Housekeeping accounts existed.
- One room had status `available` with a non-clean HK state. That alone is **not** a readiness bug: same-day sellability also requires clean housekeeping and other room policy checks.

These are read-only observations, not successful live workflow mutations or proof that every production function body matches local migrations. No actual guest was checked out or room released during this audit.

## Open Hotel comparison

Reference commit: `3f6956a54aa9faef44311f9e943ce7d44b6934e3`.

- [Dirty-task helper](https://github.com/peeraseepat-cell/open-hotel-pms/blob/3f6956a54aa9faef44311f9e943ce7d44b6934e3/src/lib/hk-dirty.ts#L48-L167) links room release to a new/current cleaning episode.
- [Start handler](https://github.com/peeraseepat-cell/open-hotel-pms/blob/3f6956a54aa9faef44311f9e943ce7d44b6934e3/src/app/api/housekeeping/tasks/%5Bid%5D/start/route.ts#L29-L90) validates worker identity and task state.
- [Approval handler](https://github.com/peeraseepat-cell/open-hotel-pms/blob/3f6956a54aa9faef44311f9e943ce7d44b6934e3/src/app/api/housekeeping/tasks/%5Bid%5D/approve/route.ts#L34-L107) records cleaning approval.

Haven already has the equivalent operational connections and stronger transactional checkout/inspection controls. The appropriate adaptation was to repair the permission/UI mismatches, retaining existing room-care RPCs rather than replacing them with reference-style separate writes or automatic inspection approval.

## Verification

- Test-first regressions reproduced Owner assignment rejection, disabled-session admission and another worker's visible cleaning controls before fixes.
- **62 targeted tests passed**, including assignment-handler role coverage and rendered queue behavior.
- **195 files / 2,120 full-suite tests passed.** Node emitted localStorage experimental warnings; these were not test failures.
- **12 real isolated PostgreSQL checks passed** for checkout, linked task creation, Owner assignment, ownership rejection, cleaning, pre-completion inspection refusal, inspection-gated sale, department denial, fail/reclean/pass, history preservation and DND deferral.
- Isolated tests used the existing loopback-only disposable test cluster, never loaded hosted environment configuration, rolled fixtures back and stopped the server afterward. The app remains connected to hosted Supabase; no Docker dependency was introduced.
- Typecheck and touched-file eslint passed.
- Production build passed on retry. The first build compiled/typechecked but failed writing a generated directory with Windows EPERM; rerunning with filesystem access completed successfully.

Route tests isolate authentication/database boundaries; they are not evidence of live SQL execution. The separate PostgreSQL checks execute actual functions. Browser access remains unavailable in the previously recorded Work settings, so no live browser clicks or end-to-end UI workflow are claimed.

No migration, hosted data modification or deployment was performed. The earlier backend remediation migration is still pending; its coordinated app/DB rollout requirements remain separate, especially request-stock fulfillment. See [earlier remediation report](C:/Projects/HOTEL-MANAGEMENT/docs/qa/backend-remediation-2026-11-02.md).

## Changed source

### Follow-up implementation verification — 3 November 2026

The implementation batch preserved the three fixes above and made their SQL evidence
durable in `scripts/housekeeping-workflow-db-test.mjs`. **27 real isolated checks passed**:
the original lifecycle plus inactive assignee rejection, competing starts, completion/
inspection retries, one reclean child, immediate/deferred guest-request links, one-time
attributed stock consumption, insufficient-stock rollback, and Maintenance blocking.

Extended action-route and queue tests cover anonymous/disabled sessions, forbidden roles,
authenticated actor attribution, other-worker controls, independent inspection, Manager
priority and Front Desk read-only access. The combined Housekeeping/availability targeted
suite passed **138 tests**; full suite **197 files / 2,175 tests**, typecheck, touched-file
lint and production build passed. Backend SQL replay passed its 23 regression cases.

Browser tools are available again. Read-only public search was exercised in the local
production build. A controlled staff lifecycle walkthrough remains pending: no actual
hosted checkout, request consumption or inspection was used as a fixture. Isolated clones
were discarded; the test server is stopped after verification. Hosted Supabase and the
paired remediation rollout remain unchanged. See [batch QA](hotel-operations-batch-1-2026-11-03.md).

- [Assignment API](C:/Projects/HOTEL-MANAGEMENT/app/api/housekeeping/tasks/[id]/assign/route.ts:1)
- [Shared Housekeeping guard](C:/Projects/HOTEL-MANAGEMENT/lib/housekeeping-route.ts:1)
- [Queue action ownership](C:/Projects/HOTEL-MANAGEMENT/components/manager/housekeeping-queue-panel.tsx:222)
- [Assignment API regressions](C:/Projects/HOTEL-MANAGEMENT/lib/housekeeping-assignment-route.test.ts:1)
- [Queue regressions](C:/Projects/HOTEL-MANAGEMENT/components/manager/housekeeping-queue-panel.test.tsx:68)

Scratch diagnostics and logs are under ignored `.tmp/hk-audit/`; no secrets were saved in this report or memory.
