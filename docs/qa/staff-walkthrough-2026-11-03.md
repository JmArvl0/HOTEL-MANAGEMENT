# Staff walkthrough — completed locally, 2026-11-03

The requested walkthrough of the changed core staff workflows passed against the
real production build, NextAuth, application APIs, PostgREST and a disposable
PostgreSQL database containing all 104 local migrations. This supersedes the
earlier progress report. It is local acceptance, not a deployed-production smoke test.

Final build: `Cl_DYGMoO2ijiYDMSMd6C`; Node 22.22.2. No service responses were mocked
in this walkthrough. The URL-prefix adapter forwarded REST requests to real
PostgREST 16.5. Storage, outbound email and payment-provider integrations were
unavailable/disabled in this synthetic environment and are not claimed tested.
The normal hosted `.env.local` SHA256 remained unchanged throughout.

## Browser results

| Role / flow | Observed result |
|---|---|
| Supplied real staff credentials | Admin, Manager, Owner and Front Desk reached their correct workspaces. Accounting passed after the explicitly authorized password reset. The unlabeled supplied email belongs to a guest and was not treated as staff. |
| Front Desk arrival | Primary guest stayed protected; companion saved within capacity; identity and unpaid-balance gates displayed; identity verification and synthetic collection committed; early arrival was rejected; recording a valid stated arrival allowed atomic check-in. |
| Room diary/move | Reservation board remained open after the navigation fix. Ready same-type replacements became selectable for an in-house stay. Move and checkout preserved the booking reference, original contracted total and turnover history. |
| Optional fees | Accounting created a test definition; Front Desk obtained and posted a server-priced quote. Unpaid checkout was rejected. After the refresh fix, another posting immediately updated the folio, collection action and departure-readiness blocker without reopening the modal. |
| Housekeeping | Claim/start/checklist completion produced inspection state; failed inspection created a linked reclean; reclean completion and passed inspection released the room. Separate Maintenance-held room appeared in the blocked queue. |
| Handover | Front Desk created a room-linked Housekeeping note. Accounting did not see the other department's note. Housekeeping received/took forward/resolved/archived/restored/reopened it; history retained the individual actor/version events. Rapid archived/current changes settled on the correct current-note list in the final build. |
| Maintenance | Housekeeping report reached the work-order queue. Technician claimed/started/diagnosed it with a required serviceability reason. The resulting block remained visible in the room board, Housekeeping and executive oversight. |
| Manager | New identity review loaded successfully; financial assessment showed distinct booked/live, capacity and money bases. No close control was available. |
| Owner | Executive Operations showed the technical hold and department workload. Catalog was readable without editing controls. Operating-day assessment was readable without a close control. |
| Accounting close | Explicit activation selected the actual current hotel day. Current-day close was blocked. A clearly dated **local-only fixture** set the open day to November 2 while the calendar remained November 3. Browser close saved one immutable snapshot and advanced to November 3; full reload preserved history and today's close remained blocked. |

Read-only database assertions after the browser actions confirmed exactly one close,
the next operating day, the preserved Maintenance hold, one 25.50 refresh-test fee,
and the original checked-out reservation's unchanged 200.00 contracted total.
The close did not resolve the handover or release the Maintenance-held room.

Guest-request stock-once, DND deferral, concurrency and injected rollback cases were
verified by the actual isolated SQL suites; no additional browser claim is made for
those cases. Provider settlement, storage upload and production-environment behavior
still need the appropriate post-deployment smoke checks.

## Fixes demonstrated during the walkthrough

1. The room-rack navigation was visible but rejected by the section guard. A shared
   access predicate now derives rack access from both underlying resource permissions.
2. Catalog and duplicate-review pagination assumed an `id` column. The shared reader
   now accepts the actual stable key; these queries use `code` and `pair_key`.
3. Quoted fee posting left reservation balance/readiness stale. The successful post
   now refreshes the reservation, and readiness reloads when its balance changes.
4. The move picker allowed confirmed reservations only. The shared SQL eligibility
   predicate now includes checked-in reservations and their remaining-night window.
   The still-unapplied local operations migration carries this guarded change.
5. An older resource response could overwrite a newer filter view. Request sequencing
   now discards outdated responses and invalidates pending work on view changes.

Relevant regressions failed before their fixes and passed afterward. No existing
assertion or timeout was weakened. The final browser build contains all five fixes.

## Final verification

- Full Vitest: **202 files / 2,201 tests passed**.
- `npm run typecheck` and production build passed.
- ESLint over all changed/new TS/TSX/MJS: **0 errors / 11 warnings**; warnings remain.
- Full 104-file migration replay/backend suite passed; **23 backend + 27 Housekeeping
  + 24 availability + 13 operations SQL checks/groups** passed.
- `git diff --check` passed. Candidate manifest was refreshed after the source fixes.
- Hosted authentication activity and the user-authorized Accounting-only password
  reset were the only production-side changes in this QA work. The reset increased
  `auth_version` and recorded `operator_password_reset`; no credential is in reports.
  No production operational/financial test write, migration or deployment was performed.

## Production release is blocked by newly detected remote drift

The user authorized a production maintenance window. Vercel remains logged out.
The final read-only migration dry-run also **failed**, because the remote ledger now
contains changes absent from the local source. Earlier four-pending-file dry-runs
are historical and are no longer valid release evidence.

| Remote version | Remote name | Local conflict |
|---|---|---|
| 20261103010000 | restore_cash_controls | Local version is hotel_nightly_availability |
| 20261103030000 | guest_request_withdrawal | Local version is hotel_operating_day |
| 20261103070000 | cash_exception_review | Missing locally |
| 20261103080000 | hms_integrity | Missing locally |
| 20261103090000 | operational_handovers | Missing locally |
| 20261103100000 | hms_cash_receipts | Missing locally |
| 20261103110000 | request_supply_completion | Missing locally |
| 20261103120000 | approved_request_routing | Missing locally |

Do not run the CLI's suggested migration-history repair or push this candidate.
First recover/review the actual new migration source and affected live function/table
definitions, reconcile overlapping handover/financial/stock behavior, then renumber
only still-unapplied local migrations after the verified ledger and replay the combined
history. Another session's unfinished work must be preserved. Refresh the app/DB
compatibility plan and restore Vercel sign-in before using the authorized window.

The manifest identifies the locally tested candidate; **it is not production-ready
against the changed remote database**. No maintenance gate was enabled, so production
was not left in maintenance mode.

Cleanup: signed out the browser, stopped owned QA helpers, discarded the owned
synthetic database and stopped the unused isolated PostgreSQL cluster. The final
local app runs on port 3000 with its original hosted configuration, PID 18484.
