# Occupants, Guest Controls and Housekeeping

Date: 2026-11-03
Status: Local implementation written; release verification incomplete.

## Request and scope

- User requested implementation of the occupant support, guest merge/DNR and
  realistic housekeeping proposals.
- Followed the approved local implementation plan at
  `docs/plans/2026-11-03-occupants-guest-controls-housekeeping.md`.
- Preserved the separate cancellation/folio work already present in the tree.

## Implemented locally

- Evolved `reservation_guests` with nullable CRM identity, occupant details,
  staff-recorded age/ID evidence, attendance, capacity and policy-gated arrival
  checks; added emergency occupancy UI/API.
- Added room discrepancy reporting, Front Desk investigation and assignment
  protection without silently changing reservation/cleanliness state.
- Added VIP, DNR, security, accessibility and special-handling flags, scoped
  audited overrides, booking/arrival enforcement and a reviewed merge flow.
- Added merge aliases and history, masked email/phone match evidence, explicit
  survivor/field selection, stale preview and idempotency. Login-linked and
  loyalty-bearing profiles are not mergeable.
- Added stay-scoped DND with audit/checkout clearing and housekeeping
  service-declined/late outcomes on existing tasks.
- Updated `SYSTEM.md`, Front Desk operations docs, implementation plan and QA
  report to distinguish local source from deployed behavior.
- Conditional child/extra-person pricing, turndown and lost property remain
  deferred pending property policy.

## Verification and limits

- `npm run typecheck`: passed after the final DND permission/UI wiring.
- Explicit-file `npx eslint` on changed TS/TSX files: exit 0, warnings only.
- `git diff --check`: exit 0 on tracked changes; line-ending notices only.
- No tests, SQL harness/replay, browser acceptance or build run for this change.
- Supabase CLI was signed out. The hosted migration ledger and live schema were
  not verified; local migration timestamps `20261103170000` through
  `20261103210000` are provisional. No migration push, policy activation, guest
  merge or deployment occurred.
- Manual SQL review corrected the merge-preview email-lock calculation to load
  its JSON guest state before reading contacts. PostgreSQL replay is still
  required before release.

## Next steps

1. Sign into the configured Supabase CLI and verify current live migration ledger
   and schema before changing local migration order or attempting replay.
2. Replay migrations on clean and restored databases; exercise merge, DNR,
   occupant/age gates, discrepancies and DND against actual SQL behavior.
3. Run planned targeted/full tests and build, then perform role and browser QA.
4. Keep production migrations, app deployment and register/age policy activation
   as reviewed release actions.
