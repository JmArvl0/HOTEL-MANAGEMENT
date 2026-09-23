# Current Status

## Operational module layout audit (2026-09-23)

- Seven standalone panels plus the shared staff resource and accounting views
  now use the canonical transparent search/filter toolbar: Guest Requests, Transportation, Housekeeping, Staff &
  Duty, Room Types, Request Types, Transfer Vehicles, shared staff resources, and Accounting.
- Controls follow search → quick/advanced filters → results, share one clear
  action, and stack responsively without changing domain behavior.
- Verification is green: typecheck, touched ESLint, focused 42/42 tests, full
  Vitest, production build, Impeccable detector, and diff-check. Authenticated
  browser QA is pending.
## Guest Rewards redesign (2026-09-22)

- Rewards now follows the customer portal's executive hierarchy: dark-teal
  hero, tier/balance-progress-redemption KPI strip, selectable tier comparison,
  and a polished points ledger with shared pagination.
- All figures derive from the existing loyalty API and canonical helpers.
  Loading geometry, empty history, malformed payload fallback, retry, semantic
  progress, keyboard focus, mobile ledger reflow, and reduced motion are
  handled.
- Verification is green: typecheck, touched ESLint, 156 files / 1,718 tests,
  production build, Impeccable detector, and diff-check. Full lint has 0
  errors and 70 pre-existing warnings. Authenticated browser QA is pending.

## Guest Payments & Folio hierarchy (2026-09-22)

- The customer Payments & Folio page now follows hero → live financial KPI
  summary → transparent compact filters → folio cards.
- Stay/payment filters and booking-reference search update the visible records,
  dynamic facet counts, outstanding balance, and paid total without navigation
  or layout shift. Secure folio content remains server-rendered.
- Verification is green: typecheck, touched ESLint, 154 files / 1,709 tests,
  production build, Impeccable layout detector, and diff-check. Full lint has
  0 errors and 70 pre-existing warnings. Authenticated browser QA is pending.

## Predictive dynamic pricing (2026-09-22)

- Local implementation complete: explainable 7-day room-rate recommendations,
  Manager review/edit/propose UI, Manager-only proposal mutation, Owner/Admin
  approval preserved, analytics provenance and audit linkage added by
  migration `20261018010000`.
- The migration has not been pushed to the linked database. Until it is
  applied, the new pricing endpoints will not be operational against Supabase.
- Focused pricing/authorization/UI suite (35), full suite (1,657), typecheck,
  lint (0 errors), production build, diff-check, and migration safety scan are
  green. Authenticated browser QA remains pending.

Last Updated: 2026-10-12
Current Development Area: Official system-wide redesign (Modern Luxury Hospitality SaaS) — COMPLETE (2026-09-19); guest-to-staff conversion boundary deployed (2026-10-12); org staff theme implemented (2026-09-20)
Current Feature: Unified PageHeader band hero on staff overview + all owner sections; every role verified against the reference
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

- **Authenticated header session countdown (2026-09-21)** — Customer and all
  staff roles now receive the earliest authoritative idle/absolute deadline
  and display only the compact time in the top-right header group. Background
  polling no longer counts as activity; meaningful pointer/keyboard activity
  is throttled through a dedicated endpoint. Normal/warning/critical colors
  use HAVEN tokens, and expiration opens a blocking Sign in again dialog.
  Focused tests 43/43, full suite 1568/1568, typecheck, touched ESLint,
  production build, and UI detector green. See
  [[2026-09-21 - Session Countdown and Expiration]].


- **Universal search/filter standard completed (2026-09-20)** — the
  search-first → chips → advanced → results order was already in place; this
  fixed what made it not actually true. Root cause of the light-theme outer card
  was a **specificity loss**, not a missing rule: the de-card overrides appended
  to `staff-ops-theme.css` were 4-class and lost to the 5-class
  `.theme-light .app-shell …` rules, so the white card still rendered in light
  theme. Fixed at the source and the redundant override block deleted. Also
  removed a second surface box that `.table-tools label` (0,1,1) was drawing
  around the shared `.haven-search-input` (0,1,0), and one of those rules was
  nulling the input's own fill. Chip radius unified on the pill, false "all"
  lowercase chip and a non-All-first queue list corrected, `aria-pressed` added
  to four bespoke chip rows. New stylesheet-walking test
  (`haven-data-controls.test.tsx`) fails if ANY stylesheet gives a toolbar
  wrapper a background/border/shadow/padding — the transparency is a cascade
  property that jsdom cannot otherwise protect. Gates: typecheck, eslint 0
  errors, **135 files / 1553 tests**, build, `git diff --check`.
  Browser visual QA not performed (no runner, KI-005). See
  [[2026-09-20 - Universal Search Filter Standard]].

