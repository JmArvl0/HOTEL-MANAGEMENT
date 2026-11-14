# DESIGN.md — Haven Hotel design system (live)

The source-of-truth reference for the shipped UI. **Do not apply
`design-system/haven-hotel/MASTER.md`** — it is superseded (see `DESIGN-STATUS.md` F2).
This doc and `app/ui-primitives.css` are the current system.

**Account dashboards (2026-11-12).** Manager, Front Desk, Housekeeping,
Maintenance, Accounting, Admin, Owner, and Guest share the dashboard heading,
four linked metrics, and responsive panels. The lead panel reflects the
role’s work. Dashboard peso amounts reveal together through the eye and start
masked on each visit. The Guest view retains its room photo and stay actions.

**Manager dashboard (2026-11-11).** Four headline metrics open the relevant
booking or room filters. Decisions & exceptions and Room readiness share the
first workspace row, followed by two periods of booked occupancy and today’s
financial summaries. The eye button reveals the four peso amounts with
centavos. The masked state returns on every fresh visit.

**Housekeeping (2026-11-11).** A counted stage strip sits above a room queue and
the selected task. The detail shows recorded room state, arrival, service notes,
and the signed-in role's next action. Phones open the task separately and
return to the filtered queue with focus on its room. The shared staff header
shows the date and time.

**Hotel Operations (2026-11-11).** The shift briefing places the operating
date, close blockers and carry-forward work above one department handover
sheet. Notes expand inline for ownership, linked records and history. The
layout uses existing staff surface, ink and semantic status tokens in both
themes. Department roles see their handover scope, and close review and
financial controls follow the signed-in role.

**Transportation (2026-11-10).** The dispatch queue leads with leg time in
Manila and labels returns due today. One counted filter set and search control
the queue. The selected itinerary shows connected route stops, progress,
driver, vehicle and folio fare. Wide layouts fill the workspace with a shared
bottom edge and independent scrolling. Narrow layouts open the itinerary
separately and return to the same queue, filters, page and focused row.

**Guest Requests (2026-11-10).** A counted queue groups submissions awaiting
approval, open work and history. The oldest pending submission appears first.
The selected submission shows the booking and room, guest note, item states
and recorded activity. Wide desktop frames share a bottom edge and scroll
independently beneath the queue controls and detail heading. On phones, Back
to queue preserves the search, filters and row focus. Supply quantities are
available in a disclosure in the details pane.

**Guest Management (2026-11-10).** The directory and selected guest profile
share a warm ivory or forest surface. The directory keeps search, quick filters,
loyalty and pagination together. The profile shows the current or next stay,
preferences and identity in Overview, with separate Stays and Guest flags tabs.
On desktop both frames fill the workspace to the same bottom edge. The table
and profile content scroll independently while their controls and headings
stay visible. Narrow layouts open the profile separately and return focus
to the guest row when Back to directory is used.

**Front Office workspaces (2026-11-09):** Room Management pairs four shared
summary cards and collapsible room groups with a Today's focus and Quick insights
rail. Room cards show separate room and housekeeping conditions and open the
room dossier. Ready, dirty, and out-of-service focus rows apply room filters.
Arrivals and unassigned arrivals open the matching Front Desk queue.

Bookings opens the room calendar with previous, Today, next, range, and filters.
Named stay bars show references and dates where space permits. The room column
and date header remain pinned within the scrollable table. Needs attention uses
dated issue cards with Review actions. Booking list opens a full-width view with
its own heading, search, and history controls. Back to calendar restores the
calendar dates and room filters. Room history remains a disclosure in booking details.
Both page headers use the same themed panel surface. Above 1,100px and from
600px tall, the desktop rails fill the available height. The main work area
and the rail contents scroll independently of the rail frames and headings.
Room Management hides the inner scrollbars. Today's focus rows and Quick
insights expand into available height and scroll within the panel on short screens.
The rails stack below their workspaces at 1,100px. On phones, filters and header
actions wrap, and horizontal scrolling stays inside the calendar.
The shared staff header shows the current Manila date and time beneath the
section title. The Bookings subtitle describes the workspace.

**Front Desk dashboard spacing (2026-11-03):** Approved metric cards use
top-right icons and aligned values/helper text. Direct panel headings in
`.overview-role-front_desk` have zero left/right padding. Shared staff
`.panel-heading` styles also have zero top padding; existing bottom padding
and outer article padding remain intact.

**Shared panel dividers (2026-11-03):** Direct `.panel > .panel-heading`
dividers extend to the container edges across staff portals. The divider inset
tracks the panel's actual padding, including analytics, reports and AI responsive
variants; heading and body spacing remain unchanged. Flush `.data-panel` headers
retain their existing full-width borders.

**Approved HMS workflows (2026-11-03):** `app/hms-workflows.css` follows
`staff-theme.css` and precedes the final shared sidebar layer. Inventory uses
the approved table/history plus adjacent issue/count form. Cash now uses the
approved Cash & Shifts workspace (2026-11-04): connected expected/count/difference,
independent count review in the shared Modal, handover/reconciliation rail, and
full-width movements/history. `cash-shifts-workspace.css` owns its ivory/forest
light palette, equivalent dark palette and mobile row recomposition. Financial
comparison precedes supporting cash basis in both DOM and visual order. Count
drafts remain owned by `CashCountPanel`; filters and same-drawer refresh preserve
them. Unavailable counts never imply agreement. Operational Handover has a
standalone source/owner form and filterable follow-up log. Guest and uploaded-ID
forms preserve the existing portal/arrival shell. Labels, draft preservation,
stable retry keys, truthful status/error feedback and keyboard focus are part of
the workflow; no prototype/sample records are wired into production screens.

