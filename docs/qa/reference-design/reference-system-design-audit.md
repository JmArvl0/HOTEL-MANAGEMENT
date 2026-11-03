# Reference System Design Audit - FleetOps web dashboard

Date: 2026-10-19. Scope: read-only source inspection of the reference system. No code was
read into Haven and no reference files were copied. Evidence labels: `SOURCE-VERIFIED`,
`INFERRED`, `NEEDS VISUAL VERIFICATION`, `NOT INSPECTED`.

Reference root: `C:\Users\areva\Downloads\fleet-transpo` ( inspected: `src/` web dashboard
only; `mobile/` Expo app out of scope by user decision ).

---

## 1. Technology and architecture

`SOURCE-VERIFIED` (package.json, src tree):

- Next.js App Router + React 18, JS components (no TypeScript in reference UI).
- **Tailwind CSS v4**: `@import "tailwindcss"` in `src/app/globals.css:1`, `@tailwindcss/postcss`
  + `tailwindcss` dev deps, no `tailwind.config.*` (v4 CSS-based `@theme`).
- **Radix UI** primitives (`@radix-ui/react-dialog/avatar/dropdown-menu/label/popover/select/
  slot/tabs/label/tooltip`) back the `src/components/ui/*` wrappers (shadcn-style pattern:
  `cn()` = cva + clsx + tailwind-merge, `src/lib/utils`).
- framer-motion (page-entrance), recharts + shared `src/lib/chart-tokens.js`, leaflet/react-leaflet
  maps, @tanstack/react-query, react-hook-form + zod, zustand.
- Route tree: `src/app/(auth)` and `src/app/(dashboard)` with ~23 dashboard modules
  (ai, analytics, cards, dashboard, dispatch, driver (7 subpages), drivers, executive, expenses,
  fleet (6 subpaths), fuel, incidents, maintenance, mechanic, notifications, reports,
  reservations, routes, settings (10 subpages), supply-deliveries, system, tracking, trips, uvvrp).

