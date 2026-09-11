# Current Status

Last Updated: 2026-09-30
Current Development Area: Post-audit improvement roadmap — COMPLETE (Phases 2–9, 2026-09-30)
Current Feature: Roadmap COMPLETE — Phase 9 commercial readiness (2026-09-30)
Current Branch: `main`
Latest Relevant Commit: `e91ee55` (TomTom-priced hotel transfers)

> ⚠ Large **uncommitted working tree** on top of that commit: the features below plus
> parallel-session work (room catalog with photos, transport booking at checkout,
> event-sourced customer notifications, QR scanner redesign). Nothing is committed yet.

## Current Objective

Post-audit roadmap execution (user-authorized continuous run, Phases 2→9, one agent, no
confirmation stops). **ALL PHASES COMPLETE** — 1 tax-aware documents, 2 guest profiles,
3 rate plans, 4 guest communication automation, 5 deposit-verification SLA visibility,
6 housekeeping assignment suggestions, 7 inventory draft POs, 8 preventive maintenance
foundation, 9 commercial readiness (9A/9B/9C/9D). The final overall report was delivered
in-session. Remaining: manual UI verification (role logins) and committing the tree.

## Recently Completed

- **Commercial readiness — roadmap Phase 9 (2026-09-30)** — four sub-items, none faking an
  integration. **9A payments**: audited clean — guest methods are exactly
  `manual_gcash`/`manual_bank_transfer` (reference + proof + human verification), the payment
  page states transfers are verified manually, **no "Pay online" UI exists**, and no
  provider abstraction was created (net deletion was the bar; it isn't met). **9B OTA**:
  migration `20260934010000` (pushed + live-verified) adds nullable
  `external_channel`/`external_reference`/`external_synced_at` on reservations + partial
  unique index (channel+reference when present) — **consumed by nothing** (grep-verified:
  zero references in app/components/lib; contract-tested). **9C group/corporate**:
  deliberately a future project — group inventory semantics + consolidated corporate folio
  touch the booking spine's invariants; documented in SYSTEM.md §15 instead of bolting on
  something unsafe. **9D F&B/minibar**: documentation only — `post_folio_charge` already
  covers arbitrary audited guest charges. Tests: `lib/ota-readiness.test.ts` (7: column
  shape, no sync machinery, no app consumer, manual-methods-only enum, no pay-online UI,
  no provider module, honest payment copy). All gates green: typecheck, lint 0 errors,
  **966/966**, build. See [[2026-09-30 - Commercial Readiness]].

- **Preventive maintenance asset registry (2026-09-30, roadmap Phase 8)** — a registry of
  **real assets** (no fake equipment seeded; the table starts empty); derived due schedules;
  **a due service never blocks a room**. Migrations `20260932010000_maintenance_assets` +
  `20260933010000_maintenance_asset_roles` (both pushed + live-verified): `maintenance_assets`
  table (RLS on, no policies, `next_service_date date GENERATED ALWAYS AS
  (last_serviced_at + service_interval_days) STORED`, partial index on active+due); four
  audited SECURITY DEFINER RPCs — register / record-service / update / deactivate — with
  null-safe actor guards, full revoke/grant footers, and **actor set maintenance+manager
  only** (the first migration shipped with owner/admin included; the pre-existing
  admin/owner governance contract tests — no `"owner"`/`"admin"` literal under
  `app/api/maintenance` — caught it within the phase and `20260933010000` tightened the live
  guards; the same discipline now applies to the RPCs). Service history lives in
  `audit_logs` (before/after per recording); deactivation retires without deleting.
  App: `lib/maintenance-assets.ts` (pure `assetDueWindow`/`daysUntil` + shared
  `ASSET_DUE_WINDOWS`); `GET/POST /api/maintenance/assets` (list with room numbers +
  register; staff-typed room resolved to id) + `POST
  /api/maintenance/assets/[id]/[action]` (record-service/update/deactivate); Maintenance
  section "Preventive maintenance" card group (overdue / ≤7d / ≤30d / scheduled / no
  history, per-card derived-due badge, Register asset / Record service / Update /
  Deactivate dialogs, explicit "a room is never blocked because a service is due"
  disclosure). Tests: `lib/maintenance-assets.test.ts` (13: due-window math, generated
  column, no-seed, never-touches-rooms, RLS/revokes/audit, governance role boundary,
  route + surface contracts). All gates green: typecheck, lint 0 errors, **959/959**,
  build. Live smoke: register → derived date, record service, interval update, deactivate
  all verified (smoke row removed; audit trail kept). Manual UI verification pending
  (Maintenance/Manager login). See [[2026-09-30 - Preventive Maintenance Assets]].

- **Inventory replenishment suggestions + draft POs (2026-09-30, roadmap Phase 7)** — the
  inventory demand forecast closes its loop into purchasing as a suggestion, never an order;
  **draft means draft**. No migration (existing `purchase_orders` + `vendors` tables reused).
  `lib/purchase-orders.ts` (pure): `buildDraftPurchaseOrder` (status type is the literal
  `"draft"` — the only value it can produce), `draftPurchaseTotal` (centavos rounding),
  `suggestedQuantity` (forecast `recommendedReorder` → ceil, else reorder point, min 1).
  Route `GET/POST /api/inventory/purchase-orders` (manager/owner/admin): GET returns the same
  `forecastInventory` output as Predictive Insights filtered to projected shortages +
  `current-low-stock` items (facts, not guesses) with live unit costs, existing drafts
  (read-only), and active vendors; POST re-reads unit cost + name from the inventory rows
  server-side (never trusted from the client), validates the vendor as active-or-absent,
  recomputes the total, inserts with `status: draft.status` only — **no update/submit/send
  path exists anywhere** — and writes an `audit_logs` row (`inventory_draft_purchase_order`,
  `after_data.submittedToVendor: false`). UI: Inventory section "Replenishment suggestions"
  strip (stock/reorder/predicted need/shortage/suggested qty/est. total) with "Create draft
  PO" dialog where **quantity and vendor are staff-editable** (default = suggested quantity);
  drafts listed read-only beneath ("Draft only — review before any order"). Tests:
  `lib/purchase-orders.test.ts` (11: helper math, EMPTY_DRAFT/INVALID_UNIT_COST, zero-quantity
  filtering, and source-scan contracts — draft-only status writes, no purchase_orders
  update/delete/upsert, server-side cost re-read, audit row, no external send, role guard,
  UI quantity-editable). All gates green: typecheck, lint 0 errors, **946/946**, build.
  Manual UI verification pending (Manager/Owner inventory section). See
  [[2026-09-30 - Inventory Draft Purchase Orders]].

- **Housekeeping assignment suggestions (2026-09-30, roadmap Phase 6)** — advisory assignment
  assistance for the Housekeeping queue; **the system suggests, a person confirms** — nothing
  auto-assigns. No migration. `lib/housekeeping-suggestions.ts` (pure `suggestAssignments`):
  unassigned pending/assigned/deferred tasks (inspections excluded), ordered by stored
  priority → next arrival → age, dealt round-robin to the Housekeeping teammate with the
  fewest open assignments (running load = existing open work + suggestions already handed
  out; ties rotate then by name — deterministic); each suggestion carries a human-readable
  reason; **no skill scores, no invented preferences**. Workload comes from the Staff & Duty
  derivation (operational records only — login is never a duty signal). Route
  `GET /api/housekeeping/assignment-suggestions` (housekeeping/manager/owner/admin) returns
  plan + staff + basis note; demo mode maps the demo store's name-based assignments. UI:
  HousekeepingQueuePanel (still presentational — the dashboard client fetches, honoring the
  existing "no fetch in the panel" contract test) renders a clearly labeled "Suggested
  assignments" strip whose rows drop out as soon as their task stops being open unassigned
  work; Housekeeping gets "Assign to me" (self-assign through the audited assign route,
  `SELF_ASSIGNMENT_ONLY` untouched), Owner gets "Assign to <teammate>", Manager sees the plan
  read-only ("coordinate via Prioritize" — no assign authority), Front Desk keeps its
  read-only queue. Tests: `lib/housekeeping-suggestions.test.ts` (9: no-staff empty state,
  priority→arrival→age ordering, round-robin balancing incl. existing workload, deterministic
  ties, exclusions, reason contents, route + panel + dashboard advisory source-scan
  contracts). All gates green: typecheck, lint 0 errors, **935/935**, build. Manual UI
  verification pending (Housekeeping strip + self-assign, Owner assign, Manager read-only).
  See [[2026-09-30 - Housekeeping Assignment Suggestions]].

- **Deposit-verification SLA visibility (2026-09-30, roadmap Phase 5)** — aging visibility
  for the deposit queue, deliberately **advisory**: nothing auto-approves or auto-rejects.
  Migration `20260931010000` (pushed + live-verified; both policy RPCs recreated from LIVE
  bodies, stale 17-param overload dropped, full revoke/grant footer): `deposit_sla_hours`
  int not null default 4 (check 0–72; 0 = tracking off) on `hotel_operational_policies`,
  Owner/Admin-governed and audited; `depositSlaHours` added to
  `current_operational_policy_snapshot` and `admin_update_operational_policy` (zod 0–72,
  Owner + Admin policy dialogs, Admin POLICY view group). App: `lib/deposit-sla.ts`
  (pure `depositAgeBand` — normal / attention ≥1 h / breach ≥ SLA — + `formatDepositAge` +
  `depositSlaSummary`); `getDashboard` metrics `depositSlaHours` (financial roles, feeds the
  chips) and `oldestPendingVerificationMinutes` / `pendingPastSla` (accounting only) plus a
  "Deposit verification past SLA" bell alert; Deposit Verification queue rows render aging
  chips (amber `sla-attention` / red `sla-breach`, both badge families) for every role that
  sees the queue — Front Desk read-only included (visibility, not authority); the module's
  summary cards gained a "Past SLA" count; the alerts poll now fires immediately on section
  entry (not just after 30 s) so deep-linked chips are never stale-defaulted. Tests:
  `lib/deposit-sla.test.ts` (13: bands incl. SLA-off and missing/future timestamps, age
  formatting, summary aggregation, migration + surface source-scan contracts) and a payments
  case in `module-summary.test.tsx`. All gates green: typecheck, lint 0 errors, **926/926**,
  build. Live: column + check constraint + single overload + snapshot key `4` + grants
  verified. Manual UI verification pending (Owner/Admin policy dialog, Accounting queue
  chips). See [[2026-09-30 - Deposit SLA Visibility]].

- **Guest communication automation (2026-09-30, roadmap Phase 4)** — daily pre-arrival and
  pre-departure guest reminders with idempotency as the core constraint. Migration
  `20260930010000` (pushed + live-verified): `notifications.type` check extended with
  `pre_arrival_reminder`/`pre_departure_reminder`; new `guest_reminder_deliveries` table
  (reservation + kind `pre_arrival`/`pre_departure`, status, error, sent_at; **unique
  (reservation_id, kind)** = one delivery ever per reservation per kind — cron retries,
  redeploys, and manual re-runs are no-ops via the duplicate-key skip). App:
  `lib/guest-reminders.ts` (`runGuestReminders` — INSERT-claim idempotency; in-app
  notification always recorded; email via the never-throw `sendEmail`, failure only marks
  the delivery row failed; pre-arrival = confirmed + check-in tomorrow with check-in time,
  approved early check-in, scheduled transportation; pre-departure = checked-in + checkout
  tomorrow with checkout time, outstanding balance when > 0, transportation); route
  `GET/POST /api/guest-reminders` (CRON_SECRET bearer or manager/owner/admin session, same
  guard as analytics generate); `vercel.json` second daily cron 01:05 UTC ≈ 09:05 Manila.
  Confirmed-booking email enriched with guest count + payment-state line (remaining or
  "Fully paid"). Tests: `lib/guest-reminders.test.ts` (7: predicates, one-send-per-target,
  idempotent re-run, no-user_id case, route guard source-scan, vercel.json contract,
  migration source-scan). All gates green: typecheck, lint 0 errors, **912/912**, build.
  Email is secondary by construction — nothing here can affect hotel operations. See
  [[2026-09-30 - Guest Reminders]].

- **Rate plans (2026-09-29, roadmap Phase 3)** — dated per-night price overlays on
  `base_rate` (weekday/weekend/seasonal/holiday; deliberately not dynamic pricing).
  Migration `20260929010000` (pushed + live-verified; all eight live pricing functions
  recreated from LIVE bodies): `room_rate_plans` (day-of-week bitmask, propose→approve
  governance — Manager proposes, Owner/Admin approves, any catalog role retires; one
  pending-or-active per type+name; approving never touches base_rate); **ONE resolver**
  `room_nightly_rates` (priority: active plan matching date+day > base_rate, narrowest
  range wins, ties decided_at desc then id desc); **agreed rates freeze at booking** as
  `nightly_rates jsonb` on holds + reservations (written once; total stays the frozen
  authority; later plan changes never reprice a confirmed booking/hold/settled folio);
  `RATE_CHANGED` now re-verifies the per-night SUM vs the frozen subtotal. App:
  `lib/rate-plans.ts` mirror (estimates only), plan-aware `getAvailability`/
  `getRoomCatalog`, three governance routes, Rate Plans modal in Room Types & Photos,
  per-night breakdowns in booking review / reservation detail / extend + arrival
  dialogs / approval financials (single rate figure only when nights price uniformly).
  Tests: `lib/rate-plans.test.ts` (18, incl. the roadmap example Fri 6400 + Sat 7200 +
  Sun 6400 = ₱20,000 and the migration source-scan contract). All gates green:
  typecheck, lint, **905/905**, build. Live verification ran inside a rolled-back
  transaction — zero plan rows seeded. Manual UI verification pending. See
  [[2026-09-29 - Rate Plans]].

- **Consolidated guest profiles (2026-09-29, roadmap Phase 2)** — the Guests module is now a
  real CRM surface instead of a raw grid. `getStaffGuestProfile` in `lib/staff-data.ts`
  (batched Promise.all, no N+1, no migration) consolidates identity (contact, nationality,
  address, loyalty, ID-verification status from stays), stay history grouped
  current/upcoming/completed/cancelled/no-show, service history (guest requests,
  transportation, room changes; manager-approval trail manager/owner only), preferences
  strictly from explicit saved records (never inferred), and a financial summary across the
  guest's folios (centavos-exact, gated on `canViewReservationFinancials`). Payment-proof
  images and identity documents are never selected. New `GET /api/staff/guests/[id]`
  (guard `canViewGuestContact` — owner/manager/front desk; GET only). UI: `GuestProfileModal`
  (approval-review-modal pattern) opened from a "Profile" row action in the Guests module and
  from the reservation detail footer ("Guest profile"); stays link straight back into the
  reservation detail. Tests: `lib/guest-profile.test.ts` (9: grouping, financial aggregation,
  cross-guest isolation, role gating, no-proof/no-ID source scan, route contract); the
  room-details source scan was bounded to `getRoomDetail` (it sliced to EOF and the new
  function tripped it). All gates green: typecheck, lint, **887/887**, build. Live smoke:
  every column list verified against the remote DB (busiest guest: 5 stays, 6 requests,
  1 approval, 5 invoices). Manual UI verification pending (role logins). See
  [[2026-09-29 - Consolidated Guest Profile]].

- **Tax-aware financial documents (2026-09-28)** — VAT-INCLUSIVE pricing (user decision): displayed
  prices stay the full amount guests pay; documents *derive* the breakdown. Migration
  `20260928010000` (pushed + live-verified; all three functions recreated from LIVE bodies):
  `vat_rate_bp` (1200) and `service_charge_bp` (1000) on `hotel_operational_policies`
  (Owner/Admin-governed, audited, version-stamped — the stale 16-param overload was dropped and
  the new signature's anon/authenticated EXECUTE grants revoked); the rates freeze into every
  future `operational_policy_snapshot` via the existing trigger; `accounting_generate_document`
  attaches a `taxBreakdown` (netSubtotal / serviceCharge / vatAmount / grossTotal, VAT absorbing
  rounding so lines sum exactly to gross) resolved from the reservation's frozen rates with
  current-policy fallback for legacy rows; settled documents are immutable and rate changes never
  rewrite them; both rates 0 → no breakdown (pre-config look). App: `inclusiveTaxBreakdown` +
  `ratePercent` in `lib/accounting.ts` (TS mirror of the SQL), VAT/SC percent fields in the Owner
  and Admin policy dialogs + `PATCH /api/admin/policy` (zod 0–10000), "Tax and financial
  documents" group in the Admin policy view, snapshot **document viewer** in Manager → Accounting
  → Financial documents (reuses the approval-review modal pattern), breakdown lines on the
  customer receipt page (snapshot rates → current-policy fallback), VAT-inclusive note on the
  booking confirmation. New `lib/tax-documents.test.ts` (10). All gates green: typecheck, lint 0
  errors, **878/878**, build. Live probe: folio on RSV-D370C7FB → 4707.79 + 470.78 + 621.43 =
  5800.00 exactly. Manual UI verification pending (Owner policy dialog, document viewer,
  customer receipt). See [[2026-09-28 - Tax-Aware Financial Documents]].

- **Badge-color governance through the approval workflow (2026-09-27)** — the workflow half
  of the badge-color feature, closing the gaps after the parallel 2026-09-26 session's
  foundation (see below). Migration `20260927010000` (pushed + live-verified, all four
  catalog RPCs recreated from live bodies): colors are **reserved by active types AND types
  with a pending rate proposal** (derived scope — rejection frees automatically), enforced
  race-free via per-color `pg_advisory_xact_lock` in all four claim paths (partial unique
  index kept as the active backstop); **approve = activate** — one Owner decision sets the
  rate AND publishes the still-inactive type with its color (color revalidated first —
  stale-form protection); **active-type recolors are Owner/Admin-only**
  (`BADGE_COLOR_CHANGE_APPROVAL_REQUIRED`, mapped in `lib/admin-route.ts`). UI: color is
  **required at creation** (validation + `*`, no neutral escape hatch — null is legacy
  fallback only), used colors disabled with owner names (never hidden, reservation-scope
  aware), Manager sees the color read-only on active types, Owner review shows the proposed
  color and the one-step publish, catalog cards carry the badge. Physical rooms inherit the
  type color in the roster (`badge_color_key` through `/api/catalog/rooms`, no per-room
  control). New/updated source-contract tests in `lib/room-catalog.test.ts`; live DB probes
  covered create/pending-conflict/approve/recolor-guard/reject-frees. All gates green
  (2026-09-27, after the parallel work landed): typecheck, lint 0 errors, **868/868** tests,
  build. Manual UI
  verification pending. See [[2026-09-24 - Room-Type Badge Color Workflow]] and [[D-010]].

- **Color-coded room-type badges (2026-09-26)** — every active room type owns one badge
  color from a curated eight-key HAVEN palette (sage, gold, ocean, plum, terracotta,
  slate, sand, lavender), stored as a semantic key on `room_types.badge_color_key`
  (migration `20260925010000`, pushed + live-verified — backfill by name: Garden
  Twin→sage, Deluxe King→gold, Ocean Suite→ocean, Executive Suite→plum) and rendered by
  the single shared `RoomTypeBadge` component in the Rooms & Availability grid and the
  check-in Select Room dialog. Uniqueness is DB-enforced among ACTIVE types only
  (partial unique index + `ROOM_TYPE_COLOR_TAKEN`/`INVALID_ROOM_TYPE_COLOR` RPC checks);
  null/unknown keys fall back to a neutral pill. Dual-palette CSS (dark shell / light
  theme / light modal panels); room-status and housekeeping colors untouched; customer
  portal untouched (never used the badge); no new approval mechanism (color is not a
  rate — it rides the audited `admin_update_room_type` path). Catalog editor gained a
  swatch picker (options render as the badge, taken colors disabled with owner names,
  live preview). All gates green: typecheck, lint 0 errors, **838/838** tests, build;
  manual UI verification pending. See [[2026-09-26 - Room-Type Badge Colors]].

- **Approval-execution correctness fixes (2026-09-26)** — three bugs from the 2026-09-23
  standards audit, fixed in migration `20260926010000` (pushed + live-verified), which
  recreates `front_desk_execute_manager_approval` and `front_desk_assign_room` from their
  LIVE bodies: (1) `reservation_modification` execution no longer rewrites
  `invoices.amount` to a bare room reprice — it now reprices the room component only
  (target rate × new nights) and preserves every posted folio charge (transport
  itemization, upgrade differences), settling through `sync_invoice_financials`;
  (2) `early_check_in` execution honors the requested arrival time
  (`requested_action.requestedTime`) on the check-in date in the policy timezone, with
  the old 8-hour window kept only as fallback for legacy/unparseable/already-passed
  requests; (3) `front_desk_assign_room` refuses administratively retired rooms with
  `ROOM_INACTIVE` (new assign-route message). SYSTEM.md §7.4/§7.8 updated and the §15
  assign-room gap removed. New source-scan test
  `lib/approval-execution-fixes.test.ts` (3/3). Suite 837/838 at the time — the one
  failure (`lib/room-type-exception.test.ts:52`) was the badge-color session's in-flight
  eligible-rooms refactor; its assertion update landed with that work and the suite is
  back to 838/838. See
  [[2026-09-26 - Approval Execution Fixes]].

- **Admin governance module presentation (2026-09-24)** — the admin dashboard's weaker
  modules were raised to the staff presentation standard, all client-side over the same
  `/api/admin/data` payloads (no API/RBAC/DB change): Users & Staff gained
  `ModuleSummaryCards` (status/recovery cards clickable onto the existing selects); Room
  Configuration became a full `RoomsView` (cards, type/wing/status filters, search, state
  badges, footer, empty state); Audit Logs & Security share an `AuditView` (cards, action/
  entity filters, search, formatted timestamps); Roles & Permissions renders role cards
  with capability chips; Hotel Policies groups and formats the raw columns (with an
  unknown-key fallback group); Admin Reports shows six cards, an accounts-by-role table
  with shares, and a configuration summary. New `admin-*` CSS block + badge colors with
  light mirrors (`globals.css` untouched — the Owner policy view still uses
  `.admin-policy-grid`). Admin tests
  18/18 (new `admin-views.test.tsx`). See [[2026-09-24 - Admin Module Presentation]].

- **Admin System Health module (2026-09-24)** — the admin dashboard's Governance group
  gained a technical System Health section: live DB probe with latency, system activity
  (last audit event, 24h events, pending approvals), and local-vs-remote migration status
  via new service-role-only `admin_read_migration_ledger()` RPC (migration
  `20260924010000`, pushed + live-verified). 60s silent auto-refresh + manual re-check.
  `outputFileTracingIncludes` bundles the migrations folder for the Vercel build. All
  gates green (808/808, 8 new). See [[2026-09-24 - Admin System Health Module]].

- **Module quick-overview cards, full pattern (2026-09-23)** — compact operational summary
  cards at the top of applicable staff modules via one shared `ModuleSummaryCards`
  component (label / count / hint / icon-chip tone; clickable cards drive the module's
  existing filter via `aria-pressed` buttons, informational cards are `<article>`s).
  Reservations front desk (Active / Arrivals / Departures / In-house) + manager oversight
  (adds authoritative Attention Required) implemented; the seven Session 06 chip-strip
  modules upgraded; Transportation and the Accounting sections migrated onto the shared
  pattern (`.tp-kpi` → `.mod-kpi` in `manager-dashboard-theme.css`). Counts reuse the same
  predicates and Asia/Manila `today` as the filters (card == chip == table rows). **Phase 3
  (same day):** cards added to Approvals & Escalations (Pending clickable onto the status
  pills; replaced the approval-summary chip strip), Housekeeping (five cards from the
  `groupQueueTask` groups), the Guest Requests panel (four queue-clickable cards), and the
  Front Desk Reports history (status-clickable cards); strict ordering everywhere (title →
  cards → filters); ArrivalLane removed with its blocker logic preserved as a 5th
  "Arrivals needing prep" reservations card; grid now keeps any card count in one row
  (`auto-fit,minmax(0,1fr)`, odd-card full-row span at ≤1000px). No business-logic/RBAC/DB
  change; customer portal untouched. 800/800 tests, lint/build/typecheck clean. See [[2026-09-23 - Session 07 - Module Summary Cards]] and SYSTEM.md §7.10 /
  DESIGN.md §10.

- **Stay extension workflow + exception dropdown audit (2026-09-23)** — stay extension
  (extra nights — checkout *date* changes) is now an explicit, distinct business case
  ([[D-009]]); the full dropdown audit confirmed all eight generic Manager-exception
  options are live business cases (label clarifications only, nothing removed). Migration
  `20260923010000` pushed + live-verified (recreated 3 RPCs from live bodies): new
  `stay_extension` approval type with in-house + later-date gates and a server-stamped
  `stayExtension` snapshot; execute branch performs the **same** `front_desk_extend_stay`
  (approval id as idempotency key, one extension implementation) after an optional
  validated same-type room move; new read-only `front_desk_extend_stay_preview` RPC
  (service_role only). New Front Desk `ExtendStayDialog` previews every figure from the
  server (nights/rate/additional lodging/projected total/balance/conflict — never
  client-derived), submits the normal extension with an idempotency key, and hands off to
  the `stay_extension` exception pre-filled on `EXTENSION_REQUIRES_ROOM_CHANGE`; departure
  transportation on the old date is flagged, never rescheduled. Manager review renders the
  stamped snapshot; approval never auto-executes. Pricing unchanged: current `base_rate` ×
  added nights through the standard folio. All gates green (788/788, 25 new); manual UI
  verification pending. See [[2026-09-23 - Stay Extension Workflow]] and [[D-009]].

- **Module quick-overview summary cards (Session 06, 2026-09-22)** — the table/grid
  modules that had no at-a-glance status (Maintenance, Rooms, Inventory, Deposit
  Verification, Refunds, Billing, Guest Requests for housekeeping/maintenance) now show
  a read-only "At a glance" chip strip above the table, derived client-side from loaded
  rows via one shared `moduleSummary` helper in the generic `ResourceView`. Guests and
  modules that already had overviews (Approvals lane, Transportation KPIs, Accounting
  cards, etc.) were deliberately left alone. Presentation-only; no server/API/CSS
  changes. All gates green (763/763); manual UI check pending. See
  [[2026-09-22 - Session 06 - Module Quick-Overview Cards]].

- **Room-type change financial responsibility (2026-09-22)** — the system now derives who pays
  from a Manager-approved structured reason code, never a manual control (supersedes [[D-004]],
  resolves [[KI-001]]). Migration `20260922010000` pushed + live-verified: hotel-caused reasons
  keep the original agreed total (absorbed amount audited); guest-requested reasons pay the
  difference through recorded guest acceptance (`record_room_type_change_acceptance`, idempotent
  folio posting) and the existing balance gate; downgrades are flagged, no refund invented;
  legacy `room_upgrade` folded into the reason model (`priceDifference`/`waived` removed); the
  same-type-available gates apply to hotel-caused changes only. Also fixed the latent invoice
  rewrite that dropped transportation-fare charges. All gates green (759/759); manual UI
  verification pending. See [[2026-09-22 - Room-Type Change Responsibility]] and [[D-008]].

- **Staff notification badges + transient toasts (Session 06, 2026-09-11)** — the operational
  staff dashboard gained three distinct notification surfaces ([[D-011]]): role-gated sidebar
  module badges (Guest Requests, Transportation, Approvals, Housekeeping, Maintenance, Deposit
  Verification & Refunds — accounting only; pill with 99+ cap, absent at 0, collapsed-category
  sums), the header bell kept as the live derived alert list (now with a count pill), and a new
  shared `components/ui/toast-stack.tsx` (max 3 stacked + queue, 6s/8s auto-dismiss by tone,
  pause on hover/focus, × removes only the popup, View navigates to the module, silent first-poll
  seeding so refresh never replays history, `aria-live="polite"`). Five new metrics computed in
  `getDashboard`; fixed the stale-badge bug where the dashboard stopped refreshing outside
  Overview/Reports (new 30s `refreshAlerts` poll). Customer portal untouched; no schema/RLS/
  business-logic change. All gates green (868/868, 19 new tests); manual UI verification pending.
  See [[2026-09-11 - Session 06]] and [[D-011]].

- **Assign & Check In wizard progress persistence (Session 05, 2026-09-11)** — closing
  the arrival wizard no longer loses progress: the dashboard holds per-reservation
  wizard progress in memory (step, chosen room, active exception mode), and reopening
  Assign & Check In for the same guest resumes exactly there. Saved room selections
  are re-validated against live inventory on resume (clamped back to the Room step
  when stale); progress clears on successful check-in; the server RPC remains the
  arbiter. All gates green for this work; manual UI verification pending. See
  [[2026-09-11 - Session 05]].

- **Landing hero/wash sync + Featured Stays alignment (Session 04, 2026-09-11)** — the
  reported regressions matched committed HEAD, but the uncommitted working tree already
  held a parallel session's complete fix (`.coast-hero-media` shared wrapper owns the GSAP
  scale, hero `overflow:hidden` clips; cards flex-column stretch with `margin-top:auto`
  price rows, single-unit grid reveal). This session verified it (curl confirmed :3000
  serves the wrapper — the report was a cached page), added `pointer-events:none` to the
  wash, pinned the architecture with `landing-hero-structure.test.tsx`, and documented the
  scale-ownership rule in `docs/ui-motion-guidelines.md` §6. All gates green (743/743);
  user-side browser TEST 1–8 pending after a hard reload. See [[2026-09-11 - Session 04]].

- **Request Types row-action arrangement (Session 03, 2026-09-11)** — the Request Types
  module's row buttons (Hide/Offer, Edit, Delete) were bare inline children of a plain
  `<td>` with no spacing or alignment. Wrapped in the standard `reservation-actions` flex
  container, right-aligned via `.rt-actions` (mirrors transportation panel), Hide/Offer
  gained Eye/EyeOff icons so all chips are equal height, Delete now uses `danger-action`,
  and the actions column header is labeled "Actions". Presentation only. All gates green
  (738/738); manual visual check pending on user side. See [[2026-09-11 - Session 03]].

- **Approved room-type exception CTA (Session 02, 2026-09-11)** — the check-in Room step's
  approved-exception notice became a prominent sage/green `role="status"` callout with the
  room type as its own element and a real `btn-accent` "Load X rooms" CTA; the active
  exception shows an "Approved exception active" summary; the alternative-request form now
  excludes the already-approved type (client-side filter) and gains a "Need a different
  room type" hint, preventing duplicate approval requests. Presentation only — approval
  rules, filtering, repricing, assignment RPC untouched. All gates green (738/738 tests,
  4 new dialog tests); manual visual check pending on user side. See
  [[2026-09-11 - Session 02]].

- **Staff sidebar dropdown responsiveness (Session 01, 2026-09-11)** — the left-navbar category
  dropdowns on `/manager_dashboard` re-rendered the whole dashboard on every click because
  `openGroups` lived at the component root. State moved into extracted `ManagerSidebarNav` /
  `AdminSidebarNav` components so a toggle re-renders only the sidebar. RBAC, localStorage keys,
  aria, CSS unchanged. All gates green (734/734 tests, 2 new jsdom interaction tests); manual
  visual check pending on user side. See [[2026-09-11 - Session 01]].

- **Booking Review — Go Back + Guest Details refinement (Session 05, 2026-09-10)** — the shared
  booking-flow Go Back pill is now a compact "Back to <previous step>" text link (label derived
  from the breadcrumb; deterministic `router.push`, never `router.back()`), and the review page's
  Guest Details switched from boxed icon tiles to a clean label/value grid. Review's back/breadcrumb/
  Edit links now carry `hold=<token>` and `/booking/details` prefills the form from that hold
  (validated: owned, active, unexpired, matching room/dates/guests), so entered guest info,
  expected arrival, preparations, and the transportation request survive the round-trip.
  Resubmission still creates a new hold. All gates green (730/730 tests); manual UI verification
  pending. See [[2026-09-10 - Session 05]].

- **Extended coastal theme conformance (Session 02, 2026-09-10)** — removed the surviving
  forest/terracotta family from booking search, shared modals, room details, QR placards, staff
  brand accents, dashboard chart colors, guest emails, and loader presentation. Preserved semantic
  success/warning/danger/payment colors. Public landing, booking, and login were browser-verified
  at desktop and mobile widths. See [[2026-09-10 - Session 02]].

- **Intent-aware room discovery (Session 01, 2026-09-10)** — landing CTAs now carry
  distinct intents into `/booking/search`: hero form → availability (dates/guests
  preserved), "View all rooms" → browse (catalog cards, no fabricated availability),
  featured card → focused mode (sort-first, scroll, "Selected from homepage" chip, never
  auto-selected; carries dates only once the guest picked them via a client intent
  context). Mode derives from the URL via `parseSearchIntent`; invalid params fall back
  to browse with a notice. Aggregate chip now counts real physical rooms. Booking
  business logic untouched. All gates green + TEST A–D browser-verified. See
  [[2026-09-10 - Session 01]] and SYSTEM.md §7.2.

- **Manager/Accounting workflow revision, D-007 (Session 05, 2026-09-09)** — audit verified the
  RPC/route/RBAC layers already enforce "Accounting owns routine financial operations; Manager
  owns exceptions"; closed the display gap: refund queue Basis badges (Within policy / Manager
  approval required / Approved exception), approvals "awaiting Accounting" chip, `lib/refund-
  workflow.test.ts` (15 scenarios), docs updated. No migration, no new flags. 701/703 suite green
  (2 pre-existing reservations-panel failures). See [[2026-09-09 - Session 05]].