- **Action-card standardization via HavenActionItem (2026-09-20)** —
  shared `icon | title + description | chevron` primitive
  (`components/ui/haven-action-item.tsx`, row + stat variants, quiet
  zero-count state, button-vs-div semantics) with staff-scoped light/dark
  CSS in `staff-ops-theme.css` §7b; manager Overview quick-panels (serves
  front_desk/housekeeping/maintenance/accounting/manager) and admin
  quick-actions + system-health cards migrated; legacy `.quick-panel`/
  `.quick-icon` and admin card CSS deleted. D-025 presentation family.
  Gates: typecheck, eslint 0 errors, **1552/1552 tests**, build.
  Per-role browser QA pending (no runner).

- **Staff content fitting & layout refinement (2026-09-20)** — screenshot
  root cause (admin `SYSTEM ADMINISTRATION` clipped by `nowrap` +
  `overflow:hidden` at 232px) fixed by two-line role-label wrap, plus a
  staff-wide fitting layer (`staff-ops-theme.css` §§20–23, all
  `.app-shell`-scoped): nav badge reserve, wrapping header actions,
  wrapping KPI values, contained table scroll, wrapping modal footers,
  viewport-capped popovers. No type reductions, no logic changes. Gates:
  typecheck, eslint 0 errors, **1543/1543 tests**, build. Browser QA
  pending (no runner). Landing/customer/auth unchanged.

- **Organization Executive Dashboard theme on staff pages (2026-09-20)** —
  org spec (`reference/design.mdd (1).txt`) implemented as
  `app/staff-ops-theme.css`, a last-import override layer with every rule
  scoped under `.app-shell` (light default + refined dark kept per user
  choice): ink/Cool Paper palette, 10%-tint AA-safe status pills, 24px stat
  cards, flat executive headers (teal band retired at both staff call
  sites), tactile motion with reduced-motion gates. Landing/customer/auth
  untouched (diff + class-usage verified). Gates: typecheck, eslint
  0 errors, **1531/1531 tests**, build (72 routes). Manual per-role browser
  QA pending. See [[D-025]], DESIGN.md §16.

- **Maintenance room-creation exposure removed (2026-10-12)** — the generic
  `ResourceView` offered a dead "Add rooms" button (and status-advance control) to
  Maintenance/Housekeeping on Rooms & Availability; both now gate off for the rooms
  resource dashboard-wide (`canCreate`/`canAdvance`), since all room-inventory writes
  go through the catalog-authority roster modal and every backend path already
  refused them (guardCatalog + RPC triple + generic-route refusals, all
  contract-tested). No server, RPC, or Front Desk-assignment change. Gates green:
  **1519/1519 tests**, typecheck/lint/build clean. Manual browser QA pending.

- **Guest-to-staff conversion executed 1/5 (2026-09-20)** — with explicit user
  approval in build mode, `arvild10.4@gmail.com` (`0f059847-…`) was converted
  guest → `admin` via the authorized `admin_convert_guest_to_staff` RPC (Owner
  actor `owner@haven.test`; ID+email+version pre-verified). Result read back
  live: role `admin`, inactive + recovery-required, auth v2, staff mirror
  (System Administration, off_duty), password sentinel, 1-hour recovery token
  minted, one conversion audit row (audit_logs 147→148; every other table
  count unchanged). Recovery link handed to user; pre-recovery scripted checks
  pass (old creds dead). The other four remain active guests at v1, blocked by
  `GUEST_BUSINESS_HISTORY_CONFLICT` (doubiru 2 holds + 2 confirmed; ry4nl3369
  3 holds + 2 reservations; akristyrose 1 hold + 1 confirmed;
  arevalojohnmichael24 9 holds + 3 reservations, plus protected `owner` role).
  User chose Track B: identity/history model proposal next — the four stay
  guests until that model is approved and deployed.

