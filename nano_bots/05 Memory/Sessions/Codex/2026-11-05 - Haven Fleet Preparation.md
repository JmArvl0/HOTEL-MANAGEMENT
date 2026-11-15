# Haven Fleet preparation — 2026-11-05

User authorized missing Haven-side work while Fleet changes are pending. Prior
review pinned Fleet bf752a850eb40cd179fbea52ac0e3cc4c4d1843a. Single agent;
preserved the dirty tree and independent Housekeeping/download work.

## Implemented locally

- Dedicated ride pickup profile for the actual traveler: name, normalized mobile,
  optional email/private photo and explicit sharing. Guest owner and Front Desk
  edit; Manager/Owner read only. Bounded 5 MiB signature-checked uploads, optimistic
  profile versioning, audited 60-second photo links and no-store responses.
- Additive migration `20261105010000_fleet_preparation.sql`. Live read-only ledger
  check before numbering reported 112 applied, latest 20261103150000. No remote
  migration was applied. All 128 repository migrations replay locally.
- Per-leg external identities and stable v2 create event IDs, linked outbound/
  return requests with Philippine timezone. Immutable attempted payload, delivery
  leases/backoff/bounded manual retries and saved late acceptance references.
- Candidate service callback with durable inbox and saved duplicate ACK, changed
  replay/reference conflicts, stale/terminal regression protection. Legacy
  unversioned events are acknowledged for review. Callback never advances local
  transport or posts a guest fare. Assignment-scoped partner photo refresh also
  checks source request, permission, current photo and active stay/trip.
- Guest Transportation → Passenger details; Front Office → Transportation →
  Pickup & Fleet. Front Desk prepares, inspects delivery, manually retries due
  events and records coordination. Local trip/profile/stay changes invalidate
  preparation. An unsent snapshot may refresh; attempted create needs coordination.
- Staging-only opt-in config, default off. Separate server credentials; HTTPS,
  timeout, no redirects, bounded ACK, exact source reference and explicit candidate
  pickup_profile_accepted response. Current Fleet cannot satisfy that extension.
  No worker schedule, live partner call, local/partner status authority transfer,
  final fare posting, automatic update/cancel or production activation.

Candidate contract, configuration, limits and manual checks are in
`docs/integrations/HAVEN_FLEET_PREPARATION.md`. Updated SYSTEM, acceptance register,
Task 22 and the earlier review's follow-up link. Task 22 stays in progress.

## Verification

- Node 22.22.2. Fresh 128-migration replay and existing SQL regressions pass.
- `node scripts/fleet-preparation-db-test.mjs`: 26 real PostgreSQL cases, including
  ownership/disabled role, consent/stale edits, photo identity, linked legs,
  concurrent claims/callbacks, crash reclaim, retry/backoff, event conflict/stale/
  terminal handling, cancellation while sending, stay cancellation and no fare.
- Focused Vitest 56/2; full suite 2,351/220. Final CSS adjustment separately checked
  in Edge. Touched ESLint 0 errors / 6 pre-existing staff-panel warnings.
- Production build and final typecheck pass. A concurrent-dev build attempt hit a
  transient generated validator-file race. Stopped QA dev server, removed only
  owned generated type paths and reran the build successfully. No source workaround.
- Authenticated real Edge uses real NextAuth/PostgREST/PostgreSQL, HTTPS synthetic
  Fleet and local private-storage fixture. Guest upload/preview/contact at 390px;
  staff two-leg prepare/send/note; callback auth/replay/conflict/stale; assigned
  photo refresh and completion denial; revoked photo/permission; retry after503;
  legacy ACK review; Owner write denial. Separate off-mode run verifies disabled
  send/API/callback and zero outgoing requests. 320px light/dark verifies no
  document overflow, 44px inputs/actions, preserved error drafts and invalid photo
  signature/size refusal. Fixed a staff CSS specificity issue found by this run.
- Evidence is ignored `.tmp/fleet-preparation/`: database.log, targeted-final.log,
  full-final.log, lint-final.log, build-final.log, browser-verify.log,
  browser-off-verify.log and PNGs. Startup port/readiness failures and selector
  corrections were test-harness issues, rerun successfully. All owned process
  trees/clones (including a verified failed-start clone) removed, local PG stopped.

## Remaining

Fleet must accept/revise the candidate guest/leg schema and ACK, implement scoped
read/update/cancel, ordered durable events/driver access and fare evidence. Joint
real staging QA, location mapping, automatic reconciliation/worker scheduling,
billing cutover and actual role/partner sign-off remain pending. Local preparation
does not certify those. No hosted deployment, commit/push or external messages.
PayMongo deferred; hosted rollout remains on hold.
