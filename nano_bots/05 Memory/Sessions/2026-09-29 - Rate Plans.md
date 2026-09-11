# 2026-09-29 - Rate Plans (Roadmap Phase 3)

Post-audit roadmap Phase 3: manager-proposed / owner-approved dated rate overlays
(weekday/weekend, seasonal, holiday periods) with ONE authoritative per-night resolver
and per-night rate freezing at booking. Deliberately NOT dynamic pricing.

## What was built

**Migration `20260929010000_room_rate_plans.sql`** (pushed via `supabase db push`,
live-verified — see Verification):

- `room_rate_plans` table: room_type_id FK, name, start/end date, `days_of_week` int
  bitmask (bit 0 = Monday … bit 6 = Sunday, 127 = every day), nightly_rate
  numeric(12,2) ≥ 0, status pending/active/rejected/retired, reason/decision trail,
  proposed_by/decided_by/decided_at. Partial unique index: one pending-or-active plan
  per (room_type_id, name). RLS on, service-role only.
- Freeze columns: `booking_holds.nightly_rates jsonb`, `reservations.nightly_rates jsonb`
  — array of `{date, rate}`, written ONCE at creation. `total` stays the frozen monetary
  authority. Legacy rows null → base-rate display fallback; nothing recomputed.
- **`room_nightly_rates(p_room_type, p_from, p_to)`** — the ONE resolver (SQL, stable,
  security definer). Priority: active plan matching date + day-of-week > base_rate;
  narrowest date range wins; ties on decided_at desc then id desc. Never DB order.
- Governance RPCs (audited, null-safe actor guards): `manager_propose_room_rate_plan`
  (manager only), `admin_review_room_rate_plan` (owner/admin; approve→active,
  reject→rejected), `manager_retire_room_rate_plan` (manager/owner/admin; pending or
  active → retired). Approving never touches base_rate — plans are additive overlays.
- **All eight live pricing functions recreated from their LIVE bodies** (read via
  DIRECT_URL first) with only the pricing lines changed:
  `create_booking_hold`, `submit_reservation_deposit`,
  `front_desk_create_reservation`, `front_desk_extend_stay`,
  `front_desk_extend_stay_preview`, `customer_request_reservation_change`,
  `front_desk_execute_manager_approval` (reservation_modification branch),
  `request_manager_approval` (room_type_exception/upgrade + stay_extension stamps).
  Each now sums per-night resolver rates and freezes the breakdown.
  - `RATE_CHANGED` in submit_reservation_deposit now compares the recomputed per-night
    SUM vs the frozen hold subtotal (a single-rate comparison could not detect plan
    changes once nightly rates could vary). Legacy in-flight holds pass — resolver
    falls back to base_rate when no plans exist.
  - Extension pricing: added nights at then-current resolver rates, appended to the
    frozen breakdown (`nightly_rates || v_rates`). Current rule preserved.
  - Approval stamps: `financials` gains `nightlyRates` + nullable `targetRate`;
    `stayExtension` gains `nightlyRates` + nullable `rate`. Single figures only when
    every night prices the same.
- Revoke-all footer for all 12 functions (public/anon/authenticated revoked,
  service_role granted).

**App layer:**

- `lib/rate-plans.ts` — TS mirror of the resolver (display/estimates ONLY; every actual
  charge is RPC-priced and frozen): `nightlyRates()` (same priority rule),
  `stayTotal()` (centavo-exact), `uniformRate`, `fromRate` (catalog "From ₱X"),
  `daysBitmask`/`daysLabel`, `parseFrozenRates`.
- `lib/booking.ts` — `getAvailability` and `getRoomCatalog` fetch active plans and
  price per night (estimates; subtotal from per-night sum).
- Routes: `GET/POST /api/catalog/room-types/[id]/rate-plans` (list; manager proposes),
  `POST /api/catalog/rate-plans/[id]/review` (owner/admin),
  `POST /api/catalog/rate-plans/[id]/retire`. Zod-validated; error codes mapped in
  `lib/admin-route.ts`.
