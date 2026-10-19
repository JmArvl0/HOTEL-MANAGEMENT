# HAVEN Hotel Management — Comprehensive Frontend UI/UX Audit

**Date:** 2026-10-18 · **Scope:** read-only frontend audit · **No code was modified by this audit.**
**Evidence basis:** static source inspection + automated checks. No browser automation exists in this
repo or harness (jsdom testing only), so every rendered-visual claim is labeled `NEEDS BROWSER
VERIFICATION`.

---

## 1. Executive summary

Haven's frontend is in materially good shape for a system at this feature depth. The baseline is
green (`typecheck` clean, `lint` 0 errors/97 warnings, **186 test files / 2 069 tests passing**).
The shared UI foundation covers most surfaces with a real design system: `Modal` (56 consumers),
`HavenSelect` (36), `TablePagination` (25), `HavenSearchInput` (26), `ModuleSummaryCards` (17),
`HavenDataToolbar` (16), `StatusBadge` (13) — with only ~30 inline styles across the whole repo.
Accessibility investment is real and verifiable: a full-ARIA listbox dropdown, `role="log"` toasts
with pause-on-read, a portal-based modal with focus trap/return and render-phase-ref hardening,
exemplary form semantics on auth pages, semantic landing markup, `prefers-reduced-motion` and
`prefers-contrast` handling, and WCAG-AA-passing contrast on every sampled color pair (computed
from the actual hex values).

The drift is concentrated, not systemic:

- **The 2026-10 CSS consolidation left residue.** `app/staff-theme.css` (2 906 lines) carries
  66 dead-or-conflicting duplicate declarations, 299 `!important`s in one file, and — together with
  the customer shell — **66 sub-9px font sizes (minimum 6px)**, which contradicts DESIGN.md §3's
  own stated readability floor (raised 2026-09-05, later superseded by the §16 FleetOps September
  retoken).
- **Two sidebar paint systems coexist** (`globals.css` base vs `staff-theme.css` override), the
  intended `PageHeader` single-hero grammar is adopted by only 5 consumers, and three parallel
  status-pill systems remain (a known-open DESIGN.md item).
- **One functional gap**: cash-shift **Close has been suspended since 2026-10-03**
  (`CASH_SHIFT_CLOSE_SUSPENDED = true`) — the button is hidden and an honest status notice
  explains why, but the operational flow is blocked until the reopen error is fixed.
- **DESIGN.md §1 is stale** (references `coastal-theme.css` / `manager-dashboard-theme.css`, both
  deleted) and `components/ui/app-shell.tsx` + its CSS are dead code still imported globally.

**Audit health score (4 code-verified dimensions + integrity): 15/20 — Good (address weak dimensions).**

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3.5/4 | Contrast passes on all sampled pairs; icon-only controls labeled; sub-9px type is the main debt |
| 2 | Performance | 3/4 | Well optimized (30s polling cadence, memoized filters); 2466-line monolithic client renders whole workspace |
| 3 | Responsive design | 3/4 | Comprehensive media-query coverage incl. `pointer:coarse`; 15 different breakpoint widths is messy but functional |
| 4 | Theming | 3/4 | Token systems coherent per surface; 680 manual `.theme-light` mirrors + legacy OS-dark block = drift risk |
| 5 | Implementation integrity | 2.5/4 | Coherent product-specific system (not AI slop); consolidation residue and 3-pill-system naming debt keep this below "coherent" |

Severity mix: **P0: 0 · P1: 1 · P2: 9 · P3: 9** (full register in §10).

---

## 2. Audit scope and limitations

- **Method:** direct source reads of `app/` (routes, layouts, CSS), `components/` (ui, manager,
  owner, admin, customer, booking, auth, shared, catalog, checkin, qr, landing), `config/role-navigation.ts`,
  `lib/types.ts`, plus automated runs of `npm run typecheck`, `npm run lint`, `npm test`.
- **Not performed:** any rendered browser verification (no headless browser runner exists in this repo;
  jsdom-only tests; dev server was live on :3000 but cannot be visually inspected by this tooling). All
  layout/visual/enteraction-runtime claims therefore carry `NEEDS BROWSER VERIFICATION`.
- **No credentials / role sessions** were supplied, so no authenticated screenshot QA.
- **No code, CSS, config, dependency, DB, or memory changes** were made. Uncommitted user work
  (`nano_bots/*` memory edits, `vitest.config.mts`, `next-env.d.ts`, untracked `.opencode/` and
  session notes) was preserved untouched.

---

## 3. Actual route and role inventory

Roles are source-derived from `lib/types.ts:1` — exactly 8, no separate "super admin":

`owner | admin | manager | front_desk | housekeeping | maintenance | accounting | guest`

### 3.1 Page routes (28 `page.tsx` files)

