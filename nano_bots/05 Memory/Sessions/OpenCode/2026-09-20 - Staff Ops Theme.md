# 2026-09-20 — Organization Executive Dashboard Theme (Staff Pages)

Implements `reference/design.mdd (1).txt` across all staff surfaces (D-025).
Staff-only; landing/customer/auth untouched.

## What changed (4 files)

- `app/staff-ops-theme.css` (new, ~700 lines) — override layer, imported last
  in `app/layout.tsx`. Every rule scoped under `.app-shell` / `.theme-light
  .app-shell`: ops tokens, shell chrome, executive headers, 24px stat cards,
  16px panels, tables, AA-safe status pills (`.badge.*` + `.haven-status--*`),
  ink buttons, 12px controls, staff-scoped modals, toasts, AI navy pill,
  admin/owner modules, tactile motion + reduced-motion gates, chart-h
  utilities, print + responsive touch-ups, refined dark mirrors.
- `app/layout.tsx` — one import line.
- `components/manager/manager-dashboard-client.tsx` — overview `PageHeader`
  `band` → `default` (1 line; parallel-session notification work preserved).
- `components/owner/owner-dashboard-client.tsx` — `Title` helper `band` →
  `default`, covering all 10 owner sections (1 line).

## Deliberately unchanged

- `.band` variant, landing/customer/auth CSS + markup, RBAC, workflows,
  DB/migrations, status strings, room-type identity colors, chart
  calculations (sole donut `roomMix` partitions inventory — rule holds).

## Verification

- `npm run typecheck` clean; eslint 0 errors (2 pre-existing warnings);
  targeted 17/17; full **1531/1531 (132 files)**; `npm run build` green
  (72 routes).
- Scope proof: git diff touches no landing/customer/auth file; customer +
  landing sources reference zero staff classes.
- Browser QA NOT performed (no runner, KI-005) — manual per-role checklist
  pending (desktop/laptop/mobile × light/dark × tables/cards/modals).

## Follow-ups

- Manual visual QA per role; confirm landing pixel-identical.
- Long-term: fold layer into theme file or keep as the staff authority.
