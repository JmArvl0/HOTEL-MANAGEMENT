# Cash Shifts UI Implementation

Date: 2026-11-04. User explicitly requested implementation of the approved
Cash & Shifts plan/proposed UI. One agent; initial working tree clean.

## Outcome

- Added `CashShiftsWorkspace` and scoped CSS; wired only the cash section through
  it. Current drawer is separate from filtered/paged history. Expected, counted
  and Short/Over/Balanced read together; blank count is unavailable, not balanced.
  Latest closed/no-open states retain actual recorded financial values.
- Added browser-pure display selectors/centavo math and tests. Existing server
  calculations remain authoritative; paid refunds are not subtracted twice.
- Adapted existing `CashCountPanel` with optional workspace rendering and shared
  Modal review. One draft/note/retry owner; same-drawer refresh/filter/cancel
  preserve state, identity changes reset. Failed close keeps unchanged retry
  key; success displays returned final amounts; stale response refreshes safely.
- Full-width linked cash movements, complete history/detail/paging and exact
  historical reconciliation actions. Explicit Accounting dialog fixes balanced
  Cancel accidentally submitting. Variance explanation/recorded difference kept.
- Plural source-linked handover summary retains authorized scope/recent100 limit,
  independent retry and navigation/focus into the existing follow-up log. No
  custody-transfer or scheduling model added. Missing data is stated honestly.
- Removed obsolete cash-only layout/AccountingView branches. Preserved shared
  shell, opening dialog, payment/refund/statement reconciliation and server rules.
  Retained Cash & Shifts name; no rename approval was inferred.

## Verified checks

- Baseline typecheck and 97 relevant tests passed.
- Final targeted suite: 7 files / 117 tests pass. Full implementation checkpoint:
  213 files / 2,292 tests pass; final reading-order/copy changes received targeted
  rerun. Touched-file ESLint: 0 errors / 3 pre-existing dashboard warnings.
- Final production build passes with `.tmp/cash-shifts-build`. Sandbox attempt
  encountered Windows EPERM; identical build outside sandbox passed. An earlier
  concurrent typecheck raced generated files; final sequential typecheck passes.
  Build-added paths removed from next-env/tsconfig. `git diff --check` passes.
- Actual React component fixtures: light/dark, Front Desk open/draft and Accounting
  closed/reconcile, 320/390/768/1024/1440px, large money without page overflow.
  Dark dialog heading contrast corrected; Cancel focus return verified.
- Authenticated live Front Desk read-only: ledger/current no-open state, retained
  reconciled overage, history both pages, details, existing Open dialog/Cancel and
  refresh. No business record was written. Viewport override reset.

## Limits and references

Live Accounting/write E2E, concurrent browser payment arrival, 200% browser zoom,
physical touch/Safari and exhaustive long-content/short-window combinations are
unverified. No schema/migration, package addition, hosted write, commit or
deployment. No business decisions added to Decisions.md.

- `docs/qa/cash-shifts-ui-implementation-2026-11-04.md` — verified scope,
  portable sample-component screenshots and exact manual coverage.
- `docs/plans/2026-11-04-cash-shifts-ui-implementation-plan.md` — updated checklist.
- Prior proposal: [[2026-11-04 - Cash Drawer UI Implementation Plan]].
