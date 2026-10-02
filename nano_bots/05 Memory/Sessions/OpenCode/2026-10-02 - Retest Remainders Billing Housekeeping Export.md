# 2026-10-02 - Retest Remainders: Billing, Housekeeping Footer, Export

## Billing search ("rene" → all 24 rows, count stuck)
Live probe (read-only): 24 invoice rows, only ONE contains "rene"
(`rene baterbonia`). Over-matching refuted on current columns; the filter
genuinely never ran in that browser — consistent with a stale deployment or
the old keystroke-loss timing, both now addressed. Hardening shipped anyway:
`filterStaffItems` scopes Billing to guest + booking + reference + status
(user-approved direction; amount text no longer matches), decoy-field
regression tests (a "rene" in any other column must not match), render
contract holds. If it still repros on a fresh deploy, the next step is an
instrumented repro (console errors? invoice payload shape?) — the code chain
is now fully pinned by tests.

## Housekeeping "Showing 5, only Room 401 visible"
Mechanism: footer counted `queueItems` (5) while the completed-today group
starts collapsed — its cards are counted but hidden. Fix: footer and toolbar
count report visible-of-total ("Showing 1 of 2 tasks" style) from the same
sets the groups render; summary totals stay global with the scope caption.
Regression test with collapsed history.

## Report Export timeout
Export is a bare `window.print()` — no JS can hang there; the hang is the
browser's print preview against `break-inside:avoid` on every panel plus zero
print rules for the tall report preview. Fix (print-CSS only): preview may
break across pages; report actions/tools/export-note hidden in print.
Stylesheet-walk tests pin both. Behavioral test: preview → Export calls
print. Instrumented retest still needed (browser? dialog appears? page
count?) to distinguish CSS hang from printer/environment failure; real
download export deferred per user choice.

## Gates
typecheck clean; eslint clean; full 1963/1964 (1 pre-existing unrelated
password-reset-audit failure); build clean; diff-check clean. No migration —
no db push. Parallel session's untracked backfill (20261024100000) + folio
work left untouched; next migration numbers above it.