**Cash & Shifts prototype integration (2026-11-14, local):** Front Desk and
Accounting share the preview's drawer card, inline physical count editor,
readiness checklist, handover card, cash activity filters, and history summary.
Accounting has the reconciliation controls. The separate confirmation dialog
shows the count and difference before final close. Mobile tables scroll within
their cards. The workspace uses the staff dashboard's light/dark theme.

**Cash safeguards (2026-11-05, local):** Count review distinguishes unsaved edits,
an explicitly saved server draft, resume/fresh count and final Close. Changed
cash activity requires recounting; stale versions and unconfirmed close responses
retain recoverable input. Refund payout uses the existing Modal and native
method/drawer selectors, with an explicit completed-payout confirmation. Closed
drawers show scoped handover and report status/actions within the current drawer
stack and history detail. Handover prefill and report-date navigation never submit
automatically. Existing light/dark tokens, mobile stacking and 44px label/action
targets are retained; the payout checkbox remains 20px inside its larger label.

**Verified cash UI gaps (2026-11-06):** Actual-app light/dark QA confirms the
cash workspace reflows at 320/390/768/1024/1440px, but the shared header clips
controls at 320/390/1024px. Modal actions measure 36px high and refund selectors
40px, short of the 44px target above; the checkbox's larger label is intentional.
Report currency display drops centavos and a closed drawer's own handover can say
“Other cash shift.” These remain findings, not implemented design changes.
Evidence: `docs/qa/cash-delivery-ui-qa-2026-11-06.md` (CD-02–05).

- **Companions:** `DESIGN-STATUS.md` (what is off / what got fixed), `SYSTEM.md` (behavior).
- **Snapshot:** working tree on `main`, 2026-10-06 staff-layer rewrite fold
  (see `DESIGN-STATUS.md` and `.impeccable/surfaces/app-booking-search.md`).

---

## 1. How CSS is loaded (what wins)

**Navigation update (2026-11-03):** The table below is historical; current
`app/layout.tsx` loads `staff-theme.css` near the end, followed by
`sidebar-navigation.css` as the final shared navigation layer. It owns sidebar
metrics for Manager/operational staff, Admin, Owner, and Guest: 280px expanded,
80px collapsed, 48px targets, 22px expanded / 24px collapsed icons, and 48px
cropped transparent logo marks. Mobile drawers retain labels even when a desktop
collapse preference is saved. Staff property pills have been removed. The shared
small logo uses its original colors in light mode and a white silhouette in dark
mode; public/auth large logo tiles retain their existing presentation.
Sidebar scrollbars are hidden with `scrollbar-width:none` and WebKit scrollbar
rules in that same layer, including staff outer/nav containers, Guest, and the
reusable navigation shells. Existing overflow, focus and scrolling behavior remain.

`app/layout.tsx` imports, in order — later files win at equal specificity:

| # | File | Role |
|---|---|---|
| 1 | `app/globals.css` | Shared base: tokens, `.btn`, `.badge`, `.modal`, `.toast`, landing + login + app-shell base (staff mobile drawer: `.sidebar{transform…}` at ≤1000px) |
| 2 | `app/guest-booking.css` | Booking flow, guest/account portal |
| 3 | `app/responsive.css` | Mobile hardening, touch targets, micro-interactions, reduced-motion |
| 4 | `components/ui/Modal.css` | Modal / form-dialog, Breadcrumb, PageHeader, chart styles |
| 5 | `components/ui/haven-select.css` | HavenSelect listbox |
| 6 | `components/ui/haven-data-controls.css` | Toolbar / search / filter badges / empty state |
| 7 | `components/booking/room-details.css` | Room detail sheets |
| 8 | `app/design-tokens.css` | Legacy token re-map (legacy OS-dark `@media` block kept off-path) |
| 9 | `app/ui-primitives.css` | **Normalization layer** — shared control metrics + action-row spacing |
| 10 | `components/customer/notification-history.css` | Notification history modal |
| 11 | `app/customer-portal.css` | Customer portal palette + layout (`.customer-shell`) |
| 12 | `components/auth/session-expiry.css` | Session expiry banner |
| 13 | `components/ui/command-palette.css` | Command palette |
| 14 | `components/ui/haven-account-modal.css` | Account modal |
| 15 | `app/staff-theme.css` | **THE staff layer (2026-10-06 rewrite, last import)** — merged `manager-dashboard-theme` + `staff-ops` + `haven-tailadmin` + `fleetops` into one sheet, per-property newest-wins; all rules `.app-shell`-scoped |

Page-scoped sheets import with their chunk: `(landing-page)/landing.css`,
`(booking)/booking/search/search.css`, `components/auth/login.css`,
`auth-vault.css`, `components/ui/haven-loader.css`.

Rule of thumb: **palettes live in each surface's scoped rules** (`.customer-shell …`, `.app-shell …`,
`.theme-light …`); **shared control *metrics* and spacing live in `ui-primitives.css`**. That split
keeps guest / booking / staff character while giving every surface the same button height, radius,
motion, focus ring, and action-row gap.

## 2. Color

Palettes live inside each surface's scoped rules (the 2026-09-09 `coastal-theme.css` overlay was
retired with the 2026-10-06 staff-layer rewrite — its file is deleted and its hexes no longer ship
in any sheet; the same hexes may remain in DESIGN-STATUS history):

- **Staff dashboards:** `.app-shell` dark FleetOps neutrals (`--db/--ds/--ds2/--dl/--dt/--dm/--dg`
  in `app/staff-theme.css`, plus `--tail-*` primitives); `.theme-light` mirrors use the
  `--ops-*` scale. Light mode is a `.theme-light` rule set (colors only — sizes/metrics inherit
  the dark block).
