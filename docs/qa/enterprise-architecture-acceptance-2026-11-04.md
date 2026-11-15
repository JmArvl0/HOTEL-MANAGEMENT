# Enterprise architecture acceptance · 2026-11-04

## Fleet revocation/purpose-key checkpoint · 2026-11-13

Local revocation and separate callback/photo credentials implemented; same-version
retries, current-snapshot already_revoked, explicit409 review, unknown-version source
lookup and permanent local tracking/renewal suppression verified.137 migration replay,
24 original SQL cases, Fleet26+14+17+16, focused114/5, full2522/241, typecheck/build/lint0
pass. Local real Edge covers actual app/auth/database with synthetic provider/storage,
withdrawal/replay/conflict/lookup/429/role/320px light/dark and zero-request off mode.
Official Supabase scoped dry-run lists four Fleet migrations; no hosted apply/deploy,
activation or actual secret/Send exchange. Real partner/mobile/GPS/token QA pending.
Task22 remains in progress. See13 November revocation session/current adapter guide.


## Fleet supplied wire checkpoint · 2026-11-13

Exact provided 6 November schema/sample now drive the local flat HAVEN adapter,
complete wrapped ACK/plain callback, atomic evidence storage, assignment/version-bound
photo signing and explicit durable Front Desk tracking renewal. No hosted activation.
Task22 stays in progress. Latest guide: `docs/integrations/HAVEN_FLEET_PREPARATION.md`.

Verified fresh136 migration replay/24 existing SQL cases, Fleet SQL26+14+17,
focused103/4, full2511/240, typecheck, production build and touched ESLint0.
Real local Edge covers photo/no-photo, both legs, guest plate/tracking/share,
renewal/lost-response replay, stale/terminal/reassignment/removal/withdrawal and
zero-request off-mode; desktop/390/320 light/dark. Fleet/storage are synthetic;
actual GPS, public-token invalidation, mobile OS share sheets and joint sign-off
remain pending. New migration20261113010000 is unapplied to hosting. Allowlist
blank; no automatic fare posting; PayMongo deferred. See the 13 November Codex session.


## Fleet ride preferences and safety checkpoint · 2026-11-05

User clarified that photo is optional and requested Fleet plate/shareable tracking,
quiet/other preferences, notes and luggage. Implemented saved-contact defaults,
per-ride preferences/luggage/notes, explicit complete-data ACK, assignment-bound
Fleet safety snapshot, owner-only no-store API and guest Track/Share controls.
Migration20261105020000 stays local, with connection off. Task22 is still in progress.

Fresh migration129 replay and original SQL regressions pass. Existing Fleet SQL26
and new safety SQL14 pass, including atomic rollback, version/role/ownership,
both legs, concurrent ordering, reassignment, revocation and no added guest fare.
Focused80/3, full2375/221, typecheck/build and touched ESLint0 errors/0 warnings pass.
Edge verified real Haven auth/API/DB at desktop/390/320 light/dark, no-photo save,
contact defaults, stored requests/outgoing payloads, plate/provider link, expired/
unsafe/stale/reassigned/complete links, error cache clearing, sharing revocation,
and another separately registered guest's404. Tracking page/Fleet were synthetic;
OS sharing and copy calls were observed without messages or system-clipboard writes.
Actual Fleet GPS/public-link revocation and mobile OS share sheets remain pending.
QA tree/clone removed, PG stopped, generated type paths restored. Full handoff:
`docs/integrations/FLEET_TEAM_RIDE_SAFETY_INSTRUCTIONS.md`.

## Fleet preparation checkpoint · 2026-11-05

Task 22 is in progress. Local migration `20261105010000` adds private pickup
profiles, linked leg identities, create outbox and status inbox. Guest and
Front Desk screens support passenger contact/photo, per-ride permission,
preparation/delivery state, due retry and coordination notes. Connection defaults
off and production activation is not implemented. Partner statuses are advisory;
local operational/fare RPCs are unchanged. See
`docs/integrations/HAVEN_FLEET_PREPARATION.md` and the Fleet preparation session.

Verified fresh replay of all 128 local migrations and 26 real PostgreSQL cases
including role/ownership denial, consent/version checks, two-leg mapping,
concurrent claim and callback, stable retry identities, terminal/old event
protection, photo identity, late acceptance after cancellation, stay cancellation
and no fare posting. Focused Vitest 56/2, full Vitest 2,351/220, production build
and typecheck passed. Touched ESLint has zero errors, six existing warnings in
the staff transportation panel. Final mobile CSS was checked in Edge after the
full suite, and the final build includes that CSS.

