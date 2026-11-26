# Cash & Shifts pre-push QA

Verified the Front Desk and Accounting drawer workflow with a disposable
database and authenticated application browser. Open, payment, cash refund,
saved physical count, Close, reconciliation and post-close navigation read
back from their intended records. Fixed a 320px page scroll jump caused by
focus on the popover close button and retested. Configured database reads
confirmed role views and migration sync without a financial write.

The full result and open release issues are in
`docs/qa/cash-shifts-pre-push-qa-2026-11-15.md`. KI-022 remains a P1 report
calculation defect; KI-028 records a transient stale drawer headline.
Typecheck, touched lint, 68 targeted tests, 2,428 full tests and 12/12 SQL
checks passed. Isolated Webpack compilation passed, but route type generation
failed on two unrelated extra exports. No commit or push.
