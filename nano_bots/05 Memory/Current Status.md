# Current Status

## Scope and acceptance continuation (2026-11-04, local unreleased)

- Local fixes cover legacy occupant updates, solo-register completion, vendor-optional
  drafts, persistent PO history and correct received-stock status. Source docs now
  reflect procurement's existing lifecycle and proposed enterprise boundaries.
- Node22 full suite2,217/typecheck/build pass; SQL and isolated restored upgrade to
  120 migrations pass. Linked ledger112/dry run lists eight pending migrations;
  none applied. Personal browser coverage and remaining limits are in
  `docs/qa/hotel-scope-integration-and-manual-acceptance-2026-11-04.md`.
- Restaurant connection remains dependent on agreed partner API/auth/sandbox.
  No production release or register/age policy activation. See
  [[2026-11-04 - Hotel Scope and Manual Acceptance]].

## Occupants, guest controls and housekeeping (2026-11-04, local unreleased)

- Local source/migrations cover a name-only occupant register with verified age
  evidence and emergency occupancy, room-discrepancy investigations, VIP/DNR and
  other operational flags with audited overrides, reviewed CRM merging, and
  stay-scoped DND plus declined/late service outcomes.
- Local synthetic browser QA verified Front Desk roster save/check-in, Manager DNR
  override, Front Desk DND, emergency occupancy and room-discrepancy report →
  investigate → resolve. Browser retest found and fixed the roster payload sending
  server-only fields; its regression test passes. Housekeeping task-outcome UI,
  reviewed merge, Owner/disabled-staff and mobile browser flows remain unverified.
- Clean chronological PostgreSQL 18 replay passed; SQL suites passed 24 backend,
  13 occupant/guest-controls and 27 housekeeping checks. Focused Vitest passed
  157/157; full Vitest passed 2,213/2,214, with the one failure isolated to the
  unrelated cancellation/change-flow assertion in `lib/change-request-redesign.test.ts`.
  Typecheck/build passed; touched-file ESLint exited 0 with warnings only. The
  earlier full suite ran under Node 26.6.0; the follow-up roster regression,
  typecheck and lint ran with Node 22.22.2.
- Restored/hosted-order replay, live-ledger verification and deployment remain
  incomplete. Supabase CLI has no access token; migration
  timestamps remain provisional. No hosted change or policy activation occurred.
- Pricing, turndown and lost property remain deferred pending property policy.
  Details: [[2026-11-03 - Occupants Guest Controls Housekeeping]]; verification:
  [[2026-11-04 - Occupants Guest Controls Verification]].

## Cancellation/no-show folio settlements (2026-11-03, local)

- Explicit policy fees, unused-obligation credits, resulting refund credit, approved
  fee waivers, guest preview/activity, issued-document snapshots and daily fee totals
  implemented. Independent transportation remains collectible.
- Additive migration `20261103160000` is pending; production is unchanged.
- Local browser QA passed Guest/Front Desk/Accounting/Manager flows, mobile/desktop,
  approved waiver and daily fee reporting. Six QA display/refresh/navigation issues
  fixed and retested. Final 204 files/2213 tests, typecheck/build pass; lint 0 errors/4
  existing warnings. Report: `docs/qa/cancellation-folio-browser-qa-2026-11-03.md`.
- Verification and release notes: [[2026-11-03 - Cancellation Folio Settlement]].

## Final local audit (2026-11-04)

- Reviewed the complete uncommitted set and committed each logical group: Front
  Office/payment workflow, staff light theme, Windows test fixtures, lint scope,
  Cash & Shifts proposal, and audit/session records. No conflict markers found.
- Final verification: 211 test files / 2,272 tests pass; typecheck, production
  build, and lint pass (0 errors; 86 repo-wide warnings, with seven baseline
  warnings on touched TSX files). `git diff --check` passes.
- Chrome light-mode review covered Room Management, Reservations, Guest
  Management, Guest Requests, Shift handover, Operational Handover, and Cash &
  Shifts. Earlier per-feature test counts below are checkpoints; this final run
  supersedes their recorded Windows assertion failures.
- No database write or deployment.

## Shared Payment Details (2026-11-04 — local)

- Deposit and stay-payment details/reviews share one receipt component with the actual
  HAVEN Hotel & Residences name and shared HAVEN logo (Garden Twin is a room type);
  live payment/proof data, deposit comparison and existing review callbacks preserved.
  Pending review actions require Accounting capability; provider-settled payments
  cannot be manually confirmed.
- Responsive sizing replaces the initial screenshot geometry: 560px desktop/laptop,
  520px tablet cap, 12px mobile margins, readable fluid type, scrolling record with
  persistent header/X. Duplicate bottom Close removed at the user's request.
  Desktop/tablet/mobile/dark and short-window QA completed.
- 69 focused tests passed at the feature checkpoint. The final cross-change run
  passes 211 files / 2,272 tests, typecheck, and production build; full lint has
  0 errors / 86 repo-wide warnings. Seven touched-TSX warnings match baseline.
  Live payment E2E remains unverified. The receipt-test type error is corrected.
- No database or deployment change. [[2026-11-04 - Shared Payment Details]].

## Staff light-theme contrast audit (2026-11-04 — local)

- Corrected shared light surfaces/borders, data-toolbar tokens, active navigation,
  pagination controls and system-health accents after auditing `--ds2` / `--dl`
  consumers and the root theme selector scope.
- Live browser review covered all manager navigation modules, including the
  populated Guest Management pager and Finance tables. Also fixed Cash & Shifts:
  the ledger now uses full width while the drawer stays beside the header.
  `git diff --check` and `npm run typecheck` pass.
- No database or deployment changes. See [[2026-11-04 - Staff Light Theme Contrast Audit]].

## Front Office modules and room calendar (2026-11-04 — local)

- User-selected seven-day guest calendar is now Room Management's default;
  Reservations and Guest Management have separate staff navigation entries.
- Final cross-change run passes 211 files / 2,272 tests, typecheck, and production
  build. Component-fixture QA and read-only Chrome module review completed;
  authenticated live action E2E remains unverified.
  No deployment or DB changes. D-035;
  [[2026-11-04 - Room Calendar and Front Office Modules]].

## Room Reservations workflow (2026-11-04 — local)

- Approved prototype integrated: two views, actionable summaries, attention queue,
  contextual reservation rows, explicit scope/history retry, and room-history disclosure.
- 75 targeted tests passed at the feature checkpoint. Final cross-change run
  passes 211 files / 2,272 tests, typecheck, and production build. Component-fixture
  QA completed; authenticated live action E2E remains unverified. No deployment
  or database changes.
- [[2026-11-04 - Room Reservations Workflow Integration]].

## Production cutover (2026-11-03)

- Authorized sequence executed and verified: maintenance gate → backup
  (restored into disposable PostgreSQL OK) → staged production deploy → four
  pending migrations applied remotely → promote → production verification →
  traffic reopened.
- Production runs dpl_Cou57UhzDNeecuDVcFfXii7TpCPQ on
  haven-hotel-management-ten.vercel.app; `/` and public API return 200,
  auth-guarded endpoints 401 cleanly. Remote ledger: 112 migrations, 0 missing
  vs local.
- Firewall gate rule disabled (not deleted); pre-cutover dump + private logs
  retained in `.tmp/qa-rollout` (git-ignored). Remaining open work: optional
  gate-rule deletion, credential rotation, external sandbox tests.
- Details: [[2026-11-03 - Coordinated Production Cutover]].

## QA remediation (2026-11-03)

- Local migration conflicts resolved using eight recovered remote source files;
  unpublished hotel migrations moved after the verified ledger. Linked dry-run
  passes. Hosted operating-day RPC absence confirmed; live rollout remains pending.
- Clean112-migration and hosted-upgrade replay plus87 SQL checks pass. Vitest2205,
  typecheck/build pass; touched-file lint0errors/0warnings. Bundled fonts build offline.
- Browser390/1366 navigation/header and persisted dummy Admin create/edit/suspend
  pass. Synthetic Accounting login and operating-day activation/assessment pass.
- Vercel CLI logged out; awaiting user sign-in for coordinated rollout. Credentials
  need secure rotation and external sandbox tests remain open. No hosted business
  writes or migration applied. `docs/qa/qa-fixes-2026-11-03.md`.

## Comprehensive QA follow-up (2026-11-03)

- Current checkout: 203 Vitest files / 2,203 tests pass; typecheck passes. Focused
  Admin/mobile checks pass (6 tests); lint has 0 errors / 7 existing warnings.
- New local-source mobile navigation fix added; browser visual retest remains pending.
- Hosted-backed Manager preview returned 503 from `/api/staff/operational-date`.
  Remote migration drift is documented, but the exact RPC error was not captured.
- Fresh isolated build could not fetch Google Fonts. Previous staff walkthrough's
  successful build is evidence for that earlier checkout, not this exact one.
- Hosted CRUD was not run; current local config targets hosted Supabase with existing
  records. No hosted business write, migration, deployment or password change in
  this QA pass. Details: `docs/qa/comprehensive-qa-2026-11-03.md`.

## Hotel operations roadmap (2026-11-03)

- Applicable local implementation and changed-core staff walkthrough complete.
  Final QA: docs/qa/staff-walkthrough-2026-11-03.md; [[2026-11-03 - Staff Walkthrough]].
