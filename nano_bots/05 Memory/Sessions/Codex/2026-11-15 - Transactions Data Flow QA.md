# Transactions Data Flow QA — 2026-11-15

Read-only live Front Desk and ledger tracing checked payment, invoice, receipt,
and drawer links. The selected payment link into Deposit Verification lost its
context; fixed and browser retested. Paid daily Transactions totals used creation
time while Accounting Reports used verification time; aligned the Transactions
period, sort, and row date. Focused tests, typecheck, full Vitest (2,451), and
an isolated Webpack production build passed; touched ESLint reported no errors.

KI-029 remains open for three invoice paid totals without payment rows. KI-032
records two historical paid cash transactions without drawer IDs. Neither was
changed. No hosted financial write or deployment. See
`docs/qa/transactions-data-flow-qa-2026-11-15.md` for samples, scope, and
verification.
