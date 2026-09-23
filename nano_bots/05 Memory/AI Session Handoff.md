# AI Session Handoff

Current execution state. Concise — detail lives in linked session notes.

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
