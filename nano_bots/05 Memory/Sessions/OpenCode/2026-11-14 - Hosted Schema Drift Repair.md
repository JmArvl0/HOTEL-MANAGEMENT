# Hosted Schema Drift Repair — 2026-11-14

## Symptom

Guest reservation/confirmation pages failed with Postgres `42703`. The breakfast
snapshot migration fixed the first missing column, then the same flow failed again.

## Root cause

`lib/customer.ts` selects `invoices.terminal_settlement` in financials,
reservation-detail and receipt paths; hosted Supabase had not applied
`20261103160000_cancellation_folio_settlement`. A static scan also found 14 other
committed migrations whose columns, tables or RPCs current code already calls:
occupants, housekeeping outcomes, guest merge/flags, roster/handovers,
lost & found, asset work, partial purchase receipts and refund drawer.

## Change

- Scoped `supabase db push` of `20261103160000` only.
- Dry-ran the remaining committed migrations in a rolled-back transaction; all
  passed except `20261103040000` (duplicate `shift_handovers`, already created by
  `20261103090000_operational_handovers`).
- Made `20261103040000` idempotent: `create table/index if not exists`; handover
  functions switched to `create or replace` after confirming they are identical
  to `20261103090000`.
- Scoped push of the 14 remaining committed migrations. Xendit
  `20261114010000/020000` were deliberately excluded (local-only work).

## Verification

- Hosted ledger `138`; REST select of `invoices.terminal_settlement` returns 200.
- Presence checks pass for all previously missing columns, tables and RPCs.
- Real password logins on the Turbopack server (`3001`): guest account and all
  account pages return 200 with data; manager, front desk, housekeeping,
  maintenance, accounting, admin and owner GET APIs return 200 with no
  `42703`, `42P01` or `42883`.
- Temporary QA password hashes were restored for every staff account.

## Notes

- Port `3106` is a webpack dev server with different env/auth; earlier API 401
  results from 3106 were a test-harness artifact, not a product bug.
- Front-desk login email is `frontdesk@haven.test` (no underscore).
- No app deployment or commit; only the migration idempotency edit is a source
  change.