Authenticated real Edge verified guest photo/contact at 390px, two-leg staff
prepare/send against an HTTPS synthetic Fleet server, outage/backoff/retry,
callback authentication/replay/conflict/stale handling, active-assignment photo
refresh and completion denial, sharing/photo revocation, current-style ACK held
for review, and Owner action denial. A separate default-off run verified disabled
send controls, server refusal, unavailable callback and zero partner requests.
320px checks verified no document overflow, 44px form/action controls, error draft
preservation, spoofed/oversized image rejection and readable dark-theme modal.
Private storage was a local fixture. No deployed Fleet, hosted storage or physical
device was certified. QA processes and owned clones were removed; PostgreSQL stopped.

Partner acceptance, deployed schema, callback/driver contracts, final fare authority,
update/cancel/recovery and actual two-system staging QA remain pending. Hosted
rollout stays on hold; PayMongo remains deferred.

Scope covers Tasks 1, 4 and 5, preparation of Task 2's ownership register and Task 3's workflow document, Task 7's local manual-payment verification, and Tasks 8–11's local boundary review/fixes and acceptance. PayMongo Task 6 is deferred. All browser writes used fictional data in a loopback Next.js, NextAuth, PostgREST and PostgreSQL stack.

## Task 2 ownership register review

`docs/ENTERPRISE_BOUNDARIES.md` now records 22 ownership rows, each with one
proposed final authority, accountable/approver role, sign-off state,
date and evidence. Every row also identifies the requester, permitted writer,
stable ID, permitted copies and correction authority. The register splits Hotel
source money from Finance journals, principal authentication from employment and
Hotel grants, and storage bytes from domain access/retention decisions. It maps
all seven Hotel areas and defines measurable handoff conditions for stock/POs,
maintenance and transport while retaining their local authorities.

Content checks passed for 22 ordered ownership IDs, matching detail rows, seven
Hotel areas, table widths and explicit source paths. At the user's request the
register uses roles while names are pending. Every row is Pending sign-off and
every accepted date is Pending. Source
evidence and this technical review do not supply department acceptance. Task 2's
register is prepared; G1 still requires confirmation from the authorized role
representatives. The register includes the review steps and an approval evidence
template with row ID, approver role, decision, date, reviewed version and reference.

## Task 3 workflow document review

[Enterprise contracts](../integrations/ENTERPRISE_CONTRACTS.md) records proposed
Finance, HR, SCM, Facilities and Fleet handoffs and references the existing
Restaurant contract. Facilities includes incident, diagnosis, assignment, repair,
Hotel verification and reopen, plus preventive service and independent block
acknowledgment. SCM includes requisition, approved PO, partial/accepted/rejected
receipt, linked return and Finance invoice matching, with explicit UOM/location
and one accepted stock effect. Each partner has a controlled fallback and
adoption conditions. Source occurrence, receipt, Hotel posting and Finance
accounting dates are separate, preserving closed Hotel history.

Content verification passed 147 assertions over Markdown table widths, existing
local links, valid ownership references, six partner columns with all 11
readiness items Pending, 15 ordered future scenarios and required scope terms.
Manual review checked the workflows against Task 3, audit Part 7, the ownership
register and current SYSTEM behavior, including the existing assignment-time
transport fare. `git diff --check` passed. The receipt example explicitly counts
eight delivered as six accepted plus two rejected, leaving four acceptable units
due from the ten ordered.

This is documentation-only evidence. The 15 scenarios have not been executed
against partner systems. No new runtime tests or browser session were run for
this change. All authorized role/partner acceptance remains Pending, G1 remains
unaccepted, PayMongo stays deferred and hosted rollout remains stopped.

## Tasks 8–11 local boundary acceptance

Verified on Node `22.22.2`, with fresh repository-migration replay on the owned
loopback PostgreSQL cluster at 55432. Each SQL helper owns its clone. Browser QA
used a separate synthetic clone, actual NextAuth, PostgREST and Next.js at
`localhost:3120`. Browser connector access was disabled in Work settings, so the
available desktop Computer Use path drove Brave. No hosted data, migration,
release, external partner or PayMongo call was included.

