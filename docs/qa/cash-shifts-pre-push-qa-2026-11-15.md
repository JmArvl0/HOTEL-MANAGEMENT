# Cash & Shifts pre-push QA

Date: 15 November 2026. Scope: the shared Front Desk and Accounting Cash &
Shifts workspace, its post-close popover, and the data destinations reached
from the drawer workflow. Financial writes in QA used a disposable loopback
database; the configured database was read only.

## Remediation verification (later on 15 November)

The approved fixes for KI-022, KI-024 and KI-028 passed the final isolated
browser/database run. A paid ₱2,000 cash collection, ₱250 cash refund and
₱100.25 GCash refund produced **₱2,000 collections, ₱350.25 refunds and
₱1,649.75 net** in the real Front Desk report API and preview. The external
refund remained outside the cash drawer, whose expected cash was ₱2,750.
While its count-context GET was deliberately held, the Current Drawer already
showed ₱2,750 beside the ₱250 payout. Save/Close stayed gated until a matching
context, including for same-net movement changes in component tests.

The final browser/database run passed all ten checks: Front Desk open,
collection, cash refund, report preview, count draft, Close, Accounting
reconciliation, both-role layout at 1440/390/320px, 320px popover stability and
post-close navigation. It replayed 131 local migrations with fictional users.
The current SQL harness passed 12/12 real PostgreSQL checks. All 233 Vitest
files and 2,451 tests passed. Typecheck and the isolated Webpack production
build exited 0 after removing three unsupported route exports. The configured
Supabase migration ledger was read-only: the cash migration
`20261105010000` is applied; the unrelated Billing correction
`20261115020000` is pending. The initial syntax/audit-order defects in that
pending Billing migration were found by replay and fixed locally; a fresh
131-migration replay then passed. No configured-database business write or
deployment was made.

Concurrent repository activity committed and pushed the shared Cash & Shifts
source as part of `386cd49` while this QA was in progress. The Billing migration
repair passed a separate real-PostgreSQL smoke check on three fictional affected
invoices: paid/balance/status corrected and three audit rows written. The repair
and this verification record remain local for review. No additional push
was made in this remediation pass.

## Initial QA result (before remediation)

## Result

The current cash workflow saves and reads back through the intended database
tables. An isolated browser-to-database run used a new loopback-only database,
129 repository migrations, fictional accounts, real NextAuth sessions, real
application routes, PostgREST, and PostgreSQL. All eight current workflow
checks passed. The separate current SQL acceptance harness passed 12/12.

At that point, **pre-push acceptance remained open.** KI-022 still counted outgoing refunds as
incoming daily-report collections. A fresh focused calculation check with a
₱2,000 collection, ₱250 cash refund, and ₱100.25 GCash refund returned
₱2,350.25 in `collections.total` instead of ₱2,000. The temporary failing
test was removed after recording the result. The full existing test suite
passes because it does not assert this case.

## Data destinations verified

| Action | Saved destination | Read-back / UI result |
| --- | --- | --- |
| Open with ₱1,000 float and location | `cash_shifts`, audit | Current Drawer shows the saved opener/location |
| Collect ₱2,000 cash | `payments` linked to shift, reservation, invoice and actor; `financial_documents` receipt; invoice paid total | Cash activity shows the payment |
| Pay ₱250 cash refund | `payments`, `refund_requests`, `refund_attempts`, audit, linked drawer and Accounting actor | Cash payouts shows ₱250; expected drawer cash settles at ₱2,750 |
| Save ₱2,750 physical count | `cash_count_drafts` with actor | Resumes after page reload; final shift count remains unset before Close |
| Confirm Close | Same `cash_shifts` row, audit | Expected/count ₱2,750 and variance ₱0 appear in latest shift/history; no automatic handover or report |
| Accounting reconciliation | Same shift's reviewer, note, time and status | Original expected/count/variance remain intact |
| Post-close links | Read `/api/accounting/cash-shifts/[id]/follow-up` | Add a concern carries the exact shift ID; Open daily report selects the close date without submitting |

The configured database was checked read-only through authorized Front Desk,
Accounting, and Admin sessions on 14 November. Both cash roles' visible shift
matched `/api/accounting/ledger`; View shift record showed the same saved
figures; the follow-up endpoint matched the popover; View all, Add a concern,
and Open daily report reached their intended modules. Admin System Health
reported the database live and the migration ledger in sync: 140 applied,
129 local files, zero pending; the cash count/refund migration was not pending.
The saved browser sessions expired on 15 November. Re-login with the current
test credential failed, so the final 320px focus correction was verified in
the isolated authenticated app rather than against the configured database.

## Initial UI and release findings (before remediation)

1. **P1 / KI-022, open:** `lib/front-desk-reports.ts` includes paid refund rows
   in `collections.total`, count and method sums. Do not treat report
   collections as accurate when refunds occurred; preserve existing immutable
   submitted snapshots when correcting the builder.
2. **P2 / KI-024, open:** The report formatter still rounds financial display
   values to whole pesos. This pass confirmed the source path; the earlier
   browser QA contains the centavo display reproduction.
3. **P2 / KI-028, open:** Immediately after a refund and ledger refresh, Cash
   payouts can show ₱250 while the Current Drawer headline still shows
   ₱3,000. The headline updates to ₱2,750 after the separate count-context GET
   completes. This did not corrupt stored cash or permit a stale close, but
   the brief mismatch can mislead a cashier on a slow connection.
4. **Popover scroll jump, fixed locally:** At 320px, focusing the newly opened
   popover's close button moved the page scroll by 176px even though document
   layout stayed fixed. Focusing with `preventScroll` removed the jump. The
   isolated 320px browser check passed with unchanged drawer height, activity
   document position, document height and scroll position.
5. **Build gate, unrelated to Cash & Shifts:** An isolated Webpack production
   build compiled, then Next route type generation rejected extra exports
   `transportVehicleTypeColumns` and `QR_BUCKET` in two non-cash API routes.
   The normal build was not used for this check because of the documented
   Windows Turbopack junction permission issue.

Header buttons were inside the viewport at 1024, 390 and 320px for both cash
roles in the read-only browser check; the older clipping note KI-023 was not
reproduced. The popover was checked on desktop, 390px mobile and 320px dark
layout for both roles before sessions expired, and then at 320px in the
isolated authenticated app after the focus fix. It stays within the viewport,
scrolls internally, closes on Escape/outside click, and does not reflow the
drawer or activity section.

## Initial commands and limits (before remediation)

- `node scripts/cash-findings-qa.mjs`: 12/12 real PostgreSQL checks passed.
- Isolated current browser-to-database QA: eight workflow checks passed,
  including refund and post-close links; no hosted financial writes.
- `npm run typecheck`: passed.
- Touched Cash & Shifts TypeScript ESLint: passed.
- Focused Vitest: 7 files, 68 tests passed.
- `npm test`: 233 files, 2,428 tests passed.
- `npm run build -- --webpack` with an isolated output directory: compiled;
  Next route type generation failed on the two non-cash exports above.

The old `scripts/cash-shifts-data-qa.mjs` still calls revoked legacy refund and
close RPCs, so its failures are a stale QA-tool issue, not evidence of a cash
workflow regression. The current `cash-findings-qa.mjs` covers those functions.
