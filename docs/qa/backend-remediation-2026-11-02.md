# Backend remediation — 2026-11-02

All **23 authorized audit findings are implemented in the local app and additive migration**. **B-005 (PayMongo webhook-envelope parsing) is excluded at the user's instruction.** No production deployment or database migration application has been performed.

The existing unfinished frontend/workspace changes were preserved. No commit was created.

## Changes and coverage

| Audit IDs | Result | Verification |
|---|---|---|
| B-001, B-002 | NULL-owner cancellations are denied; generic reservation PATCH cannot change protected fields. | Real PostgreSQL ownership rejection; route regressions for totals, dates, and ownership. |
| B-003, B-004, B-022 | OTP failures return committed verdicts, preserving counters/audit; self-service reset cannot activate suspended accounts; selfie staging/completion share the token lock and proof association. | Separate committed incorrect OTP calls; inactive recovery rejection; foreign proof rejection; successful administrator onboarding; consumed-token staging rejection. |
| B-006 | Cash shift opener uses `hashtextextended`; drawer-less route bypass is disabled. | PostgreSQL open → cash collection → close with zero variance → reopen → close cycle. |
| B-007, B-008, B-011 | Mixed-night legacy rate is nullable; `room_is_sellable` is migration-owned; gateway submission uses resolved per-night totals and freezes the breakdown. | Clean replay of all 101 migrations; mixed-rate hold and seasonal gateway submission. |
| B-009 | Immutable `loginIssuedAt` survives NextAuth renewal and client updates; fixed hard ceiling also binds renewal. | Real NextAuth encode/decode plus app JWT callback; expiry helper; standalone session probe. |
| B-010, B-017 | Verified deposit proof is copied into `submitted/` before attachment; staging deletion protects legacy attached proof; manual submissions require live manual mode. | Route/storage boundary tests, staging-path SQL rejection, deposit-OFF SQL rejection. |
| B-012, B-023 | Settlement and operational room checks honor live administrative/serviceability state; express check-in requires an unexpired early approval. | Inactive direct check-in and gateway capacity rejection; expired approval rejection. Also corrected an existing ambiguous invoice reference discovered by the express test. |
| B-013, B-014, B-015 | Pending deposits cannot be repriced by loyalty; stay spend is counted once for tier progression; excessive redemption is rejected without burning points. | PostgreSQL pending-redemption rejection, PHP 10,000 threshold example, excess-point rejection with unchanged balance. |
| B-016 | Task and direct-request fulfillment consume inventory and record movement in the same DB transaction. Generic staff stock counts use a locked audited RPC. Removed the unsafe JavaScript stock writer. | Real concurrent fulfillment; exact one-time task consumption with worker attribution; out-of-stock rollback. Replaced three obsolete fake-client consumption tests with database behavior coverage. |
| B-018, B-019 | Complete paged reads feed financial/operational aggregates; authoritative ledger, rack and customer-join errors propagate rather than becoming zero money. | 1,037-row ledger case retaining an old balance; server-cap pagination; later-page and ledger query failures. |
| B-020 | Existing mutation routes await the durable notification write; optional email remains non-fatal. | Cancellation response cannot finish while notification persistence is pending; existing notification failure tests. |
| B-021 | One SQL RPC serializes the generation claim and commits all model snapshots together. Failed prediction writes roll back partial snapshots and record a failed attempt. | Real competing transactions: one winner; bad prediction: no completed partial generation. |
| B-024 | Production build TypeScript checking restored; malformed ignored Next route types regenerated. | Typecheck and production build pass with the gate enabled. |

## Verification

- Full Vitest checkpoint: **194 files / 2,106 tests passed**. Workspace-local TEMP/TMP avoids the sandbox cache-renaming problem.
- Standalone PostgreSQL regression harness: **23 cases passed**, including real transactions/concurrency and a clean ordered migration replay.
- `npm run typecheck`: passed.
- ESLint on touched backend files/tests/scripts: passed, no errors or warnings.
- `npm run build`: passed with TypeScript checking enabled; existing deprecated-middleware warning remains.
- `node docs/qa/backend-audit-probes.mjs --session-only`: passed. Running all audit probes still reports the two excluded PayMongo failures.
- No browser QA or production booking/payment/email exercise was performed.

## Database target and rollout

The configured `.env.local` points to a stopped local Supabase stack (Docker is not running). The **linked Supabase CLI** did reach the remote project:

1. Its live migration ledger matched all 100 pre-existing local migration versions.
2. Read-only function introspection verified the bodies and execute grants of 15 relevant functions. Every replaced RPC matched its latest migration body. The snapshot-only `room_is_sellable` body was preserved. The live Housekeeping completion function has a narrower role gate than the historical migration; this function is deliberately not replaced.
3. The additive migration was then numbered as [20261102010000_backend_audit_remediation.sql](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261102010000_backend_audit_remediation.sql).
4. `supabase db push --linked --dry-run --skip-vault` listed **only that migration**. It has not been applied.

**Roll out the application and migration together.** The OTP failure-result contract, token-locked selfie RPC, finalized proof namespace, analytics persistence RPC and stock-consumption ownership change together. In particular, a database-only rollout while the old Housekeeping JavaScript stock writer is still deployed could deduct stock twice. The current checkout also contains unrelated unfinished frontend changes; deploying the whole checkout would include them. These are implementation/deployment coordination requirements, not failed local checks.

Use `supabase db push` for the actual migration; never the legacy `npm run migrate`. The migration changes functions, nullability, and a fulfillment trigger; it does not rewrite past payments, loyalty awards, or inventory movements. Existing incorrectly awarded tiers or stock discrepancies require a separately reviewed reconciliation rather than an automatic historical rewrite.

## Reproduce the isolated SQL checks

The harness never reads `.env` and is restricted to the disposable `backend_remediation_test` database on loopback port 55432, user `backend_audit`.

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/initdb.exe' -D '.tmp/backend-remediation/pg-test' -U backend_audit -A trust --encoding=UTF8 --locale=C
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D '.tmp/backend-remediation/pg-test' -l '.tmp/backend-remediation/postgres.log' -o '-p 55432 -h 127.0.0.1 -c timezone=UTC' -w start
node scripts/backend-remediation-db-test.mjs
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D '.tmp/backend-remediation/pg-test' -m fast -w stop
```

Skip `initdb` when the disposable cluster already exists. `--baseline` replays only the original 100 migrations and reproduces the pre-fix failures. The test server is stopped at session close.