- Node22:202 files/2201 tests, typecheck/build pass; lint0errors/11warnings.
  Real SQL87 checks/groups; full104 local migration replay passed.
- Production release blocked: Vercel logged out; final remote preflight has six
  missing versions and two differently named version collisions. Earlier pending-four
  report is stale. Recover/reconcile remote source/contracts before renumbering/push.
- Maintenance window authorized; no production migration or deployment. Hosted
  Accounting-only password reset explicitly requested/audited and login verified.
  Normal hosted configuration unchanged. Earlier sections are historical.

## Housekeeping integration (2026-11-03)

- Verified existing checkout → cleaning → inspection/reclean → ready flow using
  real isolated SQL. Hosted RPCs and task links exist; two tasks await inspection.
- Fixed Owner assignment API mismatch, disabled-session guard and misleading
  controls for other workers' tasks. No migration or hosted data changes.
- 195 files / 2120 tests, 12 isolated SQL checks, typecheck/lint/build pass.
- Browser E2E not performed. [[2026-11-03 - Housekeeping Integration Audit]].

## Hotel PMS reference analysis (2026-11-03)

- Completed `docs/rea-open-hotel-pms-analysis.md`: hotel operations only, pinned
  source evidence, comparison, rules, diagrams and prioritized proposals.
- REA installed/configured and directly callable in Codex; existing MCP preserved.
- Reproduced a current false sold-out availability calculation for staggered stays;
  documented without fixing. Recommendations are not approved implementation.
- No application/migration/data changes or deployment in this investigation.
- Details: [[2026-11-03 - REA Hotel PMS Analysis]].

## Local app connection and QA (2026-11-03)

- At the user's request, ignored local configuration now uses linked **hosted
  Supabase**, without a Docker database dependency. Stale local DB URLs removed.
- Browser login/views passed for five supplied roles; Accounting password
  mismatches its active account. No password/account changes performed.
- 43/43 HTTP smoke checks passed. Browser access was subsequently disabled in
  Work settings; remaining visual and operational-write checks are incomplete.
- Remediation source is committed (`5d43490`); its hosted migration is still
  pending and needs coordinated rollout. No migration/deployment performed.
- Details: `docs/qa/backend-browser-qa-2026-11-03.md`.

## Backend audit remediation (2026-11-02)

- All 23 authorized audit fixes implemented locally; user excluded B-005
  (PayMongo webhook envelopes). See `docs/qa/backend-remediation-2026-11-02.md`.
- Verified: 194 test files / 2106 Vitest tests, 23 real PostgreSQL regression
  cases, typecheck, touched-backend eslint, production build. Type checking
  restored in production builds; cash bypass disabled after cash-cycle regression.
- Linked live ledger and relevant function bodies verified. Migration
  `20261102010000_backend_audit_remediation.sql` is the sole dry-run pending item.
  Coordinated app/database rollout remains pending; no commit/deployment/DB push.
  Existing unfinished frontend work is preserved. [[KI-016]] tracks rollout.

## Local approved HMS/UI work retained by merge

## Focused HMS workflow release (2026-11-03 — current)

- Follow-up QA defects KI-014–016 fixed: stock baseline, drawer draft identity
  and cash grid. Six form tests, typecheck/build/lint pass; full suite 2,102 pass /
  existing KI-012 failure. Cash layout verified signed in at desktop/mobile.
  Broader browser write-path QA remains partial; see workflow QA report.
- Approved prototype implemented locally; eight scoped migrations applied through
  `20261103120000` (exact allowlist in implementation report).
- Stock/history, cash/folio/receipt, guest profile/ID and request/handover repaired.
  No roster dependency; HR/procurement/assets/Lost & Found held.
- Fresh PostgreSQL: 108 scoped migrations + 19 acceptance scenarios pass; live
  rollback-only smoke passed. Typecheck/build pass; full suite 2,100 pass /
  one existing Windows SQL text assertion. New workflow ESLint clean.
- Full signed-in write-path walkthrough and hosted app deployment remain pending. No Git
  push. See [[2026-11-03 - Approved HMS Workflow Implementation]] and
  `docs/HMS-WORKFLOW-IMPLEMENTATION-2026-11-03.md`.

## Earlier broad role improvements (2026-11-03 — historical checkpoint)

- Authorized Phases 0–5 implemented in source: cash controls, partial receiving,
  guest withdrawal/review honesty, roster/handover, linked preventive work,
  Lost & Found and historical cash investigation. Seven migrations were pending
  then; the focused release above supersedes that rollout status.
- Local SQL acceptance 11 pass; HTTP scope tests 16 pass; full suite 2087 pass /
  existing CRLF assertion failure. Build blocked fetching Google Fonts.
- Remote ledger/function baseline checked; deployed cash-open typo reproduced.
  Remote migration verification/application and signed-in role QA remain pending.
- See [[2026-11-03 - Role Improvement Implementation]] and
  `docs/ROLE-IMPROVEMENT-IMPLEMENTATION.md`.

## Shared Account Sidebar (2026-11-03)

- Approved navigation refinement implemented across all staff shells and Guest:
  property pills removed, larger box-free logo, fixed-size icons, consistent
  expanded/collapsed metrics and mobile drawer labels.
- Approved hidden-scrollbar refinement is also implemented across staff, Guest,
  and reusable sidebar navigation. Native overflow remains scrollable. Latest
  navigation checks: typecheck + 37 targeted tests pass; full suite 2068 pass /
  same unrelated SQL assertion failure; build still blocked fetching Google Fonts.
- Typecheck and 54 targeted tests pass. Full suite 2068 pass / 1 unrelated Windows
  SQL line-ending assertion failure; build blocked on Google Fonts connection.
  Visual verification used production-CSS fixtures; signed-in QA remains manual.
- See [[2026-11-03 - Shared Account Sidebar]].

## Guest Rewards & Loyalty Module Redesign (2026-10-06)

- Completely redesigned the guest account Rewards module ([`app/(booking)/(customer)/account/loyalty/page.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/app/%28booking%29/%28customer%29/account/loyalty/page.tsx) and [`components/customer/loyalty-card-panel.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/loyalty-card-panel.tsx)) using modern SaaS (TailAdmin / Finwise) paradigms, elevated UI/UX Pro Max aesthetics, and full responsive design:
  1. **Executive Page Header**: Standardized to `section.customer-page-title.split` with amber pill eyebrow, balanced title typography, and a prominent primary action CTA (`Book stay to earn` linking directly to `/account/find-room`).
  2. **Membership KPI Cards Grid (`.loyalty-kpi-grid`)**:
     - **Active Tier & Balance**: Digital executive membership card aesthetic with luxury background gradient, live tier badge, crown/award icon badge, bold points balance, and multiplier rate tag (`1×/1.25×/1.5× earning`).
     - **Lifetime Qualifying Spend (`.loyalty-kpi-lifetime`)**: Dedicated 4th executive KPI card highlighting total verified folio spend (`₱75,400.00`) establishing tier status, featuring gold `Coins` token with warm glow, "Tier Qualifying" pill badge, large tabular currency numerals, and explanatory copy.
     - **Tier Progress**: Real-time milestone tracker displaying distance to next tier (`₱10,000.00 to Gold`), percentage pill badge (`50% to Gold`), and a glowing animated progress bar.
     - **Purchasing Power**: Financial translation of points to Philippine Pesos (`₱150.00`), instant conversion rate pill (`1 pt = ₱1.00`), and stay discount explanation.
  3. **Interactive Tier Privileges Matrix (`.loyalty-comparison`)**:
     - Distinct luxury cards for Silver, Gold, and Platinum with spend range pills, multiplier badges, and interactive comparison selection.
     - **Executive Lifetime Spend Header Badge (`.loyalty-lifetime-spend`)**: Elevated from a dim gray footnote into a prominent, noticeable executive status badge with gold gradient styling, glowing coin token, uppercase tracking label, bold tabular currency, and active tier indicator pill (`Gold unlocked`).
     - Itemized privileges checklist (`.loyalty-tier-perks-list`) for each tier highlighting key member perks (rate guarantees, digital key, early check-in, room upgrades, concierge access).
     - Glassmorphic tier detail banner (`.loyalty-tier-detail`) with active status indicator and unlock milestones.
  4. **Program Guide Strip (`.loyalty-how-it-works`)**:
     - Clear 3-step guide explaining how Haven Rewards works: Stay & Earn (01), Ascend Tiers (02), and Redeem 1:1 (03).
  5. **Transaction Ledger (`.loyalty-ledger-card`)**:
     - Modern SaaS table design with monospace reference pill badges, status activity pills (`Earned`, `Redeemed`, `Adjusted`), and green positive point values (`+150`).
     - Guided empty state with next action link (`Explore rooms to start earning`).
  6. **Styling & Tokens ([`app/customer-portal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/customer-portal.css))**:
     - Section 10 overhauled using FleetOps tokens (`var(--cp-*)`, `var(--st-*)`, `var(--cp-gold)`, `color-mix(...)`) with 0 legacy coastal hexes.
     - Responsive layout: 4-column KPI grid on desktop, 2-column on tablet, full-width balanced stack on mobile (`<=680px`).
  7. **Verification**:
     - `npm run typecheck`: clean (0 errors).
     - `vitest`: targeted loyalty and customer shell suites passed (22/22 tests).
     - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Classic Guest AI Concierge Restoration & UI/UX Pro Max Refinement (2026-10-06)

- Restored the clean classic appearance of the floating AI chatbot to match the original design captured in the user screenshot, elevated with UI/UX Pro Max polish and impeccable craftsmanship:
  1. **Classic Circular Floating Launcher ([`components/customer/concierge-float.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/concierge-float.tsx))**:
     - Restored the 56px circular floating trigger button with centered icon (`Sparkles` when closed, `X` when open).
     - Elevated micro-interactions: smooth scale transition (`scale(1.05)` on hover, `scale(0.96)` on press), multi-stage elevation shadow (`0 10px 25px -4px rgba(0,0,0,0.16)`), and accessible focus ring.
  2. **Clean Minimal Header Layout**:
     - Single-row header with emerald `Sparkles` icon and bold `Ask HAVEN` title (`14px font-weight: 700;`).
     - Distinct tactile 32px close button with subtle border and smooth hover background.
  3. **Classic Empty State & Suggested Prompts ([`components/customer/guest-ai-concierge-panel.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/guest-ai-concierge-panel.tsx))**:
     - Clean, unobtrusive initial prompt: *"Ask about check-in times, amenities, Wi-Fi, or nearby places."*
     - Horizontal rail of rounded pill chips with micro-lift hover interactions for fast questions.
  4. **Form Controls & Input Row ([`app/customer-portal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/customer-portal.css))**:
     - Fixed broken styling where input and button previously rendered as unstyled browser controls.
     - Direct `<input>` and `<button>Send</button>` flex layout with 40px height, 10px rounded corners, smooth focus rings (`0 0 0 3px rgba(59, 130, 246, 0.15)`), and high-contrast Midnight Ink / blue send button.
     - Footnote disclosure with proper contrast and muted sizing.
  5. **Verification**:
     - `npm run typecheck`: clean (0 errors).
     - `eslint`: clean (0 errors).
     - `vitest`: targeted suites passed (17/17 tests).
     - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Cancelled Stay Refund Explanation & Modal Feature (2026-10-06)

