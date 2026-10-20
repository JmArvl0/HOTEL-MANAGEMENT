# Manual Browser QA Checklist — Phase 1 + Phase-2 Hygiene (2026-10-18)

No browser automation exists in this repo (jsdom only). Everything below must be
verified by a human with a real browser before further structural remediation
(especially HUI-005 `!important` wall removal) proceeds. Check items off; file
failures with the item ID into `nano_bots/05 Memory/Known Issues.md`.

Established credentials (owner live login is `arevalojohnmichael24@gmail.com`;
`owner@haven.test` is an inactive governance row — do not report as a bug).

## A. Cash-shift close (Phase 1, HUI-011) — verify before trusting in production

- [ ] **A1** Front-desk account (`frontdesk@haven.test`): open Cash & Shifts →
      start shift → collect a cash payment on a reservation balance → **Close
      the shift**, enter the counted amount, submit. Expect: drawer closes with
      a success toast, counted/expected variance is displayed, no `409` /
      `CASH_SHIFT_REQUIRED` error afterwards.
- [ ] **A2** After closing, try checking in an arrival and collecting a balance
      payment: with the shared drawer closed and no open shift, the UI must
      ask to **open a new shift** (or, while `CASH_BYPASS_ACTIVE=true`, mark
      payment unattributed — confirm which, and record it).
- [ ] **A3** Accounting account: repeat A1, first Cash & Shifts read → close
      flow is visible and permitted.
- [ ] **A4** Manager (non-owner account): at no point should Closing trigger a
      sign-out prompt; the **owner-only** sign-out block fires when closing an
      open shift owned by someone else→ only the manager sees the
      "sign out / re-open as owner" dialog, and choosing to stay signed-in
      keeps the session while canceling the close.
- [ ] **A5** Owner account (`arevalojohnmichael24@gmail.com`): closing another
      user's open shift shows the sign-out dialog; confirm it signs out to
      owner role → Cash & Shifts with the shift closeable.

## B. Deleted dead code had no live consumers (HUI-006/HUI-001 deletes)

- [ ] **B1** Desktop staff/admin/owner: sidebar opens/collapses normally at
      widths ≥1000px; 232px rail + expand-to-280 hover present (staff-theme).
- [ ] **B2** At 1000px or lower: `menu-btn` toggles the off-canvas drawer
      (this uses the KEPT `globals.css .sidebar` base rules — the deleted
      Navigation CSS was junk, not this). Drawer slides in, `.mobile-close`
      closes it.
- [ ] **B3** Modal parity: `.haven-account-dialog` (My Profile / account
      popover → Account) renders normally on every shell — the Phase 1
      deletion removed only its unused Navigation section from Modal.css; its
      own `haven-account-modal.css` was untouched. Check on a light and dark
      theme.
- [ ] **B4** No route references `app-shell.css` classes: admin/staff/owner
      dashboards render their ThemeToggle, clock, session countdown, and
      HavenAccountModal exactly as before.

## C. 9px type floor (Phase 1, HUI-003)

Check microcopy legibility + no layout overflow at **390 / 768 / 1366 px**:
- [ ] **C1** AI insights panel (manager) — insight cards and tokens.
- [ ] **C2** Pricing workspace — rate rows, badges, field labels.
- [ ] **C3** Reports surface — snapshot tables, export note, banners.
- [ ] **C4** Booking catalog (guest `app/(booking)` pages) — room-type cards,
      facts chips, "why" notes.
- [ ] **C5** Toasts and notification popovers at 390px.

## D. Phase-2 hygiene batches

