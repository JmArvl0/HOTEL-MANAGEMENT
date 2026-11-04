# Occupants, Guest Controls and Housekeeping — Verification Continuation

Date: 2026-11-04
Status: Local implementation verified; hosted release checks remain open.

## Follow-up fixes

- Corrected the occupant migration's primary-key alteration order.
- Corrected the discrepancy function-body patch newline and emergency occupancy
  ordering to use `assigned_at`.
- Replaced unsupported `jsonb_object_length` with a count of
  `jsonb_object_keys` in the reviewed-merge RPC.
- Added a test-only `auth.uid()` bootstrap for clean PostgreSQL replay.
- Kept the stay-service endpoint within the existing Front Desk/Manager role
  boundary. Its route test verifies that a client `p_actor` is rejected and
  valid writes use the authenticated actor.

## Verification

- Clean chronological replay of repository migrations on disposable PostgreSQL
  18 passed. SQL checks: backend remediation 24, occupant/guest controls 13,
  housekeeping workflow 27. The disposable PostgreSQL server was stopped.
- Focused occupant/guest/room-rack/housekeeping Vitest: 157/157 across 11 files.
- Final full Vitest: 708 suites, 2,214 tests; 2,213 passed, 1 failed. The sole
  failure is the unrelated cancellation/change-flow assertion in
  `lib/change-request-redesign.test.ts` that expects `ConfirmDialog` not to
  appear. The owner-role failure found in the first full run was fixed; its
  authorization test passes.
- `npm run typecheck`, `npm run build`, and ESLint on changed route/test passed.
  Touched-file ESLint across the feature work exited 0 with warnings only.
- Runtime is Node 26.6.0; package requires Node 22.22.2 through 22.x.

## Still open

- Supabase CLI has no access token. Live migration ledger/schema and hosted
  upgrade order were not verified; `20261103170000`–`20261103210000` remain
  provisional local timestamps.
- No restored-database/hosted-order replay, migration push, policy activation,
  real guest merge or app deployment occurred. Local browser acceptance was
  partial; see the continuation below for completed and unverified flows.
- Conditional child/extra-person pricing, turndown and lost-property workflows
  remain deferred pending property policy.
- Preserved the existing cancellation/folio work. The full-suite failure is
  recorded for that shared change flow and was not changed in this verification.

## Browser QA continuation (2026-11-04)

- Ran the local app against the isolated synthetic PostgreSQL/PostgREST QA stack;
  no hosted database or deployment was used.
- Reproduced Front Desk roster save rejection because the UI echoed server-owned
  fields into the strict write schema. Changed the panel to send only writable
  occupant fields and added a regression test. Browser retest saved the companion
  and showed a complete 2/2 roster; focused suite passed 5/5.
- Browser-verified synthetic age/identity gates, Manager scoped DNR exception,
  check-in, emergency occupancy display, Front Desk DND, and room discrepancy
  report/investigate/resolve. Investigation captured the current room snapshot;
  resolving did not update room or reservation state.
- Juan's occupant type remained `unknown` after a verified-age action because
  type is a separate staff-selected field. Child pricing and automatic type
  inference were not part of this pass.
- Housekeeping dashboard had zero tasks, so browser QA could not exercise its
  task-level outcomes or reporter path. Reviewed merge, Owner/disabled-staff and
  mobile browser flows remain unverified. See
  `docs/qa/occupants-guest-controls-housekeeping-2026-11-03.md` for full results.

Related: [[2026-11-03 - Occupants Guest Controls Housekeeping]]; plan at
`docs/plans/2026-11-03-occupants-guest-controls-housekeeping.md`; QA at
`docs/qa/occupants-guest-controls-housekeeping-2026-11-03.md`.
