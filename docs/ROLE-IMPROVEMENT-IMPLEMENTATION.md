# Role improvement implementation — 2026-11-03

User authorization: implement draft Phases 0–5, followed by “continue.” All changes below are local until the new migrations are applied to the configured database. Existing unrelated sidebar/landing work and the unfinished admin-password migration were preserved.

## Delivery state

| Phase | Implemented | Verification / remaining gate |
|---|---|---|
| 0 | Read live migration ledger and relevant function bodies; verified shared drawer and PO behavior; resolved stale draft-only SYSTEM wording | Live ledger ended at `20261024130000`. Initial rollback-only cash-open check reproduced SQL `42883`: missing `hashtextended`. No financial records were retained. |
| 1 | Fixed cash-open typo; serialized open/close/payment; removed cash bypass; restored close UI; shared-custody sign-out reminder; Accounting investigation queue for historical drawer-less cash | Local PostgreSQL lifecycle, retries, denied roles, investigation integrity and concurrent payment/closure scenarios pass. Remote migration/application validation pending. |
| 2 | Cumulative integer partial receipts, explicit delivered quantities, retry-safe receipt history, outstanding balances and scoped Housekeeping deliveries | Real SQL tests cover 6 + 4 = 10, overdelivery, fractions, empty receipts, retries, concurrent deliveries and denied roles. Legacy received rows stay unchanged. |
| 3 | Removed production sample-review fallback; individual pending guest-request withdrawal with ownership/version/work guards and audit | Targeted tests pass. Withdrawal and batch approval tested in PostgreSQL; new department work cannot attach to a withdrawn line. |
| 4 | Manager scheduling, own-roster staff visibility, department handovers/acknowledgement/resolution; linked assigned preventive work and completed-service history | SQL tests cover overnight overlap, permissions, handover transitions, duplicate service work and completion gates. Prototype inspected on desktop and 390px mobile. Signed-in deployed-account QA pending. |
| 5 | Lost & Found intake, storage, custody acknowledgement, claim, Manager approval/rejection, verified release and policy-confirmed disposition; optional-module evaluation below | SQL lifecycle and denial tests pass. Claim notes are excluded from Housekeeping responses. No automatic disposal policy invented. |

The planned defaults are implemented: one shared property drawer; partial receipts; Housekeeping receiving without creation/approval; withdrawal per pending request line; scheduling separate from attendance. Account creation, disabling and role assignment remain with Admin/Owner.

## New migrations and rollout

Apply through **Supabase CLI `db push`**, never `npm run migrate`:

1. `20261103010000_restore_cash_controls.sql`: correct advisory hash function, serialize cash operations, preserve existing RPC signatures, ignore legacy bypass argument and require an open drawer for new paid cash.
2. `20261103020000_partial_purchase_receipts.sql`: partial PO status, cumulative quantities, atomic receipt history, stale/retry guards and partial-order protection.
3. `20261103030000_guest_request_withdrawal.sql`: request versions, withdrawn state, ownership-checked withdrawal and new-work guards.
4. `20261103040000_roster_and_handovers.sql`: roster and handover tables/RPCs.
5. `20261103050000_linked_preventive_work.sql`: asset/work-order links and authorized completed-service recording.
6. `20261103060000_lost_and_found.sql`: item register, restricted lifecycle RPCs and custody events.
7. `20261103070000_cash_exception_review.sql`: Accounting investigation metadata without rewriting historical payments.

New tables use RLS, no anon/authenticated table grants, service-role reads and audited SECURITY DEFINER mutations. HTTP routes validate session/disabled state and scope reads; RPCs independently validate active role and transitions. Client-supplied actor IDs are never accepted at these HTTP boundaries.

**Deployment is pending.** Automatic approval review could not complete the requested remote rollback-only verification because of a usage-limit error. That action was not executed; this was not a finding that it was unsafe. A separate isolated local PostgreSQL instance was used for validation. Supabase CLI is also unavailable in the current local command environment (`npx --offline supabase --version` did not resolve).

Before remote application:

- Recheck ledger and function drift; use the authorized configured connection without printing connection secrets.
- Isolate this release from the unrelated pending `20261024140000_admin_set_account_password.sql`. Do not blindly apply every pending file or mark an unrelated migration applied. Use a scoped migration checkout containing the verified applied history and these seven files, with CLI dry-run first.
- Apply database changes before deploying dependent application code. Maintain compatible RPC signatures; receipt clients must send actual quantities. Drain stale receiving sessions before rollout: an old client pre-filling every ordered item must not be used for partially received orders.
- Perform signed-in acceptance for Front Desk, Accounting, Manager, Housekeeping, Maintenance and Guest, and verify Admin/Owner retain their governance boundaries. Exercise direct denied API calls.
- Validate historical-data compatibility and deployment backup/restore readiness. No automatic backfill of historical receipts, cash attribution or financial totals is authorized by these migrations.

