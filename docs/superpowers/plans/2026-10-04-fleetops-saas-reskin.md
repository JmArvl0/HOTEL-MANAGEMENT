# FleetOps SaaS Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the entire Haven system to a modern SaaS theme on the FleetOps palette, keeping dark mode and backend untouched.

**Architecture:** One new last-import token layer (`app/fleetops-theme.css`) wins the cascade; one shared `AppShell` (DashStack pattern) wraps guest + staff + admin/owner; rooted primitives standardize btn/input/badge/card/table/modal/toast/spacing. No API/RPC/migration changes.

**Tech Stack:** Next.js 16 App Router, React 18, hand-written CSS (no framework), `lib/theme.ts` + `ThemeToggle`, vitest + jsdom + stylesheet-walk tests.

**Spec:** This plan argues from the session agreement — FleetOps palette table (Midnight Ink `#111827`, Cool Paper `#f3f3f3`, Surface White `#ffffff`, Slate Border `#d1d5db`, Success `#10b981`/`#047857`, Warning `#f59e0b`, Alert `#ef4444`/`#b91c1c`, Info `#3b82f6`/`#1d4ed8`, Deep Navy `#0b132b` AI-only, Sky scale AI-only, Session Peach `#fff8f3`/`#27150a` banner-only), DashStack shell + Whitepace landing ideas, dark kept, every container inset (anti-scatter).

## Global Constraints

- No `supabase/migrations/` changes; no API/RPC/RBAC/logic changes — presentation only.
- Last import in `app/layout.tsx` wins; new rules scoped, never bare-element.
- Base status hexes = fills/graphics only; <14px text/chips use AA-safe variants.
- Deep Navy/Sky/Peach quarantined to AI/banner modules (walk test fails on leak).
- Every card/panel/modal/popover has explicit padding (walk test fails on bare).
- `npm run typecheck`, touched-file `eslint`, targeted `vitest`, full `npm test` + `npm run build` at phase gates.

## Review Focus

- Old coastal/teal hex resurfacing via a forgotten override — expect zero `#084b55|#f8f6f1|#85cbd0|#141815|#17363f|#c9783c` in `app/ components/ lib/` CSS.
- Dark unreadable status text — expect AA-safe variants in both themes.
- Toolbar card resurrection — expect transparent wrappers repo-wide.
- Bare container with scattered children — expect padding on every card/panel/modal.
- Quarantine leak (Navy/Peach on generic buttons) — expect walk-test failure.

---

### Task 1: FleetOps token layer + layout wiring + walk tests

**Files:**
- Create: `app/fleetops-theme.css`
- Modify: `app/layout.tsx` (append one import, last)
- Test: `app/fleetops-theme.test.ts` (new, node fs walk, no jsdom)

**Interfaces:**
- Consumes: `lib/theme.ts` `.theme-light` convention (dark = base, light = override).
- Produces: `:root` dark tokens + `.theme-light` light tokens; `.saas-page/.saas-card/.saas-btn` roots later tasks inherit.

- [ ] **Step 1: Write the failing test** — `app/fleetops-theme.test.ts` asserts `fleetops-theme.css` exists, contains `--ink:#111827`, `--floor`/`--surface`/`--line` in both themes, status + AA-safe vars, `.theme-light` block, quarantine vars present; and asserts zero old hexes in `app/ components/` CSS.
- [ ] **Step 2: Run it to verify it fails** — `npx vitest run app/fleetops-theme.test.ts`; expect FAIL (file missing).
- [ ] **Step 3: Create `app/fleetops-theme.css`** — dark `:root` base + `.theme-light` light override with full FleetOps tokens, page/card spacing roots, badge/button roots mapped to tokens, quarantine comments.
- [ ] **Step 4: Wire layout** — append `import "./fleetops-theme.css"` last in `app/layout.tsx`.
- [ ] **Step 5: Run tests** — `npx vitest run app/fleetops-theme.test.ts`; expect PASS. Then `npm run typecheck`.
- [ ] **Step 6: Commit** — `git add app/fleetops-theme.css app/fleetops-theme.test.ts app/layout.tsx; git commit -m "feat: fleetops token layer with dark parity"`

### Task 2: Shared AppShell (DashStack pattern)

**Files:**
- Create: `components/ui/app-shell.tsx`, `components/ui/app-shell.css`
- Modify: `components/customer/customer-shell.tsx` (guest adopts shell chrome), `components/manager/manager-dashboard-client.tsx` (staff adopts shell chrome) — thin wrappers only.
- Test: extend `app/fleetops-theme.test.ts` or new `components/ui/app-shell.test.tsx` (sidebar/topbar/`⌘K` slot/command palette entry, drawer ≤900px, ThemeToggle present).

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: `<AppShell nav={...} title={...} actions={...}>` used by all roles.

- [ ] Steps follow Task 1 pattern (test → fail → minimal shell → pass → typecheck/eslint → commit).

### Task 3: Rooted primitives (button/input/badge/card/table/modal/toast/spacing)

**Files:**
- Modify: `app/ui-primitives.css` (metrics point at Task 1 vars), `app/fleetops-theme.css` (append primitive roots).
- Test: walk tests — one button metric, toolbar transparency (exists), card/panel padding, quarantine.

### Task 4: Surface migration (landing/auth/booking/guest/staff/admin/QR)

**Files:** per-surface CSS + thin JSX regroups only, in order: landing → auth/recover → booking steps+rail → guest → Front Desk → Housekeeping → Manager/Reports/AI → Accounting/Maintenance → Admin/Owner → QR/scan.
**Tests:** existing suites must stay green; update old-literal theme assertions to new tokens same commit.
