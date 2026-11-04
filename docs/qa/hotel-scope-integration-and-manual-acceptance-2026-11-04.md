# Hotel scope, integration and manual acceptance

Date: 4 November 2026. Status: available local implementation and acceptance complete;
external POS connection and production release remain separate dependencies.

Plan: `docs/plans/2026-11-04-hotel-scope-integration-and-manual-acceptance.md`.

## Changes carried forward

- Corrected procurement lifecycle descriptions in SYSTEM.md and source comments.
- Added `docs/ENTERPRISE_BOUNDARIES.md` and the explicitly proposed, unimplemented
  `docs/integrations/RESTAURANT_CHARGE_TO_ROOM.md`.
- Scoped the reservation-change source assertion to its own dialog, preserving the
  cancellation confirmation. Prior targeted run passed 75 tests. The subsequent
  Node 22 full run completed with 204 files / 2,215 tests passing; this is recorded
  prior-run evidence, not the final post-change gate for this continuation.
- Preserved all pre-existing cancellation/occupant/guest-control/housekeeping edits.

## Implemented fixes

1. Guest-ID-only party updates now reuse the active occupant on the same stay rather
   than attempting to insert a second primary. Explicit occupant IDs retain strict
   validation; names never establish identity. Additive migration `20261104010000`.
2. Front Desk can edit/confirm an existing occupant list, including a one-person stay,
   without adding a companion. Saving retains the writable-field whitelist.
3. Purchase-order drafts accept an unassigned vendor, matching the server contract.
4. Existing purchase orders remain visible when there are no shortage suggestions.
5. Receipt updates quantity and the derived stock status atomically. The quantity 1,
   reorder point 20, receipt 20 case now displays 21 / healthy. Additive migration
   `20261104020000`; duplicate receipt remains rejected without another stock increment.
6. Procurement scope descriptions and the obsolete change-dialog source assertion
   match the implementation. The guest cancellation confirmation remains intact.

Pre-existing cancellation/occupant/guest-control work was preserved. No subagents,
dependency installation, commit or deployment was used for this continuation.

## Environment and browser status

Use an isolated local PostgreSQL/PostgREST/Next stack and synthetic accounts only.
The intended website is `http://localhost:3118`. Hosted secrets are cleared by the
QA launcher. Node 22.22.2 is available under `.tmp/hotel-remaining/node22/`.

The preceding turn's browser interruption was recovered. This continuation used
the in-app browser against the real local NextAuth/API/PostgREST/PostgreSQL stack.
Final build: `qKPuEzycOySP5egbN-Jc_`, isolated output `.tmp/scope-final-build`.
No headless test-runner result is being presented as personal browser acceptance.

Fixture setup was separate from UI testing: synthetic staff/guest accounts,
nonempty Housekeeping tasks, two CRM merge candidates, a protected login-linked
guest, one confirmed reservation and one in-house stay. The operating date was set
to the prior day in this isolated fixture. A setup receipt corrected the seed's
paid-invoice/no-payment mismatch; the subsequent cash/bank collection was performed
through the UI. Stock was reset between the before/after receipt reproductions;
these resets are fixture preparation, not a tested production count workflow.

## Current dependency limits

No Restaurant/POS API specification, partner identity, provisioning or sandbox has
been supplied. The partner runtime/outbox batch is conditional in the saved plan.
Documented endpoints are proposals, not working integrations. No production
migration, deployment, policy activation, real guest merge or financial write is
included in these local QA runs.

## Fresh automated and database results

- Supported Node 22.22.2: typecheck passed; touched-file ESLint passed with 0 errors /
  3 existing Manager-dashboard warnings.
- Full Vitest: 204 files / 2,217 tests passed. Existing jsdom navigation/canvas
  diagnostics remain in the log; they did not fail a test.
- Production build passed. Temporary build-directory additions to tsconfig.json
  were removed; the original configuration has no content diff.
- Clean replay of 120 migrations passed. Real PostgreSQL checks: 24 backend,
  13 occupants/guest controls, 27 Housekeeping, 13 hotel operations, 5 procurement
  receipt checks; all passed. Both new SQL fixes were reproduced before repair.
- An isolated restoration of the existing 108-migration backup upgraded through
  the four intervening released migrations and eight pending files to 120.
  The public-schema backup needed the external btree_gist extension bootstrapped;
  after that fixture correction the restore/upgrade passed. The restored database
  was discarded and never used for browser business actions.
- Linked ledger read succeeded: 112 remote versions. `supabase db push --linked
  --dry-run` passed and listed exactly eight pending files, including the two fixes.
  This was a dry run; no hosted migration was applied.
- Mechanical UI checks on the changed dashboard and roster surfaces returned no
  findings. No design-system changes were required.

## Personal browser acceptance

Unless explicitly marked earlier coverage, these are actions performed in this
continuation on synthetic records. Database assertions supplement rather than
replace the visible UI result.