- **Guarded guest-to-staff conversion (2026-10-12)** — migrations `20261012010000`
  + `20261012020000`
  adds the only supported guest/staff boundary: exact ID+email match, zero hold/reservation
  history, protected-role authority, staff-mirror creation, forced inactive recovery,
  password/OTP/session invalidation, and immutable audit in one transaction. The legacy
  role RPC now refuses guest↔staff changes. Live re-verification found John Arevalo
  history-free but assigned to protected `admin` (Owner authority required); the other
  four exact accounts own reservations/holds/payments. Therefore **0/5 were converted**,
  all remain active guests at auth version 1, and no partial staff rows exist. Migration
  ledger is in sync; focused 25/25, full 1515/1515, typecheck, lint (0 errors), and build pass.

- **Test-guest cleanup verdict (2026-10-11)** — impact probe of the 5 authorized
  guests: #1 empty, #2–5 own live reservations/holds/payments. Deletion proved
  structurally impossible (audit immutability trigger blocks the `SET NULL` on
  `audit_logs.user_id`; rollback verified clean, zero net writes). All five
  preserved. End-to-end staff creation proven live via the real API
  (`arvild10.4+otp@gmail.com` → 201, front_desk, inactive + recovery-required,
  audited) after stamping admin activity (58-min idle had correctly neutralized
  the harness token — policy working as designed). Backup at Temp
  `haven-test-account-backup.json`. OTP testing proceeds on `+` aliases with
  global OTP still off.

- **Staff-creation duplicate-email diagnosis (2026-10-11)** — "Unable to create the
  staff account." was an unmapped Postgres unique-violation: the address already
  belonged to an active guest, and the route had no `EMAIL_TAKEN` mapping. Live RPC
  body verified identical to file (no drift); new migration `20261011010000` adds an
  explicit pre-insert `EMAIL_TAKEN` guard (uniqueness unchanged) plus route mappings
  for `EMAIL_TAKEN`/`INVALID_STAFF_ACCOUNT`; pushed + ledger-verified; live RPC probe
  raises `EMAIL_TAKEN` with zero writes and no duplicate row. For OTP testing use a
  fresh address (e.g. a Gmail `+` alias), never the existing guest address. Gates:
  typecheck, lint 0 errors, **1509/1509 tests**, build, `diff --check` clean. Manual
  browser creation still pending.

- **Email login OTP via Nodemailer + Security Configuration redesign (2026-10-10)** —
  genuine two-stage login inside NextAuth (password → pending role-less/id-less token →
  emailed 6-digit code → atomic `auth_otp_verify` → full cookie via NextAuth encode);
  HMAC-only storage, resend rotation, DB-backed attempt/cooldown/issue-cap/password
  lockout; `security_policies` OTP columns + `auth_otp_challenges` + issue/verify RPCs
  (migration `20261010010000`, pushed + ledger + live-verified); SMTP transport with
  factual delivery panel (Unknown until a passing test) and own-address test email;
  redesigned admin workspace (session/OTP/delivery/enforced/history sections) with
  OTP-activation warning in the confirm flow; recovery links untouched; OTP ships
  default-Off. Gates: typecheck, lint 0 errors, **1508/1508 tests (129 files)**,
  build, detector clean. Manual browser + real-email QA pending (SMTP unconfigured).
  See [[D-022]].

- **Admin login-lockout fix (2026-10-09)** — the session callback conflated query
  error with missing account, neutralizing every session while `20261009010000` was
  unapplied (silent login loop for all roles). New `resolveSessionEnforcement`
  helper (error fail-open, absent/expired neutralize) + `/auth/continue` bounces
  dead sessions to `/login`; both pending migrations reviewed, pushed, and
  ledger-verified; live probe confirmed policy row, `last_seen_at`, and an active
  recovery-free `admin` account. Codex customer guard untouched. Gates: typecheck,
  lint 0 errors, **1490/1490 tests (128 files)**, build, `diff --check` clean.
  Manual browser logins still pending. See [[KI-009]].

- **System Administrator Security Configuration — session policy (2026-10-09)** — new
  Governance module (`security_config`) with status cards, session/cookie panel, enforced-flags
  note, and an honestly deferred passcode panel. Own `security_policies` table + admin-only
  `admin_update_security_policy` RPC (migration `20261009010000`, dry-run clean, NOT yet pushed);
  live idle/absolute enforcement in the NextAuth `session` callback (server `last_seen_at`,
  token `iat`, Remember Me tiering, one-time grandfathering, 24 h cookie backstop); conditional
  login checkbox + `?expired=1` notice; confirm modal with diff + required reason + `POLICY_STALE`
  handling; `security_policy_updated` audit with safe values only. Passcode policy deferred per
  [[D-021]] (no flow exists — recovery links untouched); Owner read-only snapshot and session
  revocation are follow-ups. Gates: typecheck, lint 0 errors, **1482/1482 tests (128 files)**,
  build clean, detector clean. Manual browser QA pending (Admin edit flow, session expiry,
  login checkbox). Migration push pending (also pushes `20261008010000`, same dry-run).