| Task | Local result | Approval / activation limit |
|---|---|---|
| 8 | Seven official areas map to existing screens, source paths, write authority and role scope. Internal Inventory & Staff Management alias is Hotel Supplies & Team Operations. Existing navigation remains. | Ownership role confirmation remains Pending. No seven-screen redesign or enterprise ERP claim. |
| 9 | Principal/mirror identity, local provisioning and emergency disable documented. Session callback, real SQL and authenticated HTTP/browser prove withdrawal of existing authority, denied new assignments/actions, local role grants and protected guest conversion with history retained. Fixed Staff & Duty workload undercount discovered in the browser. | HR identity mapping, maximum feed staleness/outage policy and HR activation remain Pending under Task 19. Locally administered access is the retained operating model. |
| 10 | Traced five installed stock writers into the same Hotel ledger, including the retained service-only legacy adjustment. Generic quantity PATCH remains blocked. Stock/task/receipt SQL passes, browser issue/shortage saves are reconciled. Added SKU/UOM/store/open-PO opening and writer-pause/cutover worksheet. | SCM mapping, opening totals, outage operating limits and transfer remain Pending under Task 20. No competing stock writer enabled. |
| 11 | Local incident/diagnosis, two independent repair blocks, cleanup, inspection, discrepancy, recurrence and preventive scheduling verified. Fixed false-zero department metrics and maintenance room/severity counters. Browser exercised both repair resolutions through cleanup and passed inspection. | Local recurrence is a new linked work order. External versioned reopen/callback and Facilities acceptance remain Task 21. Local repair authority remains. |

### Reproduced defects and minimal repairs

- Staff & Duty showed one in-progress item for a technician holding two repairs.
  `lib/staff-duty.ts` now counts every in-progress task/order while Working now
  and department coverage still count each person once. Two regressions first
  failed, then passed for Housekeeping and Maintenance.
- The department dashboard metric filter erased operational values its own role
  screens use. Housekeeping cleaning/inspection/block-coordination counters and
  Maintenance active/urgent/block counters now pass through. Unrelated financial
  metrics stay restricted. Two real aggregation/role-projection cases reproduced
  the false zeroes and now pass.
- Maintenance queue cards counted blocked work orders as rooms, omitted
  out-of-service diagnoses and retained ended repairs in urgent counts. The card
  now counts unique active room identities and excludes ended orders from active
  severity/block totals. The multi-repair/ended/non-room regression failed before
  each repair and now passes. No workflow state or room authorization was changed.

### Fresh checks for Tasks 8–11

| Check | Result | Ignored evidence under `.tmp/tasks8-11/` |
|---|---|---|
| New session/workload and original task suites | 189 tests in 11 files passed | `targeted.log` |
| Final affected aggregation/component/navigation cases | 73 tests in 8 files passed | `affected-final.log` |
| Full `npm test -- --maxWorkers=3` | 2,327 tests in 217 files passed after final source changes | `full-final.log` |
| Production `npm run build` | Passed after final metric changes | `build-final.log` |
| Final `npm run typecheck` | Passed after generated QA-build references were removed | `typecheck-final.log` |
| Touched-file ESLint | Zero errors, five existing dashboard warnings | `lint-final.log` |
| Fresh backend migration replay/regressions | Zero SQL failures on Node 22 | `backend-node22.log` |
| `scripts/enterprise-boundaries-db-test.mjs` | 36 real PostgreSQL boundary cases passed | `boundaries-final.log` |
| Housekeeping real SQL | 27 checks passed | `housekeeping-db.log` |
| HMS integrity/stock real SQL | 19 checks passed | `stock-db.log` |
| Procurement real SQL | Partial/final/omitted receipt, over-receipt rollback, exact replay and stock status passed | `procurement-db.log` |

345 content assertions passed for table widths, local links/source paths, the
seven-area map, retained task definitions and Pending approval/readiness states.
`git diff --check` passed. Generated QA-build references were removed. Test output
includes jsdom's expected unsupported navigation/canvas notices. These are not
browser evidence. No authenticated headless runner was claimed.

### Actual browser and persisted results