| Group | Routes | Role access (from code) |
|---|---|---|
| Landing | `/` | public, light-only (`landing.css` `color-scheme: light`) |
| Auth | `/login`, `/register`, `/auth/continue`, `/verify`, `/forgot-password` | public + booking-return flows |
| Guest recovery | `/recover/[token]` | public, one-time token |
| Booking flow | `/booking/search`, `/booking/details`, `/booking/payment/[token]`, `/booking/review/[token]`, `/booking/confirmation/[id]` | public; guests → redirected from `/booking/search` into `/account/find-room` (search/page.tsx:23) with search params forwarded |
| Customer portal | `/account`, `/account/find-room`, `/account/help`, `/account/loyalty`, `/account/notifications`, `/account/payments`, `/account/profile`, `/account/receipts/[id]`, `/account/requests`, `/account/settings`, `/account/transportation`, `/my-reservations`, `/my-reservations/[id]` | `requireCustomerSession` in `(customer)/layout.tsx` |
| Staff workspace | `/manager_dashboard` (single route) | page.tsx:8-15 — no session→`/login`; `disabled`→`/login`; `guest`→`/account`; owner→`OwnerDashboardClient`; admin→`AdminDashboardClient`; all others→`ManagerDashboardClient` |
| Express check-in kiosk | `/checkin/kiosk` | public surface; auth + eligibility server-side (page.tsx comment) |
| QR room placard | `/qr-placard/[roomId]` | staff-only set (`front_desk, manager, owner, admin, housekeeping, maintenance`), guests redirected (page.tsx:15-20); printable operations placard |
| API | `app/api/**` | out of UI scope |

### 3.2 Staff navigation per role (authority: `config/role-navigation.ts` + in-client `access` maps)

- **Shared workspace** (`ManagerDashboardClient`, serves `manager/front_desk/housekeeping/maintenance/accounting`):
  5 nav groups (Workspace / Front Office / Operations / Finance / Management), 25 items of which
  2 are hidden-but-still-renderable legacy surfaces (Reservations, Rooms) kept for deep links;
  role filtering via `NavItem.roles` plus the per-role section `access` map
  (`manager-dashboard-client.tsx:94`) and the `room_rack` visibility condition (needs both
  `reservations` + `rooms`).
- **Owner** (15 sections, 3 groups: Executive / Governance / Catalog) — full visibility, RBAC-free client.
- **Admin** (13 sections, 4 groups: Workspace / Accounts / Configuration / Governance; includes
  System Health with 60s re-probe).
- Directional boundaries encoded in comments/tests: Guest Requests (front_desk review /
  manager read-only / housekeeping fulfillment), Deposit Verification actionable by accounting
  only, Approvals = manager command center with filed-by-me scope for the other four roles
  (`role-navigation.ts:10-17`).
- **Guest:** 7 sidebar items + Help/notifications/profile/settings header surfaces
  (`customer-shell.tsx:10-13`).

### 3.3 Role audit status matrix

| Role | Surfaces reviewed (static) | Status |
|---|---|---|
| Owner | `owner-dashboard-client.tsx` (nav, groups, command palette, load path), shared shell | PARTIAL — section bodies spot-checked, not exhaustive |
| Admin | `admin-dashboard-client.tsx` (nav, create-staff form, system health), catalog panels | PARTIAL |
| Manager | `manager-dashboard-client.tsx` core + overview composition + command center sections | PARTIAL (2466-line client; largest surface) |
| Front Desk | arrival wizard, walk-in, extend-stay, cash-shift (incl. suspended close), deposits | PARTIAL |
| Housekeeping | housekeeping-queue-panel, guest-requests fulfillment path, assignments suggestions | PARTIAL |
| Maintenance | maintenance_orders module cards + work-order filing path, asset registry | PARTIAL |
| Accounting | accounting ledger views (transactions/folios/cash shifts/reconciliation/documents), refunds | PARTIAL |
| Guest | landing, booking flow, `(customer)/account` overview, shell, loyalty/folio patterns | PARTIAL |

No role is marked FULLY audited: every role had at least one section/module read only at the
shared-pattern level. All rendered-visual checks remain browser-pending for all roles.

---

## 4. Frontend architecture and styling overview

**Stack:** Next.js 16 (App Router) + React 18 + Supabase + next-auth (OTP-enforced) + recharts +
lucide-react + GSAP; Vitest + Testing Library (jsdom). No Tailwind binary (despite `--tail-*`
token naming), no shadcn/Radix (banned by `docs/ui-motion-guidelines.md`).

**Global CSS load order** (authoritative — read from `app/layout.tsx:4-19`; later files win at equal
specificity). Note DESIGN.md §1 lists a different, partially stale order:

1. `app/globals.css` (246) — root tokens (ink `#111827` family), `.btn/.badge/.app-shell` base, sidebar base, notification-bell root standard
2. `app/guest-booking.css` (1 321) — booking flow + legacy customer controls + `--cp-*` shell scope
3. `app/responsive.css` (204) — table overflow, touch floors, `pointer:coarse`, reduced motion kill-safe micro-interactions
4. `components/ui/Modal.css` (2 425)
5. `components/ui/haven-select.css`, `haven-data-controls.css`
6. `components/booking/room-details.css`
7. `app/design-tokens.css` (797) — Tailwind-scale primitive tokens + `--ds/--dm/--dg/--dl` aliases + legacy OS-dark `@media` block (line 363)
8. `app/ui-primitives.css` (208) — canonical `.btn` metrics, badge coverage, header-button mobile fix
9. `components/customer/notification-history.css`, `app/customer-portal.css` (929, customer token layer)
10. `components/auth/session-expiry.css`, `components/ui/app-shell.css` (23), `command-palette.css`, `haven-account-modal.css`
11. `app/staff-theme.css` (2 906) — THE staff layer, `.app-shell`-scoped, dark base + 680 `.theme-light` mirrors

Page-scoped: `(landing-page)/landing.css`, `(booking)/booking/search/search.css`, `components/auth/auth-vault.css`, `haven-loader.css`, component `*.css` co-imports.