- **Coastal landing + system-wide palette completion (Session 04, 2026-09-09)** —
  finished Codex's work: neutral location copy (no fictional address, per user
  ruling), retired every old forest/terracotta hex from brand layers, coastal
  dark-mode block, favicon + auth + loader + chart colors, DESIGN.md/DESIGN-STATUS
  updated, new landing component tests. See [[2026-09-09 - Session 04]].

- **Booking data-placement fixes (Session 03, 2026-09-09)** — address/nationality/
  request_options/expected_arrival now reach staff + guest surfaces; search-page copy
  made deposit-accurate ("Makati" not "Mactan Bay"). Display-layer only. See
  [[2026-09-09 - Session 03]].
- **Payment-proof upload for reservation deposits (Session 02, 2026-09-09)** — required
  proof screenshot + reference, private `payment-proofs` bucket, 60s signed URLs (guest +
  Accounting only), staged-upload→confirm with cleanup, RPC `PROOF_REQUIRED` guard, migration
  `20260921` applied and live-verified. Manual verification model untouched. See
  [[2026-09-09 - Session 02]].
- **Booking Review page layout polish (Session 05, 2026-09-09)** — cohesive review card, chips,
  finance tiles, CTA inside the card, amber hold callout with a11y-fixed announcements;
  presentation-only, booking logic untouched. See [[2026-09-09 - Session 01]].
