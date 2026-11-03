# HMS workflow QA — 2026-11-03

## Follow-up fixes — completed 2026-11-03

The user authorized fixes to QA-01–03. All three are now fixed locally:

- Physical-count entry captures its original stock timestamp. Refresh preserves that baseline, allowing the database to reject an outdated count. Clearing the quantity and recounting explicitly starts a new draft; selecting another item or movement type also resets the count.
- Cash-count state is keyed by drawer, actor and role. Replacing a drawer remounts the form with blank entries and retry state; ordinary refreshes of the same drawer preserve entries. A blank/invalid count is rejected before any close request.
- AccountingView is wrapped in one ledger grid child. Desktop now has exactly two columns/children with ledger and count panel both at y=84; mobile stacks them without page overflow (375px page in a 390px viewport).

Verification: 6 targeted form tests pass, including the two former expected failures now using normal assertions. The expanded tests also verify explicit recount and same-drawer refresh/new-drawer fresh submission. Full suite: **2,102 passed / 1 existing KI-012 failure** (before the assertion-only expansion; expanded targeted checks reran successfully). Typecheck, touched-file ESLint and production build pass; dashboard retains two existing hook warnings. No database migration or business-data change was needed.

Signed-in Front Desk browser recheck confirmed the desktop/mobile cash layout. Screenshots: `.tmp/hms-qa/cash-fixed-desktop.png` and `cash-fixed-mobile.png`. Business submission paths remain covered by isolated actual-component tests rather than live drawer/stock writes. The original audit below is historical evidence, not the current defect status. Broader QA limitations and unrelated suite failure remain.

---

**Verdict: not ready for a clean QA sign-off. Two P1 form-state defects and one P2 layout defect remain open.** This report supersedes any inference that the earlier implementation checks covered these interaction sequences. Runtime code and migrations were not changed during this QA session.

## Findings

### QA-01 · P1 · Physical-count draft is silently rebased by refresh

Location: `components/manager/stock-integrity-panel.tsx:20` and `:26`. Category: implementation integrity.

1. Load supply quantity 10 at timestamp 08:00 and enter a physical count of 10, reference and reason.
2. Another staff operation reduces stock to 8 at 08:05.
3. Click Refresh balances. The existing count draft remains while the item timestamp changes.
4. Save sends count 10 with `expectedUpdated=08:05`, although the physical count predates the deduction.

The database correctly validates the submitted timestamp, but the form has replaced the draft's original baseline. This can overwrite a newer deduction. Reproduced in the actual component with isolated responses; no real stock was changed. Preserve the original draft baseline, or clear/reconfirm the physical count after a refresh or item change. Suggested follow-up: `$impeccable harden`.

### QA-02 · P1 · Physical cash count can target a different drawer

Location: `components/manager/cash-count-panel.tsx:12`. Category: implementation integrity.

1. On shift A, enter a count of 1,000 and a note.
2. Another staff member closes A and opens shift B with opening cash 500.
3. A ledger refresh replaces the active-shift prop; the old count/note remain.
4. Submit sends the old count to shift B's close endpoint.

Reproduced by rerendering the actual component as the parent ledger refresh would. Closure still requires existing server authorization; the defect is silent reuse of the wrong drawer's draft. Bind/reset draft state by shift ID and require a fresh count when the drawer changes. Suggested follow-up: `$impeccable harden`.

### QA-03 · P2 · Cash count panel falls below a squeezed ledger

Location: `components/manager/manager-dashboard-client.tsx:368`, `AccountingView` at `:1863`, and `app/hms-workflows.css`. Category: responsive layout.

Verified while signed in as Front Desk at 1280px. `.hms-accounting-split` receives AccountingView's fragment siblings as separate grid children. The heading and KPI group occupy one row, toolbar/table another, and the count panel starts around y=1963. The table is squeezed to about 353px instead of sharing the intended layout with a coherent ledger column. This makes cash counting harder to discover.

Wrap the AccountingView output as one grid child and the count panel as the second. Check desktop and mobile afterward. Evidence: `.tmp/hms-qa/frontdesk-cash-desktop.png`. Suggested follow-up: `$impeccable layout`.