**Theme mechanism:** class `.theme-light` on `<html>`, set pre-paint by inline script
(`layout.tsx:35`, first-line error handler); dark default for staff, light default everywhere else;
session-expiry countdown dialog per DESIGN.md §17.

**State/enturture:** staff workspace polls every 30s (badge + section data), toasts stack max 3
with queue, command palette `Ctrl/Cmd+K` in all four shells, sidebar collapse persisted per shell
(`haven-sidebar-collapsed`, `haven-admin-sidebar-collapsed`, `haven-owner-sidebar-collapsed`,
`CUSTOMER_SIDEBAR_KEY`).

---

## 5. Shared design-system assessment

**Visual consistency — strong.** One ink family (`#111827`) with semantic green/amber/red/blue
status families in three maintained contexts (public pastel, `.app-shell` dark, `.theme-light`
mirror). Room-type identity pills (8-color HAVEN palette, `room_types.badge_color_key`) are
DB-governed with reserved colors — a genuine differentiator. Typography Inter + Playfair, loaded
once; staff deliberately type-only (no serif). Buttons: one metric system (40px base, 36px staff
compact — **documented as intent**, not a bug; 44px mobile touch floor lifted at ≤680px and
`pointer:coarse`). Radii/shadows split per surface (12px controls, 16px panels, 24px stat cards).
Icons: lucide family uniformly.

**Gaps:**

- **Sub-9px micro-type persists** (HUI-003): guest-booking.css has 14; staff-theme.css has 52
  (min 7px: `.pricing-values small` 1126, `.insight-kind` 1132/1149, `.report-section-label`
  1233 — at 7px **with `!important`**). The customer sidebar even renders `6px` letter-spaced
  smalls across (`.customer-brand-copy small`). This directly contradicts DESIGN.md §3's floor
  claim and degrades aim/hold targets for exhausted eyes on staff phones. NEEDS BROWSER
  VERIFICATION for the perceived result.
- **`PageHeader` single-hero convergence incomplete** (HUI-010): only 5 consumers (
  Navigation.tsx export; other pages still use raw `.page-title`, `.page-header`,
  `.customer-page-title` variants — now restyled by staff-theme's tail to a gradient banner
  `.workspace-body .page-title`}.
- **Three parallel status-pill systems** (HUI-009): `StatusBadge` (13), `.badge.*` spans (18),
  `customer-status` (+ `--st-*` tokens in customer-portal.css) — documented as a known-open
  item in DESIGN.md §13.
- **Token naming debt** (HUI-004): `--color-forest`/`forest-light`/`forest-dark` all alias
  `#111827` after the FleetOps retoken — `--color-primary-hover` equals primary so primary
  buttons have **no hover change** sourced from this token pair (consumers:
  design-tokens.css:230-231, Modal.css ×2). Actual hover behavior elsewhere comes from other
  definitions, so this is drift/confusion more than a visual bug. NEEDS BROWSER VERIFICATION on
  specific buttons.

---

## 6. Role-by-role findings

### Owner
- Nav: 15 sections in 3 executive groups; sidebar collapse and group open state persisted
  (`haven-owner-sidebar-*`). Command palette offers nav + Create Admin/Review Exceptions +
  Settings + Sign Out. Load per-section from `/api/owner/data?section=`.
- Uses owner-primitives kit (Toolbar/Empty/SectionHead/Collapse/Tabs/TablePanel, useOwnerSearch,
  TablePagination) — coherent module vocabulary.
- Findings: group persistence keys + nav lifecycle sound; Overview metric grammar per §16/§18.
  Pay attention: `formatPolicyValue` guards raw column display — good.
- **P3 HUI-020:** owner tokens use `--tail-*` names (tailwind-brand naming without Tailwind) —
  legibility of the theme source.

### Admin
- 13 sections, 4 groups. Users & Staff / Roles / Rooms / Policies / Audit / Security /
  Security Configuration / Password-reset audit / Admin Reports / System Health.
- 「System Health」 re-probes every 60s while open with silent refresh (line 108) — good UX.
- Create-staff form runs through shared FormDialog with validation callbacks and help text
  (defaults declared; server authority re-checks).
- Self-scoped sheets: `system-health.css` (252), `security-config.css` (31) — clean isolation,
  no shared-theme edits (matches DESIGN.md §20).
- Findings: ModuleSummaryCards ×used; Severity vocabulary follows §21 (chips + icon + text).
- **P3 HUI-016:** PendingMigrationsModal part of the admin surface is thin on error states
  (needs browser verification of empty/error renders).

### Manager
- THE largest surface: 2466-line client. Overview per §18 (Decisions & exceptions leads,
  occupancy chart), module rides on `ModuleSummaryCards` count==filter predicates invariant.
- Command palette duplicates sign-out/settings QR actions; shared dialogs (FormDialog,
  RoomSelectDialog via `useActionDialogs`) with per-field validations.
- **P2 HUI-011 — Cash Shift Close suspended** (line 1 `CASH_SHIFT_CLOSE_SUSPENDED = true`,
  comment references reopen error; line 1889 hides Close button; line 1913 renders
  `role="status"` "Shift closing is temporarily suspended…"). Impact: front_desk/accounting
  cannot end a cash drawer session; variance stays open; honest but operationally blocked.
  Flagged as P1 in register (HUI-011).
- **P2 HUI-005:** monolithic single client with per-module rendering via conditional render
  chains — maintainability/perf risk at this length (⚑ refactor candidate, not a user bug).

