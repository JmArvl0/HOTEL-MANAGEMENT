# Cash findings: delivery and frontend QA

Date: 6 November 2026, Asia/Singapore. Scope: the approved cash-refund,
saved-count and post-close follow-up changes in the current local working tree.
One agent; no production fixes, commit, migration push or deployment in this QA.

**Verdict: core destinations pass locally; release acceptance is withheld.**
The actual application persists and reads the changed records correctly, including
the ₱2,750 drawer expectation after a ₱250 cash refund. Two acceptance checks fail:
the daily report adds outgoing refunds to incoming collections, and the shared
header clips controls on smaller screens. Three additional UI issues are below.

The read-only linked ledger check returned **126 local / 112 remote migrations,
14 pending**. `20261105010000` is absent remotely, as is its local cancellation
settlement prerequisite `20261103160000`. Local verification does not certify
hosted delivery. Review the pending set and matching application release together.

## Environment and evidence

This run uses the actual Next.js application and API handlers, NextAuth session
validation, PostgREST 16.5 and PostgreSQL 18. It replays all 126 migrations into a
new, uniquely named, loopback-only database containing fictional staff and guests.
The local platform substitutes provide `auth.uid()`, storage metadata tables and
service-role grants; this is not a complete Supabase platform installation.

The runner issues encrypted test sessions for seeded accounts; normal application
role/auth-version checks still execute against that database. Password/OTP login
is outside this test. A local gateway maps Supabase's `/rest/v1` paths to
PostgREST. A safety gate checks the authenticated role and unique fixture invoice
before business writes. Service/auth credentials are generated in memory. Browser
requests to nonlocal hosts are blocked; integration credentials are overridden.
No hosted business records were changed.

The UI is not backed by fake ledger responses. Three deliberate fault injections
test a failed draft save, unavailable drawer metadata and a lost response after an
actual committed close. The normal retries reach real handlers/database functions.

- Runner: [cash-delivery-ui-qa.mjs](../../scripts/cash-delivery-ui-qa.mjs).
- Final checks and layout measurements: [results JSON](evidence/cash-delivery-results-2026-11-06.json).
- Committed record read-back: [read-back JSON](evidence/cash-delivery-readback-2026-11-06.json).
- Screenshots: [desktop](assets/cash-delivery-2026-11-06/cash-dark-1440.png),
  [mobile](assets/cash-delivery-2026-11-06/cash-light-320.png),
  [mobile count actions](assets/cash-delivery-2026-11-06/count-mobile-footer-dark.png),
  [report](assets/cash-delivery-2026-11-06/report-preview-real-data.png),
  [unresolved handover](assets/cash-delivery-2026-11-06/closed-with-unresolved-handover.png).

## Destination checks

| Action / value | Durable destination | Placement verified | Result |
| --- | --- | --- | --- |
| Open ₱1,000 float, location, opener | `cash_shifts` | Current shift and movement basis | Pass |
| ₱2,000 cash collection | `payments`, with drawer, reservation, invoice and recording actor | Cash movements and Transactions | Pass |
| Collection receipt | `financial_documents`, payment/reservation IDs and stored snapshot | Financial Documents; folio visible in Guest Folios | Pass |
| Explicit draft: amount, note, operator/role, basis/version/key | `cash_count_drafts`; final shift count fields stay NULL | Resume after module change, reload and a new same-user browser context | Pass |
| ₱250 cash refund | `payments`, `refund_requests`, `refund_attempts`, drawer/actor link and audit | Refunds, Transactions, drawer cash out; Owner Audit API read-back | Pass |
| ₱100.25 external GCash refund | Same refund/payment records, NULL drawer | Noncash payout UI; expected drawer cash stays ₱2,750 | Pass |
| Close: expected/count/variance/key | Existing `cash_shifts` row | Latest closed shift; original expected/count both ₱2,750, variance ₱0 | Pass |
| Separate explained shortage | Another `cash_shifts` row: expected ₱1,000, count ₱990, variance −₱10, close note | Actual close/reconciliation UI and DB read-back | Pass |
| Accounting review note/reviewer/time | Same shift row | Reconciled state; original −₱10 and close note retained | Pass |
| Explicit handover: concern/source/receiver | `shift_handovers` | Prefilled source, unresolved next-step count, receiver acknowledgement and resolution | Pass |
| Explicit report submission | `front_desk_reports.snapshot` | Hotel close date, Front Desk history, Manager acknowledgement | Persistence passes; collections content fails |
| Refund / close audit | `audit_logs` | Owner Audit data; one close event after retry | Pass |

The Financial Documents check concerns the original collection receipt; this QA
does not claim that refund processing creates a new refund receipt.
Owner Audit was checked through its authorized endpoint, rather than a separate
visual review of the Owner dashboard.

