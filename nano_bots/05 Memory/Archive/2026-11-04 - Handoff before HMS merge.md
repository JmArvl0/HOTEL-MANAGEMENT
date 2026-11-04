# AI Session Handoff

Current execution state. Concise — detail lives in linked session notes.

## Latest: Scope and manual acceptance continuation (2026-11-04, local)

- Executed ready plan tasks; fixed ID-only occupant updates, solo-register editing,
  optional-vendor drafts, PO history visibility and receipt stock status. Two local
  additive migrations `20261104010000`/`20261104020000`; existing work preserved.
- Node22: 2,217 tests, typecheck/build pass; lint 0 errors/3 existing warnings.
  SQL suites pass; clean replay120 and isolated backup upgrade108→120 pass.
  Linked ledger112 and dry run verified: eight pending files, none pushed.
- Personal synthetic browser QA completed for the exercised flows, including
  remaining Housekeeping/merge/access/mobile work, split payments, close and PO receipt.
  See the precise coverage/limits in
  `docs/qa/hotel-scope-integration-and-manual-acceptance-2026-11-04.md`.
- Proposed POS contract written; runtime/outbox awaits partner API/auth/sandbox.
  No production write, deployment or policy activation. Session:
  [[2026-11-04 - Hotel Scope and Manual Acceptance]]. Earlier entries below are history.

## Latest implementation: Occupants, guest controls and housekeeping (2026-11-04 verification)

- User requested implementation of Batches A–E in
  `docs/plans/2026-11-03-occupants-guest-controls-housekeeping.md`: occupant
  roster/age evidence/emergency list, room discrepancies, guest flags/DNR,
  restricted reviewed CRM merge and housekeeping DND/service outcomes.
- Local source, five additive migrations and operations docs are written; no
  production migration, policy activation, real guest merge or deployment.
- Synthetic local browser QA passed Front Desk roster save/check-in, Manager DNR
  override, Front Desk DND, emergency occupancy and room-discrepancy report →
  investigate → resolve. Fixed the roster save payload to whitelist writable
  fields; the focused regression test passes. Housekeeping had no tasks, so its
  task-level outcomes and reporter path could not be exercised in the browser.
- Reviewed merge, Owner/disabled-staff browser access and mobile browser coverage
  remain open. Juan's age group remained `unknown` because staff did not select
  occupant type; the age check does not infer that separate field.
- Clean chronological PostgreSQL 18 replay passed; SQL suites passed 24 backend,
  13 occupant/guest-controls and 27 housekeeping checks. Focused Vitest passed
  157/157; final full suite passed 2,213/2,214. The lone failure is the unrelated
  `lib/change-request-redesign.test.ts` cancellation/change-flow source assertion.
  The follow-up roster regression passed 5/5 under Node 22.22.2; typecheck/build
  passed and touched-file ESLint exited 0 with warnings only. The full suite above
  ran under Node 26.6.0, outside the supported Node 22 range.
- Restored/hosted-order replay remains outstanding. Supabase CLI has no access
  token; local timestamps `20261103170000`–`20261103210000` are
  provisional. Conditional pricing, turndown and lost-property work remains deferred.
- Verification continuation: [[2026-11-04 - Occupants Guest Controls Verification]].
- See [[2026-11-03 - Occupants Guest Controls Housekeeping]]. Existing
  cancellation/folio work remains separate and untouched.

## Latest: Explicit cancellation/no-show folio settlement (2026-11-03, local)

- User approved implementation. Migration `20261103160000` posts named deposit-based
  policy fees, credits unused booking obligations, preserves independent transport,
  derives refund credit and posts approved fee waivers during Accounting execution.
- Customer preview/folio, document snapshots and daily close fee totals updated.
  No historical backfill or new tax rule. Fixed posting-stamp OLD.status access on
  financial adjustments, reproduced through real SQL.
- Linked ledger verified at 112 migrations; dry-run lists only this new file.
  No production writes, db push or deployment. Final Node22 suite 204 files/2213 tests;
  SQL clean/upgrade replay, typecheck and build pass; QA-touched lint 0 errors/4 existing
  warnings. Browser QA complete locally (Guest/Front Desk/Accounting/Manager, mobile
  390px + desktop1366px): closures, refunds, approved fee waiver, statement and daily
  totals verified. Fixed stale rack history, statement original-amount display, zero
  preview copy, Accounting shortcut, unknown-balance labels and keyboard dialog bubbling.
  Report: `docs/qa/cancellation-folio-browser-qa-2026-11-03.md`. Owned QA services stopped;
  hosted configuration unchanged. See [[2026-11-03 - Cancellation Folio Settlement]].

## Earlier: Production cutover complete (2026-11-03)

- Authorized sequence executed: gate → verified backup (`pg_dump
  --role=postgres`) → local restore rehearsal passed (108 migrations/38
  accounts/constraint intact) → ledger recheck → staged prod deploy
  (--skip-domain) → 4 pending migrations applied remotely (ledger now 112, 0
  missing) → vercel promote → gate verified on prod → gate disabled+published.
- Production now serves the new build: `/` and public API 200; auth-guarded
  endpoints return clean 401. Deployment
  dpl_Cou57UhzDNeecuDVcFfXii7TpCPQ on haven-hotel-management-ten.vercel.app.
- Firewall rule "Haven coordinated maintenance 2026-11-03" is disabled (not
  deleted). `.tmp/qa-rollout/pre-cutover.dump` + private logs retained
  (git-ignored); restore DB copies removed. Session:
  [[2026-11-03 - Coordinated Production Cutover]].
- Open follow-ups: optional deletion of gate rule; credential rotation and
  external sandbox tests from prior QA sessions remain open.

## Earlier: QA remediation verified locally (2026-11-03)

- `docs/qa/qa-fixes-2026-11-03.md`; [[2026-11-03 - QA Remediation]]. Recovered8
  remote migrations; hotel files now03130000/140000/150000. Linked dry-run passes
  with four pending files. Missing operating-day RPC confirmed via PGRST202.
- Clean112-file and actual hosted upgrade-order replay pass; SQL23+27+24+13.
  Full203files/2205tests; focused44; typecheck/build pass; touched lint0/0.
- Bundled fonts eliminate build downloads. Retryable operating-day errors, mobile
  drawer/header and Admin lint fixed. Browser390/1366 passes; dummy account
  create/edit/suspend persisted. Accounting activation/assessment works locally.
- Hosted rollout pending: Vercel CLI logged out; user asked to run vercel login.
  No hosted migration/deploy/password change. Secure credential rotation and external
  sandbox tests remain open. Owned QA helpers/data cleaned; hosted config preserved.

## Earlier: Comprehensive QA follow-up (2026-11-03)

- Report: `docs/qa/comprehensive-qa-2026-11-03.md`; session:
  [[2026-11-03 - Comprehensive QA]]. Full tests **203 files / 2203 passed**;
  typecheck passed; focused Admin/mobile 6 tests passed; touched lint 0 errors /
  7 warnings; detector clean for Admin client.
- New local-source mobile drawer fix: fixed off-canvas positioning, state-aware
  accessible menu button, backdrop and Escape. Visual retest pending; browser bridge
  cannot reach the safe loopback-only preview.
- Current Manager preview returned 503 for `/api/staff/operational-date`. Exact RPC
  error not captured; remote migration conflicts are related risk, not proven cause.
- Fresh isolated build stopped at Google Fonts network fetch. No hosted CRUD,
  migration, deployment or password change this pass. QA temporary files/server
  removed; credentials omitted.

## Earlier: Staff walkthrough complete locally; release drift (2026-11-03)

- Real app/NextAuth/API/PostgREST/isolated PG browser walkthrough passed core changed
  staff flows, Manager/Owner oversight and successful prior-day Accounting close.
  Report: docs/qa/staff-walkthrough-2026-11-03.md; [[2026-11-03 - Staff Walkthrough]].
- Fixed rack navigation, non-id pagination, fee-post/readiness refresh, in-house
  remaining-night picker and stale resource response race; final browser retests passed.
- Node22:202 files/2201 tests; typecheck/build pass; lint0errors/11warnings.
  Real SQL backend23+HK27+availability24+operations13; full104-migration replay passed.
  Final build Cl_DYGMoO2ijiYDMSMd6C; candidate manifest regenerated, not deployed.
- Production maintenance was authorized. Vercel is logged out. Final remote dry-run
  FAILED: missing versions20261103070000–20261103120000, plus collisions:
  remote20261103010000=restore_cash_controls; remote20261103030000=guest_request_withdrawal.
  Recover/review actual remote additions and live contracts; preserve concurrent work.
  Never repair ledger or blindly renumber/push. Earlier four-pending dry-run is stale.
- Only hosted changes: normal login activity and explicitly user-authorized Accounting
  password reset with auth_version bump/audit; login verified. No credential in notes.
  No production migration, operational/financial test write, clock activation or deploy.
- Hosted .env.local unchanged. Local test clock used a clearly dated Nov2 fixture;
  close advanced to Nov3 exactly once and preserved Maintenance hold/handover.
- P10 merge/P11 optional non-adoptions unchanged. DND/stock/provider/storage browser
  claims not invented; DND/stock/concurrency have actual SQL coverage.
- Older notes below are historical. Known Issues records the current release blocker.
- Cleanup: QA browser signed out; helpers/test DB/isolated PG stopped/discarded.
  Final app on port3000, PID18484, original hosted config unchanged.

## Latest: Hotel operations implementation plan (2026-11-03)

User requested a plan for all REA findings plus Housekeeping. Created:
`docs/plans/2026-11-03-hotel-operations-and-housekeeping.md`.
- 13 phases / 24 tasks cover I-01–I-10, HK-01–HK-03, the failed-availability
  display observation, conditional features and prior remediation rollout.
- First batch: compatibility/baseline → HK close-out → nightly availability.
  Business-date/close authority and posting policy require an agreed decision
  before schema work; recommendations have not become approved policy.
- Existing HK fixes marked locally done, not duplicated. B-005 remains excluded.
  No implementation, new SQL, deployment or production mutation in planning turn.
- Local links, coverage, whitespace and diff checks pass. Existing source changes
  preserved. See [[2026-11-03 - Hotel Operations Implementation Plan]].

## Latest: Housekeeping integration audit and fixes (2026-11-03)

User suspected missing Housekeeping functions and asked to check all connections.
Existing workflow was present, including all seven relevant hosted RPCs. Six live
tasks were completed; two still awaited inspection; two active HK accounts exist.
- Fixed local Owner suggested-assignment 403 to match SYSTEM.md; explicit worker
  required. Cleaning/inspection stay HK-only; Manager coordination unchanged.
- Shared HK guard rejects disabled sessions. Queue hides another worker's claim,
  start/complete/defer actions and explains ownership; SQL checks retained.