Styling architecture (the reference's core trick, `SOURCE-VERIFIED`):

- Semantic color names (`--color-foreground`, `--color-success`, ...) are defined in one block of
  `src/app/globals.css` (`@theme inline`, lines 3-45) mapped to small two-letter variables
  (`--sf` surface, `--br` border, `--fg*` text, `--db` dark bg, `--dl` divider, `--dt/--dm/--dg`),
  with paired light/dark values per token (light block around globals.css:98-131, dark mirrors
  read at 156-162 for the `--sb` sidebar set).
- Because every component uses Tailwind utility classes over semantic tokens, ONE component
  implementation serves ALL modules and BOTH theme states without per-module CSS files.
  There is exactly one CSS file for the whole web UI (`src/app/globals.css`) plus
  `src/styles/map.css` (leaflet) and one CSS module (`fuse-button.module.css`).

## 2. Design tokens and color system

All from `src/app/globals.css` unless noted. `SOURCE-VERIFIED`.

### Colors (light values; dark counterparts in the `.dark` block)

| Token | Value | Purpose |
|---|---|---|
| `--primary` / `--fg` | `#111827` | Midnight Ink: primary buttons, active nav, primary text |
| `--primary` (dark) | `#f5f5f5` (globals.css:156) | inverted emphasis on dark |
| `--bg` (dark floor) | FleetOps neutral | page floor |
| `--sf` surface | `#ffffff` | card/panel background |
| `--br` border | `#d1d5db` | Slate Line |
| `--hv` hover | `#f3f4f6`-family | hover wash |
| `--success` | `#10b981` (globals.css:98) | healthy/completed |
| `--warning` | `#f59e0b` | needs attention this cycle |
| `--danger` | `#ef4444` | act-now blockers |
| `--info` | `#3b82f6` | in motion/active |
| `-700` variants | `success-700` etc. (globals.css:33-39) | AA-safe inks for sub-14px text on 10% tints |

Named rule (DESIGN.md "Colors"): **Strict Status Contrast Rule** - base status colors only for
fills/large graphics; `-700` variants for text < 14px.

One-off exceptions, deliberately non-token: deep navy `#0b132b` (AI Analyst identity), sky tints
(Tailwind scale), "session peach" expired-session banner surface (not reusable).

### Radii (globals.css:42-47)

`--radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-control: 12px; --radius-card: 16px;`
Plus the app uses `rounded-3xl` (24px) for stat cards. No custom radii allowed per DESIGN.md.

### Shadows (globals.css:48-51)

`--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.03); --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.04);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05);` - structural, near-invisible at rest; surfaces
are flat until hover.

### Special KPI physics (globals.css:215-266 + `stat-card.jsx`)

`.kpi-stat-card` hover lift and `.kpi-stat-card--interactive` spring
(`translateY(-3px) scale(1.004)` then active `translateY(-1px) scale(0.995)`), implemented as plain
CSS keyed off the component name; extra :not() selector blocks (lines 242-266) catch copy-pasted
lookalike card shells so stray stat-style cards inherit the same physics.

## 3. Typography

`SOURCE-VERIFIED` (globals.css:70-95, DESIGN.md):

- Single family: Inter via `--font-sans: var(--font-inter)`; `--font-data` is ALSO Inter with
  `tabular-nums` applied for anything compared vertically (tables, currency, IDs, timestamps).
  Hierarchy = weight + size only, never a second typeface (fonts partially `NOT INSPECTED` -
  next/font loading path not traced line by line).
- Canonical scale: caption 11px, label 12px (`text-xs`), body 14px (`text-sm`), lead 16px,
  section 18px, title 22px (single H1 per page). Weights 400/500/600/800.

## 4. Layout and navigation

`SOURCE-VERIFIED` (presence + values) / detailed structure `NOT INSPECTED` unless noted:

- Shell components: `src/components/layout/app-shell.jsx`, `dashboard-layout.jsx`
  (NOT INSPECTED in detail).
- Sidebar theming variables: `--sb #ffffff`, `--sb-hv #f3f4f6`, `--sb-active #111827`,
  `--sb-br #d1d5db` (light, globals.css:119-122); dark: `--sb #1a1a1a`, `--sb-hv #242424`,
  `--sb-active #f5f5f5`, `--sb-br #2a2a2a` (159-162). `SOURCE-VERIFIED`.
- Content rhythm: chart heights as canonical classes (`chart-h-sm` 220px / `-md` 260px / `-lg`
  300px, DESIGN.md); ultra-thin 6px styled scrollbars so overflow is discoverable (DESIGN.md;
  utility location in globals.css `NEEDS VISUAL VERIFICATION`).

## 5. Shared component catalog (src/components/ui, 40 files)

`SOURCE-VERIFIED` for the files read; verdicts "sampled" where noted.

| Component | Implementation summary | Evidence |
|---|---|---|
| Button | cva with 8 variants (default/destructive/outline/secondary/ghost/link/success/warning), 4 sizes (h-10 default, h-8 sm, h-11 lg, h-9 icon), radix Slot `asChild`, focus ring `ring-2 ring-foreground offset-2` | button.jsx:8-31 |
| Badge + StatusBadge | `Badge` = base chip; `StatusBadge` = central status grammar with per-entity tone maps (trip/reservation/vehicle/driver/fuel/maintenance/incident/leave/priority/gps/dispatch/route/copilot/efficiency/severity/risk) over 6 tones, entity map > global map > all-maps fallback (`status-badge.jsx:160-222`), `statusVariant()`/`TONE_CHIP`/`TONE_TEXT` exported so fills and text use the same resolution | status-badge.jsx (read) |
| StatCard / StatGrid | one shell, two behaviors: `div` resting vs `button`/`Link` interactive; tone sets for chip/icon/value/trend; `aria-label="Label: value. Open Label."` for linked cards; `StatGrid` cols 2-6 with responsive `md/lg/xl` stages | stat-card.jsx (read) |
| Card | Card/CardHeader/CardTitle/CardContent primitives, consumed by ~all modules (grep-verified imports across drivers, dispatch, dashboard, ai) | grep evidence |
| Dialog | Radix wrapper (Dialog*, used by ConfirmDialog/select dialogs) | imports (sampled) |
| Toast | `toast()` + suppress-auth variant; role log implied by usage | imports (NEEDS VISUAL VERIFICATION for internals) |
| Select / Popover / Dropdown / Avatar / Tabs / Tooltip / Label | Radix-backed | imports (sampled) |
| DatePicker / TimePicker / DateTimePicker | shared date controls (recently reworked: shared DatePicker) | imports (sampled) |
| Skeleton | FormSkeleton/DetailSkeleton/CardSkeleton/StatsGridSkeleton per-surface variants used in route-level `loading.jsx` | imports |
| EmptyState | used by dashboards, availability boards, attendance | imports |
| PageHeader / HeroHeader | page header grammar (HeroHeader used by role-dashboard) | imports |
| PageEntrance | 0.6s fade-up entrance, one per page, reduced-motion aware | DESIGN.md + component |
| PhaseRail | lifecycle spine across work orders/trips | DESIGN.md |
| DataTable family (src/components/tables) | `data-table.jsx`, `fleet-table.jsx`, `fleet-grid.jsx` | file list `SOURCE-VERIFIED`, internals NOT INSPECTED |
| Others | caps-lock-hint rose-bubble, confirm-dialog, document-upload/scan/preview, image-viewer, sticky-actions, command-palette, user-dropdown, notification-dropdown, query-feedback, theme-toggle, fuse-button (CSS module one-off) | file list |

Inconsistency note: `fuse-button.module.css` is the reference's own acknowledged exception.

## 6. The named rules (reference DESIGN.md, live authority)

1. Strict Status Contrast Rule (700-level text under 14px).
2. Data Alignment Rule (Inter + tabular figures for compared data).
3. Tactile Physics Rule (KPI spring, 280ms cubic-bezier).
4. Partition-Only Donut Rule (donuts only for sums-to-whole; overlapping counts -> bars).
5. No-Severity-Border Rule (no colored border-left for severity; tinted icon chips +
   `role="alert"`).
6. Honest Feed Rule (every panel owns skeleton / named error alert / honest empty state).
7. No custom radii; no ambient shadows on rest; motion only for genuinely live states.

## 7. Module inventory

Routes exist for all modules listed in section 1 (`SOURCE-VERIFIED` via directory tree).
Per-module page implementations: **sampled** through shared-component reads + DESIGN.md's
dashboard module specs (KPI cards, Dashboard Panels, Operations Cards 2x2, AI Analyst card,
map markers). Module-by-module body styling for analytics/reports/settings/fuel etc.:
`NOT INSPECTED` in depth. Honest-feed states (`FeedState` in dashboard panels,
`SOURCE-VERIFIED` via DESIGN.md re-sync note pointing at `src/components/dashboard/*`).

## 8. Responsive behavior

- StatGrid stages at `sm:2 / md:lg:xlg` per cols (stat-card.jsx:75-81). `SOURCE-VERIFIED`.
- Tailwind default breakpoints (640/768/1024/1280) are the implied scale; exact per-page
  mobile layouts: `NEEDS VISUAL VERIFICATION` (no browser in harness).

## 9. Accessibility observations

`SOURCE-VERIFIED`: focus-visible rings on Button and interactive StatCards; `aria-pressed` on
filter cards; `aria-label` destination naming on linked cards; documented `aria-live` on
caps-lock hints and countdown chips (`session-countdown` grammar in DESIGN.md); WCAG 1.4.11 fix history in caps-lock-hint (contrast
3.67:1). Empty states, reduced-motion gates documented. Rendered verification:
`NEEDS BROWSER VERIFICATION`.

## 10. Inspection limitations

- No dev server / browser in this harness: every rendered-visual claim is source-only.
- `dashboard-layout.jsx`/`app-shell.jsx` internals, data-table internals, dialog/select internals
  not read line-by-line (file list + import evidence only).
- Asset/icon consistency verified via lucide-react uniformity claim in DESIGN.md; logo assets
  not inspected.
