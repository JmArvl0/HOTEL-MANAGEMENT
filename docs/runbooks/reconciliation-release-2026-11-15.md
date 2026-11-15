# Scoped main reconciliation — 2026-11-15

The candidate applies the changes from the 38-commit series on top of `d95d14b`, the fetched `origin/main`. The 21 earlier local commits are outside its ancestry. Existing remote cash drafts and explicit payout methods are preserved. The breakfast migration is already hosted and is kept with its original version. This rollout does not introduce the breakfast UI from the earlier commits.

## Hosted ledger and numbering

The read-only check found 141 applied migrations through `20261115010000`. Version `20261105010000` is recorded as `fleet_preparation`, so the Fleet file keeps that version. The two historical cash and receipt files at `20261104030000` and `20261104040000` are already applied. Restore those files in Git and use the free version `20261115080000` for the unapplied cash draft and payout work. The separate explicit payout function preserves the existing `process_refund` signature. The unapplied Workforce migration moves to `20261115090000` so all pending migrations follow the hosted ledger in order.

| Pending version | Change |
| --- | --- |
| `20261115020000` | Booking attempts, reservation bounds, and inventory guards |
| `20261115030000` | Identity, catalog references, and amount validation |
| `20261115040000` | Daily reports and Xendit reconciliation |
| `20261115050000` | Guest delivery and checkout policy |
| `20261115060000` | Device sessions |
| `20261115070000` | Booking lookup, retry behavior, and asset versions |
| `20261115080000` | Cash count drafts and explicit refund payout |
| `20261115090000` | Workforce availability |

## Verified release gates

- All 2,625 Vitest tests across 262 files passed on Node 22.22.2.
- The isolated Next.js production build passed, including TypeScript checks.
- All 149 migrations replayed on local PostgreSQL. All 104 public tables have row-level security.
- Seven SQL suites passed. They covered availability, hotel operations, enterprise guards, reservation amendments, audit rules, refund drawers, and Xendit. The refund suite verified a draft close and exact retry, rejection of an overdrawn cash payout, and an external payout recorded with its selected method.

## Coordinated rollout

The hosted database currently lacks `read_booking_hold_attempt`, `create_booking_hold_attempt`, `cash_count_context`, and `process_refund_with_payout`. The new application calls them directly. Before pushing production main, verify the hosted ledger again and review the pending set without applying changes. Apply the approved eight migrations and confirm the required functions and privileges, then push the verified candidate as a fast-forward. Check guest hold and checkout availability, Accounting drawer access, and post-deploy health. The current work only read the hosted database. All mutation tests ran on the disposable local instance.