- **Guest / booking:** neutral ink family in `app/globals.css` — `--ink/--forest/--accent` all
  alias `#111827` (dark-consumable), `--green` `#10b981`, grays for line/muted. Terracotta
  `#c9783c` is retired from brand use.
- **Customer portal:** the `--cp-*` scale (`app/customer-portal.css`, dark base + `.theme-light`
  mirrors); light `var(--tail-*)`-adjacent values also re-declared in `globals.css` scope.
- **Extended-family retirement (2026-09-10):** descendant-local modal tokens, booking-search
  gradients, room details, QR placards, staff accent literals, chart slices, loader copy, and
  guest-email presentation were audited and moved from the surviving forest/terracotta family to
  the coastal palette. Semantic success, warning, danger, payment, and reservation-status colors
  remain intentionally distinct.
- **Staff dashboards:** `.app-shell` dark `#141815` family; light mode is a `.theme-light` rule set
  (colors only — sizes/metrics inherit the dark block).
- **Badge status families** (green / amber / red) exist in two mirror palettes on purpose:
  *public/light* = soft pastel background + deep text (`#def1e8`/`#267056`, amber `#fff0dd`/`#a45a22`,
  red `#f9e3e1`/`#a44843`); *app-shell dark* = deep background + bright text (`#173024`/`#65d3a5`,
  `#34291c`/`#dfa062`, `#351f21`/`#ef797e`). Coverage gap closed 2026-09-05: `active`,
  `on_leave`, `suspended`, `escalated` added in both contexts (see `DESIGN-STATUS` F5).
- **Room-type badge colors** (2026-09-25, migration `20260925010000`): each active room type owns
  one semantic key from an eight-color HAVEN palette — `sage`, `gold`, `ocean`, `plum`,
  `terracotta`, `slate`, `sand`, `lavender` — stored on `room_types.badge_color_key` and rendered
  by the shared `RoomTypeBadge` (`lib/room-type-badge.ts`) as `.room-type.rt-<key>` pills.
  Each variant defines a dual palette via custom properties (`--rt-bg`/`--rt-fg` for the dark
  shell, `--rt-bg-l`/`--rt-fg-l` for light theme + shared light modal panels); e.g. sage
  `#173024`/`#65d3a5` dark, `#def1e8`/`#267056` light. Null/unknown keys fall back to the neutral
  pill (`#232823`/`#a8b3a8` dark, `#e8e8e2`/`#4a524a` light). These are **type identity**
  colors only — room-status and housekeeping badge colors are separate rules and never derive
  from the type key. Swatches in the Room Types & Photos editor render as the badge itself.
  Governance (`20260927010000`): a color is reserved by active types *and* types with pending rate
  proposals; creation requires a choice (no neutral escape hatch — null is legacy-fallback only);
  the `terracotta` key is a categorical badge hue and is not the retired brand accent `#c9783c`.
  Physical rooms inherit their type's key — there is no per-room color control anywhere.

**Theming:** `.theme-light` on `<html>`, set pre-paint by the inline script in `app/layout.tsx`.
A staff light palette is a `.theme-light` rule set inside `app/staff-theme.css`. The landing is
**light-only** via `landing.css` `color-scheme: light`. A second, OS-driven block in
`design-tokens.css` is legacy and can drift — keep new dark-theme work
inside `.theme-light`-aware rules, not `@media (prefers-color-scheme: dark)`.

## 3. Typography

- **Inter** (sans) + **Playfair Display** (serif display). Bundled with SIL licenses in `app/fonts` and loaded once via `next/font/local` on `<body>`,
  which writes `--font-sans` / `--font-display` directly. `design-tokens.css` `:root` fallbacks are
  plain stacks (inert vs. the body variables — harmless, no self-reference).
- **No per-role fonts** — surfaces differentiate by palette only.
- **Readability floor (staff, raised 2026-09-05, F4):** nothing below ~9–11px for secondary text /
  row actions / table cells; metadata 8–10px; `.brand small` and captions 8px+. Density comes from
  padding and line-height, not shrinking type.
- **Mobile:** body ≥16px (iOS zoom guard lives in `responsive.css`).

## 4. Spacing

- One 4px scale (`--space-1..24`) is the source; **`gap` for sibling rhythm, not child margins**.
- Action rows (`.btn-row`, `.form-actions`, `.modal-actions`, `.customer-request-form>div`, …) are
  flex + `gap` + `flex-wrap: wrap` — buttons never touch and never overflow on narrow widths.
- A single 12px rhythm separates stacked cards/sections in the guest shell (e.g.
  `.customer-request-list-wrap`, `.customer-detail-grid + .customer-detail-card`).

### 4a. Breakpoints — the 6-step scale (HUI-008 contract)

New responsive rules **must** use one of these `max-width` steps — not an ad-hoc
width. The named scale covers phone → executive desktop:

| Step | Purpose |
|---|---|
| 360 | smallest phone (390px iPhone class gets inside this gate) |
| 480 | large phone / small foldables |
| 680 | tablet-portrait / narrow window (the existing touch-floor gate) |
| 900 | tablet-landscape / small laptop split collapse |
| 1100 | desktop sidebar + dense-grid collapse |
| 1440 | executive desktop (4+ column arrangements) |

`min-width` variants use the same numbers (e.g. `@media(min-width:1201px)`
exceptions already shipped may stay; new ones pick 1101/1441 conventions).
Migration is **opportunistic** — migrate a module's media query when you are
already editing it; do not bulk-rewrite working blocks.

