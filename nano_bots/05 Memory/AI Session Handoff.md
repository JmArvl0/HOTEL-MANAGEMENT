# AI Session Handoff

Current execution state. Concise — detail lives in linked session notes.

## Current task (role-based overview redesign, 2026-09-21)

System-wide staff Overview recomposition: COMPLETE, all gates green.
`Overview` in `manager-dashboard-client.tsx` is now role-composed (accounting
financial cards, ops queue panels replacing the chart for front_desk /
accounting / housekeeping / maintenance, manager decisions-first,
dedup guards, plural fixes); `staff-ops-theme.css` gains the manager
ordering rule + ≤1000px single-column grid fix; new
`overview-composition.test.tsx` (6); DESIGN.md §18. Customer/Owner/Admin
audited, already compliant, unchanged. Gates: typecheck clean, eslint 0
errors, 139 files / 1574 tests, build 73 routes, diff-check clean. Browser
QA via real Chromium against the live dev server (temporary fixture route,
deleted after): 5 roles × 1440/390px × dark/light, no errors, no overflow.
Full auth-walled role walkthrough still pending. Detail:
`Sessions/OpenCode/2026-09-21 - Role-Based Overview Redesign.md`.

## Current task (authenticated session countdown, 2026-09-21)

System-wide header countdown: COMPLETE, all gates green.
`sessionExpiresAt` is the earliest idle/absolute server deadline; background
polling is non-mutating and only explicit pointer/keyboard activity refreshes
`last_seen_at`. Customer + all staff role shells mount the compact timer before
theme/notification/profile controls. Expiration is blocking with Sign in again
as the only action. Focused tests 43/43, full suite 1568/1568, typecheck,
touched ESLint, production build, and Impeccable detector are green. Detail:
`Sessions/Codex/2026-09-21 - Session Countdown and Expiration.md`.

## Current task (search-input visibility, 2026-09-21)

Shared light-staff search contrast fix: COMPLETE, gates green. Root cause was
token contrast, not a missing border — `--hc-surface-soft/--hc-line` resolved
to `--ds2 #f7f9f6`/`--dl #e1e6e2` on the `#f4f6f3` floor. One canonical mapping
(`.theme-light .app-shell` in `haven-data-controls.css`: white surface + slate
ops border + teal accent) reaches every `HavenSearchInput` consumer incl. the
`.table-tools`-wrapped Front Desk views; input now uses the solid surface,
12px ops radius, teal hover/focus ring, disabled state. No toolbar card, no
double border, no behavior changes. 1554/1554 tests, typecheck/eslint/build/
diff-check clean. Browser QA via Playwright screenshots of the real CSS bundle
(computed: bg #fff, border #d1d5db, floor #f3f3f3; dark + 390px mobile OK).
Full in-app role walkthrough still pending (auth-walled).

## Current task (action cards, 2026-09-20)

HavenActionItem standardization across staff roles: COMPLETE, gates green.
New shared primitive `components/ui/haven-action-item.tsx` + `.haven-action-item`
CSS (staff-ops-theme §7b, light + dark); manager Overview quick-panels (5 roles)
and admin quick-actions/health cards migrated; dead `.quick-panel`/`.quick-icon`
+ legacy admin card CSS removed. 1552/1552 tests, typecheck/lint/build/diff-check
clean. Detail: `Sessions/OpenCode/2026-09-20 - Action Card Standardization.md`.
Remaining: manual per-role browser QA (no runner, KI-005). Parallel stream
(data-toolbar transparency) touched only to fix missing imports its own test
needed — otherwise untouched.

## Current task (staff ops theme, 2026-09-20)

Org Executive Dashboard theme across staff pages (D-025): IMPLEMENTED,
gates green. `app/staff-ops-theme.css` (scoped override layer, last import),
band→default at 2 staff call sites, DESIGN.md §16, D-025 recorded.
Manual per-role browser QA still pending (no runner, KI-005). Landing /
customer / auth untouched (diff-verified). Track B history-conversion work
below is a parallel stream — untouched.

## Current task (history conversion)

Option C history-carrying conversion (D-024): IMPLEMENTED, awaiting
production approval. No push, no prod mutation performed.

## Completed (verified)

- Migration `20261013010000` (new `admin_convert_guest_to_staff_with_history`
  RPC, owner-only actor, history census in audit, `staff` marker column).
  Base converter + generic role RPC untouched.
- Route `withHistory` flag, `OWNER_AUTHORITY_REQUIRED` message, admin dialog
  checkbox + payload. D-024 + `SYSTEM.md` §6 updated.
- Tests: new `guest-staff-conversion-with-history` suite (6) + old suite
  updated for dual-RPC routing. Gates green: typecheck, eslint 0 errors,
  1531/1531, build, diff-check.

## Completed (verified)

- `AGENTS.md` created — canonical shared router for Claude Code, OpenCode,
  Codex (both auto-discover root AGENTS.md; verified against official docs).
- `05 Memory/Project Memory.md` created — durable knowledge + links.
- This file created — replaces ad-hoc handoff state.
- `CLAUDE.md` preserved; pointer appended. `Memory Index.md` refreshed.
- `Sessions/{Claude Code,OpenCode,Codex}/` created for new sessions.
- Option B env fix committed (`d2be55b`, pushed to `origin/main`):
  pairing rule skipped only during `next build`; runtime strict.
  Gates were green: typecheck, eslint 0 errors, 1525/1525, build.

## Remaining / blockers

- Validate: link check, AGENTS.md size, secret grep, CLI probes.
- Manual browser QA still pending per KI-005 (no runner in repo).
- Rotate chat-exposed secrets (service-role, SMTP, NEXTAUTH, OTP, Gemini).
- HostForge deploy is the user's step (both vars must be saved in panel).

## Next action

Finish validation, report, then resume normal development on `main`
(large uncommitted tree from parallel streams — coordinate, don't overwrite).