- **Manager Reservation Oversight workspace (Session 04)** — pure attention-rule derivation
  (`lib/manager-attention.ts`), batched server decoration in `listForRole`, dedicated manager
  panel with Attention Required filter + Operational Issue badges, lifecycle timeline in the
  detail modal, Review Exception routed through the existing approval workflow. See
  [[2026-09-08 - Session 04]].
- **Check-in room-assignment exception flow** — controlled dropdowns from live inventory,
  3-gate DB validation, migration `20260919`. See [[2026-09-08 - Session 01]] and
  [[Check-in & Room Assignment]].
- **Cash-shift status color coding**, **QR scanner modal redesign (Session 03)** — both green.

## Current Work

- Staff notification badges + toasts delivered (all gates green, 868/868); manual UI verification
  pending — checklist in [[2026-09-11 - Session 06]] (needs Front Desk + Manager + Accounting
  logins).
- Extended coastal conformance delivered; public landing, booking, and authentication surfaces are
  browser-verified at desktop and mobile widths. Authenticated customer/staff light-and-dark smoke
  checks remain pending because they require live role sessions.
- Session 03 delivered and all four gates green. Manual UI verification pending (needs
  logged-in guest + staff accounts) — checklist in [[2026-09-09 - Session 03]].
- Payment-proof upload delivered (migration applied + live-verified, all gates green); manual UI
  verification pending (needs a logged-in guest + a live hold — checklist in
  [[2026-09-09 - Session 02]]).
