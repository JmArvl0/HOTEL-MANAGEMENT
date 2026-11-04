# Occupants, Guest Controls and Housekeeping Plan

Date: 2026-11-03
Status: Plan written; implementation not started.

## Request and verified context

- User requested an implementation plan for occupants, duplicate merging/DNR and realistic housekeeping.
- Inspected current schema/RPCs, party/arrival/housekeeping/duplicate panels, role guards, SQL harnesses and relevant system/design/memory contracts.
- Existing `reservation_guests` requires a CRM link and creates a guest for name-only companions. Existing housekeeping already includes inspection/reclean/stayover/deferral; duplicate review exists without merge.
- Dirty cancellation/folio work and its pending migration were present before this task and preserved. No source/migration/runtime/hosted changes were made for this plan.

## Output

- [Implementation plan](../../../../docs/plans/2026-11-03-occupants-guest-controls-housekeeping.md): 13 numbered tasks (0–12), source paths, proposed data/permission contracts, real SQL/route/UI acceptance, staged rollout and policy activation.
- Sequence: occupant register/evidence/presence/emergency list → discrepancy investigation → operational flags/scoped overrides → restricted reviewed CRM merge → structured housekeeping service conditions.
- Child pricing, turndown and lost property have explicit conditional tasks; property policies are required before activation. Proposed policy choices are not approved Decisions.
- Keep primary identity anchored to the current reservation rule; preserve login/financial/loyalty ownership. Initial merges exclude account-linked/loyalty-consolidation cases.

## Verification and next action

- Planning validation only: checked referenced existing file paths, required task/coverage sections and whitespace diff. No application tests/build/browser QA or live-ledger check performed for this documentation-only task.
- Next implementation slice: Tasks 0–2, then 3–4 to complete Batch A; establish current baseline and verify the live ledger before migration numbering. No implementation/release action has been performed.
