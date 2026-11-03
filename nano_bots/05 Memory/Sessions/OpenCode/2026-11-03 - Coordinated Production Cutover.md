# 2026-11-03 — Coordinated Production Cutover

Executed the authorized maintenance sequence end to end. No secrets stored; all
connection/backup details remain in `.tmp/qa-rollout/*.private` (git-ignored).

## Sequence completed

1. **Gate** — Firewall rule "Haven coordinated maintenance 2026-11-03" published:
   plain requests 403, `x-haven-release-check` header requests 200. Verified on
   `/` and `/api/security-policy/public` on the production domain.
2. **Backup** — `pg_dump --role=postgres --format=custom` →
   `.tmp/qa-rollout/pre-cutover.dump` (~1.0 MB). First attempt failed on table
   permissions; the prescribed `--role=postgres` fixed it. Archive listing
   verified (accounts data + `supabase_migrations.schema_migrations`).
3. **Restore rehearsal** — Dump restored into disposable local PostgreSQL 18
   (port 55434) after pre-creating `extensions` schema + `btree_gist` and
   dropping the empty `public` schema first (dump contains `CREATE SCHEMA
   public`). Post-restore: 108 migrations, 38 `user_accounts` rows,
   `room_assignment_no_overlap` EXCLUDE constraint intact.
4. **Ledger recheck** — Remote fetch re-done; remote$local diff clean; dry-run
   listed exactly the four expected pending migrations.
5. **Staged deploy** — Isolated snapshot uploaded as production-target with
   `--skip-domain` (`dpl_Cou57UhzDNeecuDVcFfXii7TpCPQ`, READY). Upload file list
   screened: no `.env*`/state/legacy files except `.env.example`.
6. **Migrations applied** — `supabase db push --linked --include-all --skip-vault`
   applied 4 files: backend audit remediation, nightly availability, operations,
   operating day. Remote ledger now 112 migrations, zero missing vs local.
7. **Promote** — `vercel promote` assigned the staged deployment to production
   domains without rebuilding.
8. **Verify** — With gate still active on prod: `/` 200, public API 200 with
   release header; `/api/staff/operational-date` + eligible-rooms return clean
   401 (auth), homepage renders app markup.
9. **Reopen** — Gate rule disabled and published; plain requests now 200.
   Disposable local restore DB + `.tmp/qa-rollout/ledger-check` copies removed.
   Retained: dump, private logs, gate rule JSONs (rule can be re-enabled/
   removed permanently later).

## Notes

- Deployment: `haven-hotel-management-1dannfmdh-hotel-management2.vercel.app`
  (inspector: vercel.com/hotel-management2/haven-hotel-management/Cou57UhzDNeecuDVcFfXii7TpCPQ).
- The firewall rule is disabled, not deleted — a follow-up pass may remove it
  entirely and confirm no maintenance-window remnants remain.
- `supabase migration fetch` re-fetch after push confirmed ledger parity.
- Earlier session blockers in Current Status (Vercel logged out, missing
  remote versions, collisions) were resolved by the recovery/reconcile work
  this session built on; see QA remediation session.