- Verified **195 files / 2120 tests**, **62 targeted tests**, **12 real isolated
  PostgreSQL checks**, typecheck, touched-file lint and production build. First
  build hit sandbox EPERM; retry with filesystem access passed.
- SQL fixtures rolled back and test server stopped. Hosted data untouched; no
  migration/deploy/commit. Browser remains unavailable; no browser E2E claim.
- Report: `docs/qa/housekeeping-integration-2026-11-03.md`; session:
  [[2026-11-03 - Housekeeping Integration Audit]]. Pending remediation rollout
  and hosted configuration below remain unchanged.

## Latest: REA hotel-operations comparison (2026-11-03)

**Analysis complete; recommendations only.** Deliverable:
`docs/rea-open-hotel-pms-analysis.md`; see [[2026-11-03 - REA Hotel PMS Analysis]].
- User's pasted request superseded the earlier investigation; only hotel operations
  were examined. Reference commit `3f6956a54aa9faef44311f9e943ce7d44b6934e3`.
- REA 6.8.0 configured for Codex, existing MCP preserved with verified backup;
  skill v49 installed. Chat tools now callable; no further restart needed.
- Confirmed availability defect: two staggered stays in room 1 make a two-room,
  two-night search return 0 although room 2 is continuously free (expected 1).
  Matching whole-window counting exists in SQL; **documented, not fixed**.
- Seven actual reference-helper assertions pass. Report includes 24 sections,
  38 rules, ERD + 3 state + 6 sequence diagrams and source references. No reference
  UI/API/SQL integration or concurrency verification claimed.
- No app/migration/package/data changes, DB push or deployment. Preserve hosted
  Supabase configuration and pending coordinated remediation rollout below.
- Proposed priorities: nightly inventory, scoped business date/atomic night audit,
  companion identities, handover queue. Retain Haven's stronger atomic operations,
  inspection gates and financial separation. Proposals are not approved decisions.

## Latest: Local backend browser QA (2026-11-03)

**Hosted Supabase restored at user's request; partial browser QA complete.**
Local Next.js now uses the linked hosted project via ignored `.env.local`;
stale Docker database URLs removed. Do not switch it back to local Supabase.
- Brave login/view checks passed for Admin, Manager, Owner, Front Desk, Guest.
  Verified overview, predictive insights, financial/cash views, guest rewards/folios.
- Accounting account is active; supplied password mismatches. No password change.
- Browser tool then reported disabled in Work settings; remaining clicks stopped.
  **43/43 HTTP smoke checks passed**, including role guards, protected reservation
  PATCH, guest ownership, non-extending session reads, catalogue/availability.
- No operational writes/payments executed. Login activity/audit writes are normal.
  New RPC/trigger workflows remain unverified through the browser.
- Docker startup failed earlier; no uninstall/reset/data deletion performed.
- Remote dry-run still lists only the remediation migration; no apply/deploy.
- Remediation source now exists in commit `5d43490`; older no-commit text below
  records the earlier session state.
- Details: `docs/qa/backend-browser-qa-2026-11-03.md` and
  [[2026-11-03 - Backend Browser QA]].

## Latest: Backend remediation (2026-11-02)

**All 23 authorized source fixes implemented and verified locally.** User explicitly
excluded B-005 (PayMongo envelope parsing); parser/signature/webhook code unchanged.
- Results: `docs/qa/backend-remediation-2026-11-02.md`; original audit remains linked.
- Gates: **194 files / 2106 Vitest tests**, **23 real PostgreSQL regression cases**,
  typecheck, touched-backend eslint and production build pass. Corrupt generated
  Next types regenerated; build TypeScript checking restored.
- Fixed identity/ownership, committed OTP counters, immutable session clock, recovery
  lifecycle/proof binding, booking rate/room gates, finalized deposit proof, loyalty,
  transactional stock, complete/error-aware financial reads, notification awaiting,
  atomic analytics. Cash open/collect/close/reopen verified; route bypass disabled.
- Linked CLI reached remote after `.env.local`'s stopped local stack failed: all 100
  old ledger versions match; 15 live functions inspected; replaced RPC bodies match;
  the live-only Housekeeping role restriction is preserved.
- New migration `20261102010000_backend_audit_remediation.sql` passes clean local
  replay; remote dry-run lists only it. **Not applied; app not deployed; no commit.**
  Coordinated app/DB rollout is required: old JS consumption + new DB trigger would
  double-decrement stock; OTP/proof/analytics contracts also change together.
- Existing unfinished frontend edits preserved. Do not deploy the whole checkout
  without accounting for them. Local PostgreSQL test server stopped at close-out.
- `node docs/qa/backend-audit-probes.mjs --session-only` passes; full probe still
  reports the two deliberately excluded webhook-envelope failures.

See [[2026-11-02 - Backend Remediation]], [[2026-11-02 - Backend Audit]], [[KI-016]].

## Current task (Unified profile popover, 2026-10-21)

COMPLETE locally; browser QA pending, no commit.
- Admin/Owner/Manager headers now use `components/ui/ProfilePopover.tsx` +
  `profile-popover.css`: anchored under the trigger, outside-click/Escape
  close with focus return, keyboard nav + focus trap, sound toggle in place,
  Settings modal, single Sign Out. ≤480px becomes a bottom sheet.
- Guest shell intentionally untouched (its `.customer-account-popover`
  contract tests stay green).
- Legacy `.app-shell .profile-popover` overrides deleted from
  `app/staff-theme.css`; new tests: 7 behaviour + a wiring contract.
- Gates: typecheck 0 · **189 files / 2093 tests** · build 88 routes · eslint
  0 errors. Browser QA checklist in [[KI-015]].

See [[2026-10-21 - Unified Profile Popover]].

## Previous: Frontend audit Phase 2: P3 hygiene (2026-10-18)

COMPLETE and committed (`c289745` Phase 1, `d27ae8b`/`f4d236f`/`678cad8`
hygiene batches, `548b80c` encoding fix). Gates: **2070/2070** tests, build
88 routes, typecheck 0, lint 0 errors/91 warnings.
- B-H1: forest→ink + real `--color-primary-hover`; `--tail-*`→`--st-*` (138
  refs); 5 losing `font:` shorthands stripped; globals dense base folded +
  cascade-dead mobile page-title rules removed; staff-theme family decoder.
- B-H2: payments status pills → `StatusBadge` (label passthrough preserves
  guest copy; `rejected`/`verified` tone coverage added).
- B-H3: DESIGN.md §4a = 6-step breakpoint scale, opportunistic migration.
- B-H4: `TailAdminPageHeader` GONE — canonical `PageHeader` only (pin test).
- **HUI-005 wall removal is GATED on manual browser QA** — checklist at
  `docs/qa/browser-qa-checklist.md` (A–F), including Phase-1 items (cash
  close cycle per role, mobile drawer, 9px layout shift) and the Phase-2
  spot checks (D1 hover, D2 rename parity, D4 payment pills).
- **Incident fixed**: PowerShell text round-trip in B-H1 double-encoded UTF-8
  in 3 auth forms — caught by `lib/encoding-guard.test.ts`; all 7 files
  restored + changes re-applied via Node (`548b80c`). Rule of thumb now:
  never bulk-edit UTF-8 source with `Get-Content -Raw`/`Set-Content`.

See [[2026-10-18 - Frontend Audit Phase 2 P3 Hygiene]] and
[[2026-10-18 - Frontend Audit Remediation Phase 1]].

## Previous: Frontend remediation Phase 1 (2026-10-18)

COMPLETE — audit → approved plan → executed, all gates green:
- Source: `docs/qa/frontend-ui-audit.md` (20 findings); plan at
  `.opencode/plans/frontend-remediation-phase2-plan.md`; outcomes recorded in
  the audit report §11 + `docs/qa/important-review.md` (HUI-005 !important walls).
- **HUI-011 (P1)**: cash-shift Close RE-ENABLED ([[D-032]]); flag + 409 backstop
  + banner deleted; contract suites now pin close, owner-only sign-out block, RPC map.
- **HUI-001/006**: dead `Sidebar`/`NavGroup` (zero consumers) deleted along with the
  Modal.css Navigation section and unused `AppShell`/`saas-shell` (tsx+css+test+import).
  globals.css `.sidebar` block kept — it is the LIVE mobile-drawer base.
- **HUI-003**: sub-9px font sizes → 9px floor by token substitution (staff-theme 52,
  guest-booking 14, no pinned-test collisions).
- **HUI-007**: DESIGN.md §1/§2 + ui-primitives comments de-staled to loaded truth.
- **HUI-010**: PageHeader contract +1 (shared-Breadcrumb); inline page-title ×30
  migration deferred — no zero-risk target; `TailAdminPageHeader` must be
  consolidated in a browser-verified pass.
- Gates after: 185 files / **2 069 tests** passing, build exit 0, lint 0 errors /
  91 warnings, typecheck exit 0. Trees: no commits, user files untouched.
- Open (KI-014): browser QA (close cycle per role, mobile drawer, 9px layout shift,
  account dialog parity).

See [[2026-10-18 - Frontend Audit Remediation Phase 1]].

## Previous: haven-qa-testing full QA run (2026-10-18)

COMPLETE — structured QA per `.opencode/skills/haven-qa-testing/SKILL.md`:
- Gates: typecheck 0 · lint 0 errors/97 warnings · **vitest 186 files/2069** ·
  build clean.
- Role matrix **8/8 PASS** (live HTTP per role; cross-role 403/401; empty-body
  writes 400/409). Owner verified live as `arevalojohnmichael24@gmail.com` →
  **HQA-002 closed: test-credential correction** (not a defect);
  `owner@haven.test` = inactive governance row (review in admin, P3).
- **HQA-001 FIXED**: `vitest.config.mts` exclude += `".opencode/**"`
  (vendored `.opencode/node_modules/zod` suites no longer swept in).
- Deep lifecycle verified end-to-end on real data (disposable guest test):
  hold → proof upload → confirm → deposit verify (30% = 1740 exact) →
  assign RM-102 → identity → balance payment → folio paid 5800/balance 0;
  check-in/charge/checkout gates correctly policy-blocked; test reservation
  RSV-27898D85 **cancelled terminal**, inventory released, residue marked
  (`QA-TEST-DELETE`).
- Open: browser/responsive QA incl. 390px; Gemini/QR visual round-trips.
- Vault close-out user-authorized. See [[2026-10-18 - Full Role QA and
  Lifecycle Trace]].

## Previous: Worktree review + push (2026-10-16)

COMPLETE — pushed `02de4de..71d41c3` to `origin/main`, branch in sync:
- Reviewed 13 leftover worktree files: all CSS-consolidation follow-ups,
  committed pathspec-scoped as `71d41c3` (+25/−18). Gates fresh (2069/2069).
- Vault notes left uncommitted per convention. No rebase/amend/force.
- Open: browser QA incl. 390px; ledger/live DB unverified.

