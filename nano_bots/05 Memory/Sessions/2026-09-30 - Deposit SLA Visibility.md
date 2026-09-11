# Deposit SLA Visibility (Roadmap Phase 5)

**Date:** 2026-09-30
**Scope:** Post-audit roadmap Phase 5 — deposit-verification SLA **visibility only** (aging chips,
Past-SLA card, bell alert). No automatic approval/rejection of anything.

## What was built

- **Migration `20260931010000_deposit_sla.sql`** (pushed + live-verified):
  - `hotel_operational_policies.deposit_sla_hours int not null default 4`,
    check `between 0 and 72` (`deposit_sla_hours_range`). 0 = SLA tracking off.
  - `current_operational_policy_snapshot()` recreated from the LIVE body + `'depositSlaHours'`.
  - `admin_update_operational_policy` recreated from the LIVE body with new
    `p_deposit_sla_hours` (validated `is null or not between 0 and 72` →
    `INVALID_OPERATIONAL_POLICY`), stamped into the audit `after_data`. The stale 17-param
    overload **dropped** (exactly one signature lives). Full revoke/grant footer.
- **`lib/deposit-sla.ts`** (pure): `depositAgeBand(submittedAt, slaHours)` →
  `normal | attention (≥1 h) | breach (≥ SLA; slaHours 0 disables)`; `formatDepositAge`
  (45m / 2h 05m); `depositSlaSummary(ages, slaHours)` → `{oldestMinutes, pastSla}`;
  `DEFAULT_DEPOSIT_SLA_HOURS = 4`.
- **Policy surfaces** (the full Phase 1 pattern): zod `depositSlaHours` 0–72 in
  `PATCH /api/admin/policy` + `p_deposit_sla_hours` rpc param; `depositSla` number field in
  the Owner and Admin policy dialogs (default from `deposit_sla_hours`); Admin POLICY view
  group "Self-service and operations" gains "Deposit verification SLA (hours)";
  `OperationalPolicy` type + default updated.
- **`getDashboard`** (`lib/data.ts`): `depositSlaHours` metric (fetched for financial roles —
  feeds everyone's chips), `oldestPendingVerificationMinutes` + `pendingPastSla` (accounting
  only), and a "Deposit verification past SLA" **bell alert** for accounting when any pending
  payment has waited ≥ SLA. The alert is derived live, consistent with the bell's semantics
  (§ D-011).
- **Deposit Verification queue UI**: pending rows render an aging chip next to the status
  badge — amber `sla-attention` ("Waiting 1h 30m") from 1 h, red `sla-breach` ("Past SLA 5h
  12m") at the threshold; tooltip shows the configured SLA. Visible to every role that sees
  the queue (Front Desk read-only included — visibility, not authority; Accounting keeps the
  only action buttons). `moduleSummary("payments")` gained a **Past SLA** card (informational;
  hint shows the threshold or "SLA tracking off").
- **Alerts poll now fires immediately on section entry** (previously only after the first
  30 s tick): deep-linking straight to the Deposit Verification queue no longer shows
  default-4 chips for half a minute. Toast seeding is id-diff based, so this cannot replay
  history as toasts.
- CSS: `badge.sla-attention` / `badge.sla-breach` reuse the existing amber/red badge
  families exactly (dark + light).

## Decisions / notes

- Accounting's Deposit Verification queue renders through the generic `ResourceView`
  (`section: "payments"` is not in `accountingSections` — that list is transactions/folios/
  cash/reconciliation/documents), so one chip implementation covers Accounting, Front Desk,
  and Manager views.
- Aging is computed client-side from `submitted_at` (live derived, like the bell) — the server
  provides only the threshold. A payment's chip updates on the next 30 s poll or refresh.
- SLA 0 means tracking off: no breach band, no breach bell alert, card hint says so — the
  column stays NOT NULL so the policy row is always explicit.
- No write path anywhere near `verify_reservation_deposit` was touched.

## Verification

- `npx supabase db push` clean; live checks: column (integer, default 4), check constraint
  present, exactly one `admin_update_operational_policy` overload, snapshot returns
  `depositSlaHours = 4`, anon/authenticated EXECUTE denied + service_role granted on both
  recreated functions (18-param signature).
- `npx vitest run lib/deposit-sla.test.ts components/manager/module-summary.test.tsx` — 21/21.
- Full gates: typecheck ✓, lint 0 errors (72 warnings pre-existing), `npm test` **926/926**
  (14 new), `npm run build` ✓.

## Affected files

- `supabase/migrations/20260931010000_deposit_sla.sql` (new)
- `lib/deposit-sla.ts` (new), `lib/deposit-sla.test.ts` (new)
- `lib/data.ts`, `lib/types.ts`, `lib/hotel-policy.ts`
- `app/api/admin/policy/route.ts`
- `components/owner/owner-dashboard-client.tsx`, `components/admin/admin-dashboard-client.tsx`
- `components/manager/manager-dashboard-client.tsx`, `components/manager/module-summary.test.tsx`
- `app/manager-dashboard-theme.css`, `SYSTEM.md`, `Current Status.md`

## Unresolved / next

- Phase 6 — housekeeping assignment suggestions (advisory strip; duty from Staff & Duty
  architecture, never login state; system suggests, human confirms).
- Manual UI verification pending (Owner/Admin policy dialog field, Accounting + Front Desk
  queue chips, bell alert on a genuinely aged deposit).
