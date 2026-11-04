# Cash Drawer UI Implementation Plan — 4 November 2026

## Request and result

User requested an implementation plan covering the cashier workflow and the earlier proposed Cash & Shifts UI. Created `docs/plans/2026-11-04-cash-shifts-ui-implementation-plan.md` with an interactive visual reference, desktop/mobile captures, current-source baseline, financial/role rules, component/file map, ordered tasks, acceptance matrix, checks and rollback boundaries.

Implementation and the suggested Cash Drawer display-name change remain unapproved. No application source, financial records, schema or deployment changed in this planning task. One agent only.

## Verified source findings

- Preserve the concurrent cash ledger full-width/header-adjacent-count CSS adjustment; the original before screenshot predates it.
- Live Operational Handover uses `operational-handover-panel.tsx` and plural `/api/staff/handovers`; singular hotel-note handover is a different contract.
- Ledger does not select payment receiving-staff attribution; use an honest unavailable value. Handover results are the recent 100 authorized records, not complete history.
- Current balanced-shift reconciliation cancellation can continue as blank notes; plan includes a bounded Cancel-no-write correction and regression test.

## Verification

Five local plan links/images resolve. Standalone visual export succeeded and its desktop/mobile references were inspected in Chrome. Scoped documentation/handoff `git diff --check` passed. Application typecheck/tests/build were not run for this documentation-only task. Previous Phase 1 checks remain explicitly identified as prototype checks, not authenticated application coverage.

## Next

Review the plan/design. After explicit implementation approval, start P0 against the then-current dirty tree; preserve unrelated work and do not infer schema/deployment authorization.
