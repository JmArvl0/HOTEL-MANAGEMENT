# HAVEN Design System

> **Last synced:** 2026-09-20 — verified against `app/design-tokens.css`,
> root `DESIGN.md` (§1–16), `app/staff-ops-theme.css`,
> `reference/design.mdd (1).txt`, `docs/HAVEN_UI_STANDARDS.md`, and
> `docs/ui-motion-guidelines.md`.
>
> **Standalone by design:** this file restates the shipped visual language so
> it reads without chasing sources. The live sources above win on any
> disagreement. **Maintenance rule:** when a token value, type size, radius,
> or component rule changes in code, update the matching section here in the
> same change — otherwise this file goes stale. Never invent values here;
> copy them from the source files.
>
> **Scope:** presentation only. Behavior, RBAC, workflows, and APIs live in
> `SYSTEM.md` and are intentionally absent here.

## 1. Principles

1. **Operational truth over decoration.** Blockers must be impossible to miss;
   normal states stay visually quiet. No fabricated figures, ratings,
   scarcity, or guarantees anywhere.
2. **Three surfaces, three characters.** Landing (marketing), customer portal
   (calm self-service), and staff operations (dense command center) share
   control metrics but never each other's palettes or heroes.
3. **Honest feeds.** Every data panel owns three states: loading skeleton,
   named error (`role="alert"`, never a fake zero-result), and truthful
   empty copy with a next action.
4. **Scoping over discipline.** Staff styling is enforced by CSS scoping
   (`.app-shell`), not by convention — landing and customer pages are
   unreachable from staff rules by construction.
5. **Density from spacing, not shrinking type.** Nothing below 11px except
   captions; tables and badges stay legible at scan distance.

## 2. The three visual surfaces

| Surface | Routes | Palette driver | Theme | Character |
|---|---|---|---|---|
| Landing / public site | `/`, `/booking/search` | `landing.css` (page-scoped) | Light only | Coastal brand: photographic hero, editorial room cards, expressive motion |
| Customer portal | `/account/*`, `/my-reservations`, booking flow | `guest-booking.css` (`--cp-*` tokens) | Light + dark | Calm consumer spacing, 40–44px controls, plain language |
| Staff operations | `/manager_dashboard`, `/qr-placard/*` | `manager-dashboard-theme.css` + `staff-ops-theme.css` (`.app-shell` scope) | Light default + refined dark | Dense executive dashboard, 36–38px controls, tabular data |

Global CSS load order (later wins at equal specificity): `globals.css` →
`guest-booking.css` → `manager-dashboard-theme.css` → `responsive.css` →
`Modal.css` → `haven-select.css` → `haven-data-controls.css` →
`room-details.css` → `design-tokens.css` → `ui-primitives.css` →
`coastal-theme.css` → `notification-history.css` → `customer-portal.css` →
`staff-ops-theme.css` (last: staff wins for staff only).

## 3. Color tokens

### 3.1 Brand primitives (`app/design-tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--color-forest` | `#084b55` | Legacy brand primary (public/guest surfaces) |
| `--color-forest-light` | `#176773` | Brand hover / light-surface accent |
| `--color-forest-dark` | `#082f39` | Dark grounds |
| `--color-mint` | `#e1eeeb` | Light tint surfaces |
| `--color-cream` | `#f8f6f1` | Light app background |
| `--color-ink` | `#103e48` | Primary text (public/guest) |
| `--color-line` | `#e3e5df` | Borders (public/guest light) |
| `--color-muted` | `#6f7974` | Secondary text (public/guest) |
| `--brand-danger` | `#a94e48` | Danger (public/guest) |

Full green/amber/orange/red/blue/slate ramps (`--color-{hue}-{50…950}`)
back the semantic tokens below.

### 3.2 Semantic status tokens (light)

| State | Text | Background | Border |
|---|---|---|---|
| Success | `--color-green-800` | `--color-green-100` | `--color-green-200` |
| Warning | `--color-amber-800` | `--color-amber-100` | `--color-amber-200` |
| Danger | `--color-red-800` | `--color-red-100` | `--color-red-200` |
| Info | `--color-blue-800` | `--color-blue-100` | `--color-blue-200` |

Dark mirrors use 300/400-level text over deep translucent fills. One
operational state always maps to one tone, everywhere.

### 3.3 Staff operations palette (org spec, `staff-ops-theme.css`)