## 5. Buttons — one metric system, two densities

Canonical base (in `ui-primitives.css`, overrides the three legacy `.btn` blocks):

- `min-height:40px`, `gap:8px`, `border-radius:6px`, padding 13px 20px in `globals.css`.
- Hover/active/focus 150–300ms; `:focus-visible` outline 2px offset 2px; `:disabled` not-allowed.
- `svg` never shrinks; icon buttons hold their box.

**Two deliberate densities:**

1. **Public/guest/booking** — base `.btn` at 40px (`.btn-sm` 32px, `.btn-lg` 48px opt-ins).
2. **Staff `.app-shell .btn`** — intentional compact variant at **36px / 11px** (denser panels), not a
   bug. If reviewers want parity, widen there — do not blanket-bump to 40px.
3. **Mobile (≤680px)** — everything lifts to a 44px touch floor; header CTAs collapse to an icon
   square **only** when genuinely icon-only (`:has(> svg:only-child)`), so text-only header buttons
   (Manage users, Update policy, …) never turn into blank squares (bug fixed in `ui-primitives.css`).

## 6. Forms & modals

The Deposit Verification section uses a two-pane review workspace: queue on
the left, selected payment and proof on the right. Compact metric cards and
queue filters surface manual reviews, past-SLA items, provider waits, and
history. On phones the queue and detail become separate views with an explicit
Back control; decisions stay in a reachable footer. Accounting's verify/reject
actions open a confirmation dialog, while Front Desk has a read-only view and
no private proof preview. All status colors use staff theme tokens in light and
dark mode.

Billing's deposit/stay-payment detail entry point uses `PaymentDetailsDialog`, matching the
user-supplied green-header receipt reference (2026-11-04), with the actual
HAVEN Hotel & Residences name and shared `HavenLogo` mark (white on the green
header in both themes). Garden Twin is a room type, never the hotel brand. This
scoped exception keeps cream paper, subtle leaves, dotted rows, sage Paid/clay
Cancelled chips, a beige total strip and scalloped bottom in
both themes. The responsive follow-up replaces screenshot-sized geometry with a
560px preferred desktop/laptop width (90vw cap), a tablet width capped at 520px,
and mobile width `100vw - 24px` with 12px minimum side margins (≤680px). Height
is automatic, capped at 88dvh/720px with safe viewport margins; short windows
prioritize the available height. Titles use 26–34px, values 13–15px and labels
10–12px with fluid padding. The branded header and its 44px X control remain
outside the keyboard-accessible scrolling record; the redundant bottom Close
button is removed, with balanced paper padding below Total. Proof content expands the
scroll region. No scale transforms. Values remain live. The common title is
Payment Details; Purpose distinguishes the payment type. The same detail-row
component renders both payment purposes. Deposits include Expected Deposit and over/under
comparison. Pending records get review actions only when the caller has Accounting
authority; these actions stay in a fixed footer. Gateway payments never offer manual
confirmation. Other viewers and settled records use the same receipt in read-only mode.

- `.form-actions` / `.multistep-actions` right-align with a 10px gap; the multi-step **Back** button
  sits alone on the left, Cancel + primary hug the right. No spacer elements — the old
  `<div style={{width:80px}}/>` was removed and replaced by
  `.multistep-actions > .btn:first-child:nth-last-child(3){margin-right:auto}`.
- On ≤480px, action rows become `column-reverse` full-width buttons — primary first, Cancel/Back
  beneath.

## 7. Focus & motion

- `:focus-visible` on every interactive element (buttons get an explicit ring in
  `ui-primitives.css`).
- Micro-interactions: 150–300ms; active presses nudge (`translateY(1px) scale(.98)`); fully disabled
  under `prefers-reduced-motion` (`responsive.css`).

## 8. Public booking search

The public room-discovery route (`/booking/search`) extends the landing-page identity instead of introducing a separate booking brand.

- Use the shared landing navigation with **Rooms** marked as the current page. Breadcrumbs communicate location; the separate three-step indicator communicates booking progress.
- Lead with a photographic coastal hero, then overlap the compact availability form across the hero/content boundary. Search parameters and availability remain the source of truth for the visible filter chips.
- Room results are photo-first editorial cards. On wide screens, media and details share the card; at `820px` and below they stack. The results and support rail become one column at `1000px` and below.
- Availability is a circular, inventory-backed marker. Hover and keyboard focus coordinate the marker, room photograph, and primary select action; reduced-motion preferences remove these transitions.
- Support copy must remain operationally truthful: live inventory, the configured 15-minute hold, and deposit/terms disclosed before submission. Do not add invented ratings, scarcity, guarantees, sustainability claims, or chain-wide claims.
- `app/(booking)/booking/search/search.css` owns this route's scoped composition. Shared booking validation, availability, rates, and reservation behavior remain in their existing components and domain libraries.

## 9. Customer payments & folio

`/account/payments` keeps the coastal card identity with a decision-first hierarchy:
page hero → three financial KPI cards → transparent filter toolbar → folio cards.
The stable KPI strip shows the filtered folio count, outstanding balance, and
paid-to-date before the user reaches the controls. Search plus the Stay Status and
Payment Status `HavenSelect` controls filter the already-authorized server payload
locally, update faceted option counts and KPI totals without navigation or layout
shift, and mirror state into `?q=`, `?stay=`, and `?pay=` through browser history.
The shared toolbar wrapper remains uncontainerized; only its inputs/selects draw
surfaces. At narrower widths the KPI strip becomes one column and the controls stack.
Each folio card carries a paid-vs-total progress bar (`.folio-progress`, accent =
partial, green = settled) between header and `.folio-summary`, with a text
alternative on the progressbar role. Bucket derivation (`financialPaymentState`) and
money derivation remain shared presentation helpers — no query or business-logic
change. Styling is scoped in `guest-booking.css` (`.folio-*`) using `--cp-*` tokens.

