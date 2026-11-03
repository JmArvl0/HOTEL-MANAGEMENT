# Housekeeping Integration Audit — 2026-11-03

User suspected missing Housekeeping connections and requested checking all rather
than identifying one symptom. Compared actual Haven wiring with already inspected
Open Hotel room-care helpers. No unrelated source was imported or redesigned.

## Findings and changes

- Existing checkout SQL atomically makes the room dirty and creates a linked
  turnover task. Start/complete/inspect/reclean and room sellability are connected.
  Guest-request linking and room-issue/cleanup connections are present in source.
- Hosted read-only checks: seven relevant RPCs advertised, six tasks completed,
  two pending inspections, no missing room links, two active HK accounts.
- Fixed Owner suggested-assignment rejection: assign route now permits Owner
  with explicit HK worker selection, as SYSTEM.md already requires. No new cleaning
  authority for Owner/Admin/Manager; cleaning and inspection remain HK-only.
- Shared guard now rejects disabled sessions before RPC. Queue hides cleaning
  actions for tasks assigned to another HK worker and explains ownership.
- Changes: assign route, shared HK guard, queue panel; new assignment-route
  regression file and three added queue behavior cases. No SQL migration needed.

## Verification

- Before fixes: five regression assertions failed for actual permission/UI defects.
- After fixes: 62 targeted tests pass; full suite 195 files / 2120 tests passes.
- Typecheck and touched-file eslint pass. Production build passes on retry after
  sandbox EPERM blocked generated-directory creation in the first attempt.
- Twelve real PostgreSQL checks passed: checkout dirty/task creation, Owner SQL
  assignment, another-worker denial, start/cleaning, inspection-before-completion
  denial, completion not yet sellable, department denial, failed inspection/reclean,
  pass/readiness, original-history preservation and DND deferral.
- Test database was the existing disposable loopback backend_remediation_test,
  never hosted. Fixtures rolled back; server stopped. App remains hosted-Supabase
  connected; no Docker dependency, production write, migration push or deployment.
- Browser remains unavailable in prior Work settings; no live browser E2E claim.
  Guest-request/cleanup links source-checked, not newly executed against live data.
- Report: `docs/qa/housekeeping-integration-2026-11-03.md`; scratch tests/logs under
  ignored `.tmp/hk-audit/`. Credentials and personal identities not saved in notes.

No commit made. Prior unrelated documentation work preserved. Pending backend
remediation migration and its coordinated stock-fulfillment rollout remain pending.