| Token | Value | Use |
|---|---|---|
| Midnight Ink | `#111827` | Primary buttons, active nav, primary text |
| Cool Paper | `#f3f3f3` | Light background floor |
| Surface White | `#ffffff` | Cards, panels, header, sidebar |
| Slate Border | `#d1d5db` | Structural dividers |
| Secondary text | `#4b5563` | Descriptions, table cells |
| Muted text | `#6b7280` | Captions, metadata |
| Success / text | `#10b981` / `#047857` | Healthy, completed |
| Warning / text | `#f59e0b` / `#b45309` | Needs attention |
| Danger / text | `#ef4444` / `#b91c1c` | Blockers (act now) |
| Info / text | `#3b82f6` / `#1d4ed8` | Active / moving items |
| Deep Navy | `#0b132b` | HAVEN AI intelligence pill **only** — never a general accent |

Base status colors are fills/large graphics only; sub-14px text and chips
use the darker AA-safe variants over ~10% tints.

### 3.4 Identity colors (never semantic)

Room-type badges carry one of eight categorical keys (`sage`, `gold`,
`ocean`, `plum`, `terracotta`, `slate`, `sand`, `lavender`) rendered by
`RoomTypeBadge` with dual dark/light pairs. They identify a room *type* and
must never encode room *status* — status lives on badges and room cards.

## 4. Typography

Inter throughout (loaded via `next/font` as `--font-sans`); Playfair Display
(`--font-display`) is reserved for landing/marketing display type and never
appears on staff or customer surfaces. System-ui fallback everywhere.

| Level | Size | Weight | Use |
|---|---|---|---|
| Display | 22px | 600 | One H1 per page |
| Title | 18px | 600 | Panel headers, modal titles |
| Lead | 16px | 500 | Leads, major statistics |
| Body | 14px | 400 | Default UI text, inputs (tables 13px) |
| Label | 12px | 500 | Badges, chips, tabs, form labels |
| Caption | 11px | 400 | Eyebrows, metadata, hints |

**Tabular numerals** (`font-variant-numeric: tabular-nums`) are mandatory
for anything scanned vertically: financial values, room numbers, dates,
timestamps, IDs, reports, statistics. Mobile body never drops below 16px
(iOS zoom guard).

## 5. Spacing, shape, elevation

- **Spacing scale:** 4px base (`--space-1…24`); rhythm steps of 8 / 16 / 24.
  Siblings use `gap`, never child margins. Action rows wrap and never overflow.
- **Radii:** controls 12px · cards/panels/modals 16px · KPI/stat cards 24px ·
  micro primitives 4–8px. No arbitrary radii.
- **Shadows (structural, never ambient):** rest `0 1px 2px rgb(0 0 0/.03)` ·
  lift `0 1px 3px rgb(0 0 0/.04)` · float `0 4px 6px -1px rgb(0 0 0/.05)`.
  Cards rest flat; hover/interaction adds elevation.
- **Staff motion:** 280ms tactile curve (`cubic-bezier(0.32,0.72,0,1)`) on
  KPI hover (`translateY(-1px)`), buttons, menus; one 0.6s page fade-up;
  everything gated on `prefers-reduced-motion`. Full area-by-area motion
  policy (including landing GSAP ownership and hard bans) lives in
  `docs/ui-motion-guidelines.md`.

## 6. App shells

| Element | Customer | Staff |
|---|---|---|
| Container | `.customer-shell` | `.app-shell` (grid: 232px sidebar + workspace; 72px collapsed rail; drawer ≤1000px) |
| Sidebar | n/a (portal nav) | White surface, slate border; active item is a Midnight Ink pill with white text |
| Header | Portal header | 60px white bar: section title, shift/mode pills, theme toggle, bell, profile menu |
| Page title | Section heading | Executive header: 11px eyebrow, 22px/600 title, 13px subtitle, actions right — flat white panel, never a color band |
| Notifications | Bell + history modal + toasts | Same shared family; sidebar badge = actionable workload count only |
| Print | Receipt print sheets | Chrome hidden; panels/cards print black-on-white |

## 7. Component catalogue

All in `components/ui/` unless noted. Shared behavior contract (keyboard,
focus, densities, feedback) is defined in `docs/HAVEN_UI_STANDARDS.md`.

