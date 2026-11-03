# AI Session Handoff

## Current - merge reconciliation (2026-11-03)

Reconciling local `74ebf4d` with remote `8581472` at the user's request.
Preserve local approved shared sidebar, stock/count/cash/ID/request workflows and
QA-01-03 fixes alongside remote Hotel Operations, readiness/party/fees/night audit,
mobile navigation, profile popovers, bundled fonts and backend remediation.
No database changes or deployment authorized by this merge task.

Remote production cutover/112-migration claims and local scoped-release evidence
come from independent sessions, not a new verification. Both full handoffs are
preserved under Memory/Archive in `2026-11-03 - Local HMS handoff before merge.md`
and `2026-11-03 - Remote rollout handoff before merge.md`. Consult relevant source
and ledger before any future migration. Conflict resolution completed: typecheck
and production build pass; 139 targeted tests pass; full suite 2,239 pass / two
Windows exact-text assertion failures. Resolved-file lint has no errors (existing
hook warnings). No browser/combined database replay claimed. See
`docs/MERGE-RECONCILIATION-2026-11-03.md` and [[2026-11-03 - Merge Reconciliation]].

Local six-form regression checks passed previously, including fixed stock refresh
baseline and drawer-ID reset. Remote current-state source includes later hotel
operations and backend changes. Prior test counts describe separate checkouts.

Known Issues collision reconciled: local QA KI-014-016 are now KI-018-020;
remote KI-014-017 retain their original IDs. Historical notes keep old labels.