See [[2026-10-16 - Worktree Review Third Commit and Push]].

## Previous: Staff CSS consolidation (2026-10-16)

COMPLETE and committed as `b39e984` (9 files, +2922/−4873, not pushed):
- Pre-commit gates fresh: typecheck 0, lint clean, 2069/2069 tests, 88-route
  build. Scoped via pathspec + `git rm`; cached-stat verified (no repeat of
  the `6904f46` incident).
- Review: classes/keyframes/vars fully carried, scoping parity, one flag —
  `@media` 87 → 322 blocks needs browser QA.
- Open: push (2 commits), browser QA incl. 390px, OTP dash confirm,
  ledger/live unverified.

See [[2026-10-16 - Staff CSS Consolidation Commit]].

## Previous: Modal lint fix + 7 contract tests (2026-10-16)

COMPLETE and committed as `5f105c2` (7 files, +27/−38, not pushed):
- `components/ui/Modal.tsx`: render-phase `hostRef` IIFE removed, portal uses
  effect-computed `shellClass`. Lint 0 errors (was 1), typecheck clean.
- 6 contract test files relaxed to whitespace-tolerant matches (behaviors
  verified present first). Full suite **2069/2069 green** (was 2062+7 failed).
- One incident recovered: first commit swept pre-staged CSS deletions;
  reset and re-committed pathspec-scoped, no data loss.
- Open: staff CSS rewrite still half-applied in worktree; OTP label `-` vs
  `—` needs product confirm; no browser QA; ledger/live unverified.

See [[2026-10-16 - Modal Lint and Contract Test Fixes]].

## Parallel task (Landing Featured Stays Scroll Pane, 2026-10-06)

The full landing SaaS redesign was rolled back by the user ("instead add a scroll pane"); `landing.css` is back at HEAD plus this change only.
- `components/landing/booking-intent.tsx` `FeaturedStays`: shows **all** active room types (no `slice(0, 4)`) in a horizontal snap track; `.coast-room-grid` remains the GSAP reveal unit. Prev/next buttons step one card; a progress rail mirrors scroll; controls hide when nothing overflows; right-edge fade hidden at end.
- `app/(landing-page)/landing.css`: `.coast-room-grid` uses `grid-auto-flow:column` + `--room-cols` (4 / 2.2 @900px / 1.12 @600px peek), `scroll-snap-type:x mandatory`, hidden scrollbar; new `.coast-room-pane/-controls/-rail/-nav` block. Pin regexes in `landing-hero-structure.test.tsx` still match.
- Verified: typecheck clean, eslint clean, landing + fleetops-surfaces + room-catalog vitest 54/54. Browser QA not yet run (manual).

## Current task (Guest Rewards & Loyalty Module Redesign, 2026-10-06)

COMPLETE locally, all gates green:
1. Redesigned the guest account Rewards module (`/account/loyalty`) with UI/UX Pro Max and modern SaaS (TailAdmin / Finwise) excellence:
   - **Executive Header (`app/(booking)/(customer)/account/loyalty/page.tsx`)**: Replaced plain header with `customer-page-title.split` featuring balanced typography, amber pill eyebrow, and high-contrast CTA button (`Book stay to earn`).
   - **Membership KPI Cards (`.loyalty-kpi-grid`)**:
     - *Active Tier & Balance*: Executive card styling with subtle luxury gradient, crown/award icon badge, bold points balance, and multiplier tag (`1×/1.25×/1.5× earning`).
     - *Lifetime Qualifying Spend (`.loyalty-kpi-lifetime`)*: Dedicated 4th executive KPI card highlighting total verified folio spend (`₱75,400.00`) establishing tier status, featuring gold `Coins` token with warm glow, "Tier Qualifying" pill badge, large tabular currency numerals, and explanatory copy.
     - *Tier Progress*: Clear distance to next tier (`₱10,000.00 to Gold`), percentage pill badge (`50% to Gold`), and glowing animated progress bar.
     - *Purchasing Power*: Direct translation of points to Philippine Pesos (`₱150.00`), instant redemption indicator (`1 pt = ₱1.00`), and stay discount explanation.
   - **Interactive Tier Privileges Matrix (`.loyalty-comparison`)**:
     - Distinct luxury cards for Silver, Gold, and Platinum with spend range pills, multiplier badges, and interactive selection.
     - *Executive Lifetime Spend Header Badge (`.loyalty-lifetime-spend`)*: Elevated from a dim gray footnote into a prominent, noticeable executive status badge with gold gradient styling, glowing coin token, uppercase tracking label, bold tabular currency, and active tier indicator pill (`Gold unlocked`).
     - Added an itemized privileges checklist for each tier (`.loyalty-tier-perks-list`) showcasing key member perks.
     - Glassmorphic tier detail banner (`.loyalty-tier-detail`) with active status indicator and unlock milestones.
   - **Program Guide Strip (`.loyalty-how-it-works`)**:
     - Added 3-step guide explaining how Haven Rewards works: Stay & Earn (01), Ascend Tiers (02), and Redeem 1:1 (03).
   - **Transaction Ledger (`.loyalty-ledger-card`)**:
     - Modern SaaS table design with monospace reference pill badges, status activity pills (`Earned`, `Redeemed`, `Adjusted`), and green positive point values (`+150`).
     - Guided empty state with next action link (`Explore rooms to start earning`).
   - **Styling & Tokens (`app/customer-portal.css`)**: Overhauled using FleetOps tokens (`var(--cp-*)`, `var(--st-*)`, `var(--cp-gold)`, `color-mix(...)`) with 0 legacy coastal hexes and responsive 4-column desktop / 2-column tablet grid.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `vitest`: targeted loyalty and customer shell suites passed (22/22 tests).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

See [[2026-10-06 - Guest Rewards and Loyalty Module Redesign]].

## Previous: Unified Dropdown Styling & Self-Describing Filter Options (2026-10-06)


## Previous: Classic Guest AI Concierge Restoration & UI/UX Pro Max Polish (2026-10-06)

COMPLETE locally, all gates green:
1. Restored the classic aesthetic and structural layout of the floating chatbot per the user's uploaded reference screenshot, elevating each element with UI/UX Pro Max taste:
   - **Floating Trigger Button**: Restored the classic 56px circular floating action button (`border-radius: 50%`) with centered icons (`Sparkles` when closed, `X` when open). Enhanced with multi-stage drop shadows, smooth micro-scale hover/active feedback, and accessible focus outlines.
   - **Header**: Single-line header featuring an emerald `Sparkles` icon, bold `Ask HAVEN` title, and a refined 32px square-rounded close button with subtle border and smooth hover state.
   - **Chat Body & Thread**: Restored the clean initial prompt (`"Ask about check-in times, amenities, Wi-Fi, or nearby places."`) and pure flex layout preventing nested scrollbars.
   - **Prompt Chips Rail**: Horizontal rail of rounded pill chips with micro-lift hover interactions and subtle background tints.
   - **Input & Send Controls**: Resolved the broken layout where `<input>` and `<button>` fell back to unstyled browser defaults. Crafted a modern flex row with 40px height, 10px rounded corners, smooth focus rings (`0 0 0 3px rgba(59, 130, 246, 0.15)`), and high-contrast send button.
   - **Footer Footnote**: Clean, centered disclosure text with muted tone and proper line height.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `eslint`: clean (0 errors).
   - `vitest`: targeted suites passed (17/17 tests).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Previous: Global Root Modal Architecture & Viewport Backdrop Dimming Fix (2026-10-06)

COMPLETE locally, all gates green:
1. Standardized modal viewing across the entire application globally so all modals follow strict modal format:
   - **Full-Viewport Backdrop Dimming**: Fixed backdrop dimming to cover the entire window (100vw, 100vh), completely overlaying headers (`.customer-content-header`, `.app-header`), sidebars/navbars (`.customer-sidebar`, `.sidebar`), and content without getting trapped inside inner containers or ancestor stacking contexts.
   - **Root Portaling by Default**: In `components/ui/Modal.tsx`, changed `portal = true` as standard default for `Modal`, `ConfirmDialog`, `PromptDialog`, and `SelectDialog`. In `components/ui/FormDialog.tsx`, propagated `portal = true` to `FormDialog`, `MultiStepFormDialog`, `RoomSelectDialog`, and `ChecklistDialog`. In `components/ui/command-palette.tsx`, portaled via `createPortal(..., document.body)`.
   - **Complete Page Scroll Lock**: Implemented reference-counted scroll locking (`activeModalCount`, `lockBodyScroll`, `unlockBodyScroll`) in `components/ui/Modal.tsx` that locks both `document.body` and `document.documentElement` (`overflow: hidden !important`), adds `haven-modal-open` CSS class, and prevents stacked modals from prematurely unlocking scrolling.
   - **Keyboard Focus Trapping**: Enhanced `trapFocus` so Tab and Shift+Tab wrap around cleanly between first and last focusable elements in the modal dialog, preventing focus leakage to background elements.
   - **Theme & Shell Cascading**: Wrapped portaled modal content in `<div className="haven-modal-portal ...">` with `display: contents;` and auto-detected `.customer-shell` / `.app-shell` classes so scoped styles and theme rules continue to cascade cleanly.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `vitest`: 186 test files passed, 2,068 tests passed (100% green).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

See [[2026-10-06 - Global Root Modal Architecture and Backdrop Fix]].

## Previous: Cancelled Stay Refund Explanation & Modal Feature (2026-10-06)

## Previous: Guest AI Concierge Modern SaaS Design Overhaul (2026-10-06)

COMPLETE locally, all gates green:
1. Elevated guest account chatbot (`ConciergeFloat` & `GuestAiConciergePanel`) to modern SaaS (TailAdmin/Finwise) aesthetics:
   - **Floating Launcher (`components/customer/concierge-float.tsx`)**: Modern SaaS pill with pulsing green live status beacon (`.concierge-live-beacon`), refined icon badge, and backdrop blur.
   - **Elevated Header**: Dual-line header with brand avatar (Sparkles), "Ask HAVEN" title, "AI Host" pill badge, live "Virtual Concierge · Online" status dot, and sleek close button.
   - **Welcome Hero Card (`components/customer/guest-ai-concierge-panel.tsx`)**: Replaced bare empty text with an elevated welcome hero card featuring sparkles icon badge and greeting while preserving `.concierge-empty` for test contracts.
   - **Message Bubbles & Markdown**: Assistant turns feature elevated surface cards with crisp borders and clean typography; user turns feature modern SaaS gradient/ink fills with high-contrast white text.
   - **Action Draft Cards**: Highlighted draft requests with "Action Draft" tags, clear details, and primary CTA buttons ("Confirm Request").
   - **Typing Indicator**: 3-dot bouncing wave animation alongside backwards-compatible pulse bars.
   - **Input Box**: Seamless container with focus-within ring and dedicated send button with icon.
   - **Full Flexbox Geometry in `app/customer-portal.css`**: Removed fixed 300px thread height cutoff; now uses flexbox column layout with zero nested scrollbars. Strict FleetOps neutrals (`#111827`, `#d1d5db`) maintained.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `eslint`: clean on touched files (0 errors).
   - `vitest`: 184 test files passed, 2,052 tests passed.
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