| Component | File | API / notes |
|---|---|---|
| Button | `haven-button.tsx` (+ `.btn` metrics) | Variants `primary` (ink) / `secondary` (white+ink+border) / `neutral` / `danger` (muted red); 36–40px staff, 40–44px customer; 12px radius; 2px focus ring; full-width stacked primary-first ≤480px |
| Select | `haven-select.tsx` | Button+listbox, 12px trigger, checkmarked selected row, grouped options; arrows/Home/End/Enter/Escape; native `<select>` kept for date/time + validated form fields |
| Data toolbar | `haven-data-controls.tsx` | Fixed order: search (350ms debounce, clear control, no Apply) → quick-filter badges (`All` first/default) → advanced filters → result count → results; `HavenEmptyState` on zero matches. The wrapper is transparent — no card, border, radius, shadow or padding — while each control keeps its own surface; results containers are separate elements and keep theirs. Guarded by `haven-data-controls.test.tsx` |
| Status badge | `StatusBadge.tsx` | Informational, non-interactive; sizes sm/md/lg, variants default/outline/soft; tones success/info/warning/danger/neutral; icon + label |
| KPI cards | `manager/module-summary-cards.tsx` | Label / tabular value / hint / tinted icon chip; `queue` prop turns a card into a filter-driving `<button aria-pressed>`, otherwise `<article>`; overview `metric-card`s share the 24px grammar with 30px values |
| Panels | theme CSS | 16px white panels: 15px/600 title + 12px description, `View … →` header link, skeleton / alert / empty states |
| Tables | theme CSS + `table-pagination.tsx` | White rounded container, 12px/500 left headers, hairline dividers, tabular numerals, status pills, row actions, footer; horizontal scroll contained in `.table-scroll` |
| Modal / dialogs | `Modal.tsx` (+ `FormDialog`, `action-dialogs`) | Sizes sm 400 / md 560 / lg 720 / xl 960 / full 95vw; owns backdrop, Escape, focus trap + restore; optional branded (ink on staff) header; `FormField` + error/help copy inside |
| Page header | `ui/Navigation.tsx` | `PageHeader({eyebrow,title,subtitle,actions,breadcrumb,variant})`; staff uses `default` (executive); `band` (deep-teal hero) retained only for non-staff consumers |
| Notifications | `haven-notifications.tsx` | Bell (click-to-open, one aggregate badge, hidden at 0) → 380–430px popover (≤7, unread-first) → shared history modal (All/Unread/Read, date filter, sort, paging); toasts via `toast-stack.tsx`; loader via `haven-loader.tsx` |
| Charts | `AccessibleChart.tsx` + Recharts | Canonical heights 220 / 260 / 300; shared fills, legends, tooltips; donuts only for true partitions (room inventory mix); overlapping counts stay bars; `role="img"` summaries + data-table fallbacks |
| AI panels | `manager/haven-ai-panel.tsx`, `predictive-insights-panel.tsx` | Read-only advisory workspace: navy Intelligence pill, sky-tint identity, grounded narrative + recommended actions; Gemini explains, never executes; no fictional insights |
| Room-type badge | `RoomTypeBadge.tsx` | Categorical pills only (see §3.4) |
| Pagination | `table-pagination.tsx` | Compact internal lists; explicit counts |

## 8. Form rules

Labels 12px/500 above every field; 14px control text; 12px radius;
2px ink focus ring; errors in danger-ink beside the field (never top-only);
helper/hint copy in muted 12px; disabled states non-interactive with
`not-allowed`; no placeholder-only labels. Multi-step footers: Back alone
left, Cancel + primary right. Native date/time inputs stay native.

## 9. Responsive + accessibility + print

- Breakpoints follow the layout grids (sidebar→drawer ≤1000px, card grids
  collapse ≤760px, table→card twins ≤720px, touch floors ≤680px/44px).
- `:focus-visible` ring on all interactive elements; icon-only buttons carry
  accessible names; linked KPI cards name their destination; live regions for
  toasts and caps-lock style hints; `line-clamp-2` over `truncate` for queue
  text; reduced-motion kill-switch global.
- Print hides all chrome (sidebar, header actions, toolbars, dialogs,
  toasts); panels avoid breaking inside.
- Content fitting (staff, `staff-ops-theme.css` §§20–23): containers grow
  around content — sidebar role labels wrap to two lines, nav labels reserve
  badge space, KPI values wrap extreme figures, tables scroll in-region,
  modal footers and header actions wrap; type sizes are never reduced to
  force fit.

## 10. What this file does not cover

Hotel workflows, role permissions, account governance, API contracts,
database schema, and migrations — see `SYSTEM.md` (authoritative),
`docs/WORKFLOW_DATAFLOW_BUSINESS_LOGIC.md`, and `supabase/migrations/`.
Motion area policy — see `docs/ui-motion-guidelines.md`. Shared interaction
contract — see `docs/HAVEN_UI_STANDARDS.md`. Shipped-UI truth (load order,
per-surface history) — see root `DESIGN.md`.
