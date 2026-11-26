# HAVEN Front Desk post-audit implementation

November 24, 2026 · Local release candidate

## Executive summary

Front Desk can recover a committed stay extension after a lost response, open
the arrival, in-house and departure queues from the dashboard, and see the
departure balances attached to that queue. Booking and room controls take less
vertical space. The desktop notification bell carries incoming work while
transaction feedback has its own lower-corner placement.

The [resolution register](FRONT-DESK-IMPLEMENTATION-REGISTER.md) tracks all nine
original findings, their files, verification and release dependencies.
The [regression report](FRONT-DESK-POST-AUDIT-REGRESSION.md) records the
connected shift, 48 desktop measurements, workload timings and screenshot
comparisons.

## Modules and technical changes

| Module | Implementation and regression coverage |
| --- | --- |
| Dashboard | The arrival, in-house and departure headline cards open their actual Bookings queues. Arrivals reflect pending and confirmed stays due that day. Departures reflect checked-in stays due to leave. Only those departures contribute to the balance hint. Shared arrival/departure queue predicates match the paged database read. The dashboard uses an invoice lookup keyed by reservation for balance counts. |
| Bookings List | The view switch lives beside booking actions. The table keeps guest, booking reference, room, dates, payment, readiness and next action. The stay range drops repeated date parts. Opening a scoped daily queue focuses the existing search. Results open in the existing reservation detail so the search survives. The broader stay-date scope includes departures ending on the first day of the default window. |
| Calendar | The heading and date controls use less vertical space. The date context and navigation share a row where space permits. The room and time headers remain sticky in the existing scroll area. |
| Room Management | Small-height workstation rules compact the automatic cards and keep room identity, condition, inventory filters, opening the dossier and the existing menu available. The explicit Large cards selection and dossier remain available. Half-open reservation nights, maintenance checks and physical room eligibility stay in the existing services. |
| In-house extension | The existing RPC binds a replay to the original staff account, stay, requested checkout and a digest of the normalized reason. The private receipt persists the original date and balance in the same transaction as the assignment, charge, invoice and audit log. The browser keeps the same key when it retries the open form. Changed inputs with a reused key receive a specific conflict. Direct extensions and authorized exception execution continue to share the same pricing and assignment service. |
| Billing and cashiering | A unique electronic reference violation returns `DUPLICATE_PAYMENT_REFERENCE` with folio and Accounting follow-up. Collection keeps the entered reference. The Front Desk success message points to the booking's Payment history to find its receipt. The standalone ledger is Accounting-only. |
| Sidebar and notifications | Front Desk group labels use the staff foreground token at full opacity and keep focus and hover treatment. The header bell announces unread work and retains access to details. It can play one tone per incoming batch according to the operator's preference. Other staff continue using the normal notification behavior. |
| Daily report and handover | The operating guide and System narrative point to `submit_front_desk_daily_snapshot`, implemented by the existing report route. Snapshot version checks, Manager acknowledgement, and authorized handover remain the existing workflows. |
| Walk-in, phone and online bookings | The shared staged staff form and the Guest booking flow remain the transaction entry points. The walk-in regression checks the quote, saved record and arrival handoff. Public booking enters through its own responsive pages. |
| Guest Management, ID and arrivals | The separate guest profile and reservation detail remain accessible from their role-scoped views. The existing identity, balance and eligible-room gates remain authoritative. Physical ID capture still needs property hardware acceptance. |
| Checkout and turnover | Existing settled-folio checkout creates room turnover. Housekeeping owns starting, completing and inspecting the task. Maintenance owns repair resolution. No new permissions are required. |
| Guest requests and Lost & Found | The existing request routing, department access and lost-property custody visibility remain scoped. The verification covers sampled role boundaries and local moderation flows. |
| Exception operations | The Manager reviews and Front Desk executes approved operational work through the existing controls. There is no new approval type. The extension replay fix does not grant Manager a direct extension action. |
| Transportation and breakfast | The existing staff entry points remain. Local validation covers protected transportation reads, guest sharing rules and a seeded request. Breakfast remains its own workspace. The Fleet delivery and physical meal procedures require external or property testing. |