### Front Desk
- Access per `access.front_desk`: reservations/rooms/guests/guest_requests/transportation/
  housekeeping_tasks/finance queues/approvals/reports.
- Arrival wizard (`front-desk-arrival-dialog.tsx` 558px) with resume-per-reservation progress;
  walk-in flow auto-opens arrival after creation; extend-stay dialog reservation-scoped.
- QR scan (`QrScannerModal`) + eligible-room picker fetches server list first (no fake rooms).
- Findings: JSON-styled forms all via shared dialogs; needs browser verification of wizard on
  390px width (HUI-018 list).

### Housekeeping
- Queue panel (`housekeeping-queue-panel.tsx`) grouped, assignment suggestions refresh 30s
  (advisor strip), task status transitions ride filter chips with ModuleSummaryCards counts.
- Guest-requests inbox fulfills department-scoped requests.
- Findings: no inspection gaps noted beyond browser trials; dense `table-scroll` migrations
  need 768px check.

### Maintenance
- Work orders from own queue (no Guest Requests tab — comment documents render path never
  existed, correct: `access.maintenance` excludes it).
- Asset registry derived due-windows (`lib/maintenance-assets`) visible-only; severity vocabulary
  amber-attention (§21).
- Findings: consistency OK; needs browser check on 480px asset table.

### Accounting
- Five ledger views shared (`accountingViews` map: transactions/folios/cash shifts/
  reconciliation/documents) + refunds queue with basis badges (`refundBasisBadge`:
  Within policy / Manager approval required / Approved exception) and SLA-style age hints.
- Cash-shift drawer status pill in header (`myShift` polled 30s).
- Findings: **cash-shift close suspended** (HUI-011). Refund and verification flows render
  through dialogs — no direct row mutation.

### Guest
- Landing: semantic sections, aria-labelledby, previews of reviews with `role="img"`, no
  fabricated metrics (46 rooms count is real constant; amenity count derived).
- Booking search: intent parsing from URL; guests redirected with forwarded params to find-room.
- Portal: 7-item sidebar + bottom identity + notifications bell + command palette + session
  countdown; the account Overview page builds an attention list from derived financial state
  (real data, no fake zeros).
- Findings: minor — legal container has 6px (`.customer-brand-copy small`) — smalls only slogan.
  Post-login nav duplicates my-reservations between sidebar and command palette is intentional
  discovery.

---

## 7. Responsive layout assessment

**Coverage is genuinely comprehensive** (all width-gated + `pointer:coarse` + safe-area + print):

- `responsive.css` guards overflow globally (`overflow-x: clip` html/body, `max-width:100vw`
  shells), table scroll containers with min-width 560/520px, ≥44px touch at ≤680px and
  `pointer:coarse`, inputs at 16px to stop iOS zoom, ≤360px sidebar width 88vw, ultra-wide
  content caps, safe-area insets; micro-interactions all killed by the reduced-motion switch.
- Staff shell: sidebar drawers at ≤1000px (`transform` off-canvas + hamburger — confirmed by
  globals:5 media block and staff-theme equivalents), workspace-body padding 16px at ≤720px,
  header CTAs collapse to icon squares **only when genuinely icon-only** (`:has` guard,
  ui-primitives.css:139-156), table rows lift `.table-action` to 40px at ≤720px, KPI cards
  renumber 28→26px.
- Booking stage stacks at ≤900px; summary goes static; catalog cards 1-col ≤680px.
- Customer shell: content header compresses at ≤375px, folio summary 2-col grid, controls stack.

**Findings (from source):** 15 distinct breakpoint widths in use
(360/375/380/420/480/600/640/680/720/760/768/900/1000/1024/1100/1200) without a scale rationale
(HUI-008) — no current defect, but every new module has to guess which of the several nearby
gates apply. NEEDS BROWSER VERIFICATION list: 390px staff tables (horizontal scroll usability),
768px sidebar drawer over content, modal fit on 390px (`.modal-content` uses `min(420px,
calc(100vw-32px))` in account modal — other sizes need render check), `.booking-search.compact`
form on 420px, focus ring visibility on dark gradient banners (`page-title` uses
`linear-gradient(135deg,#161d27,#111827)` with white text — contrast fine, focus offset unknown
until browser).

---

## 8. Accessibility and usability findings

**Verified good (source evidence):**
- `HavenSelect`: complete listbox pattern — `aria-haspopup/expanded/controls`, labelled menu
  "<field> options", `aria-activedescendant`, Home/End/Enter/Escape, focus returns to trigger,
  disabled options honored (haven-select.tsx:107-197).
- `ToastStack`: `role="log"` + `aria-live="polite"` stack; per-card `role="alert"` (error) /
  `"status"`; pause on hover+focus so a toast being read never vanishes; aria-labelled dismiss.
- `Modal`: portal render, ref-counted body scroll lock, focus trap with stable handlers,
  initial/return focus refs, named title/description ids, Escape + overlay close (Modal.tsx).
- Auth forms: labels associated, `role="alert"` error box receives focus on error with jump link
  (`#haven-email`), `aria-busy` submit, password eye toggle with `aria-pressed`, autocomplete,
  OTP redirect handled (`auth/verify`).
- Grouped nav: `aria-expanded`/`aria-controls` group headers with badges; `aria-current="page"`
  on active items in both shells; landing landmarks semantic; decorative icons `aria-hidden`;
  chart fallbacks (`role="img"` + `<details>` data-table in performance reports, Shortened
  AccessibleChart).