See [[2026-10-06 - Guest AI Concierge Modern SaaS Design Overhaul]].

## Previous: Account Dropdown Popover Preservation & Dedicated "My Profile" Modal View (2026-10-06)

COMPLETE locally, all gates green:
1. Restored native header dropdown popovers across all account triggers:
   - **Customer Shell (`components/customer/customer-shell.tsx`)**: Header account button toggles an undimmed dropdown popover (`.customer-account-popover`) directly beneath the trigger button (`Carl Garcia` / `CG`). Removed extra `.customer-popover-gap` container to ensure tight, reliable anchoring.
   - **Dropdown Items**:
     - User header (`{user.name}`, `{user.email}`)
     - `<a class="haven-account-row-item" href="/account/profile">` for "My Profile"
     - `<button class="haven-account-row-item">` for "Account security"
     - `<button class="haven-account-row-item haven-account-row-danger">` for "Sign Out"
   - **"My Profile" Modal Viewing**: Clicking "My Profile" inside the dropdown closes the dropdown and opens the dedicated `CustomerProfileModal` with full-viewport dimmed backdrop (`portal={true}` via Haven `<Modal headerVariant="branded">`), luxury typography, hero identity card with verified guest badge, live editable fields (Name, Mobile, Nationality, Address), save via `PATCH /api/account/profile`, and direct button to Account Security.
   - **Staff / Manager, Admin, Owner Dashboards**: Reverted header account menus from full modals back to native dropdown popovers (`.profile-popover` within `.profile-menu-wrap`) with outside-click handlers and Settings modal trigger intact.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `vitest`: 184 test files passed, 2,048 tests passed (100% green).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Previous: Global Account Identity Modal Standardization (2026-10-06)

COMPLETE locally, all gates green:
1. Standardized and rooted the account identity popover (`.customer-account-popover` / `.profile-popover`) into a canonical modal dialog (`HavenAccountModal`) with full background dimming (`dialog-backdrop`), full accessibility (`role="dialog"`, `aria-modal="true"`, focus trap, Escape key dismiss, backdrop click dismiss, return focus to trigger button):
   - **Canonical Component (`components/ui/haven-account-modal.tsx`)**: Wraps Haven `<Modal size="sm" headerVariant="branded">`. Displays luxury hero identity card (avatar initials, user name, email, role badge), action items list (`My Profile` link, `Account security` button, `Settings` button, `Notification sound` toggle, `Sign Out` button with danger accent).
   - **Dedicated CSS (`components/ui/haven-account-modal.css`)**: Deep dimmed backdrop tint (`rgba(4, 10, 18, 0.65)` dark / `rgba(15, 23, 42, 0.48)` light) with 4px backdrop blur, TailAdmin 16px radius, hover transitions, and popover class overrides. Loaded globally in `app/layout.tsx`. Exported via `components/ui/index.ts`.
   - **Globally Rooted Across All 4 Account Surfaces**:
     - Customer Shell (`components/customer/customer-shell.tsx`)
     - Manager & Staff Dashboard (`components/manager/manager-dashboard-client.tsx`)
     - Admin Dashboard (`components/admin/admin-dashboard-client.tsx`)
     - Owner Dashboard (`components/owner/owner-dashboard-client.tsx`)
     - All instances mounted outside `<header>` to prevent `backdrop-filter` clipping and ensure full-screen overlay backdrop coverage.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `vitest`: 183 test files passed, 2,041 tests passed (100% green, including new `components/ui/haven-account-modal.test.tsx`).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

See [[2026-10-06 - Global Account Identity Modal Standardization]].

## Previous: Notification Popover Color & Hierarchy Standardization (2026-10-06)

COMPLETE locally, all gates green:
1. Standardized color coding, visual hierarchy, and contrast across the notification popover (`.haven-notification-popover`):
   - **Semantic Severity Color Harmony**: Coordinated icon wash, icon glyph, glowing unread dot, and severity badge across the 4 canonical severities (`critical`, `attention`, `success`, `info`). Critical items now consistently present red icons and dots instead of conflicting green ones; Attention items present amber; Success presents emerald; Info presents blue.
   - **Theme-Aware Unread Rows**: Replaced hardcoded `#f3f3f3` white-patch background with theme-aware `rgba(255, 255, 255, 0.04)` in dark mode and clean `#f8fafc` in light mode.
   - **Action Controls**: Replaced arbitrary green "Mark all as read" and "View all" buttons with modern Haven SaaS primary blue accents (`#60a5fa` dark / `#2563eb` light).
   - **Group Counters**: Styled unread count pill with subtle blue accent for immediate recognition.
   - **Class Hook**: Added `is-sev-${severity}` to `.cnr` in `components/ui/haven-notifications.tsx`.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `eslint`: clean on touched files (0 errors).
   - `vitest`: 182 test files passed, 2,036 tests passed (100% green).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

## Previous: Room Title Typography System Check & Standardization (2026-10-06)

COMPLETE locally, all gates green:
1. Conducted an exhaustive system check across customer, booking, and staff surfaces for room type title headings.
2. Standardized all room title display headings to the dedicated luxury editorial serif style (`var(--font-display, Georgia, serif)`, Playfair Display) with `font-weight: 500; letter-spacing: -0.025em; text-wrap: balance;`:
   - **Customer Overview Stay Hero (`/account`)**: Changed `.customer-stay-copy h2` in `app/customer-portal.css` from `var(--font-sans)` to `var(--font-display, Georgia, serif) !important; font-weight: 500;` and added `.room-title` in `app/(booking)/(customer)/account/page.tsx`.
   - **My Reservations (`/my-reservations`)**: Added `.room-title` to `<h3>{reservation.room_type}</h3>` in `app/(booking)/(customer)/my-reservations/page.tsx` and protected `.reservation-card-copy h3` and `.customer-reservation-card h3` under `var(--font-display)`.
   - **Reservation Details (`/my-reservations/[id]`)**: Added `.room-title` to `<h1>{data.roomType}</h1>` in `components/customer/reservation-detail-view.tsx` and protected `.customer-reservation-heading h1` under `var(--font-display)`.
   - **Payments & Folio Cards (`/account/payments`)**: Added `.room-title` to `<h2>{record.room_type}</h2>` in `app/(booking)/(customer)/account/payments/page.tsx` and protected `.customer-financial-list article header h2` under `var(--font-display)`.
   - **Booking Stay Summary**: Added `.room-title` to `<h2>{roomType}</h2>` in `components/booking/booking-stay-summary.tsx` and protected `.review-stay-body h2`.
   - **Search & Landing**: Added `.room-title` to `#search-title` in `app/(booking)/booking/search/page.tsx` and `<h3>` in `components/landing/booking-intent.tsx`.
   - **Stylesheets**: Updated `app/customer-portal.css`, `app/haven-tailadmin-theme.css`, `app/guest-booking.css`, and `app/(booking)/booking/search/search.css` to exempt all room titles from the SaaS sans-serif rule and preserve `var(--font-display)`.
3. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `eslint`: clean on all 7 touched files (0 errors).
   - `vitest`: 182 test files passed, 2,036 tests passed (100% green).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

See [[2026-10-06 - TailAdmin Haven UI Standardization]].

## Previous: TailAdmin HAVEN UI Standardization (2026-10-06)

COMPLETE locally, all gates green:
1. Established ONE cohesive HAVEN SaaS Design System using TailAdmin Next.js (`TailAdmin/free-nextjs-admin-dashboard`) as the structural & component implementation reference:
   - **Preserved Brand Identity:** Maintained HAVEN brand logo, HAVEN blue (`#1d4ed8`/`#1e3a8a`), HAVEN red (`#dc2626`/`#ef4444`), warm hospitality gold (`#f59e0b`), Inter typography, and hotel branding (never generic TailAdmin branding).
   - **Zero Backend Alterations:** 100% preservation of Supabase/Postgres, migrations, API routes, NextAuth, RBAC, reservation/accounting/room availability logic, Front Desk/Housekeeping/Maintenance workflows, reports, and Haven AI.
   - **Global Theme Engine (`app/haven-tailadmin-theme.css`):** Comprehensive design tokens for Light and Dark modes; 5 modern elevation shadows; 7 geometry radii; standardized layouts for Sidebar (280px / 80px rail, squircle brand mark, accordion groups, active indicators), Header (70px sticky, search command button with `⌘K`, notification bell, profile menu), Page Headers & Breadcrumbs, Component Cards, Stat Cards (`EcommerceMetrics` pattern), Data Tables (`BasicTableOne` format), Form Controls, Status Badges (10%-tint soft pills with pulse), Modals, Pagination, and Skeletons.
   - **Component Suite (`components/ui/tailadmin-haven.tsx` & `components/ui/index.ts`):** Created and exported `ComponentCard`, `StatCard`, `TailAdminPageHeader`, `TailAdminButton`, `TailAdminBadge`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`, `TailAdminInput`, `TailAdminSelect`, `TailAdminTabs`, `TailAdminAlert`, `TailAdminEmptyState`, `TailAdminSkeleton`, and `TailAdminPagination`.
   - **Visual Template Showcase (`components/manager/haven-tailadmin-visual-template.tsx`):** Interactive demonstration covering all components (Operations Overview with KPI cards & Recharts area chart, Reservations Table with filters & pagination, Form Controls & Modals, Badges & Buttons).
   - **Unified Across All 14 Modules:** Mapped existing module classes across Dashboard, Reservations, Rooms, Guests, Front Desk, Housekeeping, Maintenance, Accounting, Reports, Staff, Hotel Policies, Catalog, System Health, and Settings directly into the TailAdmin design system tokens.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `vitest`: 182 test files passed, 2,036 tests passed (100% green).
   - `npm run build`: clean (all 88 routes compiled with Turbopack).

See [[2026-10-06 - TailAdmin Haven UI Standardization]].

## Previous: Global Notification Button and Icon Format Standardization (2026-10-05)

COMPLETE locally, all gates green:
1. Standardized and rooted the notification button (`.haven-notification-bell`), its icon, and unread badge across all roles and accounts in HAVEN (Customer, Staff/Manager, Admin, Owner):
   - **Button Geometry & Alignment:** Standardized to `38px` × `38px` (`min-width: 38px; min-height: 38px; flex: 0 0 38px;`), `border-radius: 10px;` (matches modern SaaS 10px squircle format of `.saas-header-search-btn` and theme toggle), `display: inline-flex; align-items: center; justify-content: center; line-height: 0; box-sizing: border-box; overflow: visible;`.
   - **Absolute Optical Icon Centering & Animation:** Styled `.haven-notification-bell .haven-bell-icon`, `.haven-notification-bell svg.lucide-bell`, and `.haven-notification-bell svg` with `position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: 18px !important; height: 18px !important; margin: 0 !important; padding: 0 !important; pointer-events: none !important; transform-origin: 50% 15% !important; transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.18s ease !important;`. Added subtle 14-degree bell chime rotation on hover (`transform: translate(-50%, -50%) rotate(14deg) !important;`). Absolute centering decouples the bell icon from flex sibling flow or badge presence (0, 3, or 99+), guaranteeing mathematical dead-center alignment at (19px, 19px) inside the 38px box.
   - **Rooted Badge Format:** Rooted `.haven-notification-badge`, `.customer-bell-badge`, and `.haven-notification-bell .nav-badge` to `position: absolute !important; top: -4px !important; right: -4px !important; z-index: 4 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 18px !important; height: 18px !important; padding: 0 4px !important; border-radius: 999px !important; background: #ef4444 !important; color: #ffffff !important; font-size: 9.5px !important; font-weight: 800 !important; font-variant-numeric: tabular-nums !important; border: 2px solid var(--cp-panel, #161d27) !important; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.45) !important;`.
   - **Fixed Dot Collision:** Excluded badges from `.icon-button i` dot styling in `app/globals.css`, resolving the visual glitch where a 7px dot crushed the unread counter and bell icon.
   - **Light Theme Support:** Unified crisp `#ffffff` background, `#d1d5db` border, `#5b6472` icon ink, and white border badge cutout across dark and light modes.
   - **Harmonized Shells:** Synchronized `guest-booking.css`, `customer-portal.css`, `manager-dashboard-theme.css`, `staff-ops-theme.css`, and `globals.css`.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `npx vitest run`: targeted notification suites 100% green (42/42 tests).
   - `npm run build`: clean (88/88 routes compiled).

