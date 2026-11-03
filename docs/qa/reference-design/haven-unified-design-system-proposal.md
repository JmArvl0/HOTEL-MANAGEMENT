# Haven Unified Design System Proposal

Date: 2026-10-19. Proposal only - no token or component changes have been made.
Derived from: FleetOps reference source (see `reference-system-design-audit.md`) and
Haven's current working tree (`app/globals.css`, `app/design-tokens.css`, `app/ui-primitives.css`,
`app/staff-theme.css`, `app/customer-portal.css`, `app/guest-booking.css`, `components/ui/*`).

Core principle (user mandate): **one canonical design format per function.** Any component
used by two or more roles for the same job is a shared component: identical structure and
visual grammar everywhere; role surfaces differ only through data, permissions, and semantic
token values - never through a second implementation or per-account restyling.

Legend: [R] = rule derived from FleetOps reference source. [H] = existing Haven rule retained.
[P] = proposal (engineering judgment; value not yet source-proven, needs sign-off).

---

## 1. Token foundation (already largely in place, formalize)

Colors: keep Haven's `app/design-tokens.css` primitive scale and semantic layer as the single
source ([H]). Two rules adopted from the reference:

- [R] Status tint grammar: chips/fills use `status` color at 10% over the surface; text on
  those tints uses the 700/800-level variant always, at any size below 14px
  (FleetOps globals.css:33-39 comment + status-badge.jsx:229-238).
- [R] Rainbow-free distinction: brand emphasis is the `#111827` ink family only;
  semantic colors are status-only. AI/analytics identity accents stay in a named token, not
  ad hoc hexes.

Typography [H with P floor]: Inter + Playfair display; type-only staff surfaces. Proposals:
- Raise every text to >= 9px baseline, >= 11px for interaction-bearing labels (retire the 66
  sub-9px sizes, HUI-003). Value [P] pending readability sign-off.
- [R] Tabular figures (`font-variant-numeric: tabular-nums`) for all compared numerics.

Spacing [H]: 4px base scale (`--space-*`) stays. Layout sheet targets: controls 40px
(36px staff compact documented intent [H]), touch floor 44px at coarse pointers <= 768px [H].

Radius hierarchy [R-as-relabeled]: micro 4-8px fallbacks; controls 12px; cards/panels 16px;
stat/KPI cards 24px. `SOURCE-VERIFIED` in both repos.

Shadows [R]: structural only - `xs 0 1px 2px/0.03`, `sm 0 1px 3px/0.04`, `md 0 4px 6px -1px/0.05`.
Flat at rest; shadow appears on hover/focus/temporary layers. No ambient rest shadows.

Z-index + motion durations: keep Haven's ladder (design-tokens.css: z-index + transition
primitives) [H].

## 2. Content and layout rules

- Content max-width: current per-shell behavior retained [H]; no arbitrary container switch.
- Page header: shared `PageHeader` single-hero for every page in every shell (finish
  adoption of the 5-consumer pattern, HUI-010).