- **System-wide notification presentation standardization (2026-09-19)** — Customer and the
  operational Manager, Front Desk, Accounting, Housekeeping, and Maintenance roles now render one
  component family from `components/ui/haven-notifications.tsx`: a single aggregate unread
  badge, 380–430px click-only preview (maximum seven, unread first), semantic notification row,
  and 760px internally scrolling View-All modal with All/Unread/Read/date/sort controls.
  Customer unread totals are counted independently of the seven-row seed and mark-all is
  server-authoritative. Staff retain the role-filtered `dashboard.notifications` source and
  per-device dismissal state. Sidebar workload badges and ToastStack semantics are unchanged.
  Owner/Admin still have no persistent notification source and therefore retain ToastStack only
  rather than a fabricated bell inbox. Gates: Impeccable detector clean, typecheck clean, lint
  0 errors (75 baseline warnings), **1461/1461 tests (127 files)**, production build clean.

- **Customer notification dropdown + View-All modal redesign (2026-09-19)** — guest bell is
  click-to-open (hover = tooltip only) with a ≤7 preview (unread-first, then "Earlier"),
  semantic per-type icons, accessible unread dots, one-row optimistic mark-read, "Mark all
  read" (reuses `POST /read`), and loading/empty/error states. "View all notifications" still
  opens the shared modal (no navigation), now with All/Unread/Read tabs (All first, default),
  Newest/Oldest sort, retained hotel-day filter (now defaulting to All days, per user choice),
  Today/Yesterday/Earlier-this-week/Earlier recency grouping, and offset-based Load more
  (additive `?offset=` on `GET /api/account/notifications`; fake-supabase gained `range()`).
  Rows render through one shared `CustomerNotificationRow` so dropdown and modal can never
  disagree; staff triad, unread semantics (`read_at`), toasts, and sidebar badges untouched;
  manager consumer stays source-compatible (new modal props optional). Reservation-cancelled
  icon added to the type map. Gates: typecheck clean, lint 0 errors (148 warnings, baseline),
  **1457/1457 tests (126 files)**, build OK. Manual browser QA pending (guest login: hover,
  click, mark one/all, View-all modal tabs/sort/day filter/Load more, mobile widths).
  See [[D-013]] amendment and [[2026-09-19 - Customer Notification Redesign]].