See [[2026-10-05 - Global Notification Button and Icon Format Standardization]].

## Previous: Find a Room Availability Indicator Redesign (2026-10-05)

## Previous: Global SaaS Header Search and Command Palette Standardization (2026-10-05)

COMPLETE locally, all gates green:
1. Standardized and elevated the SaaS header search button (`.saas-header-search-btn`) across all accounts in HAVEN (Customer, Staff/Manager, Admin, Owner):
   - Redesigned search bar into a prominent 250px–280px wide toolbar command control (38px height, 9px radius, subtle interior spacing and alignment).
   - Styled pinned `.saas-kbd` keyboard shortcut pill (`⌘K`) with high-contrast badge geometry.
   - Refined dark theme styling (`rgba(22, 29, 39, 0.75)` surface, `#2a3442` border, subtle blur, blue glow on hover) and light theme styling (crisp `#ffffff` / `#f9fafb` gradient, `#d1d5db` border, subtle elevation shadow on hover).
   - Enhanced `.saas-cmd-dialog` geometry: widened modal max-width from 580px to 680px (+100px), expanded `.saas-cmd-search-wrap` padding to 18px 24px (+44% vertical room) with 20px search icon and 16px input, expanded `.saas-cmd-footer` padding to 14px 24px (+40% vertical room) with 18px key gaps and 10.5px kbd pills, added 34px tactile icon boxes to items, and expanded list max-height to 420px.
   - Added responsive breakpoints: 200px width at `<=1024px`, collapses to a square 38px icon button at `<=768px` so headers never overflow on mobile.
2. Globally loaded `components/ui/command-palette.css` in root `app/layout.tsx`.
3. Standardized across all 4 account tiers with active `CommandPalette` (`Cmd+K` / `Ctrl+K`):
   - Customer Shell (`components/customer/customer-shell.tsx`)
   - Manager Dashboard (`components/manager/manager-dashboard-client.tsx`)
   - Admin Dashboard (`components/admin/admin-dashboard-client.tsx`)
   - Owner Dashboard (`components/owner/owner-dashboard-client.tsx`)
4. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `npm run build`: clean (all 88 routes compiled).
   - `npx vitest run`: targeted test suites 100% green (`header-status`, `owner-dashboard-layout`, `fleetops-surfaces`, `command-palette`, `lib/qr/tokens`).

See [[2026-10-05 - Global SaaS Header Search and Command Palette]].

## Previous: Cross-Role Modern SaaS Page Header Standardization (2026-10-05)

COMPLETE locally, all gates green:
1. Standardized page header/title across all roles and modules (Staff, Manager, Front Desk, Housekeeping, Maintenance, Accounting, Admin, Owner, and Guest) to match the thin, high-efficiency modern SaaS toolbar format established in `section.customer-page-title`:
   - Replaced legacy 108px–112px heights with compact `min-height: 0`, 12px 20px padding, 16px bottom margin, 12px border radius.
   - Removed legacy 250px decorative circles (`::after`) and vertical accent bars (`::before`).
   - Standardized typography: title `h1` at `clamp(17px, 1.8vw, 21px)` (700 weight, -0.02em letter spacing, 1.25 line height), subtitle `p` at `12px` (1.45 line height, max-width 78ch), amber pill eyebrow (`9.5px`, 750 weight, 0.06em uppercase), and compact 34px buttons (`border-radius: 8px`).
   - Dark theme: `linear-gradient(135deg, #161d27 0%, #111827 100%)`, `#2a3442` border, `#ffffff` title, `#93a0b4` subtitle, `#f59e0b` pill.
   - Light theme: `linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)`, `#d1d5db` border, `#111827` title, `#5b6472` subtitle, `#b45309` pill.
   - Preserved critical functional behavior: `.page-title:has(.new-reservation-menu)` `overflow: visible; z-index: 100`.
   - Updated across: `staff-ops-theme.css`, `manager-dashboard-theme.css` (including `.insights-title`, `.haven-ai-hero`, `.admin-overview-title`, and `.workspace-body .page-title`), `customer-portal.css`, and `guest-booking.css`.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `npm run build`: clean (all 88 routes compiled and static pages generated).
   - `npx vitest run`: targeted test suites 100% green (111/111 passing).

See [[2026-10-05 - Cross-Role Modern SaaS Page Header Standardization]].

## Previous: Thin Page Title Container (2026-10-04)

COMPLETE locally, all gates green:
1. Streamlined `section.customer-page-title.split` and `.customer-page-title` across all customer modules into a thin, compact modern SaaS toolbar:
   - Shaved vertical padding from 26px down to 12px; removed forced `min-height: 120px` → `0`.
   - Shaved bottom margin from 30px down to 16px; reduced `.customer-shell .customer-content` top gap from 38px down to 22px.
   - Refined typography scale: `h1` reduced from 28px–42px down to crisp `17px–21px` (`clamp(17px, 1.8vw, 21px)`), eyebrow to `9.5px`, subtitle to `12px` (`line-height: 1.45`), buttons to `min-height: 34px`.
   - Vertically centered `.split` layout; hidden the oversized `::after` decorative circle.
   - Total vertical space reclaimed: ~120px–140px of screen real estate.
2. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `npm run build`: clean (88/88 routes compiled).
   - `npm test`: **182/182 test files passed, 2,034/2,034 tests passed (100% green)**.

See [[2026-10-04 - Thin Page Title Container]].

## Previous: profile Server-Component context crash (2026-10-04)

FIXED locally: every guest clicking My Profile crashed `/account/profile` with `React Context is unavailable in Server Components` — the async server page directly imported `SessionProvider` from `next-auth/react` (no `"use client"` in that package). New `ProfileWithSession` client export in `components/account/account-forms.tsx` owns the provider; the page is pure server again; `client-fetch-resilience.test.ts` now pins the boundary instead of the bug.

See [[2026-10-04 - Profile Server Context Fix]].

## Previous: Guest Portal Modern SaaS UX Overhaul (2026-10-04)

COMPLETE locally, all gates green:
1. Finwise-inspired SaaS modernization across the entire Customer Account Portal and all its modules:
   - Elevated root tokens in `app/customer-portal.css` with Finwise elevation shadows (`--cp-shadow`, `--cp-shadow-hover`) and FleetOps neutral color scales (`#111827`, `#d1d5db`, `#f3f3f3`, `#ffffff`).
   - Redesigned `.theme-light .customer-shell .customer-page-title` with crisp white card surface, hairline slate border, amber pill eyebrow, balanced title typography, and high-contrast purpose-driven buttons (eliminating the legacy dark-box-in-light-mode appearance).
   - Overhauled `.customer-stay-hero` with a 240px wide aspect-ratio room thumbnail, subtle scale on hover, glass status badge cluster, 26px–32px tabular typography, and dual Midnight Ink CTA & QR access buttons.
   - Redesigned `.customer-attention` warning/action cards with soft amber backgrounds, subtle borders, and smooth arrow hover micro-slides.
   - Overhauled `.customer-overview-grid` metric cards with 40px icon containers, uppercase tracked eyebrows, 24px tabular figures, and clean key-value rows.
   - Modernized `.customer-quick-actions` to a 4-column Finwise card grid with hover lift and micro-interactions.
   - Modernized `.folio-kpi-grid` and `.folio-kpi-card` with clean icon boxes, large tabular totals, and status indicators.
   - Refined `.crd-stepper`, `.crd-tabs`, `.crd-folio-strip`, `.customer-reservation-card`, `.customer-profile-card`, and shared table grammar.
2. Environmental test fix: Added `stubStorage` helper to `components/account/account-security-dialog.test.tsx` to handle Node 22 jsdom `localStorage` environment.
3. Verification:
   - `npm run typecheck`: clean (0 errors).
   - `npm run build`: clean (all 88 static & dynamic routes compiled).
   - `npm test`: **182/182 test files passed, 2,034/2,034 tests passed** (100% green).
   - Zero migrations, zero database schema changes.

See [[2026-10-04 - Guest Portal Modern SaaS UX Overhaul]].

## Previous: Guest portal table grammar + transportation title (2026-10-04)

IMPLEMENTED locally:
1. Shared table grammar in `app/customer-portal.css` (§14, tokens-only, zero hex literals): native `.guest-table` canonical class aliased with `.loyalty-ledger-table`; folio `.payment-history` sections read as table sections (small-caps h3 header, hairline rows, right-aligned tabular amounts, hover + focus-within); folio-figure strip dividers; request/transport row hover + focus; page-title `text-wrap:balance`; 44px touch floors on quick-actions + filter chips; reduced-motion guard.
2. Transportation converged to the shared module hierarchy: `transportation/page.tsx` now renders `customer-page-title` + eyebrow; deleted the 3 dead intro rules in `app/guest-booking.css`. All 13 guest modules now share one title grammar.

See [[2026-10-04 - Guest Portal Table Grammar]].

## Previous: Finwise Modern SaaS Design & Root CSS Modernization (2026-10-04)