- Added an informative, luxury "See more" modal feature to the cancelled reservation refund section (`.crd-refund-status`) on `/my-reservations/[id]`:
  1. **Trigger Affordance (`.crd-refund-status`)**:
     - When a cancelled reservation is not eligible for a refund (`!activeRefund`), added `<button type="button" className="customer-inline-action crd-refund-more-btn" onClick={() => setRefundInfoOpen(true)}>`.
     - Includes `HelpCircle` icon, "See more" label, and `aria-label="See more details about why no refund is due"`.
  2. **Refund Policy & Eligibility Modal**:
     - Built using Haven's accessible `<Modal>` primitive with `portal={true}` (full-viewport dimming and focus trapping) and `headerVariant="branded"`.
     - Contextual reason card tailored to the reservation state:
       - **Zero Payments Collected** (`money.paid === 0`): explains that no reservation deposit or stay payments were recorded, so there is no collected amount to refund.
       - **No-Show Forfeiture**: explains that reservations marked as a no-show past the check-in cutoff forfeit the reservation deposit.
       - **Non-Refundable Notice Window**: explains that cancellations requested inside the notice cutoff window (< 7 days before arrival) forfeit the deposit to offset reserved inventory.
     - Structured financial breakdown card (Stay Total, Amount Paid, Folio Balance = ₱0.00, Eligible Refund = ₱0.00).
     - Visual policy tiers recap (100% full refund window, partial refund percentage, non-refundable cutoff, and no-show arrival cutoff).
     - Guidance note for extenuating circumstances and direct link to Help & Support (`/account/help`).
  3. **Verification**:
     - `npm run typecheck`: clean (0 errors).
     - `vitest`: 184 test files passed, 2,052 tests passed (100% green).
     - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Guest AI Concierge Modern SaaS Design Overhaul (2026-10-06)

