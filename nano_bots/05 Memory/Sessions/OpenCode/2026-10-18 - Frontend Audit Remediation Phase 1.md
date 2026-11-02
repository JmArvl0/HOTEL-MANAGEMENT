# 2026-10-18 — Frontend Audit Remediation Phase 1

Executed batches B1–C of `.opencode/plans/frontend-remediation-phase2-plan.md`
(authorized plan from the Phase-1 UI audit `docs/qa/frontend-ui-audit.md`,
20 findings HUI-001…020). No commits, no migrations, no new dependencies.
User-file diffs (`nano_bots/**`, `vitest.config.mts`, untracked dirs) preserved.

## Outcomes by finding

| Finding | Disposition | Mechanism |
|---|---|---|
| HUI-011 (P1) cash-close suspension | **RESOLVED** ([[D-032]]) | Flag + banner + 409 backstop deleted from `manager-dashboard-client.tsx` and `app/api/accounting/cash-shifts/[id]/route.ts`; Close routes to `accounting_close_cash_shift`; owner-only sign-out block preserved (pre-suspension semantics). Safe since `20261024090000` single-shift + shared drawer + `CASH_BYPASS_ACTIVE` fix arrived 2026-10-03→24. |
| HUI-001 sidebar CSS merge claim | **RESOLVED (reframed)** | Audit was wrong about danger: globals `.sidebar` block is the ONLY mobile-drawer base (≤1000px). Delete actually targeted dead markup: `Sidebar`/`NavGroup`/`NavLink`/`NavItem` from `components/ui/Navigation.tsx` (zero runtime consumers) + Modal.css "Navigation Components" section (~396 lines incl. media/reduced-motion/high-contrast rules). globals untouched. |
| HUI-006 AppShell | **RESOLVED** | `components/ui/app-shell.{tsx,css,test.tsx}` deleted + `app/layout.tsx:16` import removed; zero consumers confirmed. |
| HUI-003 sub-9px type | **RESOLVED (bounded)** | Raise-only token substitution `font-size:{5.6–8.5}px → 9px` in `app/staff-theme.css` (52) + `app/guest-booking.css` (14); 0 sub-9px remain; letter-spacing/line-height untouched; all pinning suites green. |
| HUI-007 stale DESIGN.md refs | **RESOLVED** | §1 real import order (15 sheets); §2 palette de-coastaled (hexes only in `.kilo` worktree + `.next` artifacts); snapshot line → 2026-10-06 rewrite; dead `manager-dashboard-theme.css`/`staff-ops-theme.css` refs fixed in §10–12; `ui-primitives.css` comments repointed to `app/staff-theme.css`. |
| HUI-005 !important walls | **REPORTED** | `docs/qa/important-review.md`: 466 total (staff-theme 299, globals 68, haven-account-modal 99…); root causes = bell icon walls + `.app-shell .modal-*` load-order defense; recommendation: extract bell to component layer + narrow staff-theme modal scope ≈190 removable, browser-QA gated. No mass removal this phase. |
| HUI-010 PageHeader | **PARTIAL** | No zero-risk adoption target for the 30 inline page-titles (per-header `:has()`/layout deps); deferred contract: +1 shared-Breadcrumb composition test in `components/ui/page-header.test.tsx`. `TailAdminPageHeader` consolidation deferred to a browser-verified pass. |
| HUI-002/004/008/009 with-known-fix+`ponytail` | **DEFERRED** (not in batch scope) | see plan file; open follow-ups. |
| (report) P2/P3 findings beyond B1–C | **REPORTED** | In `docs/qa/frontend-ui-audit.md` §11 for prioritization. |
| Pr0 fix-in-passing ripples | **DONE** | e.g. all-subtrahend rounding trap sheet carryovers skipped unless free per plan. |

## Gates after (all green)

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| eslint on touched files | 0 errors / 0 warnings |
| `npm test` | PASS — **185 files / 2069 tests** (−1 file = deleted app-shell suite; +3 tests: close re-enabled ×2, PageHeader breadcrumb ×1) |
| `npm run build` | PASS (exit 0, 88 routes) |
| `npm run lint` | 0 errors / 91 warnings (−6 from dead components) |

Pinned suites verified spotless: `lib/accounting.test.ts` 79, manager 22/165,
fleetops palette pins (#111827 ×72, #d1d5db ×44), notifications/engine 10/10,
booking + landing + fleetops-surfaces 69.

## Root-cause trails (for the record)

- HUI-011's real bug was never the suspension (a lock-out) but the trap it
  prevented: close → no reopen RPC → `CASH_SHIFT_REQUIRED`. Since the
  2026-10-24 migrations (advisory lock + shared drawer) + live bypass flag,
  closing is safe. Verified by reading `app/api/front-desk/reservations/[id]/payment/route.ts:2`
  and the migration ledger before touching the flags.
- HUI-001's "merge" fix would have deleted the only mobile drawer rules.
  Column-by-column evidence before deletion, not doc-first.

## Open / deferred

- KI-014 (browser QA backlog now in [[Known Issues]]): close+reconcile per role,
  owner-only sign-out dialog, mobile drawer ≤1000/≤360, 9px layout shift at
  390/768/1366, `.haven-account-dialog` parity post-Modal.css deletion.
- HUI-010 full migration; HUI-005 wall removal (component pass, browser-gated).
- No lint warnings added. No commits — user runs commit flow.

Vault: D-032 appended to [[Decisions]]. KI-014 appended to [[Known Issues]].
Handoff refreshed. This is the Phase-1 remediation session of the audit
engagement whose Phase 2 (HUI-002/008 type floor guest suites etc.) may follow
on request.
