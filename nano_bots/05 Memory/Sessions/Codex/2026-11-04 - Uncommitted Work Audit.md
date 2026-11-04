# Uncommitted Work Audit

## Request

Review the full uncommitted working tree for errors, conflicts, and dead code;
fix findings and commit each logical change with a description.

## Findings fixed

- Normalized CRLF in exact source-text test fixtures so Windows passes the same
  assertions as LF checkouts.
- Made reservation-window filtering use `[check-in, check-out)` semantics and
  added coverage for checkout-exclusive dates.
- Removed unused legacy sidebar components, obsolete room-rack selectors, an
  unreachable reservation status branch, and a redundant initial-state effect.
- Corrected the shared Modal initial-focus fallback; added a regression test.
- Scoped ESLint away from agent notes, static prototypes, and generated `.tmp` /
  `.next` files that had produced false `require()` findings.
- Corrected staff light-theme surfaces and filters; verified the handover form,
  filters, navigation, room calendar, and ledger in local Chrome.

## Verification

- `npm test`: 211 files / 2,272 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: 0 errors, 86 repo-wide warnings. The seven warnings in touched
  TSX files also appeared on the baseline versions.
- `git diff --check`: passed.
- Read-only Chrome review in light mode: Room Management, Reservations, Guest
  Management, Guest Requests, Hotel Operations / Shift handover, Operational
  Handover, and Cash & Shifts.
- No database writes or deployment.

## Commit groups

- `feat(front-office): add room calendar and reservation workspace` — calendar,
  reservation workspace, shared payment details, navigation, and dead-code cleanup.
- `fix(ui): correct light staff controls and ledger layout` — staff light theme,
  pagination/filter surfaces, System Health, and full-width Cash & Shifts ledger.
- `test: normalize source fixtures on Windows` — portable exact-text assertions.
- `chore(lint): exclude generated and reference files` — app-focused lint scope.
- `docs: add Cash and Shifts UI proposal` — plan and desktop/mobile visual assets;
  application implementation remains outside the plan.
- `docs: record cross-change audit outcome` — final verification and session state.