COMPLETE locally across all systems (localhost only):
1. Root CSS Audit & Conflict Resolution:
   - Modernized `app/globals.css`: purged `.btn-soft:hover{border-color:var(--green);color:var(--green)}` and replaced with neutral hover (`#f3f4f6` / `#9ca3af`); updated global focus rings from archaic green to modern Info Blue (`#3b82f6`); neutralized metric cards, panel headers, and trend tags.
   - Purged lingering coastal teal RGBs (`rgba(8,75,85,...)`, `rgba(201,220,218,...)`, `rgba(133,203,208,...)`, `rgba(248,246,241,...)`) in `app/globals.css` and `app/manager-dashboard-theme.css`.
   - Raised staff `.app-shell .btn` from 9px font size to standard 12px/13px with 8px radius and 36px min-height; corrected `.theme-light .app-shell` `--dt` from blue (`#3b82f6`) to Midnight Ink (`#111827`); replaced green navigation and table hover (`#10b98114`) with neutral paper hover (`#f3f3f3`).
2. Purpose-Driven Button System:
   - Primary CTA: Solid Midnight Ink (`#111827` light / `#ffffff` dark), crisp white/dark text, subtle elevation shadow.
   - Secondary / Soft: Crisp neutral border (`#d1d5db`), surface white, dark slate text (`#111827`), hover `#f3f4f6` (never green).
   - Destructive / Danger: Solid Red (`#ef4444`) with white text and clean hover.
   - Ghost / Subtle: Transparent base with soft neutral hover.
3. System-Wide Finwise Polish in `app/fleetops-theme.css`:
   - Enforced 12px-16px card radii, subtle elevation shadows, tabular numerics for monetary values and metrics, 13px clean data tables with uppercase 11px gray headers, and uniform form controls.
4. Verification & Gate Checks:
   - `npm run typecheck` clean.
   - `vitest` theme & manager suites green (103/103 passing).
   - Full `npm test`: 181/182 test files passing, 2,033/2,034 tests passing (1 pre-existing environmental jsdom localStorage failure).
   - `npm run build`: compiled all 88 routes cleanly with 0 errors.

See [[2026-10-04 - Full FleetOps SaaS Reskin]].

## Previous: retest remainders (Billing, housekeeping footer, export, 2026-10-02)

IMPLEMENTED locally, all gates green. Billing: live probe refutes
over-matching (1/24 rows holds "rene") — scoped predicate + decoy tests
shipped; re-verify on fresh deploy, instrument if it persists. Housekeeping:
footer/toolbar now visible-of-total (collapsed history was the hidden
remainder). Export: print-CSS hardening (breakable preview, chrome hidden)
+ wiring/stylesheet tests; instrumented retest pending. Full 1963/1964 (1
pre-existing unrelated failure), build clean. No migration, no db push.

See [[2026-10-02 - Retest Remainders Billing Housekeeping Export]].

## Previous: QA follow-ups BUG-001…005 (2026-10-02)

IMPLEMENTED + PUSHED, all gates green. Per-module search memory; Billing
search chain extracted/tested + draft-commit hardening (observation reads as
stale-build/timing — re-verify on fresh deploy); stale modal guards + nav
clear; single property-wide open shift (migration `20261024090000`,
live-verified, zero open shifts at census); global housekeeping totals +
scope copy. Full 1949/1950 (1 pre-existing unrelated failure), build clean.
Pending: Front Desk re-run on fresh deploy (KI-005); export-timeout
follow-up needs network capture.

See [[2026-10-02 - QA Follow-Ups BUG-001 to 005]].

## Previous: cancelled-state, preview-404, profile fixes (2026-10-02)

IMPLEMENTED + PUSHED, all gates green. Cancel now expires awaiting-
verification deposits + stamps `payment_status='failed'` (no-refund case;
migration `20261024080000`, live-verified); history card shows ₱0 for
cancelled. Refund preview path fixed (`cancel/preview` → `cancel`) + pinned.
`getGuestProfile` hardened against duplicate rows (profile 500 suspect).
Full 1934/1935 (1 pre-existing unrelated failure), build clean. Pending:
browser QA all three (KI-005); re-check profile if it recurs (logs + row
census).

See [[2026-10-02 - Cancelled State Preview Profile Fixes]].

## Previous: confirmation stay-summary aside removal (2026-10-02)

IMPLEMENTED locally, all gates green. Removed the redundant `<aside className="review-stay-card">`
(`<BookingStaySummary>` in `<div className="confirmation-stay">`) from `/booking/confirmation/[id]`
only, as requested. The confirmation page already features a complete stay & deposit summary
in its dedicated `.confirmation-card` section. Cleaned up unused photo queries and imports.
Tests updated and passing (17/17 targeted, 212/212 booking suite), typecheck and build clean.

See [[2026-10-02 - Confirmation Page Stay Summary Aside Removal]].

## Previous: abandoned PayMongo checkout (2026-10-02)

## Previous: deposit proof-upload duplicate control (2026-10-02)

IMPLEMENTED locally, all gates green. The deposit page showed a native file
input beside the styled upload button because `sr-only-proofs` matched no
loaded CSS rule. The input tag itself stays (deleting it would silently kill
the upload — the button only forwards clicks to it); one scoped 1px-clip rule
in `app/guest-booking.css` hides it, so guests see a single control. New
stylesheet-walk tests pin the rule and forbid `display:none`. Targeted 116/116,
full suite 1922/1923 (1 pre-existing unrelated failure), build clean. Pending:
manual browser QA (KI-005).

See [[2026-10-02 - Deposit Proof Upload Duplicate Control]].

## Previous: guest registration 500 (2026-10-02)

ROOT-CAUSED + FIXED locally, push pending. `POST /api/register` 500 for all new
emails: `guests.loyalty_tier` default stayed `'Member'` after `20261015010000`
restricted the check to silver/gold/platinum — every new-guest insert failed
23514. New migration `20261024060000` sets default `'silver'` (one statement,
fixes all guest-creating RPCs); `lib/loyalty.test.ts` pins it. Gates: targeted
36/36, typecheck/build clean, full suite 1920/1921 (1 pre-existing unrelated
`password-reset-audit` failure). PUSHED 2026-10-02 via `supabase db push --db-url`
(dry-run → user-approved; ledger max `20261024060000`, live default `silver`).
Standing rule this session: I handle pushes, dry-run → confirm each time,
production target.

See [[2026-10-02 - Guest Registration 500 Loyalty Default]].

## Previous: reservation detail smart-back + policy document (2026-09-29)

IMPLEMENTED locally, all gates green. Three user-confirmed changes to the
customer reservation detail page (`reservation-detail-view.tsx`,
`my-reservations/[id]/page.tsx`, guest-booking/customer-portal CSS):
1. Circular history-aware smart-back — 44px round icon + "Back" label,
   `router.back()` when history exists else push `/my-reservations`
   (direct-landing fallback), `aria-label`.
2. Breadcrumb trail above it — My Reservations › {Room Type} ›
   {Confirmation #}, last crumb `aria-current="page"`, wraps at 390px.
3. Policy tab expanded from one `policyText` paragraph into a structured
   7-group document built server-side from the policy snapshot
   (check-in/out, ID + booking age, balance & incidentals, refund tiers +
   no-show forfeit, change window, special requests, house rules) with
   `<strong>`-highlighted crucial terms and left-accent section rules.
   Pending-verification callout kept (user decision). New optional
   `policyItems` prop on `ReservationDetailViewData`; `policyText` remains
   the fallback, so the two existing view fixtures needed no change.

Gates: focused 48/48, typecheck clean, touched eslint 0 errors 0 warnings
(unused `formatPeso` import removed), build 88 routes, full suite **166
files / 1873 tests**, diff-check clean. Pending: manual browser QA (KI-005)
— desktop + 390px, policy reading order, back behavior from direct URLs.

See [[2026-09-29 - Reservation Detail Smart-Back, Breadcrumbs and Full Policy Document]].

## Previous: Find a Room compact-search control corners (2026-09-29)

IMPLEMENTED locally, all gates green. CSS-only — no JSX, logic, API or migration
change. On both Find-a-Room surfaces the Check in / Check out / Guests controls
collapsed into sharp borderless boxes (a stale `border-radius:6px` override, a
later borderless refinement, and a `.customer-shell` background shorthand that
also erased the Guests dropdown's chevron image). Controls now carry the
standard rounded language: dates use the portal's 8px wrapper (same corners as
`.prompt-input` in Request-a-Change) and the Guests select inherits
haven-select.css's 11px wrapper + chevron untouched; compact select also added
to haven-select.css's hover/focus lists (it was missing from both). Desktop
divider-cell composition kept — only the corners inside the cells changed.

Gates: focused 36/36, `components/booking` 13 files / 138, full suite **162
files / 1851 tests**, typecheck clean, touched eslint clean, build clean.
Pending: manual browser QA (KI-005) — portal `/account/find-room` (guest
login) + public `/booking/search`, desktop and ≤600px.

See [[2026-09-29 - Find a Room Compact Search Control Corners]].

## Follow-up: column geometry confirmed, no architectural change (2026-09-26/27)

A review brief arrived asking for NAME flexible / STATUS compact, on the grounds that
STATUS "stretches across a very large portion of the table". That accurately describes
the layout shipped earlier the same day, and the two specs cannot both hold — the
slack must live in one end column. Put to the user with both layouts drawn; **they
chose to keep the current geometry.** The absorbing column did not change.

What the follow-up did change is `--sys-col-name`: **280px → 240px**, the one soft
value in the model. Because a column's width is uniform across rows, Name's width also
sets how far the badge sits from a *short* name. Sized from a measurement of **all 87
migration names in Inter 13px** (the app font — `system-ui`, used in the first probe,
is narrower and made the numbers ~10% generous): mean text 145px, longest 234px.
240px keeps 84/87 names on one line for a mean 81px gap to the badge; 280px fit all 87
but left 121px. The 3 that wrap are the 234–262px outliers. Rejected 200px, which my
own earlier note floated: it wraps 17/87 (20%) and the table reads ragged.

Verified on the shipped CSS in headless Chrome with real markup: **`140 / 240 / 650`**
on a 1030px card, median row height still 48px, 3 wrapped, no overflow; the 358px card
still releases the widths with no overflow. Temporary probes deleted.

Also added: **[[D-031]]**, plus a matching clause in the `system-health.css` comment
block and in `SYSTEM.md`, because this table has been reversed three times and the wide
Status column reads as a bug to anyone who has not seen the gap it replaces. Confirmed
by `grep` that no other stylesheet in `app/` or `components/` touches
`system-health-table` or any `col-*` class, so the module owns the columns outright.

35/35 focused, **160 files / 1800 tests**, typecheck clean, eslint 0 errors, compiled
chunk confirmed carrying 240px.

## Current task (ledger table column geometry, 2026-09-26)

IMPLEMENTED locally, all gates green. CSS-only — no markup, theme, API or migration
change.

The Applied Migrations and Audit Trail tables were `table-layout:fixed` at
`width:100%`, so the one column with no declared width (Name) swallowed ~700px at a
1030px card and pushed the `Applied` badge to the far edge; audit had two ~420px
voids per row. The fix declares a width for **every column except the last of each
table** — Status (migrations) and Entity (audit) are left unconstrained so they
absorb the leftover, and their text then sits flush against the column before them.
`--sys-col-version:140` / `--sys-col-name:280` / `--sys-col-time:160` /
`--sys-col-action:200`, all taken from browser-measured text widths, not estimates.
`--sys-col-status` (120px) is deleted — Status is the absorber now. The 680px media
step releases the new set.

**A trailing `.col-fill` spacer with `width:100%` was designed, implemented, and then
rejected after measurement**: a percentage column demands the whole table width and
Chrome crushes every other column to min-content (`87/67/77/800`), in fixed layout as
well (`140/0/88/802`). The spacer was reverted; the "last column absorbs" shape needs
no markup. Numbers and the full mechanism are in the session note — do not re-derive.

Geometry was verified by measurement, not assertion: the real compiled chunk, real
markup, `getBoundingClientRect()` read out of headless Chrome. Migrations `140/280/610`
and audit `160/200/670` on a 1030px card, `358px` card `109/167/82`, no overflow in
any case (was `140/802/88`). The temporary probe `public/__colcheck.html` was deleted.

35/35 focused, 160 files / 1797 tests, typecheck clean, eslint 0 errors, compiled CSS
chunk confirmed. `SYSTEM.md` records the "every column except the last" invariant,
because the unconstrained column reads as an oversight. Pending: authenticated browser
QA (KI-005) against the live page.

See [[2026-09-26 - Ledger Table Column Geometry]].

## Previous: system health ledger conflict fix (2026-09-26)

IMPLEMENTED locally, all gates green. Three style conflicts in the ledger panel
(Applied Migrations / Payment Configuration / Audit Trail), each with a named
mechanism:

1. The admin theme resets headings with a **child** combinator
   (`manager-dashboard-theme.css:1749`) that cannot reach headings nested inside
   `[role=tabpanel]` — so the ledger's headings got no padding/separator and sat
   flush on the card border while the cells below them were inset 14px by the same
   theme file.
2. **No stylesheet gives `.data-panel` padding** — every other panel is inset by its
   own `.panel-heading` child. The tabs card has none (only the tab strip, also
   unpadded), so the pills were drawn on the card border and the theme's
   `overflow:hidden` clipped their corners and their focus ring (**an a11y defect**).
3. The tables had no mobile step: 310px of locked columns, no `@media` rule, so the
   Name column got ~48px at 390px.

All four edits are in `components/admin/system-health.css` — strip + heading inset at
the theme's 16px, the search row inset with **`margin` not `padding`** (the D-026
guard at `system-health-view.test.tsx:386` asserts that rule has no padding), and a
680px `table-layout:auto` step placed *after* the `--sys-col-*` rules it ties with on
specificity. No markup, theme, token, or migration change.