## 9a. Customer rewards

The guest Rewards page uses the customer portal's dark-teal hero, followed by
three live KPI cards (tier/balance, tier progress, redemption value), a
selectable three-tier comparison, and the append-only points ledger. The API
payload remains authoritative; client code validates it before presentation.
Tier comparison cards are real buttons with pressed state and visible focus,
while the current membership is independently marked as Active tier. Progress
uses a semantic progressbar, transform-only animation, and reduced-motion
fallback. The ledger uses the shared pagination primitive on wide screens and
reflows into labeled records on narrow screens without horizontal page scroll.
Loading skeletons reserve the same page regions as the loaded content, and
errors include a retry action.

## 10. Module quick-overview cards (staff dashboards)

`ModuleSummaryCards` (`components/manager/module-summary-cards.tsx`, styled by the
`.mod-kpis` / `.mod-kpi` block in `app/staff-theme.css` — dark and `.theme-light`
mirrors) is the single pattern for the compact operational snapshot at the top of a staff
module. Each card is label / strong value (count or peso total) / one-line hint / icon chip.
It is deliberately **not** the big Overview `metric-card`: 10px label, 22px number, 9px
hint, 13–14px padding — dense enough to read as a snapshot above a table.

- **Tones are accents, not backgrounds.** The four semantic tones (`attention`, `today`,
  `active`, `done`) tint only the icon chip background; the card surface stays neutral.
- **Clickable where a filter exists.** A card with a `queue` renders as `<button
  aria-pressed>` and drives the module's existing filter state (Reservations queues,
  Guest Requests submission queues, Front
  Desk Reports status chips) — one control surface, never a parallel filter. Cards without a
  matching filter (e.g. Reservations "Active" or "Arrivals needing prep") are informational
  `<article>`s. Selected state = ring/border via `aria-pressed`, not color flips.
- **Counts are the filters.** Values derive from the same predicates, the same grouped
  queue (Housekeeping), and the same Asia/Manila `today` string as the module's filters,
  so card == chip == table rows.
- **Ordering is fixed.** Page title → cards → filter chips → search → table; the strip is
  the module's snapshot, read before any control.
- **Grid: one row, any count.** `repeat(auto-fit,minmax(0,1fr))` keeps 2–6 cards on one
  row with equal columns. ≤1000px → 2 columns, with an odd last card spanning the full row
  so nothing dangles; ≤480px → 1 column. Zero is a valid value and renders; the workspace
  loading gate means no false zeros while fetching.
- **Admin governance modules use the same vocabulary** (2026-09-24): Users & Staff, Room
  Configuration, Audit Logs, Security, and Admin Reports all lead with the card strip
  (clickable where a filter exists), and the shared filter-toolbar / table-badge / footer /
  clear-filters-empty-state kit from Users & Staff is the pattern for every admin table.
  Roles & Permissions renders role cards with capability chips; Hotel Policies groups the
  raw columns into labeled stat tiles (times `HH:MM`, booleans Yes/No, basis points as a
   percent) with a fallback group so schema additions are never hidden. Admin CSS lives in
   the `admin-*` block of `app/staff-theme.css` (dark + `.theme-light` mirrors).

- **Data toolbar convention (search-first).** Every combined search/filter surface
  follows the same DOM and visual order: search → quick-filter badges → advanced
  filters → results. Search updates after a 350ms debounce and never needs Apply;
  quick filters and `HavenSelect` changes apply immediately. `All` is first and is
  the default unless the workflow explicitly opens a scoped queue. ≤720px keeps
  the same order while stacking full-width; customer touch targets rise to 44px.
  Search inputs carry accessible labels and clear controls. See
  `docs/HAVEN_UI_STANDARDS.md` for the canonical primitives and migration rules.

## 11. Dropdowns & selects — one Haven language, two mechanisms

`HavenSelect` (`components/ui/haven-select.tsx`, styled by
`components/ui/haven-select.css`, tokens `--select-*` mapped to the coastal
palette in both `.app-shell` dark and `.theme-light` mirrors) is the single
shared dropdown primitive. Zero dependencies beyond `lucide-react` (no
Radix/shadcn — banned in `docs/ui-motion-guidelines.md`).

- **Filter/selector UI uses `HavenSelect`** (button + listbox): 44px trigger,
  11px radius, pale-teal selected row with a right checkmark, grouped options
  where the native control used optgroups, ≤720px full-width triggers with a
  60vh scrollable menu. Keyboard: arrows/Home/End + Enter + Escape, focus
  returns to the trigger; the menu carries "<field> options" as its label so
  it never collides with the trigger's accessible name.
- **Form data-entry keeps the styled native `<select>`** (same border/radius/
  focus/error language + custom chevron via `haven-select.css`): mobile
  pickers, form validation, and date/time inputs are untouched. Never nest a
  `HavenSelect` inside a `<label>` — labels forward clicks on non-interactive
  descendants to the toggle and would reopen the menu; use the neutral
  `.haven-filter` div (filters) or `.arrival-field.haven-field` div (forms)
  with the trigger's stable `aria-label` as the accessible name.
- **Out of scope by design:** action menus (⋮/profile/New-reservation),
  date/time inputs and the room radiogroup keep
  their own semantics and share only radius/type/shadow. Expected arrival is
  exactly such an input — a native `<input type="time">` beside Nationality,
  the same control as Pickup time under Need a ride.