- Contrast: computed WCAG ratios on sampled pairs all pass AA for their roles — sidebar link
  text 11.5:1, muted 5.39:1/5.98:1 on cream/white, badge families 4.49–7.69:1, notification
  badge numeral 3.76:1 (≥3:1 UI-component requirement, large/bold numeral).
- `prefers-reduced-motion` global kill + per-animation opt-outs; `prefers-contrast: high` present
  (Modal.css ×3); marque motion is transform/opacity only.

**Risks / gaps (register-backed):**
- **HUI-003 (P2)** — 66 sub-9px font sizes across staff-theme + guest-booking (+1 loader). Tiny
  type hits row actions (8px `table-action` in guest-booking.css), pricing overlays,
  report-section labels, customer 6-8px smalls. Impact: staff-eye readability on phones in
  bright kitchens/lobbies; violates the repo's own documented floor.
- **HUI-015 (P3)** — the OS-driven `prefers-color-scheme: dark` block in design-tokens.css:363
  continues to coexist with the `.theme-light` class system (double dark-mode authority).
  Partially trimmed 2026-09-05 but retained as behavior change; drift risk documented in
  DESIGN-STATUS F3.
- **HUI-017 (P3, LIKELY)** — toast sound plays on every push (toggle available in Settings).
  Browsers with autoplay policies may silently drop it; not a defect, note for awareness.
- Session-expiry: blocking dialog focuses sign-in action (per DESIGN.md §17) — implementation
  read; NEEDS BROWSER VERIFICATION of the focus direction at expiration.

---

## 9. Shared-component and CSS consistency assessment

**Reuse (measured):** Modal ×56 · HavenSelect ×36 · HavenSearchInput ×26 · TablePagination ×25 ·
ModuleSummaryCards ×17 · HavenDataToolbar ×16 · StatusBadge ×13 · HavenButton ×8 ·
HavenEmptyState ×4 · PageHeader ×5 · `useToasts` ×6 — with only 30 inline `style={{}}`
occurrences repo-wide (mostly landing/auth one-offs flagged by DESIGN-STATUS as intentional).

**Consistency walls:**
1. **HUI-001 (P2)** — dual sidebar paint systems: `globals.css:4` `.sidebar{width:248px;background:#161d27}`
   (dark slate base, dead for staff) vs `staff-theme.css:10` `.app-shell .sidebar{width:280px;background:var(--tail-bg-surface)}`
   wins by specificity. Globals copy is latent drift that will silently ghost new rules into both.
2. **HUI-002 (P3)** — staff-theme tail carries overlapping declarations inside single rules
   (e.g. `.app-shell .mod-kpi b` states `font:600 22px` then `font-size:28px;font-weight:750`
   in the same block; `.app-header p` `font:600 12px` then `font-size:15px;font-weight:700`),
   plus 6 dead token families from four retired theme files folded into one 2 906-line sheet.
3. **HUI-005 (P2)** — `!important` piles: globals bell block fully `!important` (68) — required
   historically to beat scoped rules but now fights any future skin; `haven-account-modal.css`
   has 99 `!importants` in 484 lines; staff-theme 299.
4. **HUI-006 (P3, dead code)** — `components/ui/app-shell.tsx` (saas-shell) has zero imports
   (grep across repo: only its own test) while its `app-shell.css` is imported globally in
   layout.tsx:16. Either the test is aspirational or the component is planned-but-unmounted.
5. **HUI-007 (P2)** — DESIGN.md §1 stale (row 9 coastal-theme + managerial theme references now
   deleted); §1 import order lines missing three sheet slots customers/staff styles actually use.
6. **HUI-009 (P3)** — 3 status-pill systems (per DESIGN.md known-open).
7. **HUI-010 (P2)** — `.page-title` / `.page-header` / `.customer-page-title` / `PageHeader`
   all exist; the staff-theme tail re-styles the shared `.page-title` into a gradient banner
   per-shell — convergence incomplete (deliberate phase plan per DESIGN.md §15, but worth
   tracking).
8. **HUI-008 (P3)** — breakpoint sprawl (see §7).
9. **HUI-020 (P3)** — MB class-name opacity: staff-theme uses near-letter tokens `.sd/.tp/.grp/.mr/.hk/.mod/.ai/.saas`
   for surface families — fine for compiled output, costly to navigate in a 2 906-line source file.
10. **HUI-004 (P3)** — `--color-forest*` aliases; primary==hover token (§5).

---

## 10. Findings register

Severity: P0 critical · P1 high · P2 medium · P3 polish. Confidence: `CONFIRMED — SOURCE`,
`LIKELY`, `NEEDS VERIFICATION`. All findings are on source evidence; browser-pending items are
repeated in §11.