- **Customer receipt surface — preview, download, print, email (2026-09-18)** — `/account/payments`
  payment rows now name their state (a `pending_verification` row reads "Payment proof submitted —
  awaiting verification" with **no** receipt action) and, when settled, carry a real **View Receipt**
  button that opens the receipt in a **modal** (no navigation) with `Email receipt` / `Print` /
  `Download` (PDF + PNG). One server-authoritative document backs every surface:
  `getCustomerReceipt(userId, paymentId)` decides ownership *and* eligibility
  (`paid` and not `refund`, mirroring `accounting_generate_document`), and `lib/receipt`'s
  `receiptRows()` is walked by the modal, the print sheet, the zero-dependency text PDF
  (`lib/receipt-pdf.ts`, also the email attachment) and the canvas PNG (`lib/receipt-image.ts`), so
  no format can disagree about a number. `GET /api/account/receipts/[paymentId]` is the only
  authorized door — a foreign, unsettled or refund id all return 404; `POST .../email` sends to
  `session.user.email` only (no address is read from the body) and reports `EMAIL_UNAVAILABLE`
  instead of faking a send. **Fixed a live defect**: a `paid` refund-purpose payment used to offer
  `View receipt`, which the staff document RPC refuses. `View reservation` is now a real secondary
  button (border/padding/44px hit area), route unchanged. Gates: typecheck clean, targeted 66/66,
  build clean; full suite 1447/1451 — the 4 failures are in the concurrently-edited
  notification-history stream and touch no receipt module; lint has one pre-existing error in
  `customer-notification-row.tsx` (present at HEAD). Manual browser QA pending.
  See [[2026-09-18 - Customer Receipt Surface]].

- **Customer cancel-reservation workflow fix (2026-09-18)** — one cancel modal with a
  server-authoritative read-only preview (`GET .../cancel/preview`, snapshot-derived via new
  `lib/cancellation-preview`; execution still recalculates in `cancel_reservation`) plus a
  required free-text reason textarea (min 3 / max 500, no dropdown anywhere in the flow);
  success fires the shared ToastStack and a persistent `reservation_cancelled` bell entry
  (migration `20261008010000` with per-reservation dedupe index, never fails the response);
  cancelled detail shows a REFUND section (eligible amount, processing status, View refund
  status → `/account/payments?stay=cancelled&pay=refund`) with no manual Request Refund step.
  Auto-refund, idempotent retry, snapshot policy, hotel-tz math, inventory/transport triggers,
  audit, RBAC, and the Manager-exception boundary unchanged. Reservations have no version
  column — concurrency relies on the RPC row lock (documented in D-018). Gates: typecheck,
  lint 0 errors, full suite green, build. Manual browser QA pending (refundable +
  non-refundable + snapshot-pinned reservations, Accounting queue check).
  See [[D-018]].

- **Request-a-Change redesign + duplicate protection (2026-10-07)** — customer
  reservation-detail change flow is now one complete modal (native date pickers,
  HavenSelect over live inventory via new `GET room-options`, required reason
  textarea, one idempotency key per modal + double-submit guard); one unresolved
  request per reservation (existing `CHANGE_ALREADY_OPEN` guard kept as
  authority, UI shows non-action under-review button + status panel with
  presentation-only status mapping); `reservation_change_submitted` bell entry
  via migration `20261007010000` (pushed + ledger-verified) with per-request
  dedupe index; shared ToastStack mounted in the customer shell. Self-service
  path, Manager-approval routing, Front Desk execution, and
  TRANSPORT_REQUIRES_STAFF preserved. Gates: typecheck, lint 0 errors, full
  suite green, build, detector clean. Follow-up deltas (same day): current-stay
  summary in modal, "Keep current room type" default wording, explicit
  no-alternatives message, required markers on date fields. Manual browser QA
  pending (Flows A–C).
  See [[D-017]].

- **Universal HAVEN UI foundation (2026-09-18)** — shared search/filter toolbar,
  debounced search, All-first quick filters, semantic buttons/statuses, empty states,
  and hotel-time formatting now define one behavior system with customer/internal
  density variants. My Reservations, Manager Reservations, and Owner modules are the
  first reference consumers; existing select/modal/pagination/toast/loader systems were
  reused. No workflow/RBAC/data logic changed. Gates: changed-file lint clean, typecheck,
  1334/1334 tests, build, detector clean; authenticated visual cross-role QA remains
  manual. See [[2026-09-18 - Universal UI Foundation]], [[D-017]], and
  `docs/HAVEN_UI_STANDARDS.md`.

- **GCash-only customer deposits + Owner destination config (2026-09-16)** — new
  online deposits accept `manual_gcash` only against the Owner-configured
  destination (name/number/QR/enabled, `owner_update_payment_destination`,
  masked audit); Owner Payment Settings panel, Admin System Health payment
  block (read-only), customer QR/number/copy/amount page with safe states.
  Migration `20261006010000` pushed + live-verified (guards probed, 0
  residue). GCash currently DISABLED — Owner must configure + enable.
  Gates: typecheck, lint 0 errors, 1270/1270, build, detector clean. Manual
  role QA pending. See [[2026-09-16 - GCash Deposit Flow]] and [[D-016]].

- **Booking Review redesign + wide-workspace correction (2026-09-16)** — customer
  `/booking/review/[token]` rebuilt to the approved reference hierarchy
  (`components/booking/booking-review.tsx`: guest-profile header, 5
  descriptor/value sections, deposit tiles, deep-teal Stay card with DB photo +
  shared-lightbox reuse, teal fallback) then corrected to the 1320px premium
  workspace (larger type, full-width name block, no mid-word email breaks, 9px
  prep rects, 170px photo, cream eyebrow, 21px total). Presentation-only; all
  booking/pricing/deposit/hold logic unchanged. Gates: typecheck, lint 0 errors,
  2426/2426, build 64/64, detector clean. Manual browser QA pending (guest login
  + live hold). See [[2026-09-16 - Booking Review Redesign]].

- **Pre-arrival inventory options (2026-09-16)** — Guest Details amenities are live
  Manager-linked inventory (in-stock only, no dummy fallback, no exposed quantities);
  pre-arrival governance is Manager-only ([[D-015]]), in-stay catalog unchanged,
  consumption stays at fulfillment (exact FK). Gates: typecheck, lint 0 errors,
  1215/1215, build, db push + 8/8 live probe. Manual QA A–F pending.
  See [[2026-09-16 - Pre-Arrival Inventory Options]].

- **Find a Room hover overlay fix (2026-09-16)** — hover no longer covers the photo
  with a white block: generic `.available-room-image span` re-scoped to the
  availability chip (root cause), plus restrained hover (14% tint, 1.02 scale, View
  photo pill fade). Presentation-only, lightbox untouched. Gates: targeted 29/29,
  1215/1215, lint 0 errors, build 64/64, detector clean. Typecheck blocked by a
  parallel session's 3 pre-existing errors in `request-types-panel.tsx` (untouched).
  Manual browser hover check pending. See [[2026-09-16 - Find a Room Hover Fix]].

- **Expected arrival native time input (2026-09-16)** — Guest Details' **Expected arrival**
  radial clock popover / wheel sheet is gone; it is now a plain native `<input type="time">`,
  the same control as Need a ride → Pickup time, inheriting the shared `.booking-form-grid
  input` rule. The picker component, its test, and the dead `.arrival-*` CSS were deleted
  (repo-wide grep proved one caller). Value semantics unchanged — native time inputs already
  yield the canonical `HH:MM` `guestDetailsSchema` requires, so no API/DB change. Both times
  stay independent. Gates: typecheck, lint 0 errors, 1187/1187, build, detector clean.
  Manual QA A–D pending (live data + logins).
  See [[2026-09-16 - Expected Arrival Time Input]].

- **Find a Room availability consistency (2026-09-16)** — audit verified the count
  engine already matches the SQL authority predicate-for-predicate; closed the real
  gaps: sold-out types stay visible as Unavailable (Select disabled, details page
  redirects), hotel day uses the policy timezone, stale-on-edit indicator on the
  search form. Gates: typecheck, lint 0 errors, 1187/1187, build 64/64, detector
  clean. Manual QA A–D pending (live data + logins).
  See [[2026-09-16 - Availability Consistency]].

- **Choose-dates availability guidance (2026-09-16)** — browse-card "Choose dates" now
  smooth-scrolls to Check Availability with one gentle teal pulse, a helper line, and smart
  focus (Find-a-Room + public search share the handler; no booking/pricing/availability
  change; reduced-motion static fallback). Gates: typecheck, lint 0 errors, 1173/1173,
  build. Manual QA A–E pending. See [[2026-09-16 - Choose Dates Guidance]].

- **Room photo lightbox (2026-09-16)** — shared full-screen viewer (`RoomPhotoLightbox`)
  for Find a Room / public search cards and every View Details gallery photo: dark stage
  above all modals (`--z-index-lightbox: 1400`), looping nav + arrows, counter, 100–200%
  zoom with clamped pan, Escape/backdrop close with focus return, Tab trap, scroll-lock
  restore. Landing Featured photos stay navigation (no fake galleries); mobile ships
  buttons + drag-pan, no gesture dep. Presentation-only. Gates: typecheck, lint 0 errors,
  1161/1161, build 64/64, detector clean. Manual browser QA pending (Flows A–D).
  See [[2026-09-16 - Room Photo Lightbox]].

- **Room photo lightbox (2026-09-16)** — shared full-screen viewer for Find a Room
  card photos + View Details gallery (looping nav, counter, 100–200% zoom with
  clamped drag-pan, capture-phase Esc/arrows above the details modal, focus
  restore, failure fallback). No promo cards exist — that item N/A. Gates:
  typecheck, lint 0 errors, 1159/1159, build 64/64, detector clean. Manual
  browser QA pending (guest login).
  See [[2026-09-16 - Room Photo Lightbox]].

- **Notification history modal (2026-09-15)** — "View all notifications" now opens a
  shared filterable modal instead of navigating, on the guest bell and the staff operations
  bell (user-authorized D-013 amendment of D-011: staff reads are per-device UI dismissal,
  no new table, no second system). Hotel-day filter (Today/Yesterday/specific, Asia/Manila),
  unread-first then read newest-first, date-scoped "Mark this day as read", View preserving
  existing targets, single bell badges, sidebar/toast behavior unchanged. Guest
  `/account/notifications` page kept. Gates: typecheck, lint 0 errors, 1137/1137, build.
  Manual browser QA pending. See "2026-09-15 - Notification History Modal".

- **Centered notification banner (2026-09-15)** — transient toasts moved from the
  bottom-right corner to a viewport centered under the header in the main content column
  (sidebar-aware offset, z-index below modals); new soft-red `error` tone with alert
  semantics; Admin/Owner shells share the same viewport (ad-hoc corner toast retired).
  Bell/badges/polling/role-gating untouched. Gates: typecheck, lint 0 errors, 1110/1110,
  build 62/62, detector clean. Manual browser QA pending (role logins).
  See [[2026-09-15 - Centered Notification Banner]].

- **Room create reason removal (2026-09-14)** — Add Physical Room no longer
  requires "Reason for change"; creation stays auto-audited, edits/retire/
  reactivate still require a reason. Migration `20261002010000` pushed +
  live-verified (67/67). Gates: typecheck, lint 0 errors, 1067/1067, build,
  7/7 live probe with zero residue. Manual browser QA pending.
  See [[2026-09-14 - Room Create Reason Removal]].

- **Manager Reports redesign (2026-09-14, Codex start → this session finish)** —
  inline `Reports` extracted to `components/manager/performance-reports.tsx` and
  redesigned: header + 3 decision KPIs, accessible 7-day occupancy chart with
  data-table fallback, room-status breakdown; daily-report review queue kept as
  a distinct workflow below. Same `DashboardData`, same print export, same
  role branches. Contract tests updated to the extraction (print invariant now
  spans both files; overview-copy assertion follows the new subtitle).
  Verification: typecheck clean, lint 0 errors, **1057/1057 tests (96 files)**,
  build 62/62 routes, detector clean. Manual browser QA pending (role logins).
  See [[2026-09-14 - Manager Reports Redesign]].

- **Manager HAVEN AI operational workspace redesign (2026-09-14)** — rebuilt the
  presentation around the two existing read-only features: Daily Operations Brief and
  Ask HAVEN. The brief response now exposes five factual indicators projected from the
  same authoritative `BriefInput` (no extra query and no Gemini-derived metrics). The
  responsive workspace includes explicit advisory boundaries, conditional warning and
  forecast treatments, a session-based manager greeting, an anchored Ask composer, and
  the documented HAVEN data → predictive analytics → Gemini → human-decision flow.
  Model selection, tool loop/thought signatures, rate limits, RBAC, audit, and every
  operational workflow remain unchanged. Verification: focused 10/10, **1040/1040 full
  tests**, typecheck clean, lint 0 errors (69 existing warnings), production build passed,
  final Impeccable detector clean. Authenticated desktop/mobile browser review remains
  pending because this repository has no installed browser runner or reusable role session.
  See [[2026-09-14 - Manager HAVEN AI Workspace]].

- **Client fetch resilience (2026-09-14)** — removed the global NextAuth
  `SessionProvider` from staff/public pages and scoped it to the customer profile form,
  the only surface that calls `useSession`. Manager dashboard module loading now catches
  network and malformed-response failures, preserves successful background data, and
  presents a retryable error state instead of throwing `Failed to fetch`. Verification:
  focused regression 2/2, typecheck clean, lint 0 errors (71 existing warnings),
  **1029/1029 tests**, production build passed.

- **HostForge Docker deployment preparation (2026-09-13)** — added a root
  `Dockerfile` using `node:22-alpine` and the existing
  `npm ci → npm run build → npm run start` lifecycle, plus a secret-safe
  `.dockerignore`. The container binds to `0.0.0.0:3000`; HostForge must
  provide production environment variables through its platform settings.
  Verification: clean install passed, typecheck passed, lint 0 errors
  (71 existing warnings), 1,027/1,027 tests passed, production build passed,
  and all 66 Supabase migrations matched remotely. Docker CLI 29.7.2 was
  present, but its Linux engine was not running, so local image construction
  remains a HostForge/local-Docker follow-up. See
  [[2026-09-13 - HostForge Docker Deployment]].

- **Ask HAVEN Markdown rendering (2026-09-13)** — answers now render as clean formatted
  guidance instead of raw `\###`/`\*\*`/`&#x20;` literals. Cause: no Markdown support existed
  (`<p>{text}</p>`) and the model emits backslash-escaped Markdown + space entities with no
  format guidance. Fix (UI/rendering only; thoughtSignature loop, model, tools untouched):
  `ASK_TASK` style rules (compact dashboard Markdown, never escape), context-aware
  `normalizeAiAnswer` (`lib/ai/answer-format.ts` — Markdown-syntax patterns + known space
  entities only, assistant answers only), zero-dep safe `AiMarkdown` renderer
  (`components/manager/ai-markdown.tsx` — headings/bullets/ordered/bold/italic/code/rules,
  raw HTML inert, no `dangerouslySetInnerHTML`), `.ai-md` styles both themes. `svgAsk`: no
  literal in source; panel renders inside `.app-shell` so the sr-only label stays hidden —
  copy/serialization artifact; still hardened (`aria-hidden` Send icon, tested name/label).
  New tests: `answer-format` 9/9, `ai-markdown` 8/8, panel +2. Gates: typecheck clean,
  lint 0 errors, **1027/1027**, build. Manual browser verification pending (Manager Ask page).
  See [[2026-09-13 - Ask HAVEN Markdown Rendering]].

- **Ask HAVEN thought-signature 400 fix (2026-09-13)** — root cause: `app/api/ai/ask/route.ts`
  rebuilt `{ functionCall: { name, args } }` from the SDK `functionCalls` getter, dropping the
  Gemini 3 `thoughtSignature` sibling; the next `generateContent` failed HTTP 400. Fix preserves
  `candidates[0].content` verbatim in history (order + call ids echoed), fails safe with
  `AI_TOOL_CONTEXT_ERROR` when unrecoverable (never reconstructs unsigned calls). Model unchanged:
  `gemini-3.6-flash` via `lib/ai/gemini-client.ts` (single source of truth, `GEMINI_MODEL` override
  kept; SDK `@google/genai` 2.21.0 verified). Raw `[AI DEBUG]` provider messages removed from all
  four AI routes — Ask returns "HAVEN AI couldn't complete that request right now. Please try
  again.", others return the generic unavailable message; logs carry category only. Tools unchanged
  (9 read-only, zero params). New `lib/ai/tool-history.test.ts` (14). Gates: typecheck clean,
  lint 0 errors, **1008/1008**, build. Manual Ask HAVEN verification pending (4 tool questions +
  multi-turn same session). See session handoff [[2026-09-13 - Ask HAVEN Thought-Signature Fix]].

- **System Administrator formalization (2026-09-30)** — internal `admin` is now HAVEN's
  System Administrator (display-only; no new role, no identifier renames). Q1: migration
  `20261001010000` (pushed + verified, 66/66 in sync) lets Owner or Admin change the hotel
  timezone ([[D-012]]); Q3: workspace shows System Administrator / System Administration;
  Q2: System Health extended Unknown-first (application, storage, email, deployment,
  domain, automations, technical issues — read-only, no secrets, no new integrations).
  All gates green: typecheck, lint 0 errors, **990/990**, build. Manual UI verification
  pending (Admin login). See [[2026-09-30 - System Administrator Formalization]].

- **Stay-gated guest reviews + landing refresh (2026-09-12)** — `#smarter` tiles no longer leak
  internal ops numbers (now: 48 rooms / amenity count / 1 connected account); new landing Guest
  stories section (static grid, verified-stay badges, dummy fallback while empty); `stay_reviews`
  table + `customer_submit_stay_review` RPC (checked_out only, 1 per stay, instant publish, no
  moderation); `StayReviewCard` on the completed-stay detail page; `GET/POST /api/account/reviews`.
  Migration `20260935010000` **not yet pushed**. All gates green: typecheck, lint 0 errors,
  **977/977**, build. See [[2026-09-12 - Stay Reviews & Landing Refresh]].

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
- [[D-012 — Hotel timezone is Owner-or-System-Administrator configuration]]
- [[D-005 — Manager attention rules are derived, never mutating]]
- [[D-007 — Accounting handles routine financial operations]]

## Next Recommended Task

1. **Manual UI verification of the roadmap features** (needs role logins — one sweep):
   Owner/Admin policy dialogs (VAT/service charge, deposit SLA), Manager inventory
   replenishment + draft PO, Maintenance/Manager asset registry, Housekeeping suggestion
   strip (self-assign vs Owner assign vs Manager read-only), guest-profile modal, rate
   plans modal, deposit aging chips, System Administrator labels + timezone field +
   extended System Health cards (Admin login).
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

- [[2026-09-14 - Room Create Reason Removal]] — create needs no reason, auto-audit kept, edit reason intact; all gates green
- [[2026-09-14 - Manager Reports Redesign]] — extracted PerformanceReports surface (KPIs, accessible chart + data table, room status); print/review flows preserved; 1057/1057, build + detector clean
- [[2026-09-14 - Manager HAVEN AI Workspace]] — authoritative KPI strip + redesigned read-only brief/Ask decision workspace; all automated gates green
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
