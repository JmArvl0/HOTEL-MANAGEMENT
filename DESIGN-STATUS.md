# DESIGN-STATUS.md — Haven Hotel Management UI/Design Status Report

A design-only companion to [`SYSTEM.md`](./SYSTEM.md). One page per question: **which UI surfaces
exist, what styles them, and which parts of the UI are off and need fixing.** Every finding below
was verified by direct read of the CSS/TSX source in the working tree.

- **Reference point:** working tree on branch `main`, 2026-09-05 (main @ `e91ee55` plus uncommitted
  changes: notification/profile popovers, staff settings modal, Rooms card grid).
- **Status legend:** ✅ healthy · ⚠️ needs attention · ❌ broken.
- **Companion docs:** [`SYSTEM.md`](./SYSTEM.md) (full system), `design-system/haven-hotel/MASTER.md`
  (see finding #2 — it does not match the shipped app), `docs/lacking-of-the-system/05-ux-and-accessibility.md`
  (older UX gap audit, 2026-08-26; several items are since fixed).

---

### UPDATE 2026-09-10 — extended coastal conformance pass

The original coastal override was expanded into a source-level conformance pass across public,
customer, staff, modal, QR, chart, loader, and guest-email presentation layers. Surviving extended
forest/terracotta literals were replaced with deep ocean teal, sea-glass, coastal ink, and warm
ivory equivalents. Semantic success/warning/danger and payment-status families were preserved.

Verification: the retired-family sweep across `app/`, `components/`, and `lib/` returns zero hits;
the Impeccable detector returns no findings; typecheck, lint, all 713 tests, and the 57-page
production build pass. Desktop and mobile browser checks for landing, booking search, and login
return HTTP 200 with no console errors or horizontal overflow. Authenticated staff/customer
light-and-dark smoke checks still require live role sessions.

---

### UPDATE 2026-09-09 — coastal brand refresh

Brand palette swapped from forest/terracotta to coastal: brand hexes moved to coastal tokens in a
new override layer `app/coastal-theme.css` (imported last in `app/layout.tsx`, so it wins the
cascade over the per-surface rules). Deep ocean teal `#084b55` primary, warm ivory `#f8f6f1`,
sea-glass accents, ink/line/muted per `DESIGN.md` §2. Old `#173f32` / `#1f6b52` / `#c9783c` are
retired from brand layers. **Semantic status families (badge green/amber/red, both mirror
palettes) are untouched** — only brand surfaces moved. `coastal-theme.css` also adds a dark-mode
`@media` block for the shell; the landing stays light-only via `landing.css` `color-scheme: light`.

---

### UPDATE 2026-09-05 — modal pass: header placement + duplicated message (F8)

Redo of the shared dialog shell that styles the popups on **every** user-case page (guest portal,
booking, manager/owner/admin dashboards). Two systemic defects fixed at the shared layer:

- **F8a — header description floated mid-bar.** `Modal.tsx` rendered title, description, and the
  close button as three ungrouped children of `.modal-header` (`flex; justify-content: space-between`),
  so any dialog with a description (form dialogs, multi-step, room details, reservation change-request)
  showed it centered in the header instead of tucked under the title. Header now wraps title +
  description in `.modal-header-text` (`flex: 1; min-width: 0; flex-direction: column`); the close
  button is the only real flex sibling. `.modal-description` margin replaced by the 3px group gap
  (`components/ui/Modal.tsx`, `components/ui/Modal.css`).
- **F8b — prompt message printed twice.** `ConfirmDialog`, `PromptDialog`, `SelectDialog`,
  `RoomSelectDialog`, and `ChecklistDialog` passed `message` as the header `description` *and*
  rendered the same text again as a body `<p>`. Removed the header pass-through so each confirm /
  prompt / select / room / checklist shows its copy once, in the body, under the title
  (`components/ui/Modal.tsx`, `components/ui/FormDialog.tsx`).

Verified: `npm run typecheck` clean, eslint on the two changed components 0 errors, mechanical
detector (impeccable) no findings.

---

### UPDATE 2026-09-05 — button / spacing / control pass (fixes F2–F5, F7)

A repo-wide spacing-and-controls pass shipped on top of the earlier F1 fix. What changed and where:

- **New normalization layer `app/ui-primitives.css`** (imported last in `app/layout.tsx:11`): one
  canonical `.btn` metric block (40px / gap 8px / radius 6px, `:focus-visible`, `:disabled`),
  `.btn-sm`/`.btn-lg` opt-ins, `.btn-row` + `.end/.between/.center/.stack` modifiers, wrap guards on
  `.form-actions`/`.modal-actions`/`.reservation-actions`, a row-action `.table-action` floor, the
  **≤680px header-button fix** (`:has(> svg:only-child)` guard so text-only page-title CTAs never
  collapse to blank squares), badge coverage, and guest-shell dark re-themes.
- **F4** — staff type floor raised in `manager-dashboard-theme.css` (secondary text 9→11px, captions
  ≥8px); staff `.app-shell .btn` compact scale re-based to 36px / 11px and documented as the
  intentional second density.
- **F5** — `.badge.active / .on_leave / .suspended / .escalated` added in public + `.app-shell`
  dark + `.theme-light .app-shell` contexts (mirror palettes).
- **F3 (bounded)** — `design-tokens.css`: `--font-sans: var(--font-inter)` self-ref replaced with a
  plain fallback stack; dead `--md-*` alias blocks removed. The OS-dark re-map block is left intact
  (removing it is a behavior change, out of scope) and is tracked in F3 below.
- **F7** — `.customer-shell .booking-notice` / `.deposit-reference` re-themed onto `--cp-*`.
- **F2** — `design-system/haven-hotel/MASTER.md` is now banner-marked superseded; the live system is
  captured in the new **`DESIGN.md`** at the repo root.
- **Inline-style sweep** — spacing/margin/flex hacks removed across the customer portal & booking
  TSX: `transportation-request-form.tsx`, `transportation-request-list.tsx`,
  `guest-request-form.tsx`, `reservation-actions.tsx`, `guest-details-form.tsx`,
  `my-reservations/[id]/page.tsx`, and `FormDialog.tsx` (the 80px spacer + Cancel/primary ordering →
  CSS-only Back/Cancel/primary layout in `Modal.css`). Remaining inline styles are genuinely dynamic
  (chart dims, open/closed nav) or single-purpose visual one-offs (auth star rows, search page pill
  CTAs).

**Browser check (quick):** buttons never touch (10px action-row gaps), header CTAs readable on
≤680px, multi-step dialog shows Back left · Cancel/primary right on all steps, customer
transportation form/list rows keep a consistent 12px gutter, guest shell reads correctly in both
themes.

---

## 1. Style architecture

### 1.1 Cascade order (what wins)

Root layout imports, in order (`app/layout.tsx:4-10`) — later files win on equal specificity:

| # | File | Lines | Styles |
|---|---|---|---|
| 1 | `app/globals.css` | 152 | Landing + booking + shared staff base (`:root` tokens, `.btn`, `.badge`, `.modal`, `.toast`, login, app-shell base rules) |
| 2 | `app/guest-booking.css` | 55 | Booking flow, landing extras, customer account/portal (`--cp-*` palette) |
| 3 | `app/manager-dashboard-theme.css` | 134 | Staff dashboard dark theme + `.theme-light` overrides (`.app-shell` scope) |
| 4 | `app/responsive.css` | 179 | Mobile-first hardening, touch targets, micro-interactions (all shells) |
| 5 | `components/ui/Modal.css` | 2248 | Modal/form-dialog component styles |
| 6 | `components/booking/room-details.css` | 162 | Room detail sheets |
| 7 | `app/design-tokens.css` | 795 | **Loads last — redefines legacy tokens** (see finding #3) |
| 8 | `app/ui-primitives.css` | 154 | **Normalization layer — loads last of all** (2026-09-05): shared `.btn` metrics, action-row gaps/wrap, mobile header-button fix, badge + dark-shell coverage |

Page/component-scoped sheets (imported by their own files, so they load with that chunk):
`app/(landing-page)/landing.css` (403), `app/(booking)/booking/search/search.css` (144),
`components/auth/auth-vault.css`, `components/ui/haven-loader.css`.

### 1.2 Typography

**Inter** (sans, `--font-sans`) + **Playfair Display** (serif display, `--font-display`) for every
surface, loaded once via `next/font` on `<body>` (`app/layout.tsx:12-13`). No per-role font
differences; surfaces differentiate by palette only, as intended.

### 1.3 Theme mechanism

- Class-based toggle: `.theme-light` on `<html>`, set pre-paint by the inline script
  (`app/layout.tsx:25`), persisted per shell (`haven-dashboard-theme` key). Applied to the guest
  portal (`--cp-*` light overrides) and staff dashboards (`--ds/--ds2/--dl` overrides).
- A *second*, OS-driven mechanism exists in `design-tokens.css:359-472`
  (`@media (prefers-color-scheme: dark) :root:not(.theme-light)`) — see finding #3.
- Landing, booking (anonymous), and auth pages are single-theme by design (light, light, dark).

---

## 2. Surface inventory

| Surface | Routes | Shell / components | Palette | Dark+Light | Status |
|---|---|---|---|---|---|
| Public landing | `/` | `(landing-page)/page.tsx` + `landing.css` (over `globals.css`) | cream `#f8f6f0`, forest `#13382c`, accent `#c9783c` | single (light) | ✅ |
| Booking flow (anonymous→guest) | `/booking/search`, `/booking/details`, `/booking/payment/[token]`, `/booking/review/[token]`, `/booking/confirmation/[id]` | `components/booking/*`, `search.css`, base rules in `globals/guest-booking` | light cream/white | single (light) | ✅ |
| Guest portal | `/account/*`, `/my-reservations/*` | `components/customer/customer-shell.tsx` + `--cp-*` (`guest-booking.css:11`) | dark `#0d120f` / light `#f4f5f1`, green `#66c99f` | ✅ both | ✅ (⚠️ F7 remnants) |
| Auth | `/login`, `/register`, `/auth/continue`, `/recover/[token]` | `components/auth/auth-vault-shell.tsx` + `auth-vault.css` + `auth-motion.tsx` (`/recover` keeps `.auth-card`) | full-bleed sea scene under a deep-teal wash, one floating glass card, coastal tokens + gold em | single (by design) | ✅ |
| Staff dashboard — manager/front_desk/housekeeping/maintenance/accounting | `/manager_dashboard` | `components/manager/manager-dashboard-client.tsx` + `transportation-panel.tsx`, `.app-shell` theme | dark `#141815` family / light `#fff` family | ✅ both | ⚠️ F1, F4, F5 |
| Staff dashboard — owner/admin | `/manager_dashboard` | `components/owner/owner-dashboard-client.tsx`, `components/admin/admin-dashboard-client.tsx` | same `.app-shell` theme | ✅ both | ⚠️ F1, F4, F5 |

---

## 3. Findings (ranked: fix top-down)

### ✅ F1 — RESOLVED (2026-09-05): staff Rooms cards no longer hit by unscoped landing CSS

> **Resolution:** the landing `.room-card*`/`.room-grid` family was scoped under `.landing` in
> `globals.css` (lines 2, 6, 50 — pure selector prefixing, zero value changes; the landing markup is
> wrapped in `.landing`, so its visuals are unchanged), and the staff Rooms cards received a small
> CSS-only readability pass in `manager-dashboard-theme.css` (10px status chip replacing the 8px
> floor, 12px/1.5 detail rows with bolded tabular-nums values, 16px card padding). The finding below
> is retained for history; it is no longer actionable.

**Where (was):** `app/globals.css:2` (the `/* Landing */` line) and `:6`, plus `:50`.

The *original* landing photo-card family was never scoped. These selectors still apply to the
staff dashboard's status cards (same class name, `.room-card`, used in
`components/manager/manager-dashboard-client.tsx:716`):

- `.room-card{min-height:465px; display:flex; align-items:flex-end; color:white; …}` → **the tall
  cards with content pushed to the bottom and white text on light tinted backgrounds** (the
  symptoms from the Rooms card fix request — they were only partially removed when lines 47-49
  were scoped to `.landing`).
- `.room-card:before` — a dark gradient overlay (`rgba(5,24,18,.85)` at the bottom) painted over
  the card.
- `.room-card:after` — the large decorative circle ("the empty area").
- `.room-card button{width:39px;height:39px;border-radius:50%;…}` — deforms the staff
  advance-status badge button into a 39px circle.
- `.room-card:last-child{grid-column:span 2}` (≤1000px media query, `globals.css:6`) — the last
  staff room card stretches across two columns.
- `.room-card-content` (lines 2 and 50, unscoped) — inert for staff (no such element), but still
  an unscoped landing class.

**Fix applied (2026-09-05):** prefixed the whole `.room-card*` family on lines 2, 6, and 50 with
`.landing ` (the landing markup is already wrapped in `<main className="landing">`,
`app/(landing-page)/page.tsx:93`), same as was done for lines 47-49/82-83. Pure selector scoping —
no values change, landing visuals unchanged. Followed by the Rooms-card readability pass (see the
resolution note above).

### ✅ F2 — RESOLVED (2026-09-05): MASTER.md banner + live DESIGN.md

**Where:** `design-system/haven-hotel/MASTER.md` (generated 2026-09-02) vs. the shipped app.

MASTER.md specifies **navy `#1E3A8A` primary + gold `#A16207` accent + Karla + Playfair Display SC**
fonts. The app actually uses **forest green `#173f32`/`#1f6b52` + terrracotta `#c9783c` + Inter +
Playfair Display**, and loads none of MASTER.md's fonts (`app/layout.tsx:12-13`). Any future work
that "follows the design system file" will introduce a third palette. (`login.css` already claims
to "respect MASTER.md tokens" while matching the app, not the file.)

**Fix:** regenerate MASTER.md from the shipped app, or add a banner marking it superseded.

### ✅ F3 — RESOLVED 2026-09-05 (bounded): `design-tokens.css` trims

**Where:** `app/design-tokens.css` (imported last at `app/layout.tsx:10`).

It redefines the legacy aliases `--ink, --forest, --green, --mint, --cream, --paper, --accent,
--line, --muted, --danger, --shadow` (lines 749-775) and `--cp-*` (725-746) to point at its own
slate-based scale, including a **system-dark block** (`@media (prefers-color-scheme: dark)
:root:not(.theme-light)`, lines 359-472) that doesn't match the app's deliberate forest-palette
dark themes. Impact today is partial (most component CSS hardcodes hex; only elements using
`var(--ink)`/`var(--line)` etc. shift cool-slate under OS-dark), but the two dark-mode systems will
drift further. Also: `--md-*` aliases (777-796) are defined but never referenced anywhere (dead),
and `--font-sans: var(--font-inter)` (line 124) references a variable never set (layout writes
`--font-sans` directly) — inert but misleading.

**Fix options:** stop importing design-tokens.css into the app (keep it as reference), or strip it
down to only what the app consumes; align its dark block with the `.theme-light` class system.

### ✅ F4 — RESOLVED (2026-09-05): staff dashboard type floor raised

**Where:** `app/manager-dashboard-theme.css`.

Font sizes run 6px (`.brand small`), 7px (`.eyebrow`, `th`, `.mode-pill`, `.metric-card small`,
`.trend`, `.panel-heading p`), 8-9px across tables, buttons, popovers. This is a systemic
readability issue on every staff dashboard (manager, front_desk, housekeeping, maintenance,
accounting, owner, admin). The Rooms cards were just raised to 11-14px; the rest of the shell
wasn't. `globals.css` base sizes (9-13px) contribute too, but the staff theme is the denser layer.

**Fix:** a single pass over `manager-dashboard-theme.css` raising the floor (e.g. 8px→10px, 9px→
11px, 7px→9px, 6px→8px), keeping density via padding/line-height rather than font size.

### ✅ F5 — RESOLVED (2026-09-05): badge status coverage closed

**Where:** `globals.css:4`, `manager-dashboard-theme.css:12,20`, `guest-booking.css:23-24`.

Statuses rendered as `.badge.{status}` with **no CSS rule** fall back to generic gray (no semantic
color, status readable only from text):

- `off_duty`, `on_leave` — staff module (`components/manager/manager-dashboard-client.tsx:39`);
  only `on_duty` is styled.
- `active` / `inactive` / `suspended` — owner/admin `account_status` badges
  (`components/owner/owner-dashboard-client.tsx:168`, `components/admin/admin-dashboard-client.tsx:118`).
- `escalated`, `none` — guest-request escalation badge (`manager-dashboard-client.tsx:717`).
- Housekeeping `inspection_status` and `severity` render as plain text, not badges at all.

Three parallel status-pill systems exist:
1. `.badge` (globals + staff theme) — used by all dashboards;
2. `.customer-status` (`guest-booking.css:23`) — guest portal, diverging palette;
3. `components/ui/StatusBadge.tsx` (icon badges) — adopted only by 4 customer account pages +
   `DataTable`, not by any dashboard.

**Fix:** add the missing `.badge.*` rules to both globals and the staff theme (light+dark); longer
term, converge the guest portal onto `StatusBadge` or document `.customer-status` as the guest
surface's pill.

### ✅ F6 — RESOLVED (2026-09-07): landing page is single-styled

**Where:** was `app/globals.css:2-3` vs `app/(landing-page)/landing.css`.

**Resolution:** the interactive landing redesign rewrote `landing.css` as the single landing
stylesheet (tokens, reveal system, parallax, all sections, responsive blocks) and removed every
landing-only rule from `globals.css`, `guest-booking.css`, and `responsive.css`. Those files keep
shared primitives only (`.btn` family, `.eyebrow`, `.brand`, focus-visible ring,
`scroll-padding-top`). Landing selectors are scoped under `.landing`, so no cross-surface
collision is possible.

### ✅ F7 — RESOLVED (2026-09-05): dark-shell stragglers re-themed

**Where:** `app/guest-booking.css:41,55`.

The booking flow was light-only by design; inside the dark customer shell it's re-themed via
`.customer-shell …` overrides (`guest-booking.css:35-38`). A few stragglers remain: `.booking-notice`
hardcodes `#fff3dc`/`#6f4b16` (light cream on dark), `.deposit-reference input` uses `--line/--ink`
(which resolve from design-tokens, not `--cp-*`).

**Fix:** add `--cp-*`-based overrides for the two selectors scoped under `.customer-shell`.

### ✅ Healthy (verified, no action)

- **`app/responsive.css`** — mobile-first, adaptive gutters, no-horizontal-scroll guards, ≥44px
  touch targets under 680px, iOS zoom prevention (16px inputs), reduced-motion kill switch,
  micro-interactions. Good across all shells.
- **Staff light mode** — 41 `.theme-light` rules cover the dashboard's dark set systematically.
- **Guest portal dual theme** — `--cp-*` dark/light pairs are complete and consistent.
- **Print styles** — both `globals.css` and `design-tokens.css` carry sensible print rules.
- **Rooms card grid** (design intent) — `minmax(240px,1fr)` responsive grid, status-tinted cards,
  right-aligned detail rows, type subtitle; readable badges in both themes. (Now fully live: F1's
  unscoped rules were scoped under `.landing` on 2026-09-05 and the cards received a CSS-only
  readability pass.)

---

## 4. Recommended fix order

1. ~~**F1** — scope the `.room-card*` family in `globals.css:2,6,50` under `.landing` (small,
   zero-risk, unblocks the Rooms card design users already asked for).~~ **Done 2026-09-05** (scoping
   + Rooms-card readability pass).
2. ~~**F5** — add missing badge status rules.~~ **Done 2026-09-05** (`ui-primitives.css`).
3. ~~**F4** — staff typography floor raise.~~ **Done 2026-09-05** (`manager-dashboard-theme.css`).
4. ~~**F3** — bounded design-tokens trim.~~ **Done 2026-09-05** (self-ref + dead `--md-*` removed;
   OS-dark block retained — flagged above).
5. ~~**F2** — banner `MASTER.md` + publish `DESIGN.md`.~~ **Done 2026-09-05**.
6. ~~**F7** — guest shell light remnant overrides.~~ **Done 2026-09-05**.
7. ~~**F6** — de-duplicate landing styles~~ (resolved 2026-09-07 by the landing redesign).

---

*Original findings verified 2026-09-05 by direct read of the CSS/TSX source. Fixes for F1–F5/F7 shipped
2026-09-05 in the same tree (see the UPDATE box above).*