The principal changes are in the [staff dashboard](../../../components/manager/manager-dashboard-client.tsx),
[dashboard data](../../../lib/data.ts),
[Front Office workspace](../../../components/front-desk/fused-room-rack-panel.tsx),
[booking table](../../../components/front-desk/board-reservation-tabs.tsx),
[staff theme](../../../app/staff-theme.css),
[extension dialog](../../../components/manager/extend-stay-dialog.tsx),
[extension route](../../../app/api/front-desk/reservations/%5Bid%5D/extend/route.ts),
[payment route](../../../app/api/front-desk/reservations/%5Bid%5D/payment/route.ts),
and additive [migration 20261124030000](../../../supabase/migrations/20261124030000_front_desk_extension_replay.sql).

The migration preserves existing folio charges. An extension created before the
migration has no command receipt. A collision with such a key requires checking
the existing folio. The schema check was against the disposable local ledger.
Release acceptance must confirm the target ledger before applying the migration
alongside the application build.

## Industry comparison

| Decision | Before, then HAVEN behavior | Basis and classification |
| --- | --- | --- |
| Operational queues | Navigation to arrival and departure lists was available below the headline. The headline now opens the exact date and status population, including same-day departures. | Direct access to the operational queue is a common PMS practice. The date and status definitions come from HAVEN. [Oracle Front Desk](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.1/ocsuh/ch_front_desk.htm) · [Mews dashboard](https://help.mews.com/s/article/your-dashboard?language=en_US) |
| In-house dates | Departure date changes already checked the room, rates and folio. An interrupted response now reconciles with the original write. | PMS workflows support changing a live departure date. Durable retry and existing Manager exception boundaries are HAVEN implementation choices. [Mews reservation changes](https://help.mews.com/s/article/change-the-reservation-details?language=en_US) |
| Reservation workspace | List and Calendar were reachable but started below the fold at short desktop heights. The controls now leave room for active work while the existing modal preserves filter context. | Contextual reservation access from a timeline is common. A vendor-specific drawer or automatic room allocation was unnecessary for this finding. [Cloudbeds Calendar](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/48384262863771-Manage-reservations-from-the-New-Calendar) · [Mews Timeline](https://help.mews.com/s/article/timeline) |
| Settlement and room readiness | The folio blocked duplicate references and checkout required settlement. The conflict now explains where to reconcile the reference. The room rack retains separate occupancy and cleaning information. | Folio review at departure and coordination with Housekeeping are common practices. HAVEN retains its configured settlement, inspection and drawer rules. [Oracle checkout](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.1/ocsuh/t_checking_out_reservations.htm) · [Cloudbeds Housekeeping](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/25695101078427-Manage-Housekeeping-in-Cloudbeds-PMS) |
| Reporting | Reporting, drawer close and hotel business date are separate operations. The guide now identifies the snapshot submission and the role that reviews it. | End-of-day sequencing and no-show handling are configurable hotel policies. Existing HAVEN authority remains in effect. [Oracle end-of-day procedures](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.5/ocsuh/c_endofday_procedures.htm) |

## Implemented permission matrix

| Action | Front Desk | Other role boundary sampled or read from the route |
| --- | --- | --- |
| Create staff booking, assign, check in, extend, and check out | Allowed through guarded reservation workflows | Departmental roles are denied desk operations. Manager reviews exceptions. |
| Read booking and selected folio, collect authorized tender and view the receipt | Allowed | Guest uses the owned guest surface. Unrelated departmental staff are denied the staff folio. Accounting retains its settlement and adjustment functions. |
| Standalone invoice or payment ledger, refund processing and reconciliation | Denied | Accounting owns these ledger and financial execution surfaces. |
| Operate authorized drawer and submit Front Desk report | Allowed | Cash and report endpoints enforce their own roles. Manager acknowledges or returns the report. |
| File and execute an eligible operational exception | Allowed | Manager issues approval. The existing type, source and status gates remain in effect. |
| Read room readiness, dispatch eligible reclean and file maintenance | Allowed within operational routes | Housekeeping completes cleaning and inspection. Maintenance resolves repair work. |
| Review permitted ride or lost-property cases, view in-house register | Allowed within the existing authorized scope | Guest, Accounting and other staff consume only their respective projections. External dispatch requires the Fleet contract. |

The release candidate uses the existing role assignments. The [original role
audit](FRONT-DESK-RBAC-AUDIT.md) records the full observed route matrix and scope.

## Before and after scorecard

The baseline ratings are from the [original scorecard](FRONT-DESK-AUDIT-SUMMARY.md#evidence-based-scorecard).
The post-audit column records observations from the changed or rerun workflow.

| Area | Original evidence or rating | Post-audit evidence |
| --- | --- | --- |
| Dashboard usefulness | 6/10. Static headline cards and mixed balance scope. | Queue actions and departure balance reconcile to actual due departures. |
| Navigation | 8/10. Grouped sidebar and command search. | Group contrast improved. The daily queue opens from a headline card and focuses the existing search. |
| Reservation management | 8/10. List, Calendar and staged booking. | Working rows appear earlier. Search and detail remain in the same workspace. |
| Walk-in | 8/10. Six action clicks and three contact fields. | Same workflow completed on the new layout. |
| Room management | 6/10. Early content pushed room cards down. | The automatic layout shows a complete row at both shorter target sizes. |
| Guest management | 7/10. Guest list and reservation lookup exercised. | Guest list and scoped reservation detail passed. Full identity merge remains outside the sampled workflow. |
| Check-in efficiency | 7/10. Required identity, balance and room checks. | Gates and arrival handoff passed again. No timing comparison was collected for physical ID capture. |
| Checkout efficiency | 8/10. Balance block followed by checkout. | A same-day due booking is reachable from the headline. Unpaid rejection, settlement and turnover passed. |
| Billing and folios | 7/10. Ledger correct with generic duplicate-reference feedback. | The operator gets the specific conflict and retains the entry. The receipt path reflects the role. |
| Guest requests | 7/10. Front Desk routed a departmental request. | Routing remains available under the existing authority. |
| Departmental coordination | 8/10. Turnover and maintenance handoff observed. | Checkout to inspection and Maintenance's view of a desk-reported concern passed. |
| Manager approvals | 7/10. Reviewed request waiting for execution. | Manager review and authorized Front Desk execution of a stay extension were exercised. |
| Daily reporting | 8/10. Submitted and acknowledged snapshot. | Stale previews and improper roles remain rejected. The guide names the current snapshot command. |
| Desktop usability | 7/10. Six sizes, with early content below the fold at short heights. | Operating rows, room cards and controls fit earlier in the same workstation sizes. |
| Visual design | 7/10. Existing staff themes and visually prominent alert stack. | Existing palette and photos retained with more compact controls and a stable alert location. |
| Validation | Server already enforced the main identity, room and ledger gates. | Payment duplicate and extension payload mismatch have specific conflicts. |
| Backend reliability | 7/10. Extension replay falsely failed after commit. | The stored result survives request replay and later changes. |
| Business logic | 8/10. Core gates correct, departure balance misleading. | Queue dates and statuses agree between headline and working list. |
| Data integrity | 8/10. One charge and single winner in reservation races. | SQL verifies exactly one extension effect per key and rejects reuse across actors, payloads and stays. |
| RBAC and security | 8/10. Sampled unauthorized access denied. | Existing roles still separate operations, approvals and Finance. The receipt table is private to the backend. |
| Production readiness | 6/10. Controlled demonstration. | Candidate for staging/UAT with the matching migration. See the release dependencies below. |

## Release dependencies

**Readiness verdict · Ready for staging or UAT only.** Eight original findings
are verified fixed locally. Representative hosted performance acceptance remains
open, alongside the property and integration checks below.

- Confirm the target database ledger and run staging acceptance on the matching
  app and migration. The local synthetic fixture has one property and one browser
  engine.
- Obtain property approval for ID and age handling, document retention,
  inspection and early/late exceptions, tender and drawer procedures, no-show
  cutoffs and operating-day ownership.
- Verify the physical ID scanner, Finance settlement and close handoff, and
  Fleet dispatch and callback lifecycle with their owners. The local exercise
  used no real tender, dispatch or external notification delivery.
- Agree on a representative site workload and performance target. Include
  hosted latency, concurrent operator sessions and supported workstation
  hardware in the acceptance test.
