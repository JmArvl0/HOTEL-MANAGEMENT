# Front Desk test results

## Provenance and environment

The audit ran on November 24, 2026, against the working copy of `main` at
`e2514b89eaa360b572482d00954522b7552329cd`, including pre-existing local
changes. The remote `main` ref was read directly and returned
`c7c71665a9846961132fcd830d5c17704fbf17e2`. Local HEAD was 14 commits ahead
and none behind that ref. Results apply to the audited working copy.

The production-mode Next.js 16.4.6 build used Node 22.22.2 and loopback
PostgREST 16.5 with PostgreSQL 18.6. The database was cloned from a disposable
template. The audit confirmed the paged booking function existed, created
30 physical room fixtures and 36 baseline reservation fixtures, and dropped
its clones after use. The environment used real synthetic Front Desk,
Manager, Housekeeping, Maintenance, Accounting and Guest credentials.
OTP delivery was disabled only in the clone. Provider credentials were
blanked and browser traffic to non-loopback destinations was blocked.
All recorded tenders used synthetic references or a synthetic float.

## Repository checks

| Check | Result |
| --- | --- |
| `npm run build -- --webpack` | Passed on the audited checkout in an isolated local build directory. Existing React 18 deprecation warning. |
| `npm run typecheck -- --incremental false` | Passed. |
| `npm run lint` | Zero errors, 74 warnings in the audited tree. |
| `npm test -- --maxWorkers=3 --testTimeout=30000` | 2,751 passed across 276 files. |

The repository QA skill and older issue log state that no headless runner
exists. The checked-in Playwright configuration now has a browser runner
and projects. The audit used Playwright against installed Edge with the
explicit loopback fixture. It did not run the default project matrix
against any hosted URL.

## Connected shift

| Check | Layer | Outcome |
| --- | --- | --- |
| SHIFT-01 morning overview | Browser and SQL | Six arrivals, zero departures and six in-house stays matched the seeded population. The departure balance hint used the cross-queue count. |
| SHIFT-02 walk-in | Browser and SQL | The real Bookings dialog confirmed a new walk-in. Six workflow clicks and three contact fields were used before the staged review. The created record opened the arrival workspace. |
| SHIFT-03 phone booking | HTTP and SQL | A repeat returned the same booking, with one reservation in SQL. Invalid dates and stale quote were refused. |
| SHIFT-04–05 arrival | HTTP and SQL | Identity, balance and dirty-room gates denied unsuitable cases. Local tender replay left one payment. A valid assigned and settled reservation checked in. |
| SHIFT-06 concurrent assignment | HTTP and SQL | Concurrent responses were 200 and 409. One active assignment remained. |
| SHIFT-07–08 in-house actions | HTTP and SQL | Incidental replay left one charge. A changed replay and duplicate tender reference were rejected. Nonzero balance prevented checkout. A same-type room move retained the folio and marked the released room dirty. A different-type move lacked authorization. |
| SHIFT-09 extension | HTTP and SQL | **Confirmed failure.** The first extension committed both the date and exactly one charge. Replaying the same key and payload returned 409 with the invalid-date message. |
| SHIFT-10–11 guest service and approvals | HTTP and SQL | The towel request was routed to Housekeeping. Front Desk filed a modification and was denied review. Manager approval persisted with awaiting execution. |
| SHIFT-12–13 settlement and turnover | HTTP and SQL | Checkout left a zero balance, dirty room and one Housekeeping task. The authorized Housekeeping session completed and inspected the room. Room condition became clean. |
| SHIFT-14 daily report | HTTP, browser and SQL | A stale preview was rejected after new booking activity. A fresh preview submitted. Manager acknowledgement persisted and Front Desk review was forbidden. |
| SHIFT-15–18 handover and shift end | HTTP, browser and SQL | Linked handover appeared. Front Desk could see Housekeeping's found item, and Housekeeping could not read claimant notes. A closed drawer blocked cash collection. Front Desk returned to Room Management after checkout. |
| OPS-01–03 closure and departments | HTTP and SQL | Future no-show refused, overdue no-show persisted, cancellation persisted, the shared synthetic drawer refused a duplicate open, and Maintenance saw the repair filed from reception. |
| OPS-04–05 transport and roster | HTTP and SQL | A request without required details was rejected, a seeded local ride moved to Reviewed with zero Fleet links, and the restricted in-house roster and contextual folio were readable as Front Desk. A Guest was denied the staff roster. |