| ID | Result | Observed evidence |
|---|---|---|
| B01 | PASS | Front Desk added a named companion, saved/reloaded the two-person list, and later edited/confirmed a one-person list without adding anyone. Final SQL confirms zero CRM profiles named after the companion. |
| B02 | PASS for changed register/evidence gates | Incomplete register and missing primary age appeared in readiness. Completing the list and recording synthetic age evidence removed those gates; separate identity/time/room requirements remained. Full check-in was not repeated here. |
| B03 | Earlier browser coverage + current SQL | The prior linked occupant QA report covers Manager DNR override and Front Desk redaction. Those unchanged screens were not repeated; current real-SQL occupant/guest-control checks passed. |
| B04 | PASS | A real assigned task recorded guest decline and stayed open/deferred; late service became high priority. Stay-scoped DND removed Start cleaning from affected tasks and survived reload. |
| B05 | PASS | Housekeeping submitted a vacant observation for an occupied room. Front Desk refreshed/investigated/resolved it; the room stayed occupied/clean and the reservation stayed checked in. |
| B06 | PASS | Manager preview showed source/survivor choices, links and retained flag evidence. Merge was disabled before reason/review confirmation, then succeeded for two disposable profiles. SQL covers retained DNR and retry safety. |
| B07 | PASS for login-linked refusal | Preview explicitly refused a login-linked guest, with no merge action. Loyalty-bearing restrictions remain covered by the existing database contract rather than a separate browser attempt. |
| B08 | PASS | Owner reviewed executive operations and governance history. Disabling the signed-in synthetic Housekeeping account caused reload to require login; the test account was restored afterward. |
| B09 | PASS | Front Desk recorded PHP 100 cash and PHP 100 bank transfer against a PHP 200 bill: final paid 200, balance 0. Drawer expected/counted 100 and variance 0. These are manual ledger entries, not a gateway settlement test. |
| B10 | PASS | Front Desk had no close action. Accounting saw unreconciled drawers as a blocker, reconciled both, closed 3 November and saw one immutable close plus the 4 November assessment. Current-day close was blocked. SQL covers duplicate/rollback/concurrency; final QA query found one close and zero added room/folio charges. |
| B11 | PASS | Manager created a vendor-unassigned draft, submitted it under the existing auto-approval threshold and received stock. Final grid showed 21 / healthy, Healthy 1 / Low 0, no shortage suggestions, and both received orders still visible. Above-threshold Owner review was not separately exercised in this browser run. |
| B12 | PASS | Guest opened the single change form, entered a reason and dismissed it. Cancellation required a reason and showed the separate final confirmation; Go back / Keep reservation preserved confirmed status. No cancellation was committed. |
| B13 | PASS | Front Desk recorded solo-occupant arrival; the emergency list showed 1/1 names and adult/present. Housekeeping's operations view exposed handover rather than the restricted occupant list. |
| B14 | PASS for changed/exercised surfaces | Checked 1366x900 and 390x844: occupant editing, reservation dialog, guest change form and merge page. Mobile document width was 375 within the 390 viewport; dialogs stayed within it. Save/cancel and Escape were exercised. This is scoped acceptance, not an audit of every site screen. |
| B15 | DEPENDENCY PENDING | No agreed partner authentication/schema/sandbox or POS endpoint was supplied. No live restaurant connection or outgoing event delivery was implemented or claimed. |

## Local evidence

Screenshots under `.tmp/scope-browser-qa/` contain synthetic data only:
`inventory-received-desktop.png`, `solo-register-desktop.png`,
`solo-register-mobile.png`, `payments-desktop.png`, `reservation-mobile.png`,
`merge-desktop.png`, `merge-mobile.png`, `guest-change-mobile.png`, and
`night-audit-desktop.png`. The pre-existing owner/guest flows were checked before
the final roster-only rebuild; the new roster action was checked on the final build.

Final database evidence: 120 local QA migration entries (function bodies checked
against the applied files before recording the two follow-ups), solo register
complete/adult/present, stock 21/healthy, two received orders, one closed business
date (2026-11-03), current operating date 2026-11-04, and zero added folio charges.

Cleanup completed: signed out the synthetic browser account, reset the viewport,
closed the QA tab, stopped the owned app/PostgREST launcher and gracefully stopped
the owned PostgreSQL instance. The isolated restored-data rehearsal database was
discarded. Synthetic QA data/screenshots and the existing private backup remain in
ignored local storage; hosted configuration is unchanged. `git diff --check` passed.

## Remaining release and partner work

- Agree the Restaurant/POS contract, authentication/provisioning, sandbox, corrections
  and Finance reconciliation before implementing the conditional connection/outbox.
- Review and apply the eight pending migrations with the matching app release through
  the authorized release process. Register/age policy activation is separate.
- Optional extended acceptance: repeat DNR/loyalty and above-threshold PO review in
  the intended release environment. Do not describe these as newly browser-tested.