## 12. Performance reports surface (staff Reports section)

The approved Reports role prototype now maps to separate live role-specific
surfaces. `/prototypes/reports` remains a development-only sample-data preview;
production views use their existing session role and server-backed payloads.

- **Front Desk.** `FrontDeskReportsPanel` reads the selected hotel day's live
  snapshot and seven-day arrivals/departures trend. The page uses the approved
  prototype's editorial heading, date/export/generate actions, joined four-value
  metric band, and a trend panel beside a compact `Shift activity` preview.
  Nonzero trends use grouped vertical bars; all-zero trends show seven explicit
  zero days without synthetic activity. Full snapshot detail remains available
  on demand and in print. Submission history stays in one compact panel with
  inline status filters. Preview export and immutable submission remain
  separate actions.
- **Manager.** `ManagerReportsWorkspace` is one `Operations & review` page with
  pressed-button views for Daily report review and Performance (daily review is
  the default). It mounts only the selected view, so performance and the
  Front Desk report inbox no longer appear as two stacked report frontends.
  The daily view pairs a submission queue with the selected immutable snapshot
  and its Manager-only acknowledge/return actions. `PerformanceReports` keeps
  the existing Manager dashboard metrics.
- **Accounting.** `AccountingPerformanceReports` uses the existing restricted
  accounting ledger for settled collections, refunds, net receipts, and open
  reconciliation variance. Its seven-day chart groups paid ledger entries by
  `verified_at` (falling back to `created_at`) in Asia/Manila; booked occupancy
  remains clearly distinct from live room-rack status. A payment-method
  breakdown aggregates settled ledger entries without showing guest-level
  details. Night Audit remains read-only. The ledger endpoint is requested only
  for Accounting and retains its existing role guard.
- **Admin and Owner.** Admin keeps aggregate account/configuration governance
  with exact role counts disclosed in its paginated table. Owner keeps the
  executive operating/financial aggregates and seven-day charts/table. Both
  have a print-based export action; neither gains transaction-level controls.
- **Shared presentation and boundaries.** Report pages retain the Executive
  brief order and existing server permission gates. Admin/Owner data stays on
  their respective routes; the daily report review route and immutable
  snapshot workflow are unchanged. Export prints the currently visible report
  view. The Manager selector uses `role="group"` with `aria-pressed` so it
  behaves as a button group rather than an incomplete ARIA tablist.
- **Responsive.** The Manager controls wrap to two columns on narrow screens;
  analysis grids collapse to one column at 1050px and use the existing light
  and dark staff tokens. Charts keep accessible labels and exact-value table
  disclosures; figures use tabular numerals.

## 13. Known-open items

- **F6 — landing double-styling** (`globals.css` vs `landing.css`): **closed 2026-09-07** — the
  interactive landing redesign consolidated every landing rule into `app/(landing-page)/landing.css`;
  `globals.css` / `guest-booking.css` / `responsive.css` keep only shared primitives (`.btn` family,
  `.eyebrow`, `.brand`, focus-visible, `scroll-padding-top`).
- **`.customer-status` vs `StatusBadge`** convergence on the guest portal: started 2026-10-18 —
  payments surfaces now render StatusBadge (with label passthrough preserving the
  STATUS_LABELS copy); remaining `.customer-status` consumers (reservation detail,
  transportation list) migrate when edited next.

- **Stage 3a StatusBadge entity-map unification** (2026-10-20, commits 6309c1a, 83824a5, 85001c2):
  retired informational `badge ${...}` spans across manager, owner, catalog, guest requests,
  housekeeping, staff duty, transportation, unified room matrix; unified to `StatusBadge`
  with canonical vocabulary (haven-status tokens in `haven-data-controls.css`). Tone
  canonicalization: checked_in→green (was amber), assigned→amber (was amber), audit chips
  info-blue (was amber), inactive→amber (was red), info→blue (was neutral). Raw `.badge`
  families retained: advance buttons (→ `.room-advance` in `haven-data-controls.css`),
  loyalty tiers, source badges, nav badges, demand badges, gateway badges, customer
  portal pills. Generic `.app-shell .badge.*` rules removed from `staff-theme.css` (86 lines);
  scoped families retained (room-card header, room-rack, grp-inventory, tp-table,
  grp-approval, owner-workspace). `.room-advance` added to `haven-data-controls.css`.

## 14. Universal interaction foundation

`HavenDataToolbar`, `HavenSearchInput`, `HavenFilterBadges`, `HavenEmptyState`,
`HavenButton`, `HavenSelect`, `StatusBadge`, `Modal`, and `TablePagination` form
the shared behavior layer. Customer and internal contexts keep different density
and surfaces while sharing keyboard, focus, state, responsive-order, and feedback
semantics. The complete contract and reference consumers are documented in
`docs/HAVEN_UI_STANDARDS.md`.

## 15. Modern Luxury Hospitality SaaS (official direction, approved 2026-09-19)

Reference: `reference/` (Executive Overview + Executive Operations images) plus
the written brief. One token family, two densities (D-017); dark toggle kept
with light default. Reproduce the reference's visual language, never its sample
content — KPI figures always come from authoritative sources, never fabricated.

- **Page hero.** `PageHeader` (`components/ui/Navigation.tsx`) is the single hero:
  `variant="default"` is the compact premium header (forms, settings, dense
  screens); `variant="band"` is the full deep-teal band (dashboards, major
  module landings). Same markup either way. Band tokens `--hero-*` live in
  `design-tokens.css`; the band is a fixed self-contained surface (both themes).
