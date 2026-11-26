# Cash & Shifts remediation — 2026-11-15

The approved pre-push plan was implemented in the shared Front Desk and
Accounting Cash & Shifts source. New server-generated daily reports separate
incoming paid collections from paid refunds and record net receipts. The
shared report view retains centavos and marks older immutable snapshots whose
collections included refunds as legacy. Current Drawer shows the latest ledger
expected cash while count context reloads; Save and Close wait for a matching
activity fingerprint, including same-net movement changes. The Next route
export build errors were removed without changing handler behavior.

Verification: TDD repros failed before the fixes and passed afterward. Focused
report, drawer, route-adjacent and print tests passed. Full Vitest passed
2,451/2,451. The isolated Webpack production build exited 0. The current cash
SQL harness passed 12/12 against 131 replayed migrations. Final isolated
NextAuth/Next/PostgREST/PostgreSQL browser QA passed 10/10: open, collection,
cash and GCash refunds, report preview, count draft, close, reconciliation,
both cash roles at 1440/390/320px, popover stability and post-close links.
The report repro returned ₱2,000 collections, ₱350.25 refunds and ₱1,649.75
net. Drawer expected cash showed ₱2,750 before a deliberately held count GET
returned. Financial writes used only fictional records in a disposable
loopback database.

During QA, a concurrent Billing session committed and pushed the shared
working tree as `386cd49`, including these cash source changes. A new Billing
correction migration failed fresh replay because its loop variable was
undeclared; its audit insert also followed the update that cleared its filter.
Both defects were repaired locally and 131-migration replay then passed. A
separate real-PostgreSQL smoke check corrected three fictional affected
invoices and wrote one audit row per invoice. The
configured Supabase ledger was checked read-only: cash migration
`20261105010000` applied, Billing correction `20261115020000` pending. No
additional push or configured business write was made in this pass. See
`docs/qa/cash-shifts-pre-push-qa-2026-11-15.md`.