## Operator entry points

- Operational staff: **Schedule & Handover** in the shared sidebar. Manager sees the roster and scheduling controls; other staff see their own schedule and department handovers.
- Manager/Front Desk/Housekeeping: **Lost & Found**, with actions selected by role and current item state.
- Manager/Maintenance: **Maintenance → Preventive work**. Assign a technician, use the existing Maintenance work queue, then record the actual service date against the completed linked order.
- Housekeeping: **Inventory → eligible deliveries**. No draft suggestions, costs, creation or approval controls are added.
- Accounting: **Reconciliation → Historical cash exceptions**. Investigation notes do not mean a variance has been settled.
- Guest: **Requests → Withdraw request**, available on still-pending open lines; server checks remain authoritative.

## Test evidence and reproducibility

- Local PostgreSQL 18: 107 migrations applied from scratch with small substitutes for Supabase-owned auth/storage schemas. The unrelated unfinished admin-password migration was excluded. Application business tables, triggers and RPCs came from real migration files.
- `scripts/test-role-improvements.mjs`: 11 scenarios pass, including real concurrent database connections. Sequential fixture data is rolled back; synthetic concurrency fixtures remain only in the isolated scratch database.
- `lib/role-improvement-routes.test.ts`: 16 HTTP authorization/query-scope tests pass. These use controlled session/query doubles and are not claimed as signed-in browser QA.
- Final `npm run typecheck` passed. Touched-file ESLint: 0 errors / 21 warnings in existing shell/FormDialog code; new operational modules lint clean. Full suite: 2087 passed / one pre-existing password-reset SQL CRLF assertion failure. Targeted operational, cash, PO, navigation and request tests passed.
- `npm run build`: attempted; failed fetching Inter/Playfair Display from Google Fonts. No successful build is claimed.
- Production-CSS preview: `/prototypes/role-improvements-preview.html`; desktop/mobile captures sit beside it. Tabs and preview-only action feedback were checked. This is a fixture preview, not evidence that migrated signed-in workflows are deployed.

To repeat SQL tests, use a dedicated loopback PostgreSQL cluster on port **55439**, not the configured app database. Set `ROLE_TEST_DB_USER` if the local owner differs. `scripts/prepare-role-improvements-test-db.mjs` creates `role_improvements_fresh_test` from template0 and applies migrations; it refuses to drop or replace an existing test database. Then run:

```powershell
$env:ROLE_TEST_DB_NAME = 'role_improvements_fresh_test'
node scripts/test-role-improvements.mjs
```

These scripts never load `.env.local` or accept a remote database URL.

## Phase 5 — optional module evaluation

| Candidate | Responsible roles and actual need to establish | Proposed bounded next scope | Acceptance before a future release |
|---|---|---|---|
| Linen/laundry | Housekeeping + Manager: hotel operates laundry/linen stock rather than only charging for guest laundry | Issue/return/wash/loss ledger linked to inventory | Counts reconcile across clean/dirty/in-process/lost without duplicate stock movements |
| Formal night audit | Front Desk + Accounting + Manager: hotel needs a locked business date beyond existing daily reports | Approved close checklist and exception handling, reusing folio/report sources | No unapproved close with unresolved required exceptions; no duplicated room charges; documented correction path |
| OTA/channel manager | Manager/Owner + Front Desk: actual channel contracts, room/rate mappings and provider credentials exist | One provider first; idempotent bookings/cancellations and inventory sync with retry visibility | Sandbox end-to-end booking/change/cancellation, duplicate webhooks and inventory-conflict recovery |
| Group/corporate | Front Desk + Accounting + Manager: actual multi-room and consolidated billing requirements | Linked room reservations with explicit payer and folio ownership | Atomic allocation, per-room changes, split/consolidated payments and cancellation reconciliation |
| Full accounting/AP/budget | Accounting + Owner: determine external accounting integration vs replacing the books | Prefer a bounded export/integration until ledger requirements are approved | Hotel-approved account mappings, reversals and export reconciliation; no inference that current collections equal profit |
| Backup/restore readiness | Admin + deployment owner: identify managed backups and recovery procedures | Document and run an authorized isolated restore drill | Restored schema/data verified against agreed recovery objectives; no unverified claim that backups are absent |

These remain evaluated future scope, consistent with the draft's conditional Phase 5. No provider integration, payroll/attendance, night-audit lock or full general ledger was fabricated as part of this implementation.