Close creates neither a handover nor a daily report. Report preview alone stores
no submission; explicit confirmation does. Manager acknowledgement preserves the
snapshot byte-for-byte as JSON. The receiver's acknowledge/resolve operations
retain the handover source and advance its version to 3.

Saved counts do not silently rebase: refund activity invalidates the old count,
and Close is blocked until a fresh count is saved. Another cashier cannot read
the saved count or close that drawer; Front Desk cannot process refunds. Failed
save retains input; a lost close response retries the saved key without a second
close audit. Independent database connections read the committed final state.

## Findings and recommended fixes

### CD-01 / KI-022 — P1: report treats refunds as incoming collections

Location: `lib/front-desk-reports.ts:64` and `:83`; incoming query at `:112`.
The aggregation includes all paid payments, including `purpose='refund'`, using
their positive stored amount. The report UI at
`components/manager/front-desk-reports-panel.tsx:55` labels that sum **Cash received**.

Reproduction: collect ₱2,000 cash; pay out ₱250 cash and ₱100.25 GCash; generate and
submit the same hotel's daily report. Actual stored snapshot:

```json
{"collections":{"count":3,"total":2350.25,"byMethod":{"cash":2250,"gcash":100.25},"byPurpose":{"refund":2,"stay_payment":1}},"cashShifts":{"counted":2750,"expected":2750,"variance":0}}
```

Expected incoming collections are ₱2,000; outgoing refunds are ₱350.25; net
receipts are ₱1,649.75. The physical drawer expectation is correctly ₱2,750,
including its ₱1,000 opening float. This is a report classification defect, not a
lost refund or incorrect drawer close. Existing behavior is exposed by the new
end-to-end coverage; this QA does not establish which earlier commit introduced it.

Fix the shared report builder to distinguish incoming payments, refund outflows
and net receipts, then update preview/history/export consistently. Cover cash and
noncash refunds in a pure aggregation test and the real-app runner. Preserve old
immutable snapshots; do not silently rewrite submitted reports.

### CD-02 / KI-023 — P2: shared header controls clip outside the viewport

Location: `components/manager/manager-dashboard-client.tsx:295`;
`app/staff-theme.css:2509` and responsive header rules around `:2552`.
The fixed action row competes with the remaining header content. Exact measurements:

| Width | Controls clipped | Furthest right edge |
| --- | --- | --- |
| 1440 | None measured | — |
| 1024 | Account menu, partially | 1055.59px |
| 768 | None measured | — |
| 390 | Notifications and Account menu | 456.91px |
| 320 | Theme toggle, Notifications and Account menu | 456.91px |

Native pointer interaction with the theme toggle at 320px fails because it is
outside the viewport. Dark-mode inspection at that width used a 390px switch,
then resized back; it is not a pass for the clipped toggle. The page hides
horizontal overflow, so a document-scroll-width check alone misses this defect.
The Cash & Shifts content itself stacks without page overflow.

Reserve space for essential actions at narrow widths, collapse secondary header
content into the existing menus and test actual control rectangles/clicks in both
themes. Suggested UI follow-up: `$impeccable adapt` on the shared staff header.

### CD-03 / KI-024 — P2: report display rounds financial amounts to whole pesos

Location: `components/manager/front-desk-reports-panel.tsx:26`.
The common report formatter sets `maximumFractionDigits: 0`. The stored ₱100.25
GCash amount displays as ₱100 and ₱2,350.25 displays as ₱2,350 in the screenshot.
Storage preserves centavos; the display loses them. Use the existing exact money
formatting convention across report cards, method totals, cash figures and export.
Suggested UI follow-up: `$impeccable clarify` on report money presentation.

### CD-04 / KI-025 — P3: closed drawer's own handover says “Other cash shift”

Location: `components/manager/cash-shifts-workspace.tsx:183`.
The caption compares the source only with `active?.id`. With no active drawer,
the selected latest closed drawer's own unresolved handover gets the other-shift
caption despite a matching source ID and correct next-step count. Compare against
the displayed drawer and name the closed state accurately. Navigation and stored
source linkage pass. Suggested UI follow-up: `$impeccable clarify`.

### CD-05 / KI-026 — P2: modal touch targets miss the documented 44px target

Measured at 320px in both themes: count Save/Close/Return actions and the close
icon are 36px high; refund action buttons are 36px and selectors 40px high.
The Cash workspace's refresh target is 40px wide. The payout checkbox's 20px box
is not itself a defect because its containing confirmation label is the target.
The count modal scrolls and all footer actions can enter the viewport, but its
buttons miss the project's documented 44px goal. Review shared Modal/button
cascade rather than adding conflicting local overrides. Suggested follow-up:
`$impeccable adapt` on the count/refund dialogs.

## Frontend technical audit

