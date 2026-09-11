# 2026-09-23 — Session 07: Module Quick-Overview Cards (Full Pattern)

Upgraded the Session 06 read-only chip strips to the full compact-card pattern requested in
the module-overview brief, extended it to Reservations (the priority ask), and unified
every module summary onto one shared component. **Visualization only** — no business logic,
API, RBAC, RLS, or DB change; customer portal untouched.

## What shipped

- **New shared component `components/manager/module-summary-cards.tsx`** (`ModuleSummaryCards`
  + `ModuleSummaryCard` type): label / value / hint / icon chip with semantic tone
  (`attention` / `today` / `active` / `done` — icon-chip tints only, never card
  backgrounds). A card with a `queue` renders as `<button aria-pressed>` that activates the
  module's *existing* filter; others are informational `<article>`s. CSS lives in
  `manager-dashboard-theme.css` as `.mod-kpis` / `.mod-kpi*` (renamed from `.tp-kpi*`,
  dark + `.theme-light` mirrors; 4-col → 2-col ≤1000px → 1-col ≤480px).
- **Reservations — front desk** (`ResourceView` in `manager-dashboard-client.tsx`): Active
  (pending+confirmed+checked_in, informational — no single queue equals that set) /
  Arrivals today / Departures today / In-house, the last three clickable onto the existing
  queue filters. Counts call the same `queueFilter` predicates with the same Asia/Manila
  `today` string → card == chip == table rows by construction. **No "needs attention"
  card** — no authoritative front-desk definition ([[2026-09-22 - Session 06 - Module
  Quick-Overview Cards|Session 06]] audit); ArrivalLane already covers arrival readiness.
- **Reservations — manager oversight** (`manager-reservations-panel.tsx`): Attention
  Required (authoritative `needsAttention` from `lib/manager-attention.ts`, via the panel's
  counts Map) + Arrivals / Departures / In-house, all clickable.
- **Seven Session 06 modules upgraded** to cards with hints/icons/tones (informational — no
  status filters exist to drive): Maintenance, Rooms, Inventory, Deposit Verification
  (payments), Refunds, Billing (invoices), Guest Requests (housekeeping/maintenance view).
- **Transportation migrated** from its inline `tp-kpis` markup onto the shared component
  (same 4 cards, still queue-clickable).
- **Accounting sections migrated** from the big Overview-style `metric-grid` cards to the
  compact shared pattern (informational).

## Audit outcome (modules deliberately left alone)

Approvals (summary lane), Housekeeping (grouped queue headers), Guest Requests panel
(front desk/manager), Staff & Duty (KPI cards) already have overviews; Guests / Reports /
Insights / HAVEN AI / Room Types / Transfer Vehicles / Request Types are reference or
summary surfaces — no cards. See SYSTEM.md §7.10 "Per-module quick overview cards".

## Phase 3 (same day, follow-up request)

- **Four more modules got cards**: Approvals & Escalations (replaced the
  `arrival-lane approval-summary` chip strip; Pending is clickable onto the status pills,
  plus High priority / Escalations / Awaiting Accounting / Oldest waiting as an age value),
  Housekeeping (five cards from the panel's own `groupQueueTask` groups — card == queue by
  construction), the Guest Requests panel for front desk/manager (four cards, all clickable
  onto the submission queue filters), and the Front Desk Reports history (Submitted /
  Acknowledged / Returned clickable onto the status chips + On record).
- **Ordering fixed everywhere**: page title → cards → filter chips → search/table. In
  `ResourceView` the cards had rendered *after* the filter rows; moved above.
- **ArrivalLane removed**: the front-desk arrival-readiness strip is deleted (component +
  `.arrival-lane`/`.lane-title` CSS); its blocker logic survives as a 5th informational
  reservations card "Arrivals needing prep" (today's confirmed arrivals missing ID
  verification, room, or settlement). `.arrival-chip` CSS stays — the reservation detail
  modal uses it.
- **Grid**: `.mod-kpis` now `repeat(auto-fit,minmax(0,1fr))` — any card count (2–6) stays
  in one row with equal columns; ≤1000px 2 columns with an odd last card spanning the row;
  ≤480px one column. The D-006 contract test (`lib/refund-workflow.test.ts`) now asserts
  the title-cased "Awaiting Accounting" label.

Phase 3 gates: 800/800 tests (69 files), lint 0 errors / 70 baseline warnings, build and
typecheck fully clean (the parallel extend-stay typecheck errors were resolved by that
session). New test file `housekeeping-queue-panel.test.tsx`; approvals-view summary
assertion rewritten for cards; module-summary test covers the prep-card predicate.

## Files

- `components/manager/module-summary-cards.tsx` (new), `manager-dashboard-client.tsx`,
  `manager-reservations-panel.tsx`, `transportation-panel.tsx`, `housekeeping-queue-panel.tsx`,
  `guest-requests-panel.tsx`, `front-desk-reports-panel.tsx`,
  `app/manager-dashboard-theme.css`
- Tests: `module-summary.test.tsx` (rewritten — reservations counts mirror `queueFilter`
  plus the prep-blocker predicate; maintenance/refunds/invoices counting; component
  button/article + aria-pressed + onSelect), `transportation-panel.test.tsx` (`mod-kpi`
  class), `approvals-view.test.tsx` (card-based summary), `guest-requests-panel.test.tsx`
  (card counts + click), `housekeeping-queue-panel.test.tsx` (new), `lib/transportation.test.ts`
  (migration-content contract: `.mod-kpis{...}`), `lib/refund-workflow.test.ts`
  (title-cased label)
- Docs: SYSTEM.md §7.10 rewritten; DESIGN.md §10 "Module quick-overview cards (staff
  dashboards)" added

## Verification

- 791/791 tests (67 files), lint 0 errors / 70 pre-existing warnings, build passes,
  typecheck clean **except** `components/manager/extend-stay-dialog.test.tsx` — that file
  is untracked parallel-session work (stay extension, see [[2026-09-23 - Stay Extension
  Workflow]]), not touched here.
- Served dev CSS chunk verified to contain the 24 `mod-kpi` rules and zero `tp-kpi`.
- Browser walkthrough of the login-gated dashboard left for the user; jsdom interaction
  tests cover click→filter, selected state, and count parity.

## Next action

Manual UI check on `/manager_dashboard` (front desk + manager, 390px, light/dark), then
commit alongside the other pending work in the large uncommitted tree.