Ruled out with evidence and left alone: the `.admin-security-grid` `dl>div` rule
(no such ancestor), `dt{flex:none}`, the 560px `.table-scroll` floor, `[hidden]`, and
the tablist's hardcoded `#084b55` — swapping that to `--admin-accent` would regress
dark contrast to ~1.9:1.

35/35 selected, 160 files / 1793 tests, typecheck clean, eslint 0 errors, compiled
CSS chunk verified with newline-tolerant greps (the dev pipeline pretty-prints, so a
naive `grep -oE "rule\{[^}]*\}"` returns nothing and makes a fresh chunk look stale).
`SYSTEM.md` gained one sentence so the restated padding is not deleted as a duplicate.
Pending: browser QA (KI-005).

See [[2026-09-26 - System Health Ledger Conflict Fix]].

## Previous: system health module redesign (2026-09-26)

IMPLEMENTED locally. Hierarchy rebuilt: verdict → 8 cards → needs-attention →
ledger | automations rail. Attention moved out of the 320px rail into the main
column and is de-duplicated against the cards; ledger takes full width.

Root cause of the repeated no-op redesign prompts: this module was the only admin
stylesheet outside the D-025 theme layer, pinning a 9-11px scale while the light
theme ran 12-15px. Pinned sizes removed; tone moved onto the value line on
theme-flipping `--color-*-fg` (was `--ops-*-ink`, 2.77-3.58:1 in dark); cards step
4→2→1 at 1200/760px; split collapses at 1100px; `td:last-child` scoped to
`--migrations`; payment tab's 5 hardcoded rows dropped (3 restated the gateway card
and would have gone false once a gateway secret is set).

Unknowns made real with NO migration — both crons already persist their runs.
Automations read `guest_reminder_deliveries.sent_at` / `analytics_model_runs.generated_at`
with a per-job label ("Last send" — the reminders ledger only writes on a real send).
Deployment is two-tier: env/branch/commit from Vercel's injected vars (always), and
newest `readyState` from the API when `VERCEL_TOKEN` is set.

Selected 35/35, full suite 160 files / 1793 tests, typecheck clean, eslint 0 errors
(3 pre-existing warnings), compiled-CSS chunk verified to carry the new rules and
zero pinned sizes / ops-ink / unscoped selectors. Pending: browser QA (KI-005) and
the `VERCEL_TOKEN` env var.

See [[D-030 — Admin module stylesheets inherit the theme scale and never restate a fact a card already shows]]
and [[2026-09-26 - System Health Module Redesign]].

## Previous: ledger table refinement (2026-09-24)

IMPLEMENTED locally. Applied Migrations + audit + automations tables share one
scoped `.sys-ledger` treatment in system-health.css (uppercase 11px muted thead,
right-aligned status col, mono version-code on real `--font-mono`, transparent
search row with live count). Markup-only JSX (searchrow wrapper, code element,
sys-ledger classes); search/pagination/badges/tabs/data hooks untouched.
Brief's invented tokens (none exist) mapped to real shell tokens; bordered
toolbar card + custom pagination buttons rejected per D-026/shared primitives.
Full suite 160/160 files, 1789/1789 tests; typecheck, eslint 0 errors, build,
diff-check clean. Pending: browser QA (KI-005).

## Previous: system health console recomposition

IMPLEMENTED locally. Killed the KPI-card wall: header statusline (verdict +
counts + last-checked + Run Probes), attention queue (severity-ordered,
critical-only alert role), 3 grouped definition-list service panels
(Infrastructure / Application services / Governance, 9 rows, text+icon tone on
existing ops tokens), full-width automations table, evidence tabs untouched.
Zero backend change; RBAC/probes/actions/search/pagination/modal preserved.
Targeted 50/50, full suite 1784/1785 (1 pre-existing cross-stream OTP-copy
failure, untouched), typecheck, eslint 0 errors, build green, diff-check clean.
Pending: browser QA (KI-005).

## Previous: system health console redesign (banner + grouped cards)

IMPLEMENTED locally, gates green except 1 pre-existing cross-stream failure
(security-policy.test.ts OTP-copy expectation vs parallel stream's uncommitted
Security Configuration copy — untouched by this work). SystemHealthView is now
an ops console: posture banner (counts over probe states, no invented
algorithm), 3 grouped ModuleSummaryCards strips (Infrastructure / Application
services / Governance + Security link-out), severity-ordered alerts, untouched
automations/tabs/search/pagination/refresh/RBAC. Scoped system-health.css
(3-col grid, banner, alerts). 160 files / 1782-1783 pass, typecheck, eslint 0
errors, build green. Pending: browser QA (KI-005).

## Current task (admin governance native-CSS fix, 2026-09-23)

FIXED locally, all gates green. Uncompiled Tailwind grids in System Health
replaced with native `metric-grid` / `admin-report-lower`; tablist reuses
`insights-tabs`; dead icon utilities stripped; scoped borderless key-value
`dl` CSS added. 159 files / 1762 tests, typecheck, eslint 0 errors, build
green. Pending: viewport browser QA (KI-005).
Detail: Sessions/OpenCode/2026-09-23 - Admin Governance Native-CSS Fix.md.

## Current task (system health executive layout, 2026-09-23)

IMPLEMENTED locally, all gates green. `SystemHealthView` is a 3-tier
executive layout: 8-card infrastructure grid (incl. server-derived PayMongo
gateway mode), automations × alerts workspace, hand-rolled tablist ledger
(migrations / payment / audit trail, no refetch). 159 files / 1759 tests,
typecheck, eslint 0 errors, build green. Pending: browser QA (KI-005).
Detail: Sessions/OpenCode/2026-09-23 - System Health Executive Layout.md.

## Current task (selfie-gated password reset, 2026-09-23)

IMPLEMENTED locally, all gates green. Recovery requires a staged identity
selfie (`SELFIE_REQUIRED` in `complete_account_recovery`); self-service
`/forgot-password` (email → OTP → link, generic responses, 5/hr cap);
`password_reset_logs` ledger; Admin Governance → Password reset audit with
signed-URL selfie preview. 159 files / 1753 tests, typecheck, eslint
0 errors, build green. Pending: `supabase db push`, SMTP config, browser QA.
Detail: Sessions/OpenCode/2026-09-23 - Selfie-Gated Password Reset.md.

## Current task (operational module layout audit, 2026-09-23)

COMPLETE locally. A system-wide structural review found the shared design
foundation sound, with seven standalone panels plus shared resource and
accounting views still using legacy split search/filter rows. Guest Requests, Transportation, Housekeeping,
Staff & Duty, Room Types, Request Types, Transfer Vehicles, shared staff
resources, and Accounting now use the canonical transparent `HavenDataToolbar` hierarchy with responsive grouping,
visible labels, live result counts, and one clear action. Existing permissions,
filtering, actions, sorting, and pagination are unchanged. Gates: typecheck,
touched ESLint, focused 42/42 tests, full Vitest, production build, Impeccable
detector, and diff-check are green. Authenticated browser QA remains pending.
Detail: Sessions/Codex/2026-09-23 - Operational Module Layout Audit.md.
## Current task (guest Rewards redesign, 2026-09-22)

COMPLETE locally. The customer Rewards page now uses the standard dark-teal
hero, three live KPI cards, a keyboard-operable three-tier comparison, and a
responsive paginated points ledger with transaction badges. Tier thresholds,
multipliers, progress, and redemption value reuse the canonical loyalty
helpers; the live API payload is validated before display. Shape-matched
skeleton, guided empty, reduced-motion, and retryable error states are covered.
Gates: typecheck, touched ESLint, 156 files / 1,718 tests, production build,
Impeccable detector, and diff-check are green. Full lint has 0 errors and 70
pre-existing repository warnings. Authenticated browser QA remains pending.
Detail: Sessions/Codex/2026-09-22 - Guest Rewards Redesign.md.