| ID | Sev | Confidence | Finding | Evidence (file:line) | Impact | Remediation |
|---|---|---|---|---|---|---|
| HUI-001 | P2 | CONFIRMED — SOURCE | Two sidebar paint systems; globals copy dead for staff | app/globals.css:4 vs app/staff-theme.css:10,19 | Any future tweak to globals sidebar silently no-ops on staff; confusing audits | Move the staff sidebar base into staff-theme.css and reduce globals `.sidebar` base to the minimum actually shared, or delete the dead base |
| HUI-002 | P3 | CONFIRMED — SOURCE | Dead/conflicting double declarations inside staff-theme rules | app/staff-theme.css:2838,2844,2849,2854,2861,2869 (tail) | Wasted bytes; reader confusion (`font:600 22px` vs `font-size:28px`) | Strip the losing declarations in one mechanical pass |
| HUI-003 | P2 | CONFIRMED — SOURCE | 66 sub-9px font sizes (min 6px) on staff + customer surfaces | staff-theme.css ×52 (min 7px, e.g. 1126, 1132, 1149, 1233); guest-booking.css ×14 (min 6px: `.customer-brand-copy small`, `.customer-nav-label`, `.customer-content-header span`, `.table-action` @ 8px) | Staff-dense tables/overlays hard to read on phones; violates DESIGN.md §3 | Raise to the documented 8–11px floor; use line-height/padding for density |
| HUI-004 | P3 | CONFIRMED — SOURCE | `--color-forest*` aliases all `#111827`; `--color-primary-hover` == primary | design-tokens.css:93-95,231 | Future "primary hover" work no-ops; forest name misleading | Rename to `--color-ink*` or alias to a real hover value |
| HUI-005 | P2 | CONFIRMED — SOURCE | `!important` piles in shared roots (globals bell ×68, account modal ×99, staff-theme ×299) | globals.css:103-245; components/ui/haven-account-modal.css:12-36…; staff-theme.css | Specificity arms race; legit overrides impossible |
  Dealbutt: reduce via consolidation into one standard bell block without !important |
| HUI-006 | P3 | CONFIRMED — SOURCE | Unused `saas-shell` component; CSS still imported globally | components/ui/app-shell.tsx (0 imports); app/layout.tsx:16 | Dead bytes in every page load (minor); dead API surface | Either land the component migration or drop tsx + css import |
| HUI-007 | P2 | CONFIRMED — SOURCE | DESIGN.md §1 stale: references deleted coastal-theme.css / manager-dashboard-theme.css | DESIGN.md:27,46-47,208-211; git log (consolidation commits) | Future work "follows the doc" and reintroduces dead refs | Refresh DESIGN.md §1 import table; keep cache row for `app/staff-theme.css` |
| HUI-008 | P3 | CONFIRMED — SOURCE | 15 distinct media widths with no scale | all app+component css (inventory in audit) | Every new page guesses breakpoints; edge cages | Adopt a 6-step scale (360/480/680/900/1100/1440) and migrate opportunistically |
| HUI-009 | P3 | CONFIRMED — SOURCE | Three parallel status-pill systems | StatusBadge ×13 vs `.badge` ×18 vs `.customer-status`/`--st-*` | Inconsistent markup within one screen's reach | Continue the DESIGN.md §13 convergence; start with payments surfaces |
| HUI-010 | P2 | CONFIRMED — SOURCE | `PageHeader` single-hero adoption at only 5 consumers | components/ui/Navigation.tsx (+ page-header.test) | Per-page header variation: three different hero markups live | Set a crawl phase: replace `.page-title`/`.page-header` usages one module at a time |
| HUI-011 | **P1** | CONFIRMED — SOURCE | Cash-shift **Close suspended** since 2026-10-03 (drawer cannot be closed; staff sees honest status notice) | manager-dashboard-client.tsx:1 (constant + comment), :1889 (button hidden), :1913 (`role="status"` notice) | front_desk/accounting cannot end drawer; variance stays open; monthly reconciliation offsets; honest notice mitigates confusion | Fix reopen error (tracked by team), then remove flag and add regression test for close→reopen cycle |
| HUI-012 | P3 | CONFIRMED — SOURCE | globals.css dense minified-line debt + legacy `font-size:0` page-title rule overlapping ui-primitives fix | globals.css:1-27 vs ui-primitives.css:139-156 | Maintenance hazard both sides of the 680px gate | Fold the mobile block once (prefer ui-primitives) and reformat the base |
| HUI-013 | P3 | LIKELY | 680 manual `.theme-light` mirrors in staff-theme — every new rule needs a hand mirror | staff-theme.css (680 `.theme-light` selectors) | New rules shipped dark-first silently render in older light styles | Add a source-contract test asserting tone maps for each visual block (light+dark mirror); consider post-ceiling CSS `light-dark()` |
| HUI-014 | P3 | LIKELY | Toast sound plays on every push; browser autoplay may silently drop | toast-stack.tsx:66-67 (+ sound-toggle setting) | Inconsistent audio affordance | Verify policy behavior in real browsers; fall back to sound only after user gesture |
| HUI-015 | P3 | CONFIRMED — SOURCE | Legacy OS-dark `prefers-color-scheme` block still active alongside `.theme-light` | design-tokens.css:363+ | Dark-mode drift risk documented in DESIGN-STATUS F3 (partial) | Phase out OS-dark block once no consumer differs |
| HUI-016 | P3 | CONFIRMED — SOURCE | Panel-kind staff names sd/tp/grp/mr/mod reduce scanner readability of 2 906-line sheet | staff-theme.css (families map) | Slow maintenance, easy to touch wrong block | Comment block headers exist only at one spot (2820); add per-family subheaders |
| HUI-017 | P3 | NEEDS VERIFICATION | Session-expiry dialog focus direction + reduced-motion interplay at expiry moment | components/auth/session-expiry-guard + session-expiry.css | If focus lands on wrong node at 0:00, users re-auth blind | Browser check at forced expiry |
| HUI-018 | P2 | NEEDS VERIFICATION | Staff dense tables on 390px: `.table-scroll` min-width 560/520px + row actions 40px — scroll UX quality unknown in practice | responsive.css:28-36,104-142 | If pinch-zoom/truth is the only tool, desk flows could still be feasible but fatiguing | Browser pass on Room Reservations + Guest Folios at 390px |
| HUI-019 | P3 | NEEDS VERIFICATION | Modal fit on 390px across all dialog sizes (`sm..full`) | Modal.css + on-the-canvas min-widths | Possible clipping on xl dialogs | Browser matrix on longest dialogs (arrival wizard step 3) |
| HUI-020 | P3 | CONFIRMED — SOURCE | `--tail-*` token naming (tailwind brand without tailwind) | staff-theme.css token use; design-tokens.css | Confuses contributors re: styling engine | Rename to `--st-*`/`--ops-*` family in one pass |

