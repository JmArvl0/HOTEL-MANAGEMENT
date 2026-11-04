# Occupants, guest controls and housekeeping — implementation status

Date: 2026-11-04
State: locally implemented; browser acceptance partial; unreleased

## Implemented in source

- Occupant register reuses `reservation_guests`; name-only companions do not require CRM profiles. The current changes include verified age evidence, attendance history, policy activation dates, primary/capacity checks, check-in gates and a restricted emergency occupancy view.
- Room discrepancies record the housekeeper observation and system snapshot, create a Front Desk handover, require investigation before resolution, and block conflicting new arrivals/assignments.
- Guest operational flags cover VIP, Do Not Rent, Security Alert, Accessibility and Special Handling. DNR overrides are reservation/purpose/version/expiry scoped and audited.
- Guest identity review uses masked exact-email/phone evidence. Manual merge preview and commit require Manager/Owner authority, explicit survivor and field choices, evidence/reason, a confirmation checkbox, stale-state fingerprinting and idempotency. Account-linked and loyalty-bearing profiles are blocked. Historical FKs remain; source IDs and contact/name aliases are search evidence only.
- Housekeeping DND is stay-scoped, follows the room assignment and clears with history at checkout. DND blocks starting stayover cleaning. Guest-declined and late-service outcomes are recorded on existing tasks; room-cleanliness states remain controlled by the existing workflow.
- `SYSTEM.md`, `docs/FRONT_DESK_OPERATIONS.md` and this plan distinguish local source from deployed behavior.

## Browser acceptance (2026-11-04, local synthetic environment)

- Used an isolated local PostgreSQL/PostgREST/app stack on `localhost:3117` with
  disposable synthetic accounts and room records. The hosted Supabase project and
  deployment were not contacted or changed.
- Front Desk occupant roster save initially failed with a strict-schema error:
  the panel sent server-owned response fields back as writable data. The panel now
  sends only the supported occupant fields, and a regression test covers that
  payload. Retest saved the companion and displayed `2 of 2 declared guests`.
- Front Desk check-in readiness showed the expected age/identity, early-arrival,
  and room-selection gates. After synthetic age and identity checks, an approved
  reservation-specific Manager DNR exception, arrival-time adjustment, and room
  selection, check-in succeeded and the room board showed the occupied assignment.
- Manager DNR flag and scoped check-in exception worked. Front Desk received a
  generic review blocker without the restricted Manager note. DND could be set on
  the in-house synthetic stay and displayed as active with a recorded timestamp.
- The emergency occupancy view showed 2/2 registered names. Juan's age group was
  still `unknown` after his separate age check because staff had not selected an
  occupant type; Maria was `adult`. This pass did not establish child-pricing or
  automatic age-group classification behavior.
- Room discrepancy browser path passed: Front Desk submitted a synthetic QA102
  observation, investigation refreshed a snapshot (`available`, `clean`, no
  reservation), and resolution closed the item. The system did not silently alter
  room or reservation state. The reporter was the Front Desk account because the
  local Housekeeping queue had no task to open a Housekeeping room-detail screen.
- Housekeeping queue loaded successfully but had zero tasks. Browser acceptance
  could not exercise task-level DND blocking, service-declined/late-service
  outcomes, or the Housekeeping reporter role. Those behaviors remain covered by
  SQL and component/route tests, not this browser pass. Reviewed profile merge,
  Owner/disabled-staff access, and mobile browser layouts also remain unverified.

## Verification completed locally

- Clean chronological replay of all repository migrations succeeded on a disposable PostgreSQL 18 instance. The backend-remediation SQL suite passed 24 checks; occupant/guest-controls passed 13; housekeeping workflow passed 27. The test-only bootstrap now supplies `auth.uid()` for plain PostgreSQL. The disposable instance was stopped after the run.
- Focused occupant/guest/room-rack/housekeeping Vitest run: 157/157 across 11 files. Final authorization/occupant route set: 30/30 across 4 files.
- Follow-up roster-save regression suite: 5/5 under Node 22.22.2. The changed
  roster panel and test pass ESLint; typecheck and production build pass. The
  full-suite result below is from the earlier Node 26.6.0 run.
- Full Vitest: 708 suites, 2,214 tests; 2,213 passed and 1 failed. The remaining failure is `lib/change-request-redesign.test.ts` → “single complete modal has no second reason step”; it asserts that `ConfirmDialog` is absent in the shared cancellation/change-flow work. No occupant, guest-control or housekeeping test failed. The package requires Node `>=22.22.2 <23`; the earlier full-suite run used Node 26.6.0, outside the supported range.
- `npm run typecheck`: passed. ESLint on the previously touched TS/TSX set exited 0 with warnings only; the final changed route and route test lint clean. `npm run build`: passed, including route generation.
- The added real-SQL scenarios cover name-only occupants without CRM creation, roster completion, primary age gates/emergency list, discrepancy investigation and assignment blocking, restricted DNR notes and scoped overrides, login-linked merge refusal, reviewed merge/DNR retention, and DND/declined/late service/checkout.
- Final `git diff --check` is recorded after this report update.

## Not verified / not deployed

- Restored-database/hosted upgrade-order replay, live schema inspection and linked migration-ledger verification remain outstanding. The Supabase CLI has no access token in this environment. Migration timestamps `20261103170000` through `20261103210000` are local sequencing only and remain unverified against the hosted ledger.
- Local browser acceptance was performed for the flows listed above, with the
  limitations recorded there. No migration was pushed, no production policy was
  activated, and the hosted database and deployment were not changed.
- Conditional child/extra-person pricing, turndown and lost-property workflows remain deferred pending property-approved pricing, service and custody rules.

## Release checks still required

1. Obtain authorized Supabase CLI access; verify the linked migration ledger/live schema before adopting local migration timestamps.
2. Replay the migration set against a restored prior-release database in the verified hosted order. The clean chronological local replay is complete.
3. Re-run the full suite on the supported Node 22 range and resolve or explicitly accept the one unrelated cancellation-flow failure.
4. Extend browser acceptance to Housekeeping task outcomes/reporter access, reviewed profile merge, Owner/disabled-staff access, and mobile layouts.
5. Deploy schema and app only through a reviewed release sequence. Activate register/age policies separately after staff walkthrough and an affected-arrival review.
