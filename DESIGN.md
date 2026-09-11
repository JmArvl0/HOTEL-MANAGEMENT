# DESIGN.md — Haven Hotel design system (live)

The source-of-truth reference for the shipped UI. **Do not apply
`design-system/haven-hotel/MASTER.md`** — it is superseded (see `DESIGN-STATUS.md` F2).
This doc and `app/ui-primitives.css` are the current system.

- **Companions:** `DESIGN-STATUS.md` (what is off / what got fixed), `SYSTEM.md` (behavior).
- **Snapshot:** working tree on `main`, 2026-09-10 (coastal brand refresh plus the public booking
  search surface; see `DESIGN-STATUS.md` and `.impeccable/surfaces/app-booking-search.md`).

---

## 1. How CSS is loaded (what wins)

`app/layout.tsx` imports, in order — later files win at equal specificity:

| # | File | Role |
|---|---|---|
| 1 | `app/globals.css` | Shared base: tokens, `.btn`, `.badge`, `.modal`, `.toast`, landing + login + app-shell base |
| 2 | `app/guest-booking.css` | Booking flow, guest/account portal (`--cp-*` palette) |
| 3 | `app/manager-dashboard-theme.css` | Staff `.app-shell` dark theme + `.theme-light` overrides |
| 4 | `app/responsive.css` | Mobile hardening, touch targets, micro-interactions, reduced-motion |
| 5 | `components/ui/Modal.css` | Modal / form-dialog component styles |
| 6 | `components/booking/room-details.css` | Room detail sheets |
| 7 | `app/design-tokens.css` | Legacy token re-map (trimmed 2026-09-05 — no dead `--md-*`) |
| 8 | `app/ui-primitives.css` | **Normalization layer** — shared control metrics + action-row spacing |
| 9 | `app/coastal-theme.css` | **Coastal brand palette override (2026-09-09) — last import, wins the cascade**; includes a dark-mode `@media` block for the shell. `landing.css` remains page-scoped (loads with the landing chunk) |

Page-scoped sheets import with their chunk: `(landing-page)/landing.css`,
`(booking)/booking/search/search.css`, `components/auth/login.css`, `auth-vault.css`,
`components/ui/haven-loader.css`.

Rule of thumb: **palettes live in each surface's scoped rules** (`.customer-shell …`, `.app-shell …`,
`.theme-light …`); **shared control *metrics* and spacing live in `ui-primitives.css`**. That split
keeps guest / booking / staff character while giving every surface the same button height, radius,
motion, focus ring, and action-row gap.

## 2. Color

One coastal palette across surfaces (brand refresh 2026-09-09), differentiated per portal:

- **Primary deep ocean teal** `#084b55` · **hover** `#136573` · **warm ivory** `#f8f6f1` ·
  **sea-glass** `#85cbd0` (dark-shell accents) / `#e1eeeb` (light surfaces) · **ink** `#103e48` ·
  **line** `#dce4e1` · **muted** `#53676b`. Terracotta `#c9783c` is retired from brand use.
  These live in `app/coastal-theme.css` (last import in `app/layout.tsx`, so it overrides the
  legacy per-surface hexes).
- **Guest / booking / customer:** the `--cp-*` scale (`guest-booking.css`) is remapped by
  `coastal-theme.css`; dark ground `#0c2027`, light ground `#f6f5f0`, and sea-glass accent
  `#85cbd0` (dark) / `#176773` (light). Both themes complete.
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
`coastal-theme.css` adds a dark-mode `@media (prefers-color-scheme: dark)` block for the shell.
The landing is **light-only** via `landing.css` `color-scheme: light`. A second, OS-driven block in
`design-tokens.css` is legacy and can drift — keep new dark-theme work
inside `.theme-light`-aware rules, not `@media (prefers-color-scheme: dark)`.

## 3. Typography

- **Inter** (sans) + **Playfair Display** (serif display). Loaded once via `next/font` on `<body>`,
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

`/account/payments` (refined 2026-09-10) keeps the coastal card identity while adding
URL-driven filter chips (`?stay=` current/upcoming/past/cancelled, `?pay=`
pending/due/refund/settled — two chip rows above the list, each with a live count).
Chips are plain links (back button, sharing, direct load; zero client JS); a zero-match
chip renders dimmed and disabled. An aggregate strip under the filters shows the
filtered set's folio count, outstanding balance, and paid-to-date, server-computed.
Each folio card carries a paid-vs-total progress bar (`.folio-progress`, accent =
partial, green = settled) between header and `.folio-summary`, with a text
alternative on the progressbar role. Bucket derivation (`financialPaymentState`) and
filtering live in `lib/customer.ts` as pure presentation helpers — no query or
business-logic change. Styling is scoped in `guest-booking.css` (`.folio-*`) using
`--cp-*` tokens, with 44px chip touch floors ≤680px.

## 10. Module quick-overview cards (staff dashboards)

`ModuleSummaryCards` (`components/manager/module-summary-cards.tsx`, styled by the
`.mod-kpis` / `.mod-kpi` block in `manager-dashboard-theme.css` — dark and `.theme-light`
mirrors) is the single pattern for the compact operational snapshot at the top of a staff
module. Each card is label / strong value (count or peso total) / one-line hint / icon chip.
It is deliberately **not** the big Overview `metric-card`: 10px label, 22px number, 9px
hint, 13–14px padding — dense enough to read as a snapshot above a table.

- **Tones are accents, not backgrounds.** The four semantic tones (`attention`, `today`,
  `active`, `done`) tint only the icon chip background; the card surface stays neutral.
- **Clickable where a filter exists.** A card with a `queue` renders as `<button
  aria-pressed>` and drives the module's existing filter state (Reservations queues,
  Transportation queues, Approvals status pills, Guest Requests submission queues, Front
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
  the `admin-*` block of `manager-dashboard-theme.css` (dark + `.theme-light` mirrors).

## 11. Known-open items

- **F6 — landing double-styling** (`globals.css` vs `landing.css`): **closed 2026-09-07** — the
  interactive landing redesign consolidated every landing rule into `app/(landing-page)/landing.css`;
  `globals.css` / `guest-booking.css` / `responsive.css` keep only shared primitives (`.btn` family,
  `.eyebrow`, `.brand`, focus-visible, `scroll-padding-top`).
- **`.customer-status` vs `StatusBadge`** convergence on the guest portal: documented as the guest
  surface's own pill; convergence deferred.
