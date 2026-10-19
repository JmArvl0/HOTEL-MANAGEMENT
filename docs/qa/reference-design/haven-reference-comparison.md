# Haven vs FleetOps - Reference Comparison

Date: 2026-10-19. Read-only. Companion reports:
`reference-system-design-audit.md` (reference side),
`haven-unified-design-system-proposal.md` (the target standard),
`reference-design-adoption-roadmap.md` (phased plan).

Baseline evidence for Haven: working tree of `C:\Projects\HOTEL-MANAGEMENT` on `main`
(user uncommitted files preserved) + the repo's own `docs/qa/frontend-ui-audit.md`
(2026-10-18) and `docs/qa/important-review.md`, used as maps and spot-verified against source.

---

## 1. Existing Haven strengths (KEEP)

1. **FleetOps palette already adopted** - `app/globals.css` root tokens
   (`--ink #111827`, `--line #d1d5db`, `--green #10b981`, `--danger #ef4444`,
   `--info #3b82f6`, shadow + btn tokens) and `app/design-tokens.css` (Tailwind-scale
   primitives, 4px spacing scale, semantic layer incl. `--color-success-fg = green-800`
   AA rule) mirror FleetOps' semantic token scheme. No re-skin needed.
2. **Real shared primitive set** - `components/ui`: Modal (56 consumers),
   HavenSelect (36), TablePagination (25), HavenSearchInput (26), ModuleSummaryCards (17),
   HavenDataToolbar (16), StatusBadge (13), toast-stack, FormDialog/FormField,
   PageHeader, command-palette, haven-notifications.
3. **Accessibility architecture** (spot-verified against haven-select.tsx:107-197
   listbox pattern, Modal focus trap, toast pause-on-read).
4. **Regression-test convention for shared layout** - `module-summary.test.tsx`,
   `staff-fitting.test.ts` guard `.mod-kpis` ownership/spacing against drift.
5. Intentional module isolation is also guarded (`system-health-view.test.tsx:85`).

## 2. Same-function components that are NOT shared across roles

This is the drift to fix (user requirement: one canonical format per function).

| Function | Family and location | Consumers | Divergence from the shared grammar |
|---|---|---|---|
| KPI stat card (staff standard) | `.mod-kpis/.mod-kpi` in `app/staff-theme.css:817-897` | 17+ staff panels via `module-summary-cards.tsx` | this IS the staff standard; needs promotion to a role-agnostic shared vertical-card standard |
| KPI variant | `.sd-kpi` in `app/staff-theme.css` (~l.1534+) used by `staff-duty-panel.tsx:141` | staff duty | duplicates .mod-kpi shape with own paddings/hover |
| KPI variant | `.report-kpi-card` `app/staff-theme.css:1234-1293`, `performance-reports.tsx:37` | performance reports | 10px radius, 24px digits, 9px labels, own print rules |
| KPI variant | `.haven-ai-kpi` `app/staff-theme.css:1335-1465`, `haven-ai-panel.tsx:180` | HAVEN AI panel | 5-col grid, icon-first inversion, own skeleton |
| Stat card one-off | `StatCard` API in `components/ui/tailadmin-haven.tsx:63+` (also exported from `components/ui/index.ts`) | `haven-tailadmin-visual-template.tsx` | a second StatCard API living inside the shared ui barrel |
| KPI variant (guest) | `.loyalty-kpi-card` `app/customer-portal.css:705-866`, `loyalty-card-panel.tsx:163` | guest loyalty | gradient cards, gold tones, clamp(20-26px) digits, own hover lift - its own design language |
| KPI variant (guest) | `.folio-kpi-card` `app/guest-booking.css:963-1002`, `payments-folio-panel.tsx:119` | guest folio | horizontal icon-36px layout, 9px labels, different hover |
| Page header | raw `.page-title`/`.page-header`/`.customer-page-title` variants (6 customer pages still render `customer-page-title`; staff-theme tail paints raw titles as gradient banner) | all shells | `TailAdminPageHeader` was removed 2026-10-18 so `PageHeader` is canonical - adoption still incomplete for raw title variants (was audit HUI-010) |
| Status pills | `StatusBadge` (13 consumers) vs `.badge.*` spans (18) vs `--st-*` customer-status family in `customer-portal.css` | both roles | payments pills consolidated to `StatusBadge` 2026-10-18 (B-H2); the other two grammars remain open |
| Skeletons | staff shimmer classes vs customer panel skeletons vs `haven-ai-kpi-skeleton` vs `haven-loader` | both roles | per-surface implementations of the same function |
| Empty states | `haven-data-controls.tsx` empty state vs `.sys-*` empties vs customer panel empties | both roles | repeated ad hoc, not one component |
| Sidebar paint | `globals.css` base sidebar vs `staff-theme.css` override; customer `.customer-shell` own sidebar tokens | staff / customer | two-three paint systems coexist (audit HUI-set) |

