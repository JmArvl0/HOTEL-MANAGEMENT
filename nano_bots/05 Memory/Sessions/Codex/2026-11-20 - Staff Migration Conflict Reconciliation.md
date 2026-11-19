# 2026-11-20 — Staff migration conflict reconciliation

An encrypted, read-only check verified the hosted ledger and the effective
guest-request and document RPC bodies. All five conflicting versions match
the identities in `main`.

| Version | Hosted identity retained | Resolution |
| --- | --- | --- |
| `20261105010000` | Fleet preparation | Cash payout and drafts already use `20261104040000` and `20261115080000`. |
| `20261111010000` | Guest exact rooms | Add the portal request inventory link in `20261120010000`, retaining fingerprint and retry checks. |
| `20261111020000` | Room type lifecycle and amenities | Partial PO receipt recovery is already in `20261104030000`. |
| `20261115010000` | Reservation amendment integrity | Keep the hosted amendment migration. The new document repair covers deduplication. |
| `20261115030000` | Identity, catalog, and amount audit | Add complete document deduplication in `20261120020000`, based on the installed tax and settlement snapshot. |

The hosted SQL statements for demo-data versions `20261116010000` and
`20261116020000` match their source commits `b013e43` and `1356db9`. Those files
were restored exactly as historical entries. A second read-only comparison
matched 151 entries and showed only the two November 20 migrations as pending.

Disposable PostgreSQL replayed all 153 files from empty and applied the two
pending migrations over the 151-file baseline with existing fixture records.
All 11 scenarios passed. Coverage includes a retained stock link through
fulfillment and catalog changes, retry conflicts and concurrent requests,
historical receipt reuse, changed folio content with unchanged totals, exact
retry binding, concurrent document issuance, staff collection, and RPC grants.
Typecheck, scoped ESLint, 29 focused Vitest tests, and the isolated Webpack
production build passed. The full suite had 2,660 passes and one timeout in
the breakfast pass image test. That test passed on its own with the existing
timeout and assertions.

The hosted database was queried for migration and function metadata only.
No hosted change or Git push was made.