| Journey | Observed outcome |
|---|---|
| Manager → Staff & Duty | Before: two repair rows but one in-progress workload. After: two in progress, one working technician, logged-in Manager still No active work. |
| Housekeeping → Inventory | Issued two of ten fictional towels. Browser and a second DB connection both show eight and exactly one movement. Attempting nine more returns an explicit shortage, preserves eight and creates no extra movement. |
| Housekeeping → forbidden Finance path | Direct ledger URL returns Financial access required. Separate actual authenticated HTTP POSTs to refund processing and folio adjustments return 403 before mutation. |
| Disable while signed in | Protected account-status action rotates authority. Existing HTTP session becomes disabled/guest and stock POST returns 401. Existing browser session redirected to `/login` on reloading the dashboard. |
| Maintenance → two repairs for one room | First browser resolution retained the other technical block. Department dashboard/queue then showed one active urgent repair and one blocked room. After the last cleanup-required repair, both original orders stayed resolved and exactly one pending cleanup existed. Room remained dirty and unsellable. |
| Housekeeping → cleanup → inspection | Claimed/started the exact post-repair task and saved its checklist. Browser showed Waiting for inspection and room state inspection. Second DB connection confirmed completed task, pending inspection and unsellable room. Passed inspection then persisted clean/available/sellable with repair history retained. |

Desktop and narrower desktop window review used the existing layout. Phone,
Safari, physical touch and all-role acceptance remain in Task 14. Private local
screenshots and HTTP/SQL readback logs stay in the ignored evidence directory.
The browser clone was discarded and the owned test cluster stopped after QA.

### Manual checks after the matching application is available

Use a controlled test environment and fictional records. Current hosted rollout
is stopped, so these changes are local until separately released.

1. **Manager → Staff & Duty.** Give one technician two running work orders.
   Filter that teammate and open View. Expect two in-progress work items and one
   working person. Signing in alone must not mark someone working.
2. **Admin/Owner → account status.** With a test worker signed in elsewhere,
   deactivate the exact test account using the permitted governance action.
   Reload its dashboard. Expect login required and refused new work assignments.
   Reactivate only through reviewed local governance/recovery rules.
3. **Housekeeping → Inventory.** With ten test items, issue two using a reason
   and reference. Expect eight and one saved history row. Try issuing nine.
   Expect refusal with the balance/history unchanged. Refresh to verify it saved.
4. **Maintenance → Dashboard and Maintenance.** Give one room two active blocked
   repairs. Expect two repairs but one blocked room. Resolve one. Expect one
   active repair and the room still technically blocked. Ended orders stay in
   history and must not inflate active urgent/block counters.
5. **Repair handoff.** Resolve the last repair with Housekeeping cleanup checked.
   Expect a cleanup task and a dirty room. As Housekeeping, claim/start/complete
   its checklist. Expect inspection required. Record a passed inspection and
   verify readiness only when other repairs and discrepancies are clear.
6. **Independent Hotel block.** In a separate controlled case, leave an occupancy
   discrepancy open. Finishing repair or cleaning must not clear it or permit a
   new room assignment. Front Desk must investigate and resolve that discrepancy.

These checks do not activate HR/SCM/Facilities integrations, approve fiscal policy,
or substitute for operational role sign-off.

## Tasks 12–14 local acceptance

Environment: working tree based on `30512aa`, Node 22.22.2, local Next.js,
NextAuth and PostgREST backed by a disposable PostgreSQL 18 clone of the replayed
repository migrations. All people, transfers and evidence were fictional.
Desktop actions used the in-app browser. The 390×844 checks used authenticated
Edge via Playwright against the same real app and database. The object endpoint
was an isolated fixture for synthetic bytes and scoped 60-second tokens. It
validated the app's storage request and preview behavior. Hosted Supabase Storage
policy, link expiration enforcement, backup coverage and recovery were not run.