- Booking Review polish delivered; manual UI verification pending (same constraint).
- Session 04 delivered; manual UI verification pending (needs a logged-in Manager account).

## Current Problems / Blockers

- The working tree is uncommitted — commit it before starting new work to keep history clean.
- Parallel sessions edit the same untracked tree — coordinate before committing.
- The previously-noted `manager-reservations-panel.test.tsx` 2/8 failures did not recur in the
  2026-09-22 full run (759/759) — revisit only if they return.

## Important Active Decisions

- [[D-002 — Server-authority room eligibility]]
- [[D-003 — Structured-ID room-type exceptions]]
- [[D-008 — Room-type change financial responsibility derives from the approved reason code]]
- [[D-009 — Stay extension semantics: in-house only, one implementation, exception only on room conflict]]
- [[D-010 — Room-type badge color governance: reservation scope, approve = activate, Owner/Admin-only recolors]]
- [[D-011 — Staff notification surfaces are three distinct derived views; no persistent read/unread store]]
- [[D-005 — Manager attention rules are derived, never mutating]]
- [[D-007 — Accounting handles routine financial operations]]

## Next Recommended Task

1. **Manual UI verification of the roadmap features** (needs role logins — one sweep):
   Owner/Admin policy dialogs (VAT/service charge, deposit SLA), Manager inventory
   replenishment + draft PO, Maintenance/Manager asset registry, Housekeeping suggestion
   strip (self-assign vs Owner assign vs Manager read-only), guest-profile modal, rate
   plans modal, deposit aging chips.
