# 2026-10-02 - QA Follow-Ups BUG-001…005 (Front Desk Pass)

## BUG-001 — search leaks between modules → per-module remembered search
Root: one dashboard `search` state served every section; nav never reset it.
Fix: `searchBySection` map + scoped setter (`setSearchForSection` for the
programmatic approvals carry); `ResourceView key={section}` so filters/pages
reset per module. Tests: new per-module contracts; anchor + staff-reservations
literal updated to the new carry form.

## BUG-002 — Billing search not filtering
Chain on main verified working (invoice rows carry guest_name; dashboard
`filtered` → ResourceView → count): extracted to tested `lib/staff-search.ts`
(`filterStaffItems`) + `resource-view.test.tsx` render contract + hardened
`HavenSearchInput` to commit in-flight drafts on unmount (field-shows-text vs
filter desync class). Conclusion: observation matches a stale build or the
debounce/desync timing — locked by regression tests; re-verify on fresh deploy.

## BUG-003 — detail modals render after navigation
Root: `viewReservation`/`viewGuestProfile` set state unconditionally on
resolve; room detail synchronous. Fix: section capture + discard on mismatch,
plus clear detail/guestProfile/roomDetail on section change (targeted
eslint-disable, justified: identical-state sets bail out). Contract tests.

## BUG-004 — cash shift status inconsistent → single property-wide open shift
Census first: zero open shifts live (8 closed, 2 reconciled) — safe. Migration
`20261024090000` (pushed + live-verified): global exists-guard + advisory
lock; preserved the live-tightened front_desk/accounting roles (drift from
files, per KI-003). Route message generalized; Open button disabled while any
shift open. Tests in accounting.test.ts.

## BUG-005 — housekeeping counts disagree → global snapshot + honest copy
Panel takes `allItems` (dashboard passes unfiltered load); totals from it,
queue/footer from filtered set; scope note added (+1 CSS rule). Tests updated
+ new global-vs-filtered test.

## Gates
typecheck clean; eslint 0 errors (1 pre-existing warning + justified disable);
full 1949/1950 (1 pre-existing unrelated password-reset-audit failure); build
clean; diff-check clean. Live: ledger `20261024090000`, guard confirmed live.
Pending: Front Desk re-run of the report's exact steps on fresh deploy
(KI-005); report-export timeout needs instrumented follow-up (not actionable
from the read-only pass).