**Score rollup: 1 × P1 (HUI-011), 9 × P2, 9 × P3. No P0.**

---

## 11. Issues requiring browser verification

1. 390px usability of staff table modules (HUI-018) — Room Reservations, Guest Folios, Cash & Shifts.
2. Modal fit/scroll on 390px for the arrival wizard and XL dialogs (HUI-019).
3. Focus-visible rendering on dark gradient page-title banners and ink buttons (visible ring?).
4. Session-expiry dialog focus + reduced-motion behavior at trigger moment (HUI-017).
5. Primary-button hover visual state (HUI-004 drift) — confirm whether any surface actually lost hover.
6. `pointer:coarse` + landscape phone table action affordances after the ≤720 vs coarse overlap.
7. Owner/Admin/Manager light-mode parity of brand-new blocks (dark-first shipping; HUI-013 risk).
8. Kiosk + QR placard print surfaces (physical sizing of `/qr-placard` print CSS).
9. `havenChipPulse` active chip under `prefers-reduced-motion` rendered state (animation:none
   rule present; confirm the idle dot still communicates "available").
10. Landing parallax/motion comfort at 4K widths (1600px cap exists — confirm no banding).

---

## 12. Recommended design-system specifications and component standards

Keep the direction already approved in DESIGN.md §15 (Modern Luxury Hospitality SaaS) and §16
(FleetOps executive grammar for staff). Recommended refinements, all additive:

1. **Finish the two conversions already in flight**: PageHeader single-hero migration (do one
   module per sprint), StatusBadge/three-pill convergence (start with payments surfaces where
   both already co-locate).
2. **Type floor enforcement beyond docs:** add a lint-level (or test-level) contract asserting
   no `font-size` declaration below 10px in app/components CSS except enumerated allowlist
   (`brand small` style letter-spaced logo smalls). Every exception gets a comment naming the
   surface.
3. **One sidebar, one source:** staff sidebar paint belongs in staff-theme.css only; globals
   keepsNothing beyond metrics shared with future shells (or is deleted together with the
   saas-shell dead code once the migration decision is made).
4. **`!important` retirement plan:** the bell standard block and haven-account-modal are the
   two biggest piles; both are single-purpose skin blocks that can be scoped by their root class
   instead (`.haven-notification-bell` is uniquely named already — most `!important`s are
   redundant defensively under the layout import order).
5. **Breakpoint scale policy:** six named media tokens (--bp-xs…--bp-xl) or reusable CSS custom
   media; migrate opportunistically, no big-bang.
6. **Token naming normalization:** retire `--color-forest*` and `--tail-*` names for `--ink*` /
   surface tokens aliasing real values; keep one OS-dark block OR the class system — not both.
7. **Theme mirror contract tests:** for each visible block, light+dark contrast pairs asserted
   from the CSS itself (a source-contract test like the existing staff-fitting.test.ts).

---

## 13. Prioritized remediation roadmap

1. **P1 — Cash-shift close (HUI-011):** fix the reopen error, re-enable close, regression-test
   open→count→variance→close→reopen cycle. UX copy already exists; only the flag removal matters.
2. **P2 — CSS consolidation residue pass (HUI-001/002/007):** one mechanical PR — strip dead
   declarations, dedupe sidebar base, refresh DESIGN.md import table. Low risk, high clarity.
3. **P2 — Type-floor raise (HUI-003):** staff-theme + guest-booking sweep to the 8-11px floor;
   browser-verify the pricing overlays before/after.
4. **P2 — `!important` debt reduction (HUI-005):** bell block + account modal first.
5. **P2 — PageHeader migration wave 1 (HUI-010):** three admin governance modules, then
   finance modules.
6. **P3 — hygiene batch (HUI-004/006/008/009/012/013/016/020):** token renames, dead-code
   decision, breakpoint policy, mirror contract test, staff-theme headers.
7. **Browser-verification sprint (§11):** one afternoon with the staff + guest accounts at
   1366/768/390 resolving every NEEDS VERIFICATION item.

---

## 14. Recommended regression-test strategy

Current suite is strong on contracts (186 files). Extend it to cover the audit's weak spots:

1. **Visual token contract tests** (extend `staff-fitting.test.ts`): assert no CSS font-size
   below 10px outside allowlist; assert light+dark mirror exists per family; assert no new
   `!important` in shared roots without a named comment.
2. **Focus/keyboard source contracts:** assert `:focus-visible` rules exist for every new
   interactive component CSS; assert each icon-only button in a changed surface carries
   aria-label (pattern exists in notification-bell tests).
3. **Route-role matrix test:** assert page.tsx role redirects for the 8 roles × critical routes
   (extend owner-dashboard-layout.test.ts pattern to admin + manager page + qr-placard + kiosk).
