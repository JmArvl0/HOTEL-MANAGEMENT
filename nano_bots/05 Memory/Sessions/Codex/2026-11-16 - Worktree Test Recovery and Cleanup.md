# Worktree test recovery and cleanup

November 16, 2026. The user authorized preserving useful uncommitted test
repairs, cleaning generated release files, committing, and removing the two
temporary worktrees. The current code base was `main` at `2011428`.

## Preserved changes

Commit `2fec9b8` on `codex/preserve-worktree-tests-20261116` contains the three
adapted test files and the original November 6 session record.

- The booking regression selects the list and full-history scope explicitly,
  uses a real JSON Response for the current browser boundary, verifies an
  out-of-window stay refreshes from Confirmed to No Show, preserves the selected
  history scope, and checks exactly two uncached history requests.
- The PO source-text lifecycle guard is replaced by actual component tests for
  status filters, submit/cancel callbacks, confirmation before receiving,
  outstanding quantities, immutable completed/cancelled orders, pending approval,
  and receiving-only controls. Cancelling the delivery dialog sends no callback.
  Existing quantity-validation component coverage remains intact.

No production component, business rule, dependency, or migration changed.

## Verification

Node 22.22.2, using the existing cached runtime and installed dependencies:

- Focused Vitest: **46 tests / 4 files pass**.
- `npm run typecheck` passes; the unrestricted repeat also passes.
- ESLint on the three touched test files passes with zero findings.
- The default Turbopack production build passes, including TypeScript and all
  130 prerendered pages. An ignored `git archive` snapshot of `2011428` plus the
  three test changes excludes concurrent CSS work and environment files. Only
  that verification copy sets the documented Turbopack root for its dependency
  junction. The application configuration and generated types remain unchanged.
- Full `npm test -- --maxWorkers=2 --reporter=verbose`: **2,640 passed / 9 failed**
  across 267 files (262 passing files). Eight failures hit five-second deadlines;
  one arrival-dialog query could not find Financial readiness. The files are
  registration, reservation actions, booking intent, cash shifts, and the arrival
  dialog. All five subsequently pass in a serial unchanged-timeout run:
  **67 tests / 5 files pass**. This does not establish a clean full-suite pass.
- The earlier sandbox full attempt was stopped after repeated timing failures;
  no assertion, test timeout, or encoding guard was relaxed.

Logs and original recovery files are in ignored
`.tmp/worktree-cleanup-20261116/`. No browser QA, hosted database write, provider
call, push, or deployment was performed by this cleanup.

## Cleanup and concurrency

Original PO worktree state at `8a8efad` was saved as a binary tracked patch,
both untracked files, and five SHA-256 fingerprints. Each fingerprint and the
entire tracked patch were rechecked immediately before removal. The original
session note is now tracked alongside this record; its old verification claims
are historical, not this session's evidence.

Xendit's `next-env.d.ts` difference was generated route-type paths. Restored it
and removed the 22 untracked build/cache artifacts under `.next-release-vercel`.
Its branch at `6424807` is already in the current main history.

Both `.tmp/po-room-rack-fix` and `.tmp/xendit/release-stage` are removed. Their
branches remain. Dependency junctions were unlinked before deletion, and the
shared root dependencies remain intact. All five other registered worktrees
were checked again and are clean.

During verification, another OpenCode session changed landing CSS, added its
own session record, and prepended a handoff section. Those edits were preserved
and excluded from this cleanup's commits. Only this cleanup's own handoff
addition is staged. Current Status, Decisions, and SYSTEM.md do not need a
change for this test-only recovery and Git housekeeping.
