# 2026-09-24 - Admin System Health Module

## Work completed

Admin dashboard gained a **System Health** module (Governance group) covering the technical
side of the system, as requested: database live/latency, recent system activity, and
migration deployment status, with 60-second auto-refresh.

- Migration `20260924010000_system_health_ledger.sql` (pushed + live-verified via
  `supabase db push`): read-only `admin_read_migration_ledger()` RPC over
  `supabase_migrations.schema_migrations` (note: the table is `schema_migrations`, **not**
  `migrations`; columns are `version`/`statements`/`name`, no timestamps). EXECUTE revoked
  from public/anon/authenticated; proacl verified as `postgres + service_role` only.
- `lib/system-health.ts` — `SystemHealth` type + pure `migrationStatus()` helper
  (`in_sync` / `remote_behind` / `unknown`); tested in `lib/system-health.test.ts`.
- `/api/admin/data?section=system` — timed DB probe (unreachable DB still returns
  `db.live=false`, never a 500), last audit event + 24h event count + pending Manager
  approvals, remote ledger via the RPC, local count via `fs.readdir` (try/catch → `null`
  when files unavailable).
- `next.config.mjs` — `outputFileTracingIncludes` bundles `supabase/migrations/**` with
  the route so the local count works on Vercel.
- `components/admin/admin-dashboard-client.tsx` — new `"system"` section + nav entry
  (HeartPulse icon, Governance group), `SystemHealthView` (metric cards, drift/unreachable
  `role="alert"` panels, applied-migrations table newest-first capped at 20), 60s silent
  auto-refresh interval (`load(true)` skips the loading state so cards don't blank).
- `components/staff-sidebar-groups.test.tsx` — expected admin module list gains `system`.

## Affected files

- `supabase/migrations/20260924010000_system_health_ledger.sql` (new)
- `lib/system-health.ts`, `lib/system-health.test.ts` (new)
- `app/api/admin/data/route.ts` (system branch + `systemHealth()` helper)
- `next.config.mjs` (outputFileTracingIncludes)
- `components/admin/admin-dashboard-client.tsx` (section, nav, view, auto-refresh)
- `components/admin/system-health-view.test.tsx` (new), `components/staff-sidebar-groups.test.tsx`
- `SYSTEM.md` (§7.10 Admin System Health entry; migration counts 51→54 refreshed)

## Verification

- `supabase db push` applied; RPC returns 54 rows via service role; anon/authenticated
  revoked (proacl checked).
- Live query smoke: probe ok, 54/54 migrations in sync, activity counters populated.
- `npx tsc --noEmit` clean; `npm run lint` 0 errors (70 pre-existing warnings, none in
  these files); `npm run build` passes; **809/809 tests** (9 new).
- Runtime fix (same day): first click on System Health crashed
  (`migrations.appliedCount` of undefined) — section switches re-render once with the
  previous section's data before the fetch lands (load's `setLoading(true)` is deferred
  by `setTimeout(0)`), and a failed fetch keeps stale data too. `SystemHealthView` is now
  shape-safe (every field defaulted, "Checking…" until `db.checkedAt`, unreachable alert
  only when a probe actually ran); regression test renders `{}` as data.
- Manual UI verification pending (needs admin login).

## Decisions

- Migration status compares **file count** local vs ledger rows (not names) — deliberately
  cheap; the ledger has no applied-at timestamps.
- The header "Supabase live" pill stays hardcoded (skipped; make dynamic on request).
- Auto-refresh is health-section-only, silent (no loading flash).

## Recommended next action

Manual UI check with an admin account: dashboard → Governance → System Health (cards,
drift behavior by un-pushing nothing — status is live-derived), then commit the tree.
