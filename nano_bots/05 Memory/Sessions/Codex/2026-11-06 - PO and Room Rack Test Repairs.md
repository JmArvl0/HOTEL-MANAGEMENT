# PO and room-rack test repairs

November 6, 2026. User asked how to fix the two failures observed when publishing
the location feature. Work is isolated on `codex/fix-po-room-rack-tests`, based
on published `8a8efad`, in `.tmp/po-room-rack-fix/`. The original local branch
and unrelated working edits remain intact.

## Diagnosis and repair

- Room rack: the old test used the retired `All Reservations` accessible table
  name and read a September fixture through the default selected-window scope.
  The test now verifies the historical row is initially filtered out, selects
  Full history, reads the current `Reservation list` table, and checks the
  confirmed-to-no-show refresh, removal of the old status, preserved scope and
  exactly two non-cacheable history requests.
- Purchase orders: a source-text assertion expected partial-delivery wording
  absent from the published dashboard. That unfinished UI/schema work belongs
  to the unrelated local receipt changes and is not included here. Replaced
  the brittle lifecycle/source-copy check with three actual-component tests
  covering filters, submit/receive/cancel callbacks, partial-order receipt
  eligibility, immutable completed/cancelled orders, pending approval and
  receiving-only controls. Existing SQL and route contracts remain covered.

Only test source changes: two existing test files and one new lifecycle test.
No production component, database migration, business rule or permission change.

## Verification

- Targeted regression run:45 tests /3 files pass.
- Standalone typecheck and touched-file ESLint pass (0 errors/warnings).
- The first concurrent full/build run passed2401 cases but hit the unchanged
  encoding scan's5-second timeout. A separate four-worker full run passes
  **2402 tests /228 files**. No timeout or encoding guard was weakened.
- Build typechecking caught an unsupported Testing Library `exact` selector
  option in the new test. Removed that option; string role names already match
  exactly. The subsequent standalone typecheck passes.
- Final default Turbopack production build passes after the separate test run.
  The verification copy temporarily sets the documented linked-dependency root;
  config, generated tracked types, tsconfig and AGENTS are restored afterwards.
  Checks used installed Node24; no runtime/dependency change was made.

No commit, push, browser pass or production deployment is claimed for this repair.