## Current task (guest Payments & Folio hierarchy, 2026-09-22)

COMPLETE locally. The customer Payments & Folio page now renders in the
approved order: hero, three live financial KPI cards, a transparent compact
filter toolbar, then folio cards. Stay/payment dropdowns and reference search
filter immediately in a client leaf while the secure folio markup remains
server-rendered; counts, outstanding balance, and paid total update from the
visible records. The canonical keyboard-accessible HavenSelect is used in
accordance with HAVEN_UI_STANDARDS (Radix/Shadcn is prohibited). Gates:
typecheck, touched ESLint, 154 files / 1,709 tests, production build,
Impeccable detector, and diff-check are green. Full lint has 0 errors and 70
pre-existing repository warnings. Authenticated browser QA remains pending.
Detail: Sessions/Codex/2026-09-22 - Guest Payments Folio Hierarchy.md.

## Current task (Digital Express Pass card, 2026-09-22)

Reservation-detail QR redesign (Scenario A): COMPLETE, all gates green. The
stay QR moved out of its full-width band into a compact "Digital Express Pass"
card anchored as a third column of `.customer-reservation-heading`
(`customer-checkin-qr-pass-column`; stacks ≤900px centered ≤320px). Pass card:
uppercase pass title + HAVEN Makati, high-contrast 160px QR on white inset
figure (source is 320px, crisp on HiDPI), "Scan at front desk or kiosk", green
"Ready for Express Check-In" pill, full-width Download QR, honest validity
note (IDs/balance still verified in person). `CheckInQrExpired` keeps a
full-width band via `customer-checkin-qr-band` modifier. Also fixed two
jammed single-line statements in `reservation-detail-view.tsx` (import +
`openRequest`) — zero behavior change. New `check-in-qr.test.tsx` (4: hero
anchoring, pass parts, folio strip order, terminal band). Gates: typecheck,
touched eslint 0 errors, **1713/1713 (155 files)**, build, diff-check.
Browser QA still manual (KI-005). Detail:
`Sessions/Freebuff/2026-09-22 - Digital Express Pass Card.md`.

## Current task (PayMongo GCash auto-pay, 2026-09-22)

Automated GCash deposit confirmation: COMPLETE locally, all gates green. The
DB backbone already existed (`20261016010000`); this session reconciled the
boundary to PayMongo's real wire formats (`Paymongo-Signature` t/te/li HMAC
over `"<t>.<body>"` + timestamp tolerance, `PAYMONGO_*` env with legacy
aliases, centavo helper, real event shapes incl. v1/v2 payment.paid, payload
amount guard), added migration `20261021010000` (idempotent re-assert +
same-reference replay instead of `GATEWAY_REFERENCE_CONFLICT` on concurrent
multi-channel delivery), GCash Instant Auto-Pay UI + confirmation-page
payment poller (new guest-scoped `GET
/api/account/reservations/[id]/payments`), and `lib/paymongo.test.ts` (29).
Gates: typecheck, touched eslint 0 errors, **1704/1704 (153 files)**, build,
diff-check. Pending: `supabase db push`, PayMongo dashboard webhook
registration, browser QA (KI-005). Detail:
`Sessions/Freebuff/2026-09-22 - PayMongo GCash Auto-Pay Reconciliation.md`.

## Current task (predictive dynamic pricing, 2026-09-22)

IMPLEMENTED locally, not migrated remotely and not committed. A centavo-exact
7-day pricing recommender now combines occupancy forecast, 48-hour net pickup,
and day-of-week demand; generated room-type bounds clamp every result.
Manager can review/edit selected recommendations beside the occupancy chart
and submit them through an additive transactional wrapper around the existing
rate-plan proposal RPC. Rows remain pending for Owner/Admin, carry analytics
origin + model-run provenance, and are separately audited. Direct role/API,
domain, bounds, and UI tests are green (35 focused tests); typecheck is green.
Full gates are green: 148 files / 1,657 tests, typecheck, lint (0 errors; 66
repository-wide warnings), production build, diff-check, and migration safety
scan. Pending: authenticated browser QA and remote migration application by an
explicit deployment task. Detail:
`Sessions/Codex/2026-09-22 - Predictive Dynamic Pricing.md`.

## Current task (role-based overview redesign, 2026-09-21)

System-wide staff Overview recomposition: COMPLETE, all gates green.
`Overview` in `manager-dashboard-client.tsx` is now role-composed (accounting
financial cards, ops queue panels replacing the chart for front_desk /
accounting / housekeeping / maintenance, manager decisions-first,
dedup guards, plural fixes); `staff-ops-theme.css` gains the manager
ordering rule + ≤1000px single-column grid fix; new
`overview-composition.test.tsx` (6); DESIGN.md §18. Customer/Owner/Admin
audited, already compliant, unchanged. Gates: typecheck clean, eslint 0
errors, 139 files / 1574 tests, build 73 routes, diff-check clean. Browser
QA via real Chromium against the live dev server (temporary fixture route,
deleted after): 5 roles × 1440/390px × dark/light, no errors, no overflow.
Full auth-walled role walkthrough still pending. Detail:
`Sessions/OpenCode/2026-09-21 - Role-Based Overview Redesign.md`.

## Current task (authenticated session countdown, 2026-09-21)

System-wide header countdown: COMPLETE, all gates green.
`sessionExpiresAt` is the earliest idle/absolute server deadline; background
polling is non-mutating and only explicit pointer/keyboard activity refreshes
`last_seen_at`. Customer + all staff role shells mount the compact timer before
theme/notification/profile controls. Expiration is blocking with Sign in again
as the only action. Focused tests 43/43, full suite 1568/1568, typecheck,
touched ESLint, production build, and Impeccable detector are green. Detail:
`Sessions/Codex/2026-09-21 - Session Countdown and Expiration.md`.

## Current task (search-input visibility, 2026-09-21)

Shared light-staff search contrast fix: COMPLETE, gates green. Root cause was
token contrast, not a missing border — `--hc-surface-soft/--hc-line` resolved
to `--ds2 #f7f9f6`/`--dl #e1e6e2` on the `#f4f6f3` floor. One canonical mapping
(`.theme-light .app-shell` in `haven-data-controls.css`: white surface + slate
ops border + teal accent) reaches every `HavenSearchInput` consumer incl. the
`.table-tools`-wrapped Front Desk views; input now uses the solid surface,
12px ops radius, teal hover/focus ring, disabled state. No toolbar card, no
double border, no behavior changes. 1554/1554 tests, typecheck/eslint/build/
diff-check clean. Browser QA via Playwright screenshots of the real CSS bundle
(computed: bg #fff, border #d1d5db, floor #f3f3f3; dark + 390px mobile OK).
Full in-app role walkthrough still pending (auth-walled).

## Current task (action cards, 2026-09-20)

HavenActionItem standardization across staff roles: COMPLETE, gates green.
New shared primitive `components/ui/haven-action-item.tsx` + `.haven-action-item`
CSS (staff-ops-theme §7b, light + dark); manager Overview quick-panels (5 roles)
and admin quick-actions/health cards migrated; dead `.quick-panel`/`.quick-icon`
+ legacy admin card CSS removed. 1552/1552 tests, typecheck/lint/build/diff-check
clean. Detail: `Sessions/OpenCode/2026-09-20 - Action Card Standardization.md`.
Remaining: manual per-role browser QA (no runner, KI-005). Parallel stream
(data-toolbar transparency) touched only to fix missing imports its own test
needed — otherwise untouched.

## Current task (staff ops theme, 2026-09-20)

Org Executive Dashboard theme across staff pages (D-025): IMPLEMENTED,
gates green. `app/staff-ops-theme.css` (scoped override layer, last import),
band→default at 2 staff call sites, DESIGN.md §16, D-025 recorded.
Manual per-role browser QA still pending (no runner, KI-005). Landing /
customer / auth untouched (diff-verified). Track B history-conversion work
below is a parallel stream — untouched.

## Current task (history conversion)

Option C history-carrying conversion (D-024): IMPLEMENTED, awaiting
production approval. No push, no prod mutation performed.

## Completed (verified)

- Migration `20261013010000` (new `admin_convert_guest_to_staff_with_history`
  RPC, owner-only actor, history census in audit, `staff` marker column).
  Base converter + generic role RPC untouched.
- Route `withHistory` flag, `OWNER_AUTHORITY_REQUIRED` message, admin dialog
  checkbox + payload. D-024 + `SYSTEM.md` §6 updated.
- Tests: new `guest-staff-conversion-with-history` suite (6) + old suite
  updated for dual-RPC routing. Gates green: typecheck, eslint 0 errors,
  1531/1531, build, diff-check.

## Completed (verified)

- `AGENTS.md` created — canonical shared router for Claude Code, OpenCode,
  Codex (both auto-discover root AGENTS.md; verified against official docs).
- `05 Memory/Project Memory.md` created — durable knowledge + links.
- This file created — replaces ad-hoc handoff state.
- `CLAUDE.md` preserved; pointer appended. `Memory Index.md` refreshed.
- `Sessions/{Claude Code,OpenCode,Codex}/` created for new sessions.
- Option B env fix committed (`d2be55b`, pushed to `origin/main`):
  pairing rule skipped only during `next build`; runtime strict.
  Gates were green: typecheck, eslint 0 errors, 1525/1525, build.

## Remaining / blockers

- Validate: link check, AGENTS.md size, secret grep, CLI probes.
- Manual browser QA still pending per KI-005 (no runner in repo).
- Rotate chat-exposed secrets (service-role, SMTP, NEXTAUTH, OTP, Gemini).
- HostForge deploy is the user's step (both vars must be saved in panel).

## Next action

Finish validation, report, then resume normal development on `main`
(large uncommitted tree from parallel streams — coordinate, don't overwrite).

- `AGENTS.md` created — canonical shared router for Claude Code, OpenCode,
  Codex (both auto-discover root AGENTS.md; verified against official docs).
- `05 Memory/Project Memory.md` created — durable knowledge + links.
- This file created — replaces ad-hoc handoff state.
- `CLAUDE.md` preserved; pointer appended. `Memory Index.md` refreshed.
- `Sessions/{Claude Code,OpenCode,Codex}/` created for new sessions.
- Option B env fix committed (`d2be55b`, pushed to `origin/main`):
  pairing rule skipped only during `next build`; runtime strict.
  Gates were green: typecheck, eslint 0 errors, 1525/1525, build.

## Remaining / blockers

- Validate: link check, AGENTS.md size, secret grep, CLI probes.
- Manual browser QA still pending per KI-005 (no runner in repo).
- Rotate chat-exposed secrets (service-role, SMTP, NEXTAUTH, OTP, Gemini).
- HostForge deploy is the user's step (both vars must be saved in panel).

## Next action

Finish validation, report, then resume normal development on `main`
(large uncommitted tree from parallel streams — coordinate, don't overwrite).