- UI: Rate Plans modal in Room Types & Photos (`room-catalog-panel.tsx` + `.rate-plan-*`
  CSS): plan rows with status/dates/days/rate/reason/decision trail, approve/reject
  (Owner/Admin), retire, and a Manager propose form (7 day checkboxes, date inputs,
  rate, reason). Nightly-breakdown rendering wherever rates can vary: booking Review
  `BookingSummary`, ReservationDetailModal stay summary, extend-stay dialog + manager
  stayExt/financials views, arrival-dialog target-type preview + approved-exception
  view (via `eligible-rooms` returning `nightlyRates`).
- `lib/staff-data.ts` full-detail reservation select now includes `nightly_rates`.

## Verification

- Migration live-verified on the remote DB: 12 functions each with exactly ONE
  overload; resolver priority proven on real rows inside a rolled-back transaction
  (Deluxe King base 6400; weekend Sat-only plan 7200; narrower 3-day holiday plan 9000
  beating the 31-day weekend plan on its nights; **Fri 6400 + Sat 7200 + Sun 6400 =
  ₱20,000.00 exactly — the roadmap's worked example, never 6400×3**); grants correct;
  `room_rate_plans` empty after verification (rollback — no live plans seeded).
- Tests: new `lib/rate-plans.test.ts` (18): resolver mirror (roadmap example,
  no-plan fallback, day-of-week filter, narrowest-wins, decided_at/id tie-breaks,
  non-active never prices), centavo-exact totals, parseFrozenRates, and the migration
  source-scan contract (table/constraints/index, freeze columns, resolver + priority
  line, all pricing sites, governance guards, revoke footer for all 12 functions).
  The tests caught a real bug: `daysLabel`'s Weekdays/Weekends bitmasks were off by
  one day (fixed: 31 = Mon–Fri, 96 = Sat+Sun).
- All gates green: typecheck, lint (0 errors), **905/905** (was 887 + 18 new), build.
- Fixed a real parse bug the typecheck caught in `BookingSummary`: missing `)` closing
  the per-night `.map()` in the new nightly-breakdown JSX.

## Decisions / notes

- Uniform-rate convention: `nightly_rate` on holds and `rate`/`targetRate` in stamps
  carry a single figure ONLY when every night prices the same; null otherwise and UIs
  render the per-night breakdown. Legacy rows null → base-rate display fallback.
- TS mirror is estimates-only by design; the RPC is the authority. No client ever
  computes a charge.
- `CREATE OR REPLACE` cannot remove parameter defaults (SQLSTATE 42P13) — the live
  `create_booking_hold`/`submit_reservation_deposit` signatures carry DEFAULTs that
  `pg_get_function_identity_arguments` hides; use `pg_get_function_arguments`.

## Affected files

Migration `20260929010000_room_rate_plans.sql`; `lib/rate-plans.ts` (+ test);
`lib/booking.ts`; `lib/admin-route.ts`; `lib/staff-data.ts`; `lib/room-type-change-reasons.ts`;
`app/api/catalog/room-types/[id]/rate-plans/route.ts`;
`app/api/catalog/rate-plans/[id]/review|retire/route.ts`;
`app/api/front-desk/reservations/[id]/eligible-rooms/route.ts`;
`components/catalog/room-catalog-panel.tsx`; `components/booking/booking-shell.tsx`;
`app/(booking)/booking/review/[token]/page.tsx`;
`components/manager/manager-dashboard-client.tsx`; `components/manager/extend-stay-dialog.tsx`;
`components/manager/front-desk-arrival-dialog.tsx`; `app/globals.css`; SYSTEM.md
(§6 rate plans block, §7.2/§7.4/§7.8 pricing statements, §9/§10/§11).

## Unresolved / next

- Manual UI verification pending (Manager propose + Owner approve in Room Types &
  Photos; a varying-rate booking through search → review; reservation detail).
- schema.sql fresh-install snapshot still lags (KI-002, carried).
- Next: Phase 4 — guest communication automation (pre-arrival/pre-departure reminders,
  idempotent send tracking, cron).