4. **jsdom interaction suites** for arrival wizard subtotal steps and cash-shift close/reopen
   once the flag is removed (turn HUI-011 into a regression test).
5. **Manual browser matrix per release** (the only true visual ground truth): 1366/768/390 ×
   staff light/dark per role dashboards + booking flow + customer portal, using the §11 checklist.

---

## 15. Pages/features not inspected (or inspection-depth-limited)

- `/verify` OTP page and `/forgot-password` flow — auth shell pattern read, deep per-state
  inspection deferred; OTP values never displayed by design.
- `/account/help`, `/account/loyalty` (deep card-level), `/account/receipts/[id]`,
  `/account/settings` — shared shell/pattern inspection only.
- `/my-reservations/[id]` change-request dialogs and `/booking/payment/[token]` +
  `/booking/review/[token]` internal step composition — pattern-level only.
- Inside `ManagerDashboardClient`, per-section bodies were spot-checked; not every render
  branch of 2 466 lines was traced line-by-line.
- `app/api/**` server routes (out of UI scope) and service worker/`sw` assets (none found).
- No browser QA at all (see §2): nav drawer animation, focus order in real browsers, print
  output ink, chart canvas rendering, camera-permission UX (`QrScannerModal`, kiosk) remain
  unverified.

---

### Positive findings worth replicating

- Command palette availability is identical in all four shells — one shared component doing real work.
- Module badge counts derive from the same predicates as filters (card == chip == rows invariant,
  tested in `module-summary.test.tsx`) — the best data-truthfulness practice in the repo.
- Honest status copy everywhere operational data is missing (`Shift closing is temporarily
  suspended`, empty states offer the supported action, no fabricated zeros).
- `customer-portal.css` and `system-health.css` show the sane pattern: self-scoped token layer,
  no shared-theme edits, sectioned with comments.

*Report generated as an audit deliverable only; no implementation changes were made.*

---

## 11. Remediation Phase 1 outcomes (2026-10-18, same date as audit)

Executed after plan approval ( .opencode/plans/frontend-remediation-phase2-plan.md).
All gates re-run post-change: 	ypecheck exit 0; eslint touched files 0 errors;
targeted vitest green; full 
pm test **185 files / 2 069 tests passing** (net −1
file / same tests: dead pp-shell.test.tsx removed, +2 re-enabled-close contract
tests, +1 PageHeader breadcrumb contract); 
pm run build exit 0; 
pm run lint
0 errors / 91 warnings (6 advisory warnings retired with deleted dead components).

- **HUI-011 (P1) RESOLVED** — cash-shift Close re-enabled with user approval.
  Root cause verified: the 2026-10-03 suspension guarded against a stranded
  drawer (no reopen flow + CASH_SHIFT_REQUIRED blocking check-in balance
  payments); the 2026-10-24 single-open rule, shared-drawer index and live
  unattributed-cash bypass (CASH_BYPASS_ACTIVE=true) removed that risk.
  Flag, 409 backstop and suspension banner deleted; contractor tests
  (lib/accounting.test.ts "cash-shift close re-enabled") now pin the offer,
  the owner-only sign-out block, and safe RPC error mapping.
  NEEDS BROWSER VERIFICATION: close→count→reconcile happy path per role.
- **HUI-001 RESOLVED** — root cause re-derived: the ONLY consumer of the bare
  .sidebar component markup was the dead Sidebar in
  components/ui/Navigation.tsx (zero runtime imports). Deleted Sidebar +
  NavGroup, their exports, and the Modal.css Navigation section (~396 lines);
  globals.css .sidebar block KEPT — it is live mobile-drawer base
  (≤1000px off-canvas rules live only there). responsive.css:77 88vw rule
  documented as cascade-dead, left in place (harmless).
- **HUI-006 RESOLVED** — unused AppShell/.saas-shell deleted (tsx + css +
  test + pp/layout.tsx:16 import). Zero consumers existed.
- **HUI-003 RESOLVED (bounded)** — every active AND cascade-dead sub-9px
  ont-size raised to a 9px floor by token substitution
  (staff-theme.css 52 → 0, guest-booking.css 14 → 0; no value replaced one ≥9px;
  !important suffixes untouched). Zero pinned-test collisions
  (booking/staff/toast/notifications suites all green). Layout shift risk
  NEEDS BROWSER VERIFICATION at 390/768/1366 px.
- **HUI-007 RESOLVED** — DESIGN.md §1 rewritten to the real 15-import order;
  §2 palette section de-coastaled to the live per-surface truth; stale
  file refs in §10/§11/§12 + staff-ops delivery line fixed; ui-primitives
  header/footnote comments repointed to pp/staff-theme.css.
- **HUI-005 (P2) REPORTED, not fixed** — full wall classification in
  docs/qa/important-review.md (66 !important walls mapped; 2 structural
  bell-fight + modal load-order root causes; removal deferred to a browser-QA
  gated follow-up).
- **HUI-010 PARTIAL** — PageHeader composition contract extended
  (shared-Breadcrumb rule in components/ui/page-header.test.tsx).
  Inline page-title ×30 migration deferred: no zero-risk adoption target
  exists; the only parallel implementation (TailAdminPageHeader,
  consumer = the visual template preview) must be consolidated in a
  browser-verified pass.

User files preserved untouched: 
ano_bots/**, itest.config.mts,

ext-env.d.ts, untracked .opencode/, docs/qa/, session notes.
No commits, no migrations, no dependency changes, no npm installs.
