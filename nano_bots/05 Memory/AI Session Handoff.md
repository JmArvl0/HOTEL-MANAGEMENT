# AI Session Handoff

Current execution state. Concise — detail lives in linked session notes.

## Current task (retest remainders: Billing, housekeeping footer, export, 2026-10-02)

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
