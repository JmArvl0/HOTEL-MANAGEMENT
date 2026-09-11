# Preventive Maintenance Asset Registry (Roadmap Phase 8)

**Date:** 2026-09-30
**Scope:** Post-audit roadmap Phase 8 — preventive maintenance **foundation**: a registry of
REAL assets with derived due schedules. No equipment is invented or seeded; a due service
**never blocks a room**.

## What was built

- **Migrations** `20260932010000_maintenance_assets` + `20260933010000_maintenance_asset_roles`
  (both pushed + live-verified):
  - `maintenance_assets` table: name, category, optional `room_id` (FK), optional location,
    `last_serviced_at date`, `service_interval_days` (1–3650 check), **`next_service_date`
    GENERATED ALWAYS AS (last_serviced_at + service_interval_days) STORED**, notes, active,
    registered_by, timestamps. RLS enabled, zero policies (service-role only). Partial index
    on `next_service_date` where active. **No rows seeded** — live count verified 0 after the
    smoke test was removed.
  - Four audited `SECURITY DEFINER` RPCs (`set search_path=public`, EXECUTE service_role only,
    full revoke footer incl. the anon/authenticated named-role revoke): `maintenance_register_asset`,
    `maintenance_record_asset_service` (advances `last_serviced_at`, returns the new derived due
    date; rejects future dates), `maintenance_update_asset` (null = unchanged; dialog prefills so
    an edit submits the full row), `maintenance_deactivate_asset` (reason required; retires, never
    deletes). Every action writes an `audit_logs` row with before/after — **service history lives
    in audit_logs**, not a duplicate table.
- **App**: `lib/maintenance-assets.ts` (pure `daysUntil`, `assetDueWindow`, shared
  `ASSET_DUE_WINDOWS`); `GET/POST /api/maintenance/assets` (active assets + room numbers via
  PostgREST embed, normalized object/array; register with staff-typed room resolved id-or-number,
  same tolerance as work-order reporting) and `POST /api/maintenance/assets/[id]/[action]`
  (record-service / update / deactivate), all running through the RPCs — the routes never write
  tables directly.
- **UI** (Maintenance section, maintenance + manager): "Preventive maintenance" card group above
  the work-order table — five due windows (Service overdue / Due within 7 days / Due within 30
  days / Scheduled / No service history yet) with per-card derived-due badges
  (sla-breach/sla-attention reuse), "Register asset" (real-equipment disclosure), Record service /
  Update / Deactivate dialogs. Empty state says so honestly; the panel carries the disclosure
  "a room is never blocked because a service is due".

## Decisions / notes

- **Governance catch (the important one).** The first migration shipped the RPC guards with
  owner/admin included; the full suite immediately failed the pre-existing admin/owner governance
  contract tests — **no `"owner"`/`"admin"` literal may appear under `app/api/maintenance`**,
  because Owner/Admin supervise through executive surfaces and never operate departmental
  workflows. Correct set: **maintenance + manager** (manager keeps operational supervision via
  `canCoordinateOperations`). Fixed same-phase: routes + client + a tightening migration
  (`20260933010000`) that replaces all four live bodies; verified live (guard mentions
  maintenance/manager, no 'owner' substring, anon EXECUTE revoked, service_role granted).
- **Derived, not entered.** `next_service_date` is a generated column, so the schedule can never
  drift from recorded services; recording a service is the only thing that advances it. An asset
  with no history has a null due date and lands in "No service history yet" — never guessed.
- **Never touches rooms.** The migration has no `update rooms`, no `room_is_sellable` reference;
  the routes only read rooms for the id lookup. Blocking stays owned by the work-order
  serviceability diagnosis (§7.6). The predictive risk model does not consume the registry (§15
  updated: due dates are calendar facts, not predictions).
- **No fake data** anywhere: empty registry, honest empty state, demo mode returns 503 like every
  other mutating surface.

## Verification

- `npx vitest run lib/maintenance-assets.test.ts` — 13/13 (after tightening the no-seed
  assertion: the register RPC's own parameterized `insert` is the only one, and the
  `nullif(...,'')` empty-string idiom defeats naive "no string literals" regexes — assert the
  single insert is parameterized instead).
- Full gates: typecheck ✓, lint 0 errors (72 warnings pre-existing), `npm test` **959/959**
  (13 new), `npm run build` ✓.
- Live smoke (remote DB): register (2026-08-01 + 90d → derived 2026-10-30) → record service
  (2026-09-11 → 2026-12-10) → interval update (30d → 2026-10-11) → deactivate (active=false);
  all four audit rows present; smoke row then deleted (count back to 0; audit trail kept).

## Affected files

- `supabase/migrations/20260932010000_maintenance_assets.sql` (new),
  `supabase/migrations/20260933010000_maintenance_asset_roles.sql` (new)
- `lib/maintenance-assets.ts` (new), `lib/maintenance-assets.test.ts` (new)
- `app/api/maintenance/assets/route.ts` (new),
  `app/api/maintenance/assets/[id]/[action]/route.ts` (new)
- `components/manager/manager-dashboard-client.tsx` (asset state/fetch, registerAsset,
  assetAction, ResourceView panel + props)
- `SYSTEM.md` (§7.6 preventive block, §9 table row + counts, §11 maintenance API lines,
  route count 104, §15 note)
- `Current Status.md`, this note

## Unresolved / next

- Phase 9 — commercial readiness (9A payments: keep manual GCash/bank, boundary only if net
  deletion; 9B OTA: nullable external columns + §15 documentation, no sync code; 9C group/
  corporate: only if safe, else document; 9D F&B/minibar: documentation only) + the **final
  overall report**.
- Manual UI verification pending (Maintenance/Manager login: register a real asset, record a
  service, watch the card move between windows).
- The predictive maintenance-risk model intentionally does not use the asset registry yet —
  feeding recurring-issue risk by asset (not just room) is a natural future phase once real
  service history accumulates.