## Workstation and role evidence

The baseline matrix captured 48 populated screen samples across the four
principal screens, six resolutions and two palettes. Each sample rendered
without page-level horizontal overflow. Those rendering checks do not mean
every screen had satisfactory first-view density. The smallest workstations
had no complete first-view rows in the two booking views. The keyboard
sample opened command search and exercised the booking modal focus cycle.
The main run reported no JavaScript page errors.

The primary run executed 100 scenario checks. It logged 97 passes, the
extension failure, and two runner assertions that expected the wrong
roster response shape or transport error wording. Corrected targeted
checks passed for both workflows. Ten main authorization scenarios checked
Front Desk, applicable other roles and anonymous access.

After merging the corrected repeats by scenario, **104 of 105 distinct
checks passed**. The sole remaining failure is SHIFT-09, the extension
replay. The five focused checks covered booking search and return context,
the room dossier, Breakfast service access, the Guest redirect from the
staff URL and three live notices arriving over the calendar. The search
preserved its booking-reference filter after closing reservation detail.

A separate contrast audit measured the 11 px Workspace sidebar label
from the browser's computed colors and effective opacity. Both themes
fell below the normal-text threshold. This is a visual finding, separate
from the workflow pass counts. [FD-UI-001](FRONT-DESK-QA-FINDINGS.md#fd-ui-001--low-contrast-sidebar-group-buttons).

The primary run recorded 110 audited HTTP requests. Of those, 46 successful
requests had a roughly 28 ms median and a 53 ms sample p95. This is a
mixed-route loopback sample. Workstation timings in the evidence include
the renderer wait and capture setup. These are not production response-time
targets or a peak shift benchmark.

| Evidence | What it shows |
| --- | --- |
| [Morning overview](evidence/shift-01-morning-dashboard.png) | Counter scope and actionable overview at Front Desk |
| [Walk-in review](evidence/shift-02-walk-in-review.png) · [Arrival workspace](evidence/shift-02-arrival-workspace.png) | Real booking and its downstream reception surface |
| [Booking layout at 1280](evidence/1280x720-light-bookings.png) · [Calendar at 1280](evidence/1280x720-dark-calendar.png) | Data below the fold and retained desktop controls |
| [Alert burst at 1280](evidence/1280x720-notifications-calendar.png) | Three actual alerts overlapping the working area |
| [Command search](evidence/1366x768-keyboard-command-search.png) · [Dialog focus](evidence/1366x768-booking-dialog-focus.png) | Desktop keyboard and modal state |
| [Reservation detail](evidence/1280x720-reservation-detail.png) | Contextual detail opened from a single search result |
| [Room dossier](evidence/1280x720-room-dossier.png) · [Room turnover](evidence/shift-18-room-turnover.png) | Contextual room structure and reception board |
| [Operations report](evidence/shift-14-operations-report.png) · [Cash & Shifts](evidence/shift-cash-shifts.png) | Shift reporting and synthetic cash view |
| [Sanitized run data](evidence/front-desk-results.json) | Viewport measurements, status counts and reproducible HTTP outcomes |

## Untested and external acceptance

| Area | Remaining test or dependency |
| --- | --- |
| Front Desk physical devices | Verify scanner and kiosk paths, keyboard-only long-session operation, printer or browser PDF handoff and assistive tools. |
| Finance and hosted | Verify authorized hosted ledger parity, real provider callback behavior in an approved test environment, drawer close/reconciliation and financial-document issuance. |
| Fleet and communications | Verify partner receipt, fare, rejection, retries and delivery through approved test channels. The audit did not send a dispatch, email or SMS. |
| Policy scenarios | Activate approved age, occupant, identity, early arrival and exception rules in a dedicated fixture. Replay approved amendment execution, difficult room-type changes, paid no-show/refund and claimant release. |
| Database scale | Load-test a high-history property and overlapping Front Desk work. Current measurements cover one synthetic property and one room-assignment race. |
| Supported environments | Repeat the workstation check on deployment browsers and property hardware. Mobile Front Desk is outside the primary audit scope. |
| Unsampled actions | Full boundary enumeration, every optional field and filter, profile merge, guest request batch approval lifecycle, physical scan-to-breakfast, return-and-resubmit reporting and full close-day execution. |
