# 2026-10-18 — Frontend Audit Phase 2 (P3 hygiene + consolidation)

Executed B-H1…B-H5 of the Phase-2 plan (user-approved: commit Phase 1 first →
P3 hygiene → status pills → breakpoint contract → HUI-010 → QA checklist).
No browser QA available; structural HUI-005 wall removal stays gated behind
`docs/qa/browser-qa-checklist.md` verification (its own gate section F).

## Commits (all pathspec-scoped)

| Commit | Contents |
|---|---|
| `c289745` | Phase-1 remediation (HUI-011/001/003/006/007, dead code, 9px floor) |
| `d27ae8b` | B-H1: real `--color-primary-hover:#1f2937`, `--color-forest*` → `--color-ink` (design-tokens only, 13 refs; `--forest` legacy alias left live), `--tail-*` → `--st-*` full sweep (138 refs, 2 files, zero TS refs — staff-theme + fused-room-rack), 5 losing `font:` shorthands → `font-family` (family/size/weight/lh all restated after), globals dense base (lines 1–6) pretty-printed + cascade-dead `.page-title .btn{font-size:0}` rules removed (ui-primitives §3 owns the mobile collapse), staff-theme family decoder comment (sd/tp/grp/mr/mod/ai/saas) |
| `f4d236f` | B-H2: payments `<em.customer-status>` ×2 → `StatusBadge` (new `label` prop passes `friendlyStatus` copy; `rejected`+`verified` added to StatusBadge tone/icon maps); guest-booking sizing rule repointed to `.haven-status` |
| `(DESIGN.md)` | B-H3: §4a 6-step breakpoint scale (360/480/680/900/1100/1440), opportunistic-migration rule; §13 convergence note updated — landed inside the earlier commit flow (see `git log`) |
| `678cad8` | B-H4: `TailAdminPageHeader` deleted (second implementation, demo-only consumer); visual template migrated to canonical `PageHeader` + breadcrumb (Home crumb added); pin test: index+tailadmin carry no second header |
| `548b80c` | Encoding fix: B-H1's PowerShell `Get-Content -Raw`/`Set-Content` round-trip had double-encoded UTF-8 in 3 auth forms (caught by `lib/encoding-guard.test.ts`); all 7 B-H1 files restored from pre-batch commit + changes re-applied via Node (UTF-8, no BOM); tree scan clean |

## Verified against pins

- globals reformat is byte-equal modulo the two removed dead rules
  (whitespace-collapsed comparison) — `fleetops-surfaces.test.ts` pins hold
  (`--ink:#111827` collapsed-match, coastal hex guard).
- 2070/2070 tests pass (185 files) after encoding fix; build 88 routes clean;
  lint 0 errors / 91 warnings; typecheck 0.
- StatusBadge suite + payments pins green; page-header pin suite 4/4.

## Gates refreshed

`npm test` 2070/2070 · `npm run build` ✓ · `npm run lint` 0 errors / 91
warnings · `npm run typecheck` ✓ · encoding guard ✓.

## Open

- `docs/qa/browser-qa-checklist.md` (sections A–F) is the manual gate — HUI-005
  wall removal (bell extraction ≈119 decls + `.app-shell .modal-*` narrowing
  ≈71) executes only after A–B + D1/D2 pass (§F of the checklist).
- HUI-009 remaining consumers: reservation detail view + transportation list
  `.customer-status` migrate-on-edit.
- HUI-008 bulk migration stays opportunistic by DESIGN.md contract.