| Task | Check and actor | Result and observed evidence |
|---|---|---|
| 12 / A11 | Paying guest, Accounting, other guest, Owner, Front Desk and Housekeeping request a proof | **PASS, local HTTP and Accounting desktop preview.** Authorized roles opened the fixture; unauthorized users got the same 404 body as an unknown payment. Signed-token path substitution and direct public access were refused by the fixture. The proof dialog loaded the image, and Escape returned focus to Review. |
| 12 / A11 | Front Desk reviews guest ID; wrong roles and disabled sessions attempt reads | **PASS, local HTTP/SQL.** Front Desk received the exact current document; all other tested roles were refused. Replacing the reviewed ID reset readiness to unverified. The old review request returned 409 and the old row stayed verified as history. Rechecking the current ID succeeded. Disabled Front Desk/Accounting sessions returned 401 on document/proof routes. |
| 12 / A11 | Private read audit and caching | **PASS, local HTTP/SQL.** Both preview types recorded actor/document references with no bytes or URL in the audit payload. Signed-link and guest receipt responses are private and no-store. |
| 12 | Manual upload ownership/type/size | **PASS, local HTTP.** Active-hold owner staged a valid PNG. Another guest, text advertised as PNG, and 5 MiB plus one byte were refused. Confirmation re-sniff and submission protection are covered by existing tests and the backend replay. Guest-ID bytes were seeded for review because the current app has no guest ID upload route. |
| 12 | Historical receipt snapshot | **PASS, local browser/HTTP/SQL.** Guest opened the ₱200 receipt with its original issued name and number after a synthetic stay name edit. Another guest got 404. Automated regressions cover issue-time tax and older issued receipts with no tax breakdown. The existing cancellation QA covers the issued folio snapshot. |
| 12 | Retention, legal hold and restore | **DEPENDENCY PENDING.** Owners must approve the exact retention schedule and hold procedure. Provider object restore and enforcement rehearsal are in Task 23. See the private document register and recovery worksheet. |
| 13 | Front Desk daily collections and Accounting dashboard | **PASS, desktop and SQL.** Today's Front Desk preview counted two settled collections totaling ₱210. The separate ₱25 refund and pending ₱100 proof did not increase this figure. Accounting showed ₱210 collections. Existing submitted snapshots retain their original data. |
| 13 | Owner/Accounting net and closed-day source totals | **PASS, 390px/HTTP/SQL.** Owner shows Net collections. Ledger matches gross minus refunds in centavos. Negative net has a regression. The real operating-day suite verifies ₱275 frozen accrual, separate ₱50 receipts for one day, and ₱25 receipts / ₱5 refunds / ₱20 net for another, plus immutable close and missing-rate refusal. |
| 13 / A15 | Fiscal issuer, deposit recognition, Restaurant and corporate AR | **DEPENDENCY PENDING.** Definitions and proposed POS-origin model are documented. Finance approval, entity/tax/issuer decisions and import/acknowledgment tests are outstanding. |
| 14 / A12 | Occupants, age evidence, emergency occupancy, flags and reviewed merges | **PASS, fresh local SQL and earlier desktop/390px evidence.** Reused B01–B03, B06–B08 and B13–B14 in the Hotel Scope QA. Fresh SQL verifies companion without CRM, minimum-age evidence, emergency list, redaction, scoped override, login-linked merge refusal and retained flag history. Only disposable profiles were merged. |
| 14 / A12 | DND, room move, late/declined service, discrepancy and readiness | **PASS, fresh SQL with earlier browser coverage of the adjacent journeys.** Active DND followed the same stay through an in-house room change. Starting service in the new room was refused with the task and housekeeping state intact. Checkout cleared DND with history. Earlier B04–B05 and Task 11 cover service outcomes, discrepancy and inspection/readiness in the browser. DND across the room move was not repeated in the browser. |
| 14 / A12 | Handover | **PASS, desktop and 390px.** Front Desk used Enter to acknowledge the assigned handover. PostgreSQL recorded the receiver and time. The phone viewport displayed Acknowledged for the same record. |
| 14 / A04 | Drawer and night-close role split | **PASS, desktop, 390px and HTTP.** Front Desk showed the open ₱100 float and could view assessment with no close control. Accounting showed the close control disabled by genuine blockers. Front Desk close POST got 403 and Accounting reached validation. The 390px check injected one failed assessment response and used Enter on Refresh to recover from the real API. Prior Task 7 and KI-021 prove successful close and drawer reconciliation. |
| 14 / A05 | Guest/staff folio, refund and cancellation views | **PASS, scoped desktop/390px.** Front Desk saw the test folio, Accounting opened Refunds, and the guest saw the separate ₱25 refund. Guest opened the original receipt and Escape returned focus to View Receipt. Cancellation required a reason, opened a separate confirmation with Go back focused, and Keep reservation returned focus and preserved confirmed status. Earlier cancellation QA covers committed cancellation/refund/reversal. |
| 14 | Operational sign-off and release devices | **DEPENDENCY PENDING / NOT RUN.** Actual property register/age policy, operational role approval, hosted browser and physical iOS/Safari were not exercised here. No policy activation or rollout. |

Local logs and 390px screenshots are in ignored `.tmp/tasks12-14/`. No signed
URL, secret or actual guest information is tracked. References for reused
browser coverage are [Hotel Scope QA](hotel-scope-integration-and-manual-acceptance-2026-11-04.md)
and [cancellation and folio browser QA](cancellation-folio-browser-qa-2026-11-03.md).

### Verification commands and readback