- Completely elevated the guest account floating AI concierge chatbot (`ConciergeFloat` & `GuestAiConciergePanel`) to match the renewed HAVEN modern SaaS (TailAdmin/Finwise) design language:
  1. **Floating Launcher Pill ([`components/customer/concierge-float.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/concierge-float.tsx))**:
     - Upgraded from a plain circular button to a modern SaaS floating pill with backdrop blur, subtle shadow, and a pulsing emerald live status beacon (`.concierge-live-beacon`) showing active availability.
     - Preserves full accessibility: `aria-expanded`, `aria-label="Chat with HAVEN concierge"` (closed) / `"Close concierge chat"` (open).
  2. **Elevated Header & Identity**:
     - Modern two-line brand layout: dedicated avatar badge with Sparkles, bold title ("Ask HAVEN"), "AI Host" pill badge, and live "Virtual Concierge · Online" status indicator dot.
     - Accessible close button with hover feedback and `aria-label="Close chat panel"`.
  3. **Welcome Hero Card ([`components/customer/guest-ai-concierge-panel.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/guest-ai-concierge-panel.tsx))**:
     - Transformed bare empty text into an elevated welcoming hero card (`.concierge-welcome-card`) with sparkles icon badge, bold greeting ("How can we assist you today?"), and clear prompt suggestions. Preserves `.concierge-empty` for test suite invariants.
  4. **Chat Bubbles & Action Cards**:
     - **Assistant Messages**: Elevated card surface with crisp border, refined typography, and full markdown rendering.
     - **User Messages**: Modern SaaS gradient / deep ink fill with crisp high-contrast white text and subtle shadow elevation.
     - **Action Draft Cards**: Highlighted service request drafts with "Action Draft" tags, request details, and primary CTA buttons ("Confirm Request").
     - **Typing Indicator**: Animated 3-dot bounce wave (`.concierge-typing-dots`) alongside backwards-compatible pulse bars.
     - **Input Form**: Seamless container wrapper (`.concierge-input-wrap`) with focus-within ring and dedicated send button with icon.
  5. **Flexbox Architecture in [`app/customer-portal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/customer-portal.css)**:
     - Eliminated fixed 300px thread height cutoff; implemented full flexbox layout (`flex: 1; min-height: 0; overflow-y: auto`) inside an elevated 20px radius card (`410px` wide, max `600px` height) with zero nested scrollbars.
     - Fully compliant with FleetOps neutral tokens (`#111827`, `#d1d5db`) and zero legacy coastal hexes.
- Verification:
  - `npm run typecheck`: clean (0 errors).
  - `eslint`: clean on touched files (0 errors).
  - `vitest`: 184 test files passed, 2,052 tests passed (100% green).
  - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Account Dropdown Popover Preservation & Dedicated "My Profile" Modal View (2026-10-06)

- Restored native header dropdown popover behavior across all account triggers while dedicating modal viewing exclusively to "My Profile":
  1. **Customer Shell ([`components/customer/customer-shell.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/customer-shell.tsx))**:
     - Header account button (`Carl Garcia` / `CG`) opens an undimmed, luxury dropdown popover directly anchored beneath the header button.
     - Dropdown contains user identity header, "My Profile" item (`<a class="haven-account-row-item" href="/account/profile">`), "Account security" item, and "Sign Out" item.
     - Clicking "My Profile" intercepts navigation, closes the dropdown popover, and opens the dedicated modal view.
  2. **Dedicated Customer Profile Modal ([`components/account/customer-profile-modal.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/account/customer-profile-modal.tsx))**:
     - Uses Haven `<Modal size="md" headerVariant="branded" portal={true}>` to guarantee full-viewport backdrop dimming (`dialog-backdrop`) without clipping by sticky headers or CSS transforms.
     - Hero Identity Card with monogram avatar, verified guest badge, legal name, and email.
     - Live editable form inputs (Full Name, Mobile Number, Nationality, Address) and read-only verified email with Front Desk notice.
     - Form submission sends `PATCH /api/account/profile` with input validation, success/error feedback alerts, and router refresh.
     - Footer includes seamless transition button to Account Security (`onOpenSecurity`).
  3. **Staff / Manager, Admin, and Owner Dashboards**:
     - Reverted header account triggers from full modals back to native dropdown popovers (`.profile-popover` inside `.profile-menu-wrap`), preserving their outside-click dismissals and Settings dialog triggers.
- Verification:
  - `npm run typecheck`: clean (0 errors).
  - `vitest`: 184 test files passed, 2,048 tests passed (100% green).
  - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Reservation Booking Policy Formatting & Visual Scannability Redesign (2026-10-06)

- Completely overhauled the formatting of the reservation booking policy panel (`<section class="customer-policy crd-panel" id="crd-panel-policy">`), transforming raw wall-of-text sentence paragraphs into structured, high-contrast, scannable components:
  1. **Check-in & Check-out**: Formatted into a dedicated 3-column schedule bar (`.crd-policy-metrics`) highlighting Check-in (`From 3:00 PM`), Check-out (`By 12:00 PM`), and Timezone (`Asia/Manila (PHT)`).
  2. **Valid ID & Minimum Age**: Structured into clear specification rows with status badge pills (`Required at check-in` / `18+ years old`) and concise secondary explanation copy.
  3. **Balance & Incidentals**: Formatted with a dedicated settlement timing pill (`Due at checkout`) and clear scope breakdown (remaining room balance and incidental charges incurred).
  4. **Cancellation Refunds**: Replaced dense sentence clauses with a visual tiered refund breakdown (`.crd-policy-tiers`):
     - **100% Refund**: Emerald tier card for cancellations ≥ 14 days before arrival.
     - **50% Refund**: Amber tier card for cancellations ≥ 7 days before arrival.
     - **Non-Refundable**: Rose/critical tier card for cancellations < 7 days before arrival.
     - **No-Show Rule**: Clear bottom notice for deposit forfeiture past 11:59 PM on arrival day.
  5. **Changes to Your Booking**: Structured into a notice window row (`≥ 3 days before arrival`) with condition details (availability, repricing, staff approval).
  6. **Special Requests**: Structured into a fulfillment status row with a clear "Subject to availability" tag and arrival fulfillment explanation.
  7. **House Rules**: Transformed inline sentences into a visual 3-card rules grid (`.crd-policy-rules-grid`):
     - Pets: `Not Allowed` with ✕ icon and suite policy detail.
     - Smoking: `100% Smoke-Free` with ✕ icon and designated area detail.
     - Early Check-in: `Not Offered` / `Available` with clear status indicator.
  8. **Container Upgrades**: Upgraded `reservation-detail-view.tsx` to wrap each policy item in `.crd-policy-card` with `.crd-policy-header` and `.crd-policy-body`, eliminating malformed `<p>` tag nesting over block elements.
- Verification:
  - `npm run typecheck`: clean (0 errors).
  - `eslint`: clean on touched files (0 errors).
  - `vitest`: 183 test files passed, 2,041 tests passed (100% green).
  - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Global Account Identity Modal Standardization (2026-10-06)

- Standardized and rooted the account identity popover (`.customer-account-popover` / `.profile-popover`) into a canonical modal dialog (`HavenAccountModal`) with full background dimming, luxury elevation, and standardized global rooting:
  1. **Canonical Component ([`components/ui/haven-account-modal.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/ui/haven-account-modal.tsx))**:
     - Built on the core accessible dialog primitive ([`components/ui/Modal.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/ui/Modal.tsx)) with `role="dialog"`, `aria-modal="true"`, focus trapping, Escape dismiss, backdrop click dismiss, and return-focus restoration.
     - Features luxury hero identity card displaying avatar initials mark, user name (`<strong>`), email address (`<small>`), and role pill badge.
     - Standardized action items list: `My Profile` link (`profileHref`), `Account security` button (`onOpenSecurity`), `Settings` button (`onOpenSettings`), `Notification sound` toggle (`showSoundToggle` with `role="switch"`), and `Sign Out` button (`onSignOut`) with danger styling.
     - Maintains `.customer-account-popover` and `.profile-popover` container classes for testing backwards compatibility.
  2. **Dedicated Theme Stylesheet ([`components/ui/haven-account-modal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/components/ui/haven-account-modal.css))**:
     - Full viewport overlay with dimmed tint (`rgba(4, 10, 18, 0.65)` in dark mode, `rgba(15, 23, 42, 0.48)` in light mode) and `backdrop-filter: blur(4px)`.
     - TailAdmin / Finwise elevation shadow, 16px radius, hover micro-transitions, danger row styling, and sound switch toggle pill.
     - Loaded globally in [`app/layout.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/app/layout.tsx).
  3. **Rooted Globally Across All 4 Account Surfaces**:
     - **Customer Shell ([`components/customer/customer-shell.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/customer-shell.tsx))**: Mounted at root level outside `<header>` inside `AccountSecurityProvider` so the backdrop spans the entire viewport without `backdrop-filter` clipping.
     - **Manager & Staff Dashboard ([`components/manager/manager-dashboard-client.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/manager/manager-dashboard-client.tsx))**: Replaced inline popover, wired `profileBtn` focus restoration and notification sound toggle.
     - **Admin Dashboard ([`components/admin/admin-dashboard-client.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/admin/admin-dashboard-client.tsx))**: Replaced inline popover, removed manual event listeners.
     - **Owner Dashboard ([`components/owner/owner-dashboard-client.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/owner/owner-dashboard-client.tsx))**: Replaced inline popover, wired "Owner / Super Admin" role badge and sound toggle.
- Verification:
  - `npm run typecheck`: clean (0 errors).
  - `vitest`: 183 test files passed, 2,041 tests passed (100% green, including new `haven-account-modal.test.tsx`).
  - `npm run build`: clean (all 88 routes compiled with Turbopack).

- Completely resolved the visual confusion and color clashes in `<div class="haven-notification-popover">` across customer and staff portals:
  1. **Coordinated Semantic Severity Palette**: Unified icon colors, icon wash containers, glowing unread dots, and high-contrast severity chips across the 4 canonical severities:
     - **Critical (`sev-critical`)**: Soft red wash (`rgba(239, 68, 68, 0.14)` / `#fef2f2`), red icon glyph (`#f87171` / `#dc2626`), glowing red dot (`#f87171` / `#dc2626`), and high-contrast WCAG AA chip (`color: #fca5a5; background: rgba(239, 68, 68, 0.16)` in dark; `color: #b91c1c; background: #fef2f2` in light).
     - **Attention (`sev-attention`)**: Soft amber wash (`rgba(245, 158, 11, 0.14)` / `#fffbeb`), amber icon glyph (`#fbbf24` / `#d97706`), glowing amber dot (`#fbbf24` / `#d97706`), and high-contrast amber chip (`#fcd34d` in dark; `#b45309` in light).
     - **Success (`sev-success`)**: Soft emerald wash (`rgba(16, 185, 129, 0.14)` / `#ecfdf5`), emerald icon glyph (`#34d399` / `#059669`), glowing emerald dot (`#34d399` / `#059669`), and emerald chip (`#6ee7b7` in dark; `#047857` in light).
     - **Info (`sev-info`)**: Soft blue wash (`rgba(59, 130, 246, 0.14)` / `#eff6ff`), blue icon glyph (`#60a5fa` / `#2563eb`), glowing blue dot (`#60a5fa` / `#2563eb`), and blue chip (`#93c5fd` in dark; `#1d4ed8` in light).
  2. **Eliminated Dark Mode Unread Glitch**: Replaced the hardcoded `#f3f3f3` background (which previously generated a blinding white rectangle on dark mode panels) with theme-aware tokens: `rgba(255, 255, 255, 0.04)` with subtle border `rgba(255, 255, 255, 0.08)` in dark mode, and clean `#f8fafc` with `#e2e8f0` border in light mode. Read rows maintain a 1px transparent border to prevent layout shift.
  3. **Replaced Monochromatic Green Overrides**: Removed forced `color: var(--cp-green)` across all icons, chevrons, and dots. Replaced arbitrary green "Mark all as read" and "View all notifications" CTAs with modern SaaS primary blue action styles (`#60a5fa` dark / `#2563eb` light).
  4. **Enhanced Group Labels**: Upgraded unread group counter with a dedicated subtle primary pill (`rgba(59, 130, 246, 0.16)` / `#eff6ff`), providing immediate scannability for unread vs earlier sections.
  5. **Component Class Hook**: Added `is-sev-${severity}` to `.cnr` in [`components/ui/haven-notifications.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/ui/haven-notifications.tsx) alongside `:has(.sev-${severity})` CSS fallbacks for complete styling resilience.
- Verification:
  - `npm run typecheck`: clean (0 errors).
  - `eslint`: clean on touched files (0 errors).
  - `vitest`: 182 test files passed, 2,036 tests passed (100% green).
  - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Room Title Typography System Check & Comprehensive Standardization (2026-10-06)

- Completed a comprehensive system check and fixed all room type title headings across the application to ensure they use the dedicated luxury editorial serif display style (`var(--font-display)`, Playfair Display) with `font-weight: 500; letter-spacing: -0.025em; text-wrap: balance;`:
  1. **Customer Overview Stay Hero (`/account`)**: Fixed `.customer-stay-copy h2` in [`app/customer-portal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/customer-portal.css) from `var(--font-sans)` to `font: 500 clamp(26px, 2.6vw, 34px)/1.15 var(--font-display, Georgia, serif) !important;` and added `.room-title` to `<h2>{stay.room_type}</h2>` in [`app/(booking)/(customer)/account/page.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/app/(booking)/(customer)/account/page.tsx).
  2. **Customer My Reservations (`/my-reservations`)**: Removed `.customer-reservation-card h3` from the sans group, mapped `.reservation-card-copy h3` to `var(--font-display) !important`, and added `className="room-title"` to `<h3>{reservation.room_type}</h3>` in [`app/(booking)/(customer)/my-reservations/page.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/app/(booking)/(customer)/my-reservations/page.tsx).
  3. **Customer Reservation Details Hero (`/my-reservations/[id]`)**: Removed `.customer-reservation-heading h1` from the sans group, mapped it explicitly to `var(--font-display) !important; font-weight: 500`, and added `className="room-title"` to `<h1>{data.roomType}</h1>` in [`components/customer/reservation-detail-view.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/reservation-detail-view.tsx).
  4. **Customer Payments / Folio Card (`/account/payments`)**: Removed `.customer-financial-list h2` from the sans group, added `className="room-title"` to `<h2>{record.room_type}</h2>` in [`app/(booking)/(customer)/account/payments/page.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/app/(booking)/(customer)/account/payments/page.tsx).
  5. **Booking Stay Summary Aside (`BookingStaySummary` / `ReviewStayCard`)**: Added `className="room-title"` to `<h2>{roomType}</h2>` in [`components/booking/booking-stay-summary.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/booking/booking-stay-summary.tsx).
  6. **Find a Room & Search Focus**: Confirmed `.booking-page .room-title` in [`components/booking/room-results.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/booking/room-results.tsx) and added `.room-title` to the focus heading in [`app/(booking)/booking/search/page.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/app/(booking)/booking/search/page.tsx).
  7. **Landing Page Featured Stays**: Added `className="room-title"` to `<h3><Link href={href}>{room.name}</Link></h3>` in [`components/landing/booking-intent.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/landing/booking-intent.tsx).
  8. **Global Stylesheets Synchronized**: Standardized room-title preservation rules across [`app/customer-portal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/customer-portal.css), [`app/haven-tailadmin-theme.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/haven-tailadmin-theme.css), [`app/guest-booking.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/guest-booking.css), and [`app/(booking)/booking/search/search.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/(booking)/booking/search/search.css) while keeping all general SaaS headings strictly in `var(--font-sans)`.
- All gates green: `npm run typecheck` clean (0 errors), eslint clean on all touched files (0 errors), 182/182 test files passed (2,036/2,036 tests 100% green), `npm run build` clean (88/88 routes compiled with Turbopack).

## TailAdmin HAVEN UI Standardization (2026-10-06)

- Established ONE unified HAVEN SaaS Design System benchmarked on the TailAdmin Next.js open-source template (`TailAdmin/free-nextjs-admin-dashboard`), preserving HAVEN brand identity (HAVEN logo, HAVEN blue `#1d4ed8`/`#1e3a8a`, HAVEN red `#dc2626`/`#ef4444`, warm gold `#f59e0b`, Inter typography) with zero modifications to backend architecture, Supabase, API routes, auth, or business logic.
- Built comprehensive global stylesheet [`app/haven-tailadmin-theme.css`](file:///c:/Projects/HOTEL-MANAGEMENT/app/haven-tailadmin-theme.css): full light/dark tokens, 5 elevation shadows, 7 geometry radii, standardized structural styles for Sidebar (280px / 80px rail, squircle brand mark, accordion groups), 70px sticky Header (search command with `⌘K`, notification bell chime, profile dropdown), Page Headers & Breadcrumbs, Component Cards, Stat Cards (`EcommerceMetrics` pattern), Data Tables (`BasicTableOne` format), Form Controls, Status Badges (10%-tint soft pills with pulse), Modals, and Skeletons.
- Built reusable React component suite [`components/ui/tailadmin-haven.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/ui/tailadmin-haven.tsx) and updated [`components/ui/index.ts`](file:///c:/Projects/HOTEL-MANAGEMENT/components/ui/index.ts): `ComponentCard`, `StatCard`, `TailAdminPageHeader`, `TailAdminButton`, `TailAdminBadge`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`, `TailAdminInput`, `TailAdminSelect`, `TailAdminTabs`, `TailAdminAlert`, `TailAdminEmptyState`, `TailAdminSkeleton`, and `TailAdminPagination`.
- Built interactive complete visual template showcase [`components/manager/haven-tailadmin-visual-template.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/manager/haven-tailadmin-visual-template.tsx) covering all 4 tabs: Operations Overview with KPI cards & Recharts area chart, Reservations Table with search, filters & pagination, Form Controls & Modals, and Badges & Buttons.
- All 14 modules unified under the shared design tokens: Dashboard, Reservations, Rooms, Guests, Front Desk, Housekeeping, Maintenance, Accounting, Reports, Staff, Hotel Policies, Catalog, System Health, and Settings.
- All gates green: `npm run typecheck` clean (0 errors), 182/182 test files passed (2,036/2,036 tests 100% green), `npm run build` clean (88/88 routes compiled with Turbopack).

## Notification Button and Icon Format Standardization (2026-10-05)

- Standardized the notification bell button (`.haven-notification-bell`), optical icon alignment, and unread badge across all roles and accounts (Customer, Staff/Manager, Admin, Owner) as a global root standard.
- Upgraded button geometry to `38px` × `38px` with `10px` squircle border radius, perfectly matching the 38px SaaS search bar and header controls.
- Centered the `Bell` icon optically with absolute positioning (`position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important;`), decoupling it from badge count and flex sibling flow to guarantee mathematical dead-center alignment at (19px, 19px). Added an interactive chime swing animation on hover (`transform: translate(-50%, -50%) rotate(14deg) !important;`).
- Standardized unread counter badge to `position: absolute !important; top: -4px !important; right: -4px !important; min-width: 18px !important; height: 18px !important; border-radius: 999px; background: #ef4444; color: #ffffff;` with clean dark/light border cutouts.
- Fixed critical dot collision where `.icon-button i` was crushing notification badges into a 7px dot overlapping the bell icon.
- All gates green: `npm run typecheck` clean, 42/42 notification tests passed, `npm run build` clean (88/88 routes).

## Find a Room Availability & Media Status Indicator Redesign (2026-10-05)

- Redesigned and elevated the room availability and media status indicator into a prominent, high-contrast, modern status pill badge (`top: 12-16px; left: 12-16px; z-index: 3`, `pointer-events: none`, `padding: 6-7px 13-14px`, `border-radius: 999px`, `font-size: 11.5px`, `font-weight: 750`).
- Integrated animated live pulsing status dot (`::before` with `havenChipPulse`): glowing emerald for Available/Published, glowing amber for Low Availability (1–2 units left) or Unpublished, red for Sold Out / Unavailable, and slate for browse ("Check dates").
- Standardized at the root level across all surfaces:
  - **Guest Account (`/account/find-room`)**: `.customer-content .available-room-image .room-availability-chip` in both dark and light modes.
  - **Public Booking Search (`/booking/search`)**: Replaced old 58px circle with the exact same elevated status pill in `search.css`.
  - **Manager & Staff Room Catalog (`/manager_dashboard`)**: `.catalog-card-media .badge` in root `app/globals.css` upgraded to the exact same status pill with live green/amber pulsing dots.
- All gates green: `npm run typecheck` clean, 80/80 related tests green, 160/160 booking suite green, `npm run build` clean (88/88 routes).

## Global SaaS Header Search and Command Palette Standardization (2026-10-05)

- Redesigned the SaaS header search button (`.saas-header-search-btn`) into a prominent, wider (250px–280px) modern SaaS toolbar command bar with right-pinned `⌘K` shortcut badge, refined micro-elevation shadows, and dark/light mode contrast.
- Standardized across all 4 account surfaces: Customer Shell (`customer-shell.tsx`), Staff/Manager Dashboard (`manager-dashboard-client.tsx`), Admin Dashboard (`admin-dashboard-client.tsx`), and Owner Dashboard (`owner-dashboard-client.tsx`), all wired with active `CommandPalette` (`Cmd+K` / `Ctrl+K`).
- Globally integrated in `app/layout.tsx` via `components/ui/command-palette.css`.
- All gates green: `npm run typecheck` clean, `npm run build` clean (88/88 routes), vitest core suites 100% green.

## Cross-Role Modern SaaS Page Header Standardization (2026-10-05)

- Standardized the header/title bar across all accounts and workspaces (Staff, Manager, Front Desk, Housekeeping, Maintenance, Accounting, Admin, Owner, and Guest) to the compact modern SaaS toolbar design established in `section.customer-page-title`.
- Replaced legacy 108px–112px heights, bulky 250px decorative circles (`::after`), and oversized headings with a thin 12px 20px bar, `clamp(17px, 1.8vw, 21px)` title, 12px subtitle, amber pill eyebrow (`9.5px`), and 34px buttons.
- All gates green: `npm run typecheck` clean, `npm run build` clean (88/88 routes), vitest core suites 100% green.

## Guest Portal & Modern SaaS UX Overhaul (2026-10-04)

- The entire customer account portal (all 13 modules) and global styling were modernized to an impeccable modern SaaS aesthetic benchmarked against Finwise.
- Re-architected `app/customer-portal.css` with Finwise elevation tokens, white card surfaces with slate borders in light mode (ending the dark-box-in-light-mode glitch), refined stay hero banner with 240px wide aspect photo and dual action buttons, 4-column quick action grid, 3-metric overview grid with 40px icon boxes and tabular figures, and shared table grammar.
- Purged legacy coastal teal RGBs and corrected mismatched button states across all modules; unified on purpose-driven button tokens.
- All gates green: `npm run typecheck` clean, `npm run build` clean (88/88 routes), `npm test` 182/182 files and 2,034/2,034 tests passed (100% green).

## System Health module (2026-09-26)

- The Admin → System Health module was rebuilt around one question — *is anything
  wrong right now, and what do I do about it?* Order is now verdict → 8 service
  cards → needs-attention → ledger | automations rail. The attention list left the
  320px rail for the main column, and the ledger took the full width.
- Root cause of "prompts to fix the design change nothing": the module was the only
  admin stylesheet outside the D-025 theme layer, keeping a pinned 9–11px scale while
  `.theme-light .app-shell` ran at 12–15px. Tones moved onto the value line only, on
  theme-flipping `--color-*-fg` tokens. Alerts are now de-duplicated against the cards.
- The two permanent Unknowns became real with **no migration** — both crons already
  persist their runs: automations read `guest_reminder_deliveries` / `analytics_model_runs`
  (labelled "Last send" where the ledger records sends, not attempts), and Deployment
  gained a two-tier feed (always-on env/branch/commit; newest build status when
  `VERCEL_TOKEN` is set).
- The ledger panel then had three **style conflicts** fixed in
  `components/admin/system-health.css`: the theme resets headings with a child
  combinator that cannot reach headings nested inside `[role=tabpanel]`, and no
  stylesheet gives `.data-panel` padding (every other panel is inset by its own
  heading child) — so the ledger's headings sat flush on the card border and the tab
  pills were drawn *on* it, with `overflow:hidden` clipping their focus ring. The
  tables also had no mobile step. See [[2026-09-26 - System Health Ledger Conflict Fix]].
- The ledger tables' **column geometry** followed: they were `table-layout:fixed` at
  `width:100%`, so the one column with no declared width (Name) swallowed ~700px and
  pushed the Status badge to the far edge of the card. The module now declares a
  width for every column **except the last of each table** — Status in migrations,
  Entity in the audit trail — which is the column that absorbs the leftover width.
  `table-layout:fixed` is gone; a spacer column was designed, built, measured, and
  **rejected** (see the session note). Browser-measured, not assumed. A later review
  brief asked for the reverse (Name flexible, Status compact); both layouts were put
  to the user, who **kept this one** — recorded as [[D-031]] so the wide Status column
  is not "fixed" back. The one soft value, `--sys-col-name`, was then tuned 280 → 240px
  from a measurement of all 87 migration names in the app's real font (Inter 13px, not
  `system-ui`): 84/87 names stay on one line and the mean gap to the badge drops from
  121px to 81px.
  See [[2026-09-26 - Ledger Table Column Geometry]].
- Verification: 35/35 focused, full suite 160 files / 1797 tests, typecheck clean,
  eslint 0 errors (3 pre-existing warnings), compiled-CSS chunk confirms the fixes,
  and the final geometry was measured in headless Chrome at 1440px and 390px.
- See [[D-030 — Admin module stylesheets inherit the theme scale and never restate a fact a card already shows]]
  and [[2026-09-26 - System Health Module Redesign]]. Authenticated browser QA is
  pending (KI-005); `VERCEL_TOKEN` is unset, so tier 2 deployment status is dormant.

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

Last Updated: 2026-10-03
Current Development Area: Occupancy reporting correctness — the seven-day trend is now one shared, explicitly-labelled **booked** basis (Accounting QA BUG-001)
Current Feature: **Reports / Overview / Owner occupancy labelling** — booked (reservation stay dates, `bookedOccupancyTrend`) vs live (room rack) named on every surface that shows both; browser QA pending
Current Branch: `main`
Latest Relevant Commit: `8473496` (Digital Express Pass strip, deployed) — the occupancy-basis change is **not yet committed**

> Working tree on 2026-10-03 holds the occupancy-basis change ([[2026-10-03 - Occupancy Basis Fix]]) on top
> of the tree pushed as `6a1a880` / `de7eb4f` / `3a9e9eb` / `abc45c7` / `8473496`.

## Current Objective

Post-audit roadmap execution (user-authorized continuous run, Phases 2→9, one agent, no
confirmation stops). **ALL PHASES COMPLETE** — 1 tax-aware documents, 2 guest profiles,
3 rate plans, 4 guest communication automation, 5 deposit-verification SLA visibility,
6 housekeeping assignment suggestions, 7 inventory draft POs, 8 preventive maintenance
foundation, 9 commercial readiness (9A/9B/9C/9D). The final overall report was delivered
in-session. Remaining: manual UI verification (role logins); the tree was committed and pushed on
2026-10-03.

## Recently Completed

- **Occupancy reporting basis unified and labelled (2026-10-03)** — Accounting QA BUG-001: the
  Reports seven-day chart read 30% for Saturday while the Room status panel beside it read
  0 occupied / 0 reserved / 10 available. Both were true, but they are different quantities with one
  shared name — the chart is **booked** occupancy (reservation stay dates) and the panel is the
  **live room rack** (`rooms.status`). The trend now has one implementation,
  `bookedOccupancyTrend` in `lib/analytics/occupancy.ts`, built on the engine's tested `countNights`,
  which also fixed a real defect: `checked_out` was counted for **every** day of the window, so an
  early-departed guest was reported as occupying tonight. The Owner executive trend
  (`/api/owner/data`) had its own third copy of the rule and now uses the same helper. Reports,
  Overview and the Owner dashboard label which number is which ([[D-033]]). Not committed/deployed
  yet; browser QA pending.

- **Digital Express Pass moved into its own strip under the hero (2026-10-03)** — the pass QR
  was the **middle `auto` column of the 3-column hero heading grid**, so a ~400px tall card set the
  hero's height, wedged between the confirmation number and the action panel, and pushed
  `ReservationActions` to the far right off-axis from the room type. It is now a **full-width strip
  directly below the hero** — the same slot the *QR expired* band already uses, so live and expired
  passes always appear in the same place — with QR left, description middle, Ready pill + Download
  right (`customer-checkin-qr-strip`, aligned in one row). Children were regrouped into
  figure/copy/action **without renaming a single existing class**; the skeleton took the same shape
  so loading does not jump. The dead `.customer-checkin-qr-pass-column` rules are gone and the hero
  heading grid dropped its third track (which otherwise still contributed its 28px gap). Caught a
  real cascade trap pre-ship: the strip's mobile rules were first placed in the existing `≤900px`
  block *above* the base QR rules, so equal specificity + source order would have made the desktop
  layout win on phones — they now sit beside the rule they override, verified in the compiled chunk.
  Mobile reading order is intentionally QR-first now (grouping cannot preserve the old interleave).
  Typecheck clean, lint 0 errors (70 pre-existing warnings), full suite **1982 with the same 1
  pre-existing unrelated failure** ([[KI-012]], CRLF), build clean. Committed `9710e86`, pushed, and
  **deployment verified live** — the portal CSS chunk became `40qbpq0o-pj0p.css` (sha256
  `b705cc2578c98307…`, was `2odo9rj1od4bl.css`) with 12 strip rules and **0** `pass-column` rules.
  Manual guest browser QA pending ([[KI-005]]).
  See [[2026-10-03 - Check-In QR Pass Strip]].

- **Working tree committed (2026-10-03)** — the long-standing uncommitted tree was committed in six
  logical commits and pushed: `6a1a880` retires the pre-arrival ID upload (component +
  `id-document` route), `de7eb4f` stops a cancelled/no-show stay bucketing as *Awaiting
  Verification* when a stale pending deposit row survives the expiry + backfill, `3a9e9eb` raises a
  Front Desk attention warning for a **pending** reservation past its check-in date (advisory, never
  mutates status), `abc45c7` lets the profile route survive duplicate guest rows (the `maybeSingle`
  lookups threw on a second row and 500'd the save), and `8473496` hoists `groupQueueTask` into
  `lib/housekeeping-queue.ts` + adds `countRequestBatches` (the queue panel still carries its local
  copy — the swap has not happened yet). All four parallel workstreams were verified green together
  before committing.

- **Guest Account security opened as a modal (2026-10-03)** — the account menu's **Account
  security** entry was a `<Link href="/account/settings">`, so it navigated the guest away
  mid-task (a half-filled booking step, an open folio) with only browser Back to return. It now
  opens `AccountSecurityDialog` — the notification-sound switch + the password form, i.e. parity
  with the old page, minus the Appearance row because the theme toggle already lives in the
  customer header. A context provider mounted inside `<main>` gives one instance, opened from
  **both** the menu and the My Profile page title; `/account/settings` is kept as a working
  fallback. Deliberately **not portaled** (a portal would leave `.customer-shell` and lose the
  portal's form theming) and **not rendered in the header** (its `backdrop-filter: blur(12px)`
  would become the containing block for a fixed dialog). Fixed a live styling gap in the same
  pass: `.settings-theme-row` / `.settings-body h3` were styled only under `.app-shell
  .modal-content`, so the sound row rendered as a bare div on the customer settings page — it now
  has a customer-scoped block (tokens only, [[D-029]]). `PasswordForm` still signs the guest out
  on success. No API/RPC/DB change. New 6-case dialog test + 2 shell cases; typecheck clean, lint
  0 errors, full suite 1981 with the same 1 pre-existing unrelated failure ([[KI-012]], CRLF),
  build clean. Committed `17b824d` with a **pathspec commit** and pushed; **deployment verified
  live** — the portal CSS chunk became `2odo9rj1od4bl.css` (sha256 `47fb7070…`, was
  `1k_zs0e1djhi-.css` / `e13948be…`) carrying the new `.customer-shell .settings-theme-row` rules
  alongside the previous deploy's `.loyalty-redeem`. Guest browser QA pending.
  See [[2026-10-03 - Account Security Modal]].

- **Guest loyalty redemption block redesigned (2026-10-03)** — the `.loyalty-redeem` widget on
  My Reservations → reservation → **Rate & folio** looked "messy" because it was **the only guest
  surface with no stylesheet at all** (repo-wide grep: zero `.loyalty-redeem` rules in any
  `*.css`), so it rendered raw browser controls inside an otherwise tightly-typeset card. Rebuilt
  as a designed sub-panel: icon + heading + rate line, **Available** / **Max for this folio**
  figures, a real themed range slider, a bordered exact-amount field, the **Use max** shortcut,
  an accent Apply, and a live `aria-live` peso preview. The rate now reads `POINTS_TO_PESO` through
  `formatPeso` instead of a prose literal. The `max = min(points, floor(folioBalance))` cap is
  **untouched and load-bearing** — the RPC credits `least(points, invoice)` but debits every point
  sent. New 5-case jsdom test + updated `lib/loyalty.test.ts` contract. Typecheck clean, full suite
  1973 with the same 1 pre-existing unrelated failure ([[KI-012]], CRLF), build clean.
  Committed `febfc54`, pushed, and **deployment verified live** — the portal CSS chunk gained
  `.loyalty-redeem` (`3ck2-y394gzxr.css` → `1k_zs0e1djhi-.css`, ~60 s after the push), which also
  proves the GitHub → Vercel auto-deploy is wired. Guest browser QA pending.
  See [[2026-10-03 - Loyalty Redemption Block Redesign]].
- **Owner Payment Settings — method switch persists (2026-10-03)** — switching
  PayMongo → Manual GCash in Owner → Governance → Payment Settings reported success but
  reverted on refresh. Root cause: the wizard's primary **Save changes** called only
  `PATCH /api/owner/payment-destination`, whose RPC never writes `deposit_method`, so the
  method stayed `'paymongo'` while `gcash_enabled` stayed true and the effective path stayed
  instant. The single `save()` now commits the method first (`PATCH /api/admin/deposit-method`,
  threading the returned version — both RPCs share one counter) then the destination; the
  redundant `saveMethod()`/soft footer button is gone, and Step 1's **Activate PayMongo** calls
  the same save. Live probe confirmed the RPC exists — **no migration**. Typecheck clean,
  targeted 38/38, full suite 1968 with 1 pre-existing unrelated failure ([[KI-012]], CRLF),
  build clean. SYSTEM.md §7.2 updated. Committed fix-only as `347d688` and pushed to
  `origin/main` (2026-10-03); the tree's parallel-session work was left local. Browser QA
  pending ([[KI-005]]). See [[2026-10-03 - Owner Payment Method Persist]].
- **Cancelled-deposit backfill applied (2026-10-03)** — `20261024100000_cancel_backfill_stale_pending.sql`
  pushed with `supabase db push` after a clean dry-run. Verified live: deposits still
  `pending_verification` on cancelled/no-show reservations **3 → 0**, cancelled reservations
  still `payment_status='unpaid'` with no eligible refund **3 → 0**; ledger max now
  `20261024100000`. Terminal reservations only — paid rows and refund-eligible rows untouched.

- **Room price typography (2026-09-29)** — finished a two-surface plan left half-verified
  by a previous session (that session died on a provider rate limit at `typecheck`, not a
  code failure; its edits were already correct on disk). The room-card price block no
  longer renders figures in the display serif — both surfaces use `--font-sans` at semibold
  with tabular numerals kept, and the `3 nights` / `estimated total` labels went 9–10px
  muted grey → 12px full contrast. The plan's deferred item turned out to be real but
  cheaper than it assumed: `" / night"` is a bare text node inside `.room-price`, which had
  **no rule in any stylesheet** and no ancestor setting a `font-size`, so it inherited the
  16px root default. One `font-size` per surface fixes it with no JSX edit to the shared
  component. Two public-page inconsistencies closed with it: `.room-price-total` was
  computing at weight 400 against the portal's 600, and a redundant tabular rule was
  deleted. Note the two stylesheets **mirror each other by hand** — any price-block change
  must be made in both. Typecheck clean, full suite 162 files / 1850 passing, build clean,
  compiled chunks checked by byte offset to prove cascade order. See
  [[2026-09-29 - Room Price Typography Fix]]. Manual browser verification pending.

- **Admin module CSS scoping fix (2026-09-26)** — Admin → System Health layout edits now
  land deterministically instead of silently losing. Three overlapping causes fixed:
  unscoped `.page-title`/`.panel-heading` rules in a stylesheet Next.js hoists app-wide
  (`.panel-heading h3` had been forcing every admin panel heading into a flex row that no
  theme could override), a (0,1,1) specificity tie between `system-health.css` and
  `globals.css` whose winner was bundler chunk order, and a test that locked the
  stylesheet's literal text. Table column geometry moved into `--sys-col-*` variables
  (`table-layout:fixed` ignores cell content, so markup edits could never move it). Five
  Security Configuration headings that had been relying on the leaked rule now declare
  their own. Also unclipped the Pending Migrations modal's Filename column. Full suite
  160 files / 1791 passing, typecheck clean, compiled dev-server CSS verified. See
  [[D-029 — Admin module stylesheets are global; every selector must be namespaced]] and
  [[2026-09-26 - Admin Module CSS Scoping Fix]]. Manual browser verification pending.

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

- Accounting QA BUG-001 fixed (2026-10-03, uncommitted): the Reports chart and the Room status panel
  on the same page disagreed (`Saturday 30%` vs `0 occupied / 0 reserved / 10 available`) because both
  were called "occupancy" — one from reservation stay dates, one from the live room rack. The trend
  now comes from one shared `bookedOccupancyTrend` helper (the same tested `countNights` basis the
  analytics engine uses, which also stops an early-departed guest being counted as occupying
  **tonight**), the Owner executive trend uses it too, and every surface showing both numbers labels
  which is which ([[D-033]]). Browser QA pending ([[KI-005]]) — as Accounting and Manager check
  Reports reads as booked with today's point last, and the Overview/Owner cards say Live room rack.
  See [[2026-10-03 - Occupancy Basis Fix]]. The report's second item (repeated immutable receipts for
  the same source records) was **not** changed — unverified, recorded as [[KI-013]].

- Guest reservation-page Digital Express Pass strip delivered (2026-10-03); **committed `9710e86`,
  pushed, and live in production** (deploy verified by the portal CSS chunk change). Manual guest
  browser QA pending ([[KI-005]]) — a confirmed + paid reservation at 1440px (hero is two columns,
  the pass sits between hero and folio strip, Download still saves the PNG), then checked-in,
  cancelled / checked-out (the expired band in that slot, no live pass), dark + light, at
  1440 / 1024 / 900 / 390px. Checklist in [[2026-10-03 - Check-In QR Pass Strip]].

- Guest Account security modal delivered (2026-10-03); **committed `17b824d`, pushed, and live in
  production** (deploy verified by the portal CSS chunk change). Manual guest browser QA pending
  ([[KI-005]]) — My Reservations → account menu → **Account security** with a form
  half-filled; Escape returns focus to the menu button; sound switch survives a reload; a password
  change still lands on `/login?reason=password-changed`; repeat from the My Profile title button,
  dark + light, 390px; `/account/settings` still resolves. Checklist in
  [[2026-10-03 - Account Security Modal]].

- Guest loyalty redemption block redesigned (2026-10-03); **committed `febfc54`, pushed, and live
  in production** (deploy verified by the portal CSS chunk change). Manual guest browser QA still
  pending ([[KI-005]]) — My Reservations → reservation → Rate & folio, dark + light, 390px, plus a
  keyboard-only pass. Checklist in [[2026-10-03 - Loyalty Redemption Block Redesign]].

- Owner Payment Settings method-switch fix delivered (2026-10-03); manual Owner browser QA pending
  ([[KI-005]]) — switch PayMongo → Manual → Save → hard refresh → still Manual; then back to
  PayMongo. Checklist in [[2026-10-03 - Owner Payment Method Persist]].

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
- Overview requests-card link is now a full-width soft pill (`btn btn-soft`); the other two
  card links stay text links by design. All gates green (166 files / 1873 tests, build
  clean); manual UI verification pending (needs a logged-in guest) — checklist in
  [[2026-09-29 - Overview Requests Card Pill Button]].
- Online-deposit failure ("Unable to start online payment.") fixed at the root: the live database
  had no `public.submit_gateway_deposit` in any schema while its migration (`20261016010000`) was
  already recorded as applied, so `supabase db push` could never recreate it ([[KI-011]]). Restore
  migration pushed and live-verified — function present, service-role-only, `prosrc` digest matches
  the canonical body, RPC resolves through PostgREST (no `PGRST202`); the route now logs RPC
  failures and maps every guard code, and `lib/gateway.ts` keeps the provider's HTTP status.
  PayMongo had collected **zero** payments ever, so no orphaned session was paid. All gates green
  (167 files / 1886 tests, build clean); no end-to-end guest run yet (needs a guest login) —
  checklist in [[2026-09-29 - Restore submit_gateway_deposit]].
- Booking form type raised to the system standard (14px body / 12px meta, 16px fields). Inside
  `.booking-form-card` labels sat at 10px, the request subhead and GCash detail labels at 9px,
  and the field text was worst: inputs inherited 10px from `.booking-form-grid`, selects were
  14px via `haven-select.css`, and textarea fell back to the ~13.3px UA default — three sizes in
  one grid. Fixed with a scoped `.booking-form-card` block appended to `app/guest-booking.css`
  (both forms; `guest-booking.css` is imported by the root layout, so it covers the public flow
  and the portal at once). All gates green (168 files / 1893 tests, build clean); visual check
  pending (needs a guest login) — checklist in [[2026-09-29 - Booking Form Type Scale]].

## Current Problems / Blockers

- Parallel sessions edit the same untracked tree — coordinate before committing. (The long-standing
  backlog was cleared on 2026-10-03: `c6e95e0..8473496` were pushed, so the tree is clean again.)
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
   extended System Health cards (Admin login), and the new occupancy labelling
   (Reports / Overview / Owner — booked vs live room rack).
2. Commit the working tree — **done 2026-10-03** (`9710e86`..`8473496`, pushed to `origin/main`).
3. Confirm the first live guest-reminders cron firing (09:05 Manila) once a night passes
   with eligible reservations.
4. Known-issue sweep when convenient: schema.sql fresh-install snapshot lags the
   migrations ([[KI-002]]-class drift).

## Relevant Documentation

- [[2026-10-03 - Occupancy Basis Fix]]
- [[2026-10-03 - Check-In QR Pass Strip]]
- [[2026-10-03 - Account Security Modal]]
- [[2026-10-03 - Loyalty Redemption Block Redesign]]
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

- [[2026-10-03 - Occupancy Basis Fix]] — Accounting QA **BUG-001**: the Reports *Seven-day occupancy* chart showed Saturday 30% while the Room status panel on the same page showed 0 occupied / 0 reserved, because both were called "occupancy" — the chart from reservation stay dates, the panel from the live room rack; one shared `bookedOccupancyTrend` (built on the engine's tested `countNights`, so past nights include `checked_out` and **tonight never counts an already-departed guest**) now serves dashboard/Reports, the Owner executive route and the engine, and Reports/Overview/Owner label booked vs live everywhere both appear ([[D-033]]); the report's duplicate-receipts item was left alone as unverified ([[KI-013]]); 1987 tests pass + 1 pre-existing CRLF failure ([[KI-012]]), 10/10 focused files, typecheck/lint/build clean, **not committed or deployed yet**
- [[2026-10-03 - Check-In QR Pass Strip]] — the Digital Express Pass was the middle column of the reservation hero's 3-column grid, a ~400px card that set the hero's height and pushed the action panel off-axis; it is now a full-width strip below the hero (QR | description | action) in the slot the expired notice already uses, children regrouped with no class renames, dead `pass-column` CSS removed, and a same-file source-order cascade trap caught before shipping (mobile rules must sit beside the rule they override); committed `9710e86`, pushed, and **deployment verified live** by the portal CSS chunk change; 1982 tests (1 pre-existing CRLF failure, [[KI-012]]), lint 0 errors, build clean, guest QA pending
- [[2026-10-03 - Account Security Modal]] — the account menu's Account security entry navigated to `/account/settings` and dropped the guest's page; it is now a dialog (sound switch + password form) opened from the menu and the My Profile title via one provider inside `<main>`, deliberately non-portaled and outside the blurred header; `/account/settings` kept as a fallback; also fixed the portal's unstyled `.settings-theme-row`; committed `17b824d` and **deployment verified live** by the portal CSS chunk change; 1981 tests (1 pre-existing CRLF failure, [[KI-012]]), lint 0 errors, build clean, guest QA pending
- [[2026-10-03 - Loyalty Redemption Block Redesign]] — `.loyalty-redeem` on the guest reservation folio had no CSS anywhere, so it rendered raw browser controls; rebuilt as a styled sub-panel (figures, themed slider, Use max, live credit preview) sourcing the rate from `POINTS_TO_PESO`; the `min(points, floor(balance))` cap is preserved because the RPC debits every point sent; committed `febfc54` and **deployment verified live** by the portal CSS chunk change (which also confirms the GitHub → Vercel auto-deploy); 1973 tests (1 pre-existing CRLF failure, [[KI-012]]), build clean, guest QA pending
- [[2026-10-03 - Owner Payment Method Persist]] — the wizard's primary Save called only the destination route, so PayMongo → Manual GCash reported success while `deposit_method` stayed `'paymongo'`; one `save()` now commits the method first (version threaded into the destination save), redundant method-only button removed; live probe ruled out a migration; 1968 tests (1 pre-existing CRLF failure, [[KI-012]]), build clean, Owner QA pending
- [[2026-09-29 - Booking Form Type Scale]] — `.booking-form-card` type lifted to the 14px/12px standard with 16px fields; inputs inherited 10px, selects were 14px, textarea ~13.3px, so one grid showed three sizes; scoped append (not in-place — `.request-option` is shared), 1893/1893, build clean, visual check pending
- [[2026-09-29 - Restore submit_gateway_deposit]] — live DB had no `submit_gateway_deposit` in any schema while its migration was already ledger-recorded, so `db push` could never recreate it ([[KI-011]]); restore pushed + live-verified (prosrc digest matches, RPC resolves, no `PGRST202`), route now logs and maps every guard code, zero payments had ever been collected; 1886/1886, build clean, guest run pending
- [[2026-09-29 - Overview Requests Card Pill Button]] — requests-card link became a full-width soft pill (`btn btn-soft`), sibling card links untouched; 1873/1873, build clean, visual check pending; the label renders green and the pill is outline-only by cascade, not by choice
- [[2026-09-29 - Room Price Typography Fix]] — price figures off the display serif onto `--font-sans`, 12px labels on both surfaces; the bare `" / night"` node inherited 16px from a rule-less span; 1850/1850, build clean, visual check pending
- [[2026-09-26 - Admin Module CSS Scoping Fix]] — unscoped admin module CSS leaked app-wide (D-029); leak guard added, 1791/1791 green, manual browser check pending
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
## Recent Sessions

- [[2026-10-03 - Occupancy Basis Fix]] — Accounting QA **BUG-001**: the Reports *Seven-day occupancy* chart showed Saturday 30% while the Room status panel on the same page showed 0 occupied / 0 reserved, because both were called "occupancy" — the chart from reservation stay dates, the panel from the live room rack; one shared `bookedOccupancyTrend` (built on the engine's tested `countNights`, so past nights include `checked_out` and **tonight never counts an already-departed guest**) now serves dashboard/Reports, the Owner executive route and the engine, and Reports/Overview/Owner label booked vs live everywhere both appear ([[D-033]]); the report's duplicate-receipts item was left alone as unverified ([[KI-013]]); 1987 tests pass + 1 pre-existing CRLF failure ([[KI-012]]), 10/10 focused files, typecheck/lint/build clean, **not committed or deployed yet**
- [[2026-10-03 - Check-In QR Pass Strip]] — the Digital Express Pass was the middle column of the reservation hero's 3-column grid, a ~400px card that set the hero's height and pushed the action panel off-axis; it is now a full-width strip below the hero (QR | description | action) in the slot the expired notice already uses, children regrouped with no class renames, dead `pass-column` CSS removed, and a same-file source-order cascade trap caught before shipping (mobile rules must sit beside the rule they override); committed `9710e86`, pushed, and **deployment verified live** by the portal CSS chunk change; 1982 tests (1 pre-existing CRLF failure, [[KI-012]]), lint 0 errors, build clean, guest QA pending
- [[2026-10-03 - Account Security Modal]] — the account menu's Account security entry navigated to `/account/settings` and dropped the guest's page; it is now a dialog (sound switch + password form) opened from the menu and the My Profile title via one provider inside `<main>`, deliberately non-portaled and outside the blurred header; `/account/settings` kept as a fallback; also fixed the portal's unstyled `.settings-theme-row`; committed `17b824d` and **deployment verified live** by the portal CSS chunk change; 1981 tests (1 pre-existing CRLF failure, [[KI-012]]), lint 0 errors, build clean, guest QA pending
- [[2026-10-03 - Loyalty Redemption Block Redesign]] — `.loyalty-redeem` on the guest reservation folio had no CSS anywhere, so it rendered raw browser controls; rebuilt as a styled sub-panel (figures, themed slider, Use max, live credit preview) sourcing the rate from `POINTS_TO_PESO`; the `min(points, floor(balance))` cap is preserved because the RPC debits every point sent; committed `febfc54` and **deployment verified live** by the portal CSS chunk change (which also confirms the GitHub → Vercel auto-deploy); 1973 tests (1 pre-existing CRLF failure, [[KI-012]]), build clean, guest QA pending
- [[2026-10-03 - Owner Payment Method Persist]] — the wizard's primary Save called only the destination route, so PayMongo → Manual GCash reported success while `deposit_method` stayed `'paymongo'`; one `save()` now commits the method first (version threaded into the destination save), redundant method-only button removed; live probe ruled out a migration; 1968 tests (1 pre-existing CRLF failure, [[KI-012]]), build clean, Owner QA pending
- [[2026-09-29 - Booking Form Type Scale]] — `.booking-form-card` type lifted to the 14px/12px standard with 16px fields; inputs inherited 10px, selects were 14px, textarea ~13.3px, so one grid showed three sizes; scoped append (not in-place — `.request-option` is shared), 1893/1893, build clean, visual check pending
- [[2026-09-29 - Restore submit_gateway_deposit]] — live DB had no `submit_gateway_deposit` in any schema while its migration was already ledger-recorded, so `db push` could never recreate it ([[KI-011]]); restore pushed + live-verified (prosrc digest matches, RPC resolves, no `PGRST202`), route now logs and maps every guard code, zero payments had ever been collected; 1886/1886, build clean, guest run pending
- [[2026-09-29 - Overview Requests Card Pill Button]] — requests-card link became a full-width soft pill (`btn btn-soft`), sibling card links untouched; 1873/1873, build clean, visual check pending; the label renders green and the pill is outline-only by cascade, not by choice
- [[2026-09-29 - Room Price Typography Fix]] — price figures off the display serif onto `--font-sans`, 12px labels on both surfaces; the bare `" / night"` node inherited 16px from a rule-less span; 1850/1850, build clean, visual check pending
- [[2026-09-26 - Admin Module CSS Scoping Fix]] — unscoped admin module CSS leaked app-wide (D-029); leak guard added, 1791/1791 green, manual browser check pending
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