- **KPI cards.** `ModuleSummaryCards` (`components/manager/module-summary-cards.tsx`)
  is the canonical card grammar (label / value / hint / icon chip, queue-click
  where a filter exists). Deltas render only from computed comparison data.
- **Tables.** One grammar: white rounded container, small-caps gray headers,
  hairline dividers, pastel status pills, right-aligned text row-actions,
  footer "View full…" link. The unused TanStack `DataTable` was deleted
  (2026-09-19); surfaces keep their existing tables until converged onto this
  grammar phase by phase.
- **New CSS uses tokens.** The repo-wide hardcoded-hex sweep is deferred to the
  final consistency phase; all new rules reference `design-tokens.css` tokens.

## 16. Organization Executive Dashboard theme — staff pages (2026-09-20, D-025)

Authoritative spec: `reference/design.mdd (1).txt` (FleetOps Executive
Dashboard language, adapted to hotel operations — tokens and grammar only,
never fleet content). Applies to **staff pages only** (every role dashboard,
module, table, form, modal, report, notification surface under `.app-shell`,
plus staff-only `qr-placard`). Landing, customer portal, booking flow, and
auth screens are explicitly out of scope and untouched.

- **Delivery mechanism:** `app/staff-theme.css`, imported last in
  `app/layout.tsx`. Every rule is scoped under `.app-shell` (dark base) or
  `.theme-light .app-shell` (light default) and wins by import order at equal
  specificity — no shared-file edits, no `!important` sprawl.
- **Palette:** Midnight Ink `#111827` (primary buttons, active nav, primary
  text), Cool Paper `#f3f3f3` (light floor), Surface `#ffffff`, Slate border
  `#d1d5db`, secondary `#4b5563`, muted `#6b7280`, status
  `#10b981/#f59e0b/#ef4444/#3b82f6`, Deep Navy `#0b132b` reserved for the
  HAVEN AI intelligence pill. Small status text uses 700-level variants
  (`#047857`, `#b45309`, `#b91c1c`, `#1d4ed8`) over ~10% tints.
- **Type:** Inter only on staff (no serif display); Display 22/600, Title
  18/600, panel title 15/600, Body 14/400 (tables 13), Label 12/500, Caption
  11/400; tabular numerals for financial/room/date/ID/report figures.
- **Shapes:** controls 12px, cards/panels/modals 16px, KPI/stat cards 24px,
  micro 4–8px. Shadows structural only (rest/lift/float); KPI hover lifts
  `translateY(-1px)` on a 280ms tactile curve; page entrance is a single
  0.6s fade-up; all gated on `prefers-reduced-motion`.
- **Headers:** the deep-teal `PageHeader variant="band"` hero is retired on
  staff (manager overview + all 10 owner sections now `variant="default"`);
  cross-role `.page-title` bands, the admin command band, and the
  staff-duty/housekeeping heroes are flat executive headers in the override
  layer. The `.band` variant itself is untouched for other consumers.
- **Cards/panels/tables/badges/buttons/forms/modals/charts/AI:**
  ModuleSummaryCards and overview `metric-card`s share the 24px stat grammar
  (tinted icon chip, 30px/24px semibold tabular value, note + muted trend;
  linked cards are buttons with `aria-pressed`, focus ring, press physics);
  panels carry title/description/`View … →` with skeleton / `role="alert"`
  error / truthful-empty states; tables keep search→quick-filters→advanced→
  results order with All-first; one state = one color (DB status strings
  unchanged; room-type identity keys preserved); primary = ink, secondary =
  white/ink, danger = muted red; modals 16px with ink branded headers
  (staff-scoped); chart heights 220/260/300; the one donut (`roomMix`)
  genuinely partitions room inventory, so the Partition-Only rule holds with
  no change; severity travels on tinted chips, never border bars (owner tone
  insets removed); no pulse/beacon on static records (none existed).
- **Dark variant kept + refined** (user decision, plan phase): ink-family
  surfaces, white primary buttons, same token names.
- **Superseded for staff only:** D-024 teal band hero, dark-green shell,
  7–9px micro-type, decorative metric-card stripes. Landing/customer/auth
  keep their existing systems.

## 17. Authenticated header session countdown

- Shared Customer, operational staff, System Administrator, and Owner headers
  place the countdown in the top-right control group after role indicators and
  before theme, notification, and profile controls.
- Visible content is only a clock glyph plus `HH:MM:SS` while at least one
  hour remains, otherwise `MM:SS`. The glyph hides at compact mobile widths;
  the timer stays visible.
- Normal, approaching-expiration, and critical states use the existing
  neutral/info, warning, and danger tokens. A non-live accessible expiration
  label prevents screen readers from announcing every tick.
- Expiration opens a blocking, focus-directed dialog with one action:
  **Sign in again**.

## 18. Role-based overview composition (2026-11-12)

`DashboardOverview`, `DashboardHeading`, `DashboardMetrics`, and `DashboardPanel`
share layout and theme behavior across the staff and guest shells. On phones
metrics form two columns and the panels stack.

- **Manager:** `ManagerOverview` leads with decisions, operational exceptions,
  and the five room-rack states. The occupancy chart compares two consecutive
  seven-night periods. Shift briefing opens Hotel Operations. Financial
  amounts start masked and reveal together through the eye button.
- **Front Desk:** arrivals and departures, room readiness, recent bookings,
  and the shared drawer summary.
- **Accounting:** verifications, SLA, refunds, folios, and financial follow-ups.
- **Housekeeping / Maintenance:** the current task or repair queue leads,
  with room readiness and department shortcuts beside or below it.
- **Admin / Owner:** account governance and executive exceptions lead their
  respective dashboards, with authorized detail pages reached from cards.
