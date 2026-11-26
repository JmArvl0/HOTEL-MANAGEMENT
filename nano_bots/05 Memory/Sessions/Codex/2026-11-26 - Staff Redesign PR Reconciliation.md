# 2026-11-26 — Staff redesign PR reconciliation

- Reconciled all 58 Git conflicts in PR #1 against main at `53f058d`.
- Preserved current Front Office, Accounting, guest and Lost & Found workflows
  and the original feature commits. Older Billing, Cash & Shifts, reports,
  and Transaction designs remain available as prototypes and historical notes.
- Kept the hosted identities recorded in the November 20 staff migration
  reconciliation. The four older branch files add no required behavior over
  main's replacement migrations.
- Reconnected the shared AI drawer to the current staff shells. Current
  navigation and the shared authenticated session guard control module access.
  Accounting uses refund, settlement, and balance facts. Room board readiness
  uses actual housekeeping and maintenance state.
- The isolated PostgreSQL migration replay and its SQL regressions passed.
  Local checks made no hosted database changes.
