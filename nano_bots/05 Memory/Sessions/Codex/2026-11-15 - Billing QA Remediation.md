# Billing QA remediation — 2026-11-15

The user asked to implement the Billing QA recommendations. The UI changes
committed in `386cd49` were verified in the live Front Desk browser: the
₱19,140 pending deposit appears in Payments as unapplied; `INV-7799` warns
that applied payments have no linked settled transaction; `INV-FF587288`
shows Cancelled and the historical stay context in desktop and 390px detail.
The statement control guards repeated clicks and opens the issued document.
No statement or other configured-database financial write was performed.

The configured migration ledger was read-only. `20261115010000` had already
been applied; `20261115020000` had not. The former's five-total comparison
could reuse an obsolete statement after charge changes, had no concurrency
guard, and replaced the terminal-settlement fields added by `20261103160000`.
The pending invoice-reset migration would have set three paid totals to zero
without external evidence that the guests never paid. It was removed from the
working tree before deployment. KI-029 remains open and requires Accounting
reconciliation against external payment evidence.

Additive `20261115030000_repair_financial_document_dedup.sql` patches the
installed document function: removes the old shortcut, restores terminal
settlement fields, serializes by source, compares full immutable folio content
except number/time, and returns the earliest receipt for a settled payment.
Historical documents are untouched. This migration is **not applied** to the
configured database yet.

Verification used disposable PostgreSQL 18 with 130 migrations replayed.
Replaying the applied dedup reproduced the loss of `terminalSettlement`; the
repair restored it. Fictional data showed one statement for unchanged content,
a new statement after a reversed charge with unchanged totals, one receipt for
one payment, and one document from two concurrent issuance requests. The
temporary server and files were removed. Typecheck passed; scoped ESLint had
zero errors and three pre-existing dashboard warnings; Vitest passed 233 files
and 2,443 tests; isolated Webpack production build exited 0 after an initial
Windows sandbox `EPERM`. Impeccable detector found no UI issues.

Relevant evidence: `docs/qa/billing-qa-2026-11-15.md`, KI-013/KI-029/KI-030/
KI-031, D-040. Accounting live browser/write paths remain untested. The branch
also contains a concurrent local Cash remediation commit `db9f347`; preserve
that work when committing or pushing this Billing correction.