| Command or evidence | Observed result |
|---|---|
| `npm test -- --maxWorkers=4` | 2,330 tests / 217 files passed. The final copy-only lint correction was followed by a fresh affected run. |
| Targeted Vitest: accounting, Front Desk operations/reports, receipts/routes, hotel operations, performance reports, HMS routes and deposits | 242 tests / 9 files passed. |
| Touched-file ESLint | Zero errors, ten existing dashboard warnings. |
| `npm run typecheck`, `npm run build` | Typecheck and final production build passed. The final build used a fresh output folder and one worker after Windows rejected directory creation during parallel prerendering. |
| `node scripts/backend-remediation-db-test.mjs` | 127 migrations replayed in the disposable template, zero regression failures. |
| `node scripts/test-hms-integrity.mjs --full-template` | 19 cases passed. |
| `node scripts/hotel-operations-db-test.mjs`, `node scripts/refund-drawer-db-test.mjs` | 13 operating-day checks and the separate drawer/refund replay and race checks passed. |
| `node scripts/occupant-guest-controls-db-test.mjs`, `node scripts/housekeeping-workflow-db-test.mjs`, `node scripts/enterprise-boundaries-db-test.mjs` | 15, 27 and 36 passed respectively, including new DND move coverage. |
| Authenticated browser/readback | Desktop in-app browser and 390×844 Edge. Screenshots and HTTP/SQL logs under `.tmp/tasks12-14/`. Browser clone discarded; test app, storage fixture, PostgREST and test PostgreSQL stopped. |

### Manual website checks

1. **Accounting → Deposit Verification → Review.** Use a fictional proof.
   Open it and press Escape. The image should be visible and focus should
   return to Review. A Front Desk login and an unrelated guest should be refused
   the same private proof request.
2. **Guest → Payments & Folio → View Receipt.** Open an issued test receipt.
   Edit the test stay after issue and reopen the receipt. Expect the original
   issued details and number. A separate refund should remain its own line.
3. **Front Desk → Reports → Generate preview.** Compare the day's two separate
   kinds of money movement. Collections should include settled incoming
   payments. Accounting's refund and night-audit totals should show payouts
   separately. **Owner → Financial overview** shows Net collections.
4. **Front Desk → Operational Handover / Hotel Operations / Cash & Shifts.**
   Acknowledge an assigned item and reload. Check the actual drawer float and
   open status. Open Operating day & close as Front Desk and as Accounting.
   Accounting can close once blockers are resolved. Front Desk sees the
   assessment without the closing action.
5. **Guest → My Reservations → Manage stay → Cancel reservation.** At 390px,
   enter a reason and open confirmation. Use Go back and Keep reservation to
   verify the original booking remains confirmed and focus returns.

## Task 15 closed-day download acceptance

**PASS, local download scope.** A synthetic night close was created by the real
close RPC in a disposable PostgreSQL clone. An Accounting session used one
Download menu for CSV, Excel and PDF. All files carried the same
`HAVEN-CLOSE-<business-date>-V1` identity and seven saved measures. Independent
CSV, OOXML and PDF readers confirmed ₱1,250.75 room accrual, ₱125.50 collections,
₱25.25 refunds and ₱100.25 net collections. The workbook and PDF were rendered
and visually checked. Each format returned identical bytes when requested again.

Authenticated Edge covered 1440px, 820px and 390px, light and dark at 390px,
keyboard activation, Escape focus, an injected export failure, and successful
retry. Front Desk had no download action. Authenticated HTTP checks confirmed
unauthenticated and other-role refusal, invalid date/format validation, and an open-day
refusal. Local SQL readback found one persisted close and one stable reference
on every download audit entry. Files, screenshots and logs are in the ignored
`.tmp/task15/` directory. The owned database clone and local QA services were
shut down after verification.

The focused run passed 126 tests. The full rerun passed 2,335 tests across 218
files with a 20-second test timeout after a source scan timed out in the first
run. Touched TypeScript files passed ESLint. The final production build passed
in a fresh local directory with hosted credentials cleared, after a Windows
prerender-directory error in the previous attempt.

Manual check: Accounting → Hotel Operations → Operating day & close →
Closed days → Download. Select each format for one saved close. Compare the
batch reference and totals across the three files, then download a second time.
Verify that the filename and data match the first copy.

**DEPENDENCY PENDING** for Finance-approved transaction-level mapping, test
import, actual acknowledgment and reconciliation. These downloads are marked for
Finance review. No hosted release, PayMongo or partner calls were involved.