- Page entrance: one authored entrance per page-load, 0.6s fade-up, collapsed under
  `prefers-reduced-motion` [R, matches Haven's reduced-motion kill].
- Chart heights: canonical classes (`chart-h-sm/md/lg` = 220/260/300px) and one shared
  chart token source module so recharts fills cannot drift per panel [R].

## 3. Shared cross-role component standards

Each standard: ONE canonical implementation. Owner layer = `components/ui/*` + one CSS
home (existing `ui-primitives.css` for metrics, the token files for palettes). Surfaces
may not restyle shared components at layer scope (enforced by the test convention, section 6).

### 3.1 KPI / overview card (first consolidation, 7 families collapse into 1)

Canonical format merged from FleetOps `stat-card.jsx` and Haven's proven `.mod-kpi` grammar:

- Structure: vertical card; top row = 12px/500 label + 24px tinted icon chip (10% tone
  bg, 700-variant icon ink); value 24-28px semibold `tabular-nums`; optional 11px pill
  valueNote; 11px muted caption under the value. Card: 16px panel padding, 24px radius,
  `--shadow-xs`, 1px `--border`.
- Two interactions in one shell ([R] FleetOps two-variant-one-shell):
  - resting `article` (hover: border-color accent, `translateY(-1px)`);
  - interactive `button` filter/KPI (hover lift `translateY(-3px)` scale 1.004 280ms, 2px
    focus ring, `aria-pressed` when it filters).
- Grid: responsive stages 1 / 2 / 3-4 cols (pointer:coarse keeps 44px targets).
- Sidebar-panel tone chips (attention/today/active/done) map to the same 10%/700 rule.
- Consumers to consolidate: `.mod-kpi`, `.sd-kpi`, `.report-kpi-card`, `.haven-ai-kpi`,
  tailadmin `StatCard`, `.loyalty-kpi-card`, `.folio-kpi-card` -> all become capability
  variants (tone/size/interactive/content slots) of the one card. Loyalty and folio keep
  their data and semantics; gradients/gold treatments become two approved tone variants,
  not separate CSS families [P].

### 3.2 Status badges and pills

One resolver, one renderer: extend Haven `StatusBadge.tsx` with a per-entity tone map
(trip/reservation/request/folio/payment/housekeeping/maintenance/incident/leave/deposit)
plus a global fallback map, mirroring FleetOps `status-badge.jsx` semantics (entity map >
global > fallback) [R]. All `.badge.*` spans and `--st-*` customer pills migrate. Tokens
carry tone; entity mapping lives in one module.

### 3.3 Buttons and form controls

Keep Haven's metric system (40px / 36px staff compact / 44px mobile) [H]; adopt explicit
variant vocabulary: primary (ink), secondary/outline, soft, ghost, danger, success,
with hover/active/disabled/focus-visible states defined once in `ui-primitives.css` [P].
HavenSelect, HavenSearchInput, date pickers stay the canonical controls in both portals.

### 3.4 Tables, toolbars, pagination

`haven-data-controls.tsx` toolbar + `TablePagination` are canonical for both portals [H].
Table standards: sticky-capable headers, tabular numerics in numeric columns [R],
row hover wash only, row actions as 36-40px hit areas (mobile 44px) [H].
Page-scoped table styling via tokens only.

### 3.5 Modals and drawers

`Modal.tsx` portal + focus trap is canonical [H]. FormDialog/ConfirmDialog/PromptDialog/
select variants stay the only dialog forms in both roles. Guest and staff drawers reuse
the same shell with width variants.

### 3.6 Page-level states (Honest Feed Rule [R])

Every data panel renders exactly one of: skeleton (per-layout variant from one
skeleton component family), named error alert (`role="alert"`, retry affordance), or
truthful empty state (`EmptyState` component with next action). The same component set
serves staff and guest; copy differs, structure does not.

### 3.7 Toasts, badges, bell

`toast-stack` role="log" stack stays canonical for both portals [H]; sidebar/nav paint
consolidation happens with the notification bell component extraction already recommended
by `important-review.md` (deletes the two `!important` walls).

## 4. Guest vs staff surface distinctions (the only sanctioned differences)

- Theme: staff `.app-shell` dark default + `.theme-light` mirrors; customer/booking light.
  Token VALUES differ ([H]); every shared component consumes the same semantic token names.
- Density: staff compact 36px controls; guest 40px. Metrics in ui-primitives, not per page.
- Guest celebration treatments (loyalty gold) = approved tone variants of the shared card.

## 5. CSS architecture and ownership

1. Tokens: `app/design-tokens.css` + `app/globals.css` only. No hex literals in shared
   component CSS (lint/grep gate [P]).
2. Shared component CSS: one file beside the component (`components/ui/*.css`) or
   `ui-primitives.css` for metrics. Surfaces cannot re-declare shared selectors
   (`.mod-kpi`, `.badge`, `.modal-*`, etc.) outside the owner [P; enforcement via tests].
3. Page-scoped sheets stay for module character (room rack, reports print, kiosk); they
   consume tokens, never shared component internals.
4. `.theme-light` mirrors live next to the dark rules in staff-theme.css until the
   `--ops-*` migration completes [H as documented]; no new mirror duties for shared
   components (one rule, token-flip only).
5. `!important` policy: none in shared layers; walls only for third-party chart internals
   (already documented as conventional) [H per important-review.md].

## 6. Anti-drift regression convention

Extend the existing pattern (`module-summary.test.tsx`, `staff-fitting.test.ts`):
- Ownership tests: a shared selector is declared in exactly one file (grep-based tests
  like `fused-room-rack-panel-style.test.ts:81-83`).
- Format tests: each shared component renders identical skeleton under
  staff/customer theme context (jsdom, per Haven's testing stack).
- Palette tests: no new hex literals in page-scoped sheets that duplicate token values.

## 7. Acceptance criteria (for the system, not this proposal)

- Any KPI/overview card, badge, modal, table, toolbar, empty/error state looks
  structurally identical across a staff panel and a guest page at the same variant.
- Zero per-account CSS overrides of shared selectors.
- All type >= 11px on interactive controls (>= 9px floor elsewhere) [P pending sign-off].
- `npm run typecheck`, `eslint`, vitest, and `npm run build` stay green at each stage
  (baseline today: typecheck clean, lint 0 errors/97 warnings, 2069 tests passing [H]).
