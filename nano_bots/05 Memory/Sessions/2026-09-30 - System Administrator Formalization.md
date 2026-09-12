# 2026-09-30 - System Administrator Formalization

Internal `admin` role formally treated as HAVEN's System Administrator (Q1/Q2/Q3 decisions). No new role; internal id `admin` unchanged everywhere.

## Work completed

- **Q1 timezone**: new migration `20261001010000_policy_timezone_admin.sql` (pushed + verified, 66/66 in sync) removes the Owner-only timezone gate from `admin_update_operational_policy` — Owner or Admin may change it, other roles may not. Stale protection, reason, audit, IANA validation preserved. Admin policy dialog label fixed ("Hotel timezone"); dead `TIMEZONE_OWNER_ONLY` entries removed from `lib/admin-route.ts`.
- **Q3 display names** (labels only): admin workspace brand → `HAVEN SYSTEM ADMINISTRATION`, property pill → `System Administration`, profile/role renders via new `roleLabel` helper → `System Administrator`; applied in admin client (profile, overview, users, roles, reports) + Owner Admins table. Owner "Admin Governance" section title kept (governs Owner+Admin protected accounts, not the Admin workspace).
- **Q2 System Health** (Unknown-first, read-only, no secrets): new cards Application (env/version/commit), Storage (room-photos probe), Email (configured/not configured), Deployment (Vercel/Unknown), Domain (Not connected), Scheduled automations (2 real vercel.json crons, last-run Unknown), Recent technical issues. No new integrations, no dev controls.
- **Docs**: `SYSTEM.md` §7.10 (definition, timezone rule, health extension).

## Verification

- typecheck clean; lint 0 errors (71 warnings); **990/990 tests** (88 files); build clean.
- `db push --dry-run` showed exactly the 1 intended migration; push applied; `migration list` 66 rows, 0 mismatches. No reset/repair.

## Decisions recorded

- [[D-012]] (timezone), display-name boundary, Unknown-first health.

## Next

- Manual UI verification (Admin login: labels, policy dialog, health cards; Owner Admins table).
- Commit the working tree (coordinate with parallel sessions).