## Shared Download menus (2026-11-05)

The same menu now serves the closed-day Finance files, staff report print
actions, in-house register, room placard, guest receipt, and express pass QR.
Finance offers CSV, Excel and PDF. Guest receipts offer direct PDF and PNG plus
Print receipt. Guest express passes offer PNG. The report, register and room
placard print options use the browser's Print / Save as PDF workflow.

Authenticated Edge against local NextAuth, PostgREST and a disposable PostgreSQL
clone verified all three Finance files, all guest receipt actions at 390px,
and the guest QR PNG. In the receipt modal, one Escape closed the format menu;
the next closed the modal and restored focus to View Receipt. Desktop verified
the Front Desk report, operating-day report, in-house register and room placard.
Browser PDF readback confirmed the four print layouts carried their expected
content and omitted the download controls. The daily report print action did
not submit a report. The property-performance component's print selection was
exercised by its rendered test.

Local checks passed 2,337 Vitest tests across 219 files and 67 focused tests.
Production build and touched-file lint passed. Browser evidence stays under
ignored `.tmp/export-menus/`. Hosted rollout remains on hold.

## Baseline and final checks

Task 3 and Tasks 8–11 checks are recorded separately above. Earlier
runtime/browser results retain their original scope.

- Clean starting commit `6eb2049`, Node `22.22.2` and workspace-local TEMP/TMP. Initial full run had 2,312 passes and 3 failures. The two targeted failures reproduced together (41 passes, 2 failures). The third full-run failure was a timeout in the QR token source scan.
- Final Vitest run with three workers passed all 2,316 tests in 216 files, including the QR scan. Typecheck, touched-file ESLint with zero errors, production build and whitespace checks passed.
- The read-only hosted ledger check before numbering the corrective migration found 112 versions through `20261103150000`. Both `20261103020000` and `20261104020000` were pending, and the hosted PO function still used the earlier definition. Migration `20261104030000` was verified only on isolated PostgreSQL. Release planning must account for both prerequisite PO migrations and the corrective replacement before exposing the updated workspace.

## Local acceptance

| Area | Browser result | Persisted evidence |
|---|---|---|
| PO receiving | Manager opened Inventory. A 4/10 order offered six remaining, rejected seven, and accepted three. Stock and receipt totals updated without leaving Inventory. | Two delivery records, cumulative received seven, order still partial, stock 5 → 8 and status healthy. The real SQL regression also covered omitted lines, rollback on over-receipt, exact replay and final receipt. |
| Reservation history | Front Desk selected Full history and marked a fictional stay no-show from its folio. The existing view stayed selected and showed the new status once. | The reservation saved as `no_show`. The rendered regression now selects the actual date scope and verifies the history re-fetch. |
| Drawer | Front Desk opened with ₱1,000, recorded ₱200 cash, saw the saved receipt and ₱300 remaining folio balance, and closed at ₱1,200 expected/count. Accounting reconciled it. | One linked cash payment and one receipt. Expected/count ₱1,200 each, variance ₱0, reconciled status persisted. The isolated cash suite passed all 17 checks. |
| Refund | Earlier Accounting QA recorded a ₱250 fictional noncash refund against a seeded request. KI-021 follow-up then verified explicit ₱200 cash and ₱150 noncash payouts through the actual local browser. | The cash payout linked to its displayed drawer and reduced its expected cash to ₱1,000; the noncash payout stayed unlinked. Both entered one operating-day snapshot. KI-021 is fixed locally and pending hosted release. See the KI-021 session record. |
| Night close | The review first blocked on the manually seeded refund fixture's unclosed reservation obligation. The protected cancellation RPC settled that fictional obligation during fixture preparation. Accounting refreshed, reviewed and closed Nov 3 through the browser. Nov 4 appeared as the new operating date. | Exactly one immutable Nov 3 snapshot with ₱200 net receipts, operating version advanced once. All 13 real hotel-operations SQL cases passed, including posting/close serialization and duplicate close protection. |

The new day's preview showed a frozen-rate blocker for the fictional in-house stay seeded directly for cash testing. The closed Nov 3 snapshot was unaffected. Browser screenshots are in the ignored local QA directory `.tmp/architecture-10of10/`. No hosted migration, release, activation or hosted business write occurred. This is scoped local evidence for the architecture plan.

## Task 7 local transaction acceptance