## Verification

| Check | Result |
|---|---|
| TypeScript | Passed: `npm run typecheck` |
| Targeted existing tests | 166 passed, 8 files |
| Full existing suite | 2,100 passed; 1 failed in `lib/password-reset-audit.test.ts` (existing Windows CRLF-sensitive SQL assertion) |
| New regression reproduction | 2 **expected failures**, explicitly marked `it.fails`; both defects remain open |
| New regression-file ESLint | Passed |
| Production build | Passed fresh: `npm run build` |
| Real PostgreSQL acceptance | 19 passed in dedicated scratch database, including stock/cash/request races and rollback |
| Configured Supabase smoke | Passed; fictional business fixtures rolled back |
| Unauthenticated HTTP | 8 checks returned 401 across inventory, handover, profile and ID-review read/write endpoints |

The full suite ran before the new regression file was added. Do not add its expected failures to the 2,100 normal passes. Repro command: `npx vitest run components/manager/hms-qa-regressions.test.tsx --reporter=verbose`. Logs are in ignored `.tmp/hms-qa/`.

## Signed-in browser coverage

Used the supplied test accounts through normal login. Credentials are not recorded here. Browser work inspected live screens without submitting stock, drawer, payment, profile, ID, handover or request changes. Normal authentication can generate ordinary session/audit activity.

| Role | Verified live browser coverage |
|---|---|
| Front Desk | Handover load/empty state and department recipients; cash screen; open-shift dialog inspected and cancelled; desktop/mobile handover layout |
| Accounting | Handover recipients restricted to Accounting; reconciliation and historical cash-exception records load in content |
| Manager | Inventory balances and movement-history empty state load; no movement write form |
| Guest | Profile fields load; pending request expands with Withdraw request control; no withdrawal or profile save performed |
| Owner | Normal login routes to separate executive dashboard; navigation smoke only |
| Admin | Normal login routes to separate governance dashboard; navigation smoke only |
| Housekeeping / Maintenance | Automated/component/SQL role checks only; no supplied signed-in browser accounts |

Owner/Admin do not use the shared operational dashboard. In particular, Owner has no Inventory/history navigation screen in the current source: backend read permission is not evidence of a delivered Owner inventory UI. Front Desk likewise has no Inventory navigation. Earlier account-coverage wording should be read with this correction.

At 390×844, the tested Front Desk handover view had no page-wide horizontal overflow and all six tested handover buttons were 44px tall. Screenshots: `.tmp/hms-qa/frontdesk-handover-desktop.png` and `frontdesk-handover-mobile.png`. This is a focused responsive check, not a full accessibility certification.

Not covered end-to-end in the signed-in browser: real payment collection/receipt issuance, drawer closure, stock issue/count submission, ID document replacement/verification, guest-profile persistence, request withdrawal/approval and handover creation/resolution. Their targeted automated and database checks are separate evidence, not a substitute for claiming browser completion.

## Scoped UI audit

Provisional scores apply only to inspected workflow views; unmeasured accessibility/performance areas are not certified.

| Dimension | Score / 4 | Evidence / limit |
|---|---:|---|
| Accessibility | 2 | Labels and tested 44px targets; no exhaustive keyboard/contrast audit |
| Performance | 2 | Views load; no profiling or web-vitals measurement |
| Theming | 2 | Existing shared shell reused; dark theme not audited |
| Responsive design | 2 | Handover mobile check passes; cash desktop layout fails |
| Implementation integrity | 1 | Two draft-identity defects reproduced |
| Total | 9 / 20 | Poor within this narrow audit; prioritize correctness |

Implementation integrity verdict: **fail**. The repeated pattern is retaining drafts while replacing the record/version those drafts describe. Positive findings include atomic server operations, real concurrent SQL acceptance, role-scoped recipients, read-only Manager inventory and preserved native mobile layout.

Recommended order: fix QA-01/02 with `$impeccable harden`, repair QA-03 with `$impeccable layout`, re-run the targeted regressions and affected browser flows, then `$impeccable audit` and `$impeccable polish`. These may be run individually or together after fixes are authorized. No deployment or migration change was performed during QA.