- [ ] **D1 (#13)** Primary CTA hover: every primary/staff shell button shows a
      *visibly different* hover (the shipped intent is ink → darker `#1f2937`
      on light surfaces; brand-blue hover stays on TailAdmin CTA styles).
      Report any button whose hover looks identical to rest state.
- [ ] **D2 (`--st-*` rename)** Staff shell+: every surface inside Staff /
      Manager / Admin / Owner dashboards keeps surface color, card border and
      shadow radius exactly as before the rename (spot-compare sidebar, page
      header card, panels, metric cards, room rack table).
- [ ] **D3 (globals fold)** Auth pages: `/login`, `/register`, `/verify` —
      cards, buttons, inputs form rows, eyebrow; the dense base got
      reformatted but byte-equal.
- [ ] **D4 (payments pills)** `/account/payments`: transaction status pill and
      refund pill look like the same family as the folio header pill
      (`haven-status--*`); labels unchanged ("Partially paid", "Awaiting
      verification", "Refund pending", "Refunded", "Failed", "Rejected",
      "Verified").
- [ ] **D5 (PageHeader demo)** `/manager_dashboard` → `haven-tailadmin-visual-template`:
      canonical PageHeader now renders with breadcrumbs Home › Dashboard ›
      Design System › TailAdmin Standard; Export/Extra actions column intact.

## E. Still-open audit verifications (Phase 1 backlog, KI-014)

- [ ] **E1** Staff dense tables at 390px (HUI-018): Room Reservations,
      Guest Folios, Cash & Shifts — `.table-scroll` pinch/scroll usability.
- [ ] **E2** Modal fit at 390px across sm→full (HUI-019), worst-case arrival
      wizard step 3.
- [ ] **E3** Session-expiry dialog focus direction + reduced-motion at expiry
      moment (HUI-017).
- [ ] **E4** Light-mode parity of recently shipped staff blocks (HUI-013 risk
      spot check): admin workspace, AI insights, pricing.

## F. Gate before HUI-005 wall removal

When **A–B and D1/D2 pass**, the HUI-005 remediation (extract bell icon
wall to component layer ≈119 decls, narrow `.app-shell .modal-*` load-order
defense ≈71) may run with the same checklist re-run as its only extra
verification target: bell centering/badge on all four shells + light mode
(F items here), account modal backdrop (F), toasts unobstructed by the
drawer (F).

## G. Stage 2 unified KPI card (reference-design, commits b964270..1244d58)

One .mod-kpi card format on every surface; NOTE: jsdom tests cover structure
and ownership only, the rows below are the visual acceptance and MUST be
confirmed in a real browser. No browser automation in this repo;
observations go to this file.

- [ ] **G1 (staff dark)** Manager dashboard + Staff & Duty: KPI strip renders
      the shared card (24px radius, 46x46 absolute top-right chip, 28px/750
      tabular value); queue cards toggle with accent ring; zero-count cards
      dim at 0.55 and ignore clicks.
- [ ] **G2 (staff light)** Same surfaces under the light toggle: ink accent
      borders on hover/press, ops-tint chips (warning/info/success).
- [ ] **G3 (HAVEN AI)** AI page: five indicators render the standard card
      (no 5-across mini strip), danger chip (red tint) on the maintenance
      card; loading shows the .mod-kpis skeleton grid (five bars).
- [ ] **G4 (performance reports)** Reports page: three vertical cards (form
      change from horizontal); print preview still 3-col and white-bg.
- [ ] **G5 (guest payments)** /account/payments: three shared cards on
      customer tokens; outstanding > 0 shows an amber chip, settled green.
- [ ] **G6 (guest loyalty)** /account/loyalty: four cards; gold chip on the
      tier and lifetime cards, progressbar inside the tier-progress card
      keeps role=progressbar + its aria value; gradient backgrounds gone.
- [ ] **G7 (regression)** No page still references .sd-kpi, .report-kpi,
      .haven-ai-kpi (non-skeleton), .folio-kpi, .loyalty-kpi, StatCard or
      TailAdmin* components (grep pass + visual check of the old routes).

## H. Stage 3 StatusBadge entity-map unification (reference-design, commits 6309c1a..83824a5..85001c2)

All informational `badge ${...}` spans retired across manager/owner/catalog/guest/housekeeping/staff/transport/unified-room-matrix; unified to `StatusBadge` with canonical vocabulary (haven-status tokens). Raw `.badge` families retained: advance buttons (→ `.room-advance`), loyalty tiers, source badges, nav badges, demand badges, gateway badges, customer portal pills.

- [ ] **H1 (manager dark/light)** Manager dashboard tables, detail drawers, approvals view: chips render via StatusBadge (haven-status tokens); tone deltas accepted (checked_in green, assigned amber, audit chips info-blue).
- [ ] **H2 (room detail modal)** Reservation status, task priority/status, order priority/serviceability/status: StatusBadge chips; advance button kept raw (`.room-advance`).
- [ ] **H3 (owner)** Dashboard badge helper, payment settings: StatusBadge; loyalty tier badges raw.
- [ ] **H4 (catalog)** Room catalog, transport vehicle types: active/inactive chips via StatusBadge.
- [ ] **H5 (guest requests)** Status chips unified; grp-overdue SLA chip amber.
- [ ] **H6 (housekeeping)** Suggestion priority, task priority/status, room state: StatusBadge.
- [ ] **H7 (staff duty)** Work status chips unified.
- [ ] **H8 (transportation)** Trip status chips (toLowerCase) via StatusBadge with TRANSPORTATION_STATUS_LABELS.
- [ ] **H9 (unified room matrix)** Room state, housekeeping chips via StatusBadge; advance buttons raw (`.room-advance`).
- [ ] **H10 (regression)** Grep for raw `badge ${` / `className="badge"` in migrated files returns zero; scoped raw families only (loyalty, source, nav, demand, gateway, advance, customer pills).
- [ ] **H11 (CSS)** staff-theme.css generic `.app-shell .badge.*` rules removed (86 lines); scoped families retained (room-card header, room-rack, grp-inventory, tp-table, grp-approval, owner-workspace); `.room-advance` added to haven-data-controls.css.
- [ ] **H12 (test)** approvals-view.test.tsx updated to check haven-data-controls.css for haven-status tokens instead of raw badge CSS.