Fresh run uses commit `30512aa` plus the current test/document changes, Node
`22.22.2`, workspace TEMP/TMP and the owned loopback cluster at port 55432. The
backend harness replayed the current migration set into its dedicated template.
Each subsequent SQL suite ran sequentially and owned its clone or dedicated
scratch database. No hosted connection or provider call was used.

| Requirement | Fresh local evidence | Result |
|---|---|---|
| Final-room concurrency | Three races cover two website holds, website versus Front Desk, and two Front Desk bookings. Exactly one claim survives. The staff race commits one reservation/invoice and no phantom payment. | PASS |
| Manual payment pending when capacity is lost | Expire the original claim, book the remaining room, then attempt Accounting verification. Verification refuses unavailable capacity; the same proof/reference remains pending and reviewable; no paid row is created. | PASS for manual review; provider-paid recovery deferred with Task 6 |
| Atomic payment/receipt and payout | Injected receipt failure leaves no payment and the original invoice balance. Injected refund-attempt failure leaves no payout and the request pending. | PASS |
| Drawer/collection/refund races | Collection behind a close is rejected without payment or receipt; close behind collection includes the committed receipt; close behind cash refund includes the committed payout. | PASS |
| Refund retries and caps | Simultaneous noncash retries create one attempt. Exact cash replay succeeds after close, changed payout details conflict, stale drawer is rejected, and refund above folio credit fails. Existing received-funds and exception checks remain exercised. | PASS |
| Cancellation/no-show and frozen terms | Policy windows, advance credits, no-show cutoff and fee, concurrent cancellation, issued snapshots, fee waiver and independent transport charges are verified. | PASS |
| Stock issue/task fulfillment | Exact retry creates one movement, changed payload conflicts, insufficient stock and stale count fail, forced movement failure rolls back, task and direct fulfillment consume once, concurrent issues retain both deductions. | PASS |
| Operating-day close | Posting serializes with close; competing close has one winner; exact retry retains one immutable snapshot. Invoice obligations and charge rows before/after close are identical. Snapshot insert failure rolls back the day advance. | PASS |

Repeatable commands and evidence are recorded below. The cancellation harness's
temporary local adapter supplies the Supabase auth schema and uses the isolated
55432 port; its business SQL and assertions are unchanged.

| Suite | Invocation | Outcome | Ignored local log |
|---|---|---|---|
| Backend replay/regressions | `node scripts/backend-remediation-db-test.mjs` | Zero SQL failures | `.tmp/architecture-10of10/task7-backend.log` |
| Availability | `node scripts/hotel-availability-db-test.mjs --manual-only` | 25 passed; gateway case deferred | `.tmp/architecture-10of10/task7-availability.log` |
| HMS integrity | `node scripts/test-hms-integrity.mjs --full-template` | 19 passed | `.tmp/architecture-10of10/task7-integrity.log` |
| Refund/drawer regression | `node scripts/refund-drawer-db-test.mjs` | Payout, rollback, replay, race and day totals passed | `.tmp/architecture-10of10/task7-refund-drawer-final.log` |
| Hotel operations | `node scripts/hotel-operations-db-test.mjs` | 13 passed | `.tmp/architecture-10of10/task7-operations-final.log` |
| Cancellation policy | `node .tmp/architecture-10of10/cancellation-local.mjs` | 18 passed | `.tmp/architecture-10of10/task7-cancellation-final.log` |
| Procurement receipt | `node scripts/inventory-replenishment-db-test.mjs` | Partial/final receipt, stock status, omission, rollback and replay passed | `.tmp/architecture-10of10/task7-procurement.log` |
| Targeted Vitest | Eight existing accounting, booking, operations and route files | 136 passed | `.tmp/architecture-10of10/task7-targeted.log` |

Final checkpoints passed 2,316 Vitest tests in 216 files, typecheck, touched-script
ESLint and production build. The first build hit a Windows EPERM creating a
generated route directory; rebuilding into a fresh ignored output directory
passed. Logs are `task7-full.log`, `task7-typecheck.log`, `task7-lint.log` and
`task7-verified-build.log` under `.tmp/architecture-10of10/`. Generated Next type
paths were restored and the isolated PostgreSQL cluster stopped after checks.

The local manual-payment portion of Task 7 is verified. G2 remains conditional on
the enabled operating model and operational owner acceptance. This run does not
certify provider-paid recovery, enabled automatic payments, external integrations
or hosted readiness. Prior browser evidence covers the unchanged local money and
day-close UI; the new concurrency results come from real PostgreSQL sessions.
