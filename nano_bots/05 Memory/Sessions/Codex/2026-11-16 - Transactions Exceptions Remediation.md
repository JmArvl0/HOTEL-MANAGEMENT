# Transactions Exceptions Remediation — 2026-11-16

The owner confirmed the three invoice paid totals and two unattributed cash
receipts are demo records. Read-only configured-ledger queries found no
financial rows or payment audits for the three invoice balances. A guarded
additive migration recomputes those three folios through the authoritative
function and writes before/after audit entries. Disposable local PostgreSQL
replay passed empty, changed-state rollback, and expected correction cases.
Transactions component 8/8, full Vitest 2,452/2,452, typecheck, scoped lint
(zero errors), and isolated Webpack production build passed.

The cash receipts have explicit `unattributedCash=true` collection audits and
belong to paid folios. Their settled history was preserved. Transactions now
shows a cash exception warning, and Accounting can open its existing
investigation queue. Front Desk live browser QA checked the warning; the
Accounting navigation is component-tested only.

The checkout's linked migration dry-run found 17 remote-only versions and a
conflict at `20261115010000`. The latest `origin/main` supplied the missing
source. A separate worktree passed 150-migration SQL replay and a linked dry-run
listing only `20261116010000`. The migration was applied to the configured
database and readback confirmed all three invoices at ₱0 paid and three
before/after audit entries; the cash payments remained unchanged. The source
branch `codex/transactions-demo-correction` (`b013e43`) was pushed. See
`docs/qa/transactions-data-flow-qa-2026-11-15.md` follow-up.
Front Desk Billing browser QA showed `INV-7799` and `INV-7800` unpaid with
their full balances. The disposable PostgreSQL cluster was stopped and removed.