Typographic-floor note (2026-10-19 re-verification): HUI-003 (66 sub-9px text sizes) was
remediated upstream on 2026-10-18 - a byte-level font-size scan of `staff-theme.css` +
`guest-booking.css` finds zero sub-9px values today. Stage rows that referenced this debt
are therefore enforcement-only (pin the floor with the existing guard tests), not fix work.

## 3. Structural difference and its consequence

- Reference: ONE global stylesheet + Tailwind utilities over semantic tokens => one
  component implementation serves every module, both themes; drift cannot accumulate
  per module because no module has its own CSS.
- Haven: per-surface CSS layers (`staff-theme.css` last-import wins, `customer-portal.css`,
  `guest-booking.css`, page-scoped sheets) + `!important` walls documented in
  `docs/qa/important-review.md` (466 occurrences; bell walls fight,
  account-modal load-order defense). Same-function components drift per layer.
- Consequence: adopting FleetOps patterns means **re-implementing them in Haven's
  vanilla-CSS idiom** (Tailwind + Radix are not options here; `docs/ui-motion-guidelines.md`
  bans shadcn/Radix). The good news: Haven's token layer already speaks the same language,
  so it is consolidation, not translation.

## 4. Per-family verdicts

| Family | Verdict | Rationale and target consumers |
|---|---|---|
| Semantic token scheme + AA-safe status 700-variant text rule | **ADOPT** | Haven already has it in `design-tokens.css`; formalize the 700-variant rule to retire the sub-9px debt (HUI-003) |
| StatCard shell + interactive physics + `aria-label` destination naming (FleetOps `stat-card.jsx` + `globals.css:215-266`) | **ADOPT-as-standard**, merged with Haven's proven `.mod-kpi` vertical grammar | becomes THE one KPI/overview card for staff AND guest (loyalty/folio/ai/report/sd/tailadmin all consolidate) |
| StatusBadge entity-map resolution (`status-badge.jsx` grammar) | **ADAPT** | extend Haven's `StatusBadge.tsx` to one entity-tone resolution, retire `.badge.*` spans and `--st-*` pill systems |
| Button cva variant/size system | **ADAPT** | Haven's 40px/36px staff-compact metrics are documented intent (audit A5); keep metrics, adopt the explicit variant vocabulary in one primitives layer |
| Honest Feed Rule (skeleton/named-error/empty per panel) | **ADOPT** | drives the unified empty/loading/error standard for both roles |
| PageHeader single-hero convergence | **ADOPT-as-continuation** | Haven already owns `PageHeader`; finish adoption instead of adding a new pattern |
| Partition-Only Donut / Data Alignment / No-Severity-Border chart rules + `chart-tokens.js` single-source chart palette | **ADAPT** | Haven (recharts, GSAP-free) can use one `lib/chart-*` source; Haven's own audit already flagged chart wall complexity |
| Per-module CSS files for page-scoped styling | **KEEP (bounded)** | Haven's page-scoped sheets stay for module character; shared component CSS must not be re-declared there (test convention below) |
| Tailwind + Radix + cva implementation stack | **AVOID** | stack mismatch; Haven bans shadcn/Radix by policy; vanilla + design-token equivalents only |
| `fuse-button.module.css`, one-off session-peach exceptions | **AVOID** | keep exceptions rare and documented, do not replicate |
| FleetOps mobile/companion patterns | **AVOID** (out of scope) | mobile/ is a separate Expo surface by design |

## 5. Priority order (drives the roadmap)

1. Shared KPI/overview card (biggest consumer count, 7 families to collapse).
2. StatusBadge unification (13 + 18 + customer family).
3. PageHeader adoption completion.
4. Toolbar/filter + empty/loading/error states per panel (Honest Feed).
5. Sidebar/notification paint consolidation (the `!important` walls).
6. Typography floor: DONE upstream 2026-10-18 (zero sub-9px values remain); keep enforced
   by guard tests only.

Every adoption above is data-preserving: no permission, auth, payment, or business-rule
changes; layout-only consolidation.