Implementation integrity verdict: the cash workspace remains coherent and specific
to the hotel's drawer lifecycle; the shared report's financial classification
prevents a clean acceptance verdict. The Impeccable detector returned no findings
on the five selected cash component/style files; that does not validate arithmetic
or rendered geometry, which the browser checks caught.

| Dimension | Scoped score / 4 | Evidence / limitation |
| --- | --- | --- |
| Accessibility | 2 | Count focus trap, Escape/focus return, input labels and visible focus pass; clipped header controls and undersized modal targets remain. Full screen-reader/contrast audit not performed. |
| Performance | 2 | No uncaught errors in monitored financial pages; existing hook/render lint warnings remain. Development-server timings are not a production performance benchmark. |
| Responsive design | 2 | Cash content reflows at all five widths; header clipping and modal target sizes remain. |
| Theming | 3 | Actual light/dark screenshots show readable cash/count/refund states and preserved hierarchy; 320px theme toggle is clipped. |
| Implementation integrity | 2 | Durable records and explicit submissions pass; report classification, centavo display and handover caption need correction. |
| Total | **11/20** | Scoped technical score; significant work needed. No WCAG conformance claim. |

Reviewed empty/current/closed/reconciled drawers, saved/unsaved/stale/error count
states, ₱10 million count formatting, refund method/drawer/error states, history,
handover and report destinations. Widths: **1440, 1024, 768, 390 and 320 CSS px**;
workspace light/dark at all five. Count dialog light/dark at 320px; cash refund
dialog light at 320px and desktop. Keyboard Tab stays in the count modal; Escape
returns focus. Scrolling brings the mobile count Save action fully into view.

Cash movement/history rows recompose on mobile, primary values remain readable,
forms preserve entries during the tested failures, and explicit next-step actions
reach their intended modules. Page overflow and unlabeled controls were checked
in the runner's scoped cash/count selectors; this is not an all-application DOM audit.

## Fresh verification

| Check | Result |
| --- | --- |
| Actual-app browser/HTTP/database acceptance | **25 checks: 23 pass / 2 fail**, expected nonzero exit for CD-01 and CD-02 |
| Migration replay | All **126** files replayed in fresh scratch databases |
| Real SQL acceptance, including races/rollback/caps | **12 / 12 pass** |
| Targeted Vitest | **11 files / 156 tests pass** |
| Full `npm test` | **2,343 pass / 2 fail**, 220 files |
| ESLint on QA runners and changed implementation TS/TSX | **0 errors / 6 existing warnings** |
| `npm run typecheck` | **Pass** after restoring the pre-existing type paths |
| Isolated `npm run build` | **Pass**, `HAVEN_BUILD_DIR=.tmp/cash-delivery-build-20261106` |

The two full-suite failures are the recorded purchase-order surface contract and
room-rack reservation-history refresh tests. Prior clean-baseline reproduction is
documented in the 4 November handoff; a new pristine-baseline run was not performed
here. These are separate from the two newly exposed real-app acceptance failures.

Node **22.22.2** was used. Temporary build types/config additions are cleaned up
after the run, retaining pre-existing working-tree changes. The owned PostgreSQL
test cluster is stopped; fictional databases are retained. No runtime page source
was modified by this QA.

## Reproduction and remaining limits

Run `scripts/cash-findings-qa.mjs` for SQL acceptance and
`scripts/cash-delivery-ui-qa.mjs` for the actual-app checks from the repo root.
The latter uses the existing local-only test cluster at
`.tmp/cash-findings-pg` (`127.0.0.1:55441`, dedicated `cash_data_qa` user), installed
PostgreSQL 18 binaries, the local PostgREST binary under
`.tmp/staff-walkthrough/postgrest`, Node 22 under `.tmp/hotel-remaining/node22`
and installed Google Chrome. It accepts no hosted DB target and creates a new
database each run. It starts isolated Next/PostgREST processes on fresh local
ports and closes its browser/processes afterward. These machine-local binaries
are prerequisites, not newly installed dependencies or a general CI setup.

Logs, all screenshots, fictional fixtures and scratch databases remain ignored
under `.tmp/cash-delivery-qa-20261106/` and the dedicated PostgreSQL data directory;
selected credential-free evidence is retained above. The browser runner is
expected to fail until CD-01/CD-02 are fixed. Earlier harness startup/selector
failures were corrected before the recorded final 25-check run.

Unverified: hosted app/API-to-hosted-DB behavior, password/OTP journey, real
payment-provider/bank disbursement, email delivery, physical touch devices,
Safari/Firefox, 200% browser zoom, screen readers, comprehensive contrast and
production performance. Only a manual payout is recorded; no money is sent.
This QA added reproducible evidence and defect records; it did not repair the
new findings or activate a release.