2. Commit the working tree (all sessions' features + parallel work) — the tree is large;
   coordinate with parallel sessions first.
3. Confirm the first live guest-reminders cron firing (09:05 Manila) once a night passes
   with eligible reservations.
4. Known-issue sweep when convenient: schema.sql fresh-install snapshot lags the
   migrations ([[KI-002]]-class drift).

## Relevant Documentation

- [[2026-09-30 - Commercial Readiness]]
- [[2026-09-30 - Preventive Maintenance Assets]]
- [[2026-09-30 - Inventory Draft Purchase Orders]]
- [[2026-09-30 - Housekeeping Assignment Suggestions]]
- [[2026-09-30 - Deposit SLA Visibility]]
- [[2026-09-30 - Guest Reminders]]
- [[2026-09-29 - Rate Plans]]
- [[2026-09-29 - Consolidated Guest Profile]]
- [[2026-09-28 - Tax-Aware Financial Documents]]
- [[2026-09-26 - Standards Audit & Approval Execution Fixes]]
- [[2026-09-23 - Stay Extension Workflow]]
- [[2026-09-22 - Room-Type Change Responsibility]]
- [[Check-in & Room Assignment]]
- [[Manager Approvals]]
- `SYSTEM.md` §6, §7.4, §7.8, §7.9, §8 (authoritative)

## Recent Sessions

- [[2026-09-30 - Commercial Readiness]] — Phase 9 + roadmap finale; manual payments verified honest, OTA columns with zero consumers, 9C/9D documented as deliberate scope decisions
- [[2026-09-30 - Preventive Maintenance Assets]] — Phase 8 of the post-audit roadmap; derived due dates, real assets only, never blocks a room; governance tests caught an owner/admin overgrant and it was tightened same-phase
- [[2026-09-30 - Inventory Draft Purchase Orders]] — Phase 7 of the post-audit roadmap; forecast shortage → staff-editable draft PO, no status other than draft is writable
- [[2026-09-30 - Housekeeping Assignment Suggestions]] — Phase 6 of the post-audit roadmap; advisory balanced plan, human confirms via the audited assign route
- [[2026-09-30 - Deposit SLA Visibility]] — Phase 5 of the post-audit roadmap; aging chips + past-SLA cards/alert, no automation
- [[2026-09-30 - Guest Reminders]] — Phase 4 of the post-audit roadmap; idempotent daily pre-arrival/pre-departure reminders, cron at 09:05 Manila
- [[2026-09-29 - Rate Plans]] — Phase 3 of the post-audit roadmap; one resolver, per-night freezing, propose→approve overlays
- [[2026-09-29 - Consolidated Guest Profile]] — Phase 2 of the post-audit roadmap; read-only CRM consolidation
- [[2026-09-28 - Tax-Aware Financial Documents]] — Phase 1 of the post-audit roadmap; VAT-inclusive breakdowns, no total ever changed
- [[2026-09-11 - Session 06]] — staff notification badges + transient toasts (D-011: three derived surfaces, no persistence)
- [[2026-09-24 - Room-Type Badge Color Workflow]] — badge-color governance: pending-proposal reservation, approve = activate, Owner/Admin-only recolors, required color at creation
- [[2026-09-26 - Room-Type Badge Colors]] — per-type badge colors, semantic DB keys, shared component, swatch picker
- [[2026-09-26 - Standards Audit & Approval Execution Fixes]] — full business-process audit (verdict: valid, above-standard core PMS) + the three audited correctness bugs fixed
- [[2026-09-24 - Admin Module Presentation]] — admin modules raised to the card/filter/badge presentation standard
- [[2026-09-24 - Admin System Health Module]] — admin technical-health section (DB live/latency, activity, migration drift)
- [[2026-09-23 - Stay Extension Workflow]] — stay extension as a first-class case + full dropdown audit
- [[2026-09-22 - Session 06 - Module Quick-Overview Cards]] — "At a glance" status strips for the bare-table modules
- [[2026-09-22 - Room-Type Change Responsibility]] — reason-coded financial responsibility
- [[2026-09-11 - Session 05]] — Assign & Check In wizard progress persistence
- [[2026-09-11 - Session 04]] — Landing hero/wash sync + Featured Stays alignment
- [[2026-09-11 - Session 03]] — Request Types row-action arrangement
- [[2026-09-11 - Session 02]] — Approved room-type exception CTA (check-in Room step)
- [[2026-09-11 - Session 01]] — Staff sidebar dropdown responsiveness fix
- [[2026-09-10 - Session 05]] — Booking Review Go Back + Guest Details refinement
- [[2026-09-10 - Session 02]] — Extended coastal theme conformance and verification
- [[2026-09-10 - Session 01]] — Intent-aware room discovery (landing → /booking/search)
- [[2026-09-09 - Session 05]] — Manager/Accounting workflow revision (D-007)
- [[2026-09-09 - Session 04]] — Coastal landing + system-wide palette completion (Codex handoff)
- [[2026-09-09 - Session 03]] — Booking process audit + data-placement fixes
- [[2026-09-09 - Session 02]] — Payment-proof upload for reservation deposits (customer flow)
- [[2026-09-09 - Session 01]] — Booking Review page layout polish (customer flow)
- [[2026-09-08 - Session 04]] — Manager reservations oversight workspace
- [[2026-09-08 - Session 03]] — QR scanner modal UI/UX redesign
- [[2026-09-08 - Session 02]] — Obsidian memory layer created
- [[2026-09-08 - Session 01]] — room-assignment exception flow + cash-shift colors