- **Guest:** `/account` shows the guest’s reservation, attention items,
  stay finances, requests and notifications. `/my-reservations` holds history.

## 19. Predictive pricing workspace (2026-09-22)

- The Occupancy Outlook keeps the FACT bars and dashed PREDICTION line as the
  primary evidence. A responsive recommendation workspace sits beside it at
  wide widths and stacks below it before mobile.
- Recommendation cards show room/date, base rate (FACT), proposed rate,
  percentage movement, demand-tier badge, confidence, and plain-language
  reasoning. Color is never the only status signal.
- The top three highest-impact recommendations preview in the panel. The
  branded review modal exposes all seven-day room/date recommendations with
  native checkboxes, bounded numeric inputs, visible focus treatment, and a
  sticky semantic footer count/action group.
- The sole primary action says **Submit Proposal to Owner**. Supporting copy
  states that submission leaves live rates unchanged and creates pending
  Owner/Admin work. Reduced-motion removes skeleton and row transitions.

## 20. System Health module conformance (2026-09-26)

The System Health module (`SystemHealthView`, `SystemHealthLedger`,
`system-health.css` — self-scoped, no shared-theme edits) follows the §16
staff grammar with four module-specific applications: health cards use the
24px stat step with tone-tinted icon chips and base-card hover lift; ledger
and job states use honest badge names (`applied`, `succeeded`, `failed`,
`info` — `paid` stays a payment word); pending filenames wrap to two lines
instead of truncating; payment/audit panels own skeleton and empty-with-action
states per the Honest Feed Rule. Severity still travels on chips, never
border bars; tone stays on value lines and theme-flipping tokens.

## 21. Canonical severity color code (2026-09-26)

One vocabulary everywhere — red is crucial, amber is attention, green is
success, blue is informing:

| Severity | Meaning | Transport |
|---|---|---|
| `critical` / red | Act now — failures, rejections, critical states | Badge/chip + icon + text (`expired`, `failed`, toast `error`) |
| `attention` / amber | Needs attention this cycle — the single attention family (`urgent` included) | Badge/chip + icon + text (`pending`, toast `warning`) |
| `success` / green | Completed well | Badge/chip + icon + text (`healthy`, `applied`, `succeeded`, toast `success`) |
| `info` / blue | Informing, no action needed | Badge/chip + icon + text (`info`, toast `info`) |

Rules: color never travels alone (icon + text label always); severity lives
on chips/badges/icon-chips only — never colored border bars, never whole-card
tints; small text uses AA-safe 700-level variants. Sources:
`lib/notifications.ts` (`NOTIFICATION_SEVERITY`, bell + history chips),
`ToastStack` tones (the reference implementation, all shells),
`HavenActionItem` tones (incl. `info`), `StatusBadge` families, System Health
queue badges. Unknown notification types default to info — never alarming on
the unrecognised.

Phase 2 (2026-09-26): `urgent` unified into the amber family (icon + label
kept); `refunded`/`closed` moved to green as completed outcomes while
`checked_out` stays informational blue; approval `critical`/`high` severities
gained real theme rules (danger red / warning amber — previously unstyled
gray); reservation `.mr-issue.info` moved from neutral gray to informing blue.
Modal `danger`/`warning` map to the same red/amber tokens — no change needed.

UPDATE 2026-10-19 - Stage 1 chart-token consolidation (reference-design roadmap).
Recharts panels no longer declare private palettes: lib/chart-tokens.ts is the single source for chart hexes (grid, axis, occupancy fact #176773, report occupancy #2a9098, forecast #b8860b, template line #1d4ed8), consumed by the manager overview, HAVEN AI predictive chart, performance reports, and the tailadmin visual template; lib/chart-tokens.test.ts pins the values and forbids raw hex series attributes in those files. Values shipped unchanged - this is an ownership consolidation, no visual change expected; rendered-chart spot checks go to the manual browser checklist. The status tint grammar (10% fill + 700/800-level text variant, FleetOps reference rule) is now stated in app/design-tokens.css comment form.

UPDATE 2026-10-19 - Stage 2: THE one KPI/overview card (reference-design roadmap,
commits b964270..1244d58). One card format for staff AND guest surfaces:
.mod-kpis/.mod-kpi lives solely in app/ui-primitives.css (section 7), painted
per-surface by token fallback chains (--st-* staff, --cp-* customer) with
--kpi-* component tokens set by two small theme mirrors (staff dark / light).
Absorbed families deleted outright: .sd-kpi (staff-duty), .report-kpi
(performance reports, horizontal -> vertical form change), .haven-ai-kpi
(HAVEN AI; skeleton kept until Stage 3 shared skeleton work), .folio-kpi-card
(guest payments), .loyalty-kpi (executive gradients + corner badges retired
per product decision), and the unrouted tailadmin-haven kit + visual template
(StatCard/TailAdmin* deleted from components/ui). Component:
components/manager/module-summary-cards.tsx - tones attention/today/active/
done/danger/gold (icon-chip tints follow the 10% fill + 700-ink grammar),
aria-pressed queue cards (buttons), articles otherwise, disabled support,
optional 'extra' slot (loyalty progressbar). Known visual deltas on staff
surfaces: dark cards drop to 16px 18px padding / 24px stat radius (light
theme's documented values), chips become 46x46 absolute top-right with the
dark theme acquiring the light theme's tone-tint grammar; HAVEN AI's 5-across
mini strip becomes the standard card at 20px gap; report cards go vertical.
Manual browser checks required: staff dark + light, guest payments + loyalty,
HAVEN AI skeleton, report print.
