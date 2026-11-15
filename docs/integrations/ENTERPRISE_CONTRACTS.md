# Enterprise workflows and partner readiness

Prepared 4 November 2026, Asia/Manila. Version 0.1, proposed for role review.

This is Task 3's written handoff procedure. It describes how Hotel, Finance, HR,
SCM, Facilities, Fleet and Restaurant should exchange requests and results. All
partner contracts remain pending sign-off and runtime acceptance. The role
register in [Enterprise boundaries](../ENTERPRISE_BOUNDARIES.md) supplies the
proposed authorities. Names can be added later. An authorized representative must
confirm the relevant role's decisions before activation.

Existing behavior is governed by [SYSTEM.md](../../SYSTEM.md), current source and migrations.
Current Hotel stock/PO, maintenance and transport workflows retain authority until
their individual handoffs are accepted. The operating-day and refund controls
keep their recorded local/hosted release status. PayMongo work remains deferred.

## 1. Business flow overview

| Partner | Hotel sends or requests | Partner returns | Hotel sees success when |
|---|---|---|---|
| Finance | Source transaction batch, corrections and optional AR transfer | Accepted/rejected posting lines and journal/transfer references | Accepted source lines reconcile to Finance's actual posting |
| HR | Minimal employee/schedule lookup or catch-up request | Authoritative employment/schedule version | Hotel saves the projection and applies its own access/assignment rules |
| SCM | Requisition, counted delivery, supply use or count evidence | Order status, accepted/rejected receipt/movement and balance version | The single stock authority records the accepted effect once |
| Facilities | Room incident and immediate local restriction reference | Work acceptance, diagnosis, assignment, repair and reopen status | Hotel verifies repair evidence and separately passes its readiness checks |
| Fleet | Guest transport request or cancellation | Acceptance, confirmed assignment/trip status and fare evidence | Provider acknowledgment confirms the guest promise and Billing accepts any fare effect |
| Restaurant | Minimal stay eligibility and charge/correction outcome | Stable sale/check reference and correction request | Hotel saves the accepted folio charge or linked reversal |

A submitted request stays pending until its receiver acknowledges the appropriate
business step. A delivery counted by staff, a repair completed by a technician,
and a final Hotel readiness release each have their own responsible role.

## 2. Common contract rules

These requirements apply to each proposed connection. Exact payload schemas,
endpoint paths, error codes, authentication mechanism and limits remain subject
to the receiving team's contract review. Proposed message names in this document
describe business intent and are not advertised as running APIs.

| Requirement | Agreement required before implementation or activation |
|---|---|
| Identity and access | A revocable machine identity with server-derived partner/property/outlet scope. Agree provisioning, rotation, revocation and TLS. Hotel service-role keys and staff sessions stay private. Sensitive actions still use the domain's protected operation. |
| Request identity | Immutable operation ID plus authenticated partner, property and business reference. Include a correlation ID and originating actor reference where a human decision is required. A display name, email or room number cannot establish ownership. |
| Schema | Versioned request/result fields, required/null meanings, enum meanings, text/array/quantity limits and compatible version changes. Reject unsupported versions explicitly. |
| Minimal information | Exchange only fields needed for the service. Guest ID images, restricted flags, payroll and unnecessary folio history remain outside partner responses. Domain access checks precede private object access. |
| Quantity and money | Identify item, UOM and location for quantities. Money uses integer `amountMinor`, explicit currency and agreed tax/service-charge components and rounding. Finance approves mappings and fiscal treatment. |
| Saved outcome | Return operation ID, pending/accepted/rejected state, source/effect reference, version, reason and processing times. Pending includes a durable status reference. A saved receipt of work does not imply the requested business effect already occurred. |
| Exact retry | Save business identity, normalized payload comparison and outcome with the effect. The same operation/payload returns its original result. Reusing the identity with changed content conflicts. Deduplicate the underlying transaction as well as event deliveries. |
| Unknown result | After a timeout, query the original operation before creating a replacement. If unresolved, retain Unknown/pending and escalate. A sender must not assume a failed response means the receiving transaction failed. |
| Delivery retry | Agree bounded backoff, jitter, rate-limit handling and `Retry-After`. Authentication failure pauses for credential repair. Invalid data, forbidden scope and state conflicts need reviewed correction. Assign retry limits and escalation thresholds during acceptance. |
| Concurrent operations | The receiving system locks/rechecks its authoritative fact. Posting serializes with checkout/day close, stock with receipt/count, and repair status with reopen/version changes as applicable. |
| Event order and catch-up | Include source aggregate/version. Ignore stale projection changes, detect missing versions and query current state. Define cursor/pagination semantics, stable ordering and retention of tombstones/inactive records. Advance the cursor only after a page is saved. |
| Outgoing events | Where the contract needs asynchronous delivery, save the business fact and event together, and track delivery separately per destination. A deployed worker, real receiver, status query and reconciliation are required before relying on this path. |
| Corrections | Preserve original accepted records. A new correction references its original source/effect and authorized approver. Rejected or reversed work remains visible. An old correction cannot silently overwrite a newer state. |
| Audit | Retain IDs, actor/partner scope, decision/reason, versions, amount/quantity and times, delivery attempts and acceptance references. Redact credentials and private documents from logs and tracked examples. |
| Reconciliation | Compare source, accepted, rejected, pending and reversed counts and amounts or quantities. Identify unmatched IDs and queue age. Agree an operational reviewer, support contact, cadence and escalation action. |
| Cutover | Reconcile opening records, pause conflicting writers, record the effective authority/version and verify first acknowledgments. After the partner accepts writes, pause/reconcile before a switchback. |

### Occurrence, receipt and posting dates

| Time/date | Responsible system | Meaning |
|---|---|---|
| `occurredAt` | Originating system | When the source event actually happened, with UTC or explicit offset |
| `receivedAt` | Receiving system | When the receiver durably received the message |
| `businessDate` | Hotel server | Hotel operating day on which a new Hotel financial effect is posted |
| `accountingDate` | Finance | Accepted Finance accounting date/period under its approved policy |

For example, a sale occurs on Hotel day A, but its first accepted charge arrives
after Hotel day A has closed. Preserve the sale's occurrence time and post a new
Hotel effect on the current open day B. Finance decides its accounting period.
An exact replay returns the original accepted result and posting day. A later
correction is a new linked effect. Closed snapshots are preserved.

## 3. Finance handoff

Owners use O06–O10, O14–O15 and O22 from the role register. Hotel Accounting owns
the operational source transactions and guest balance. Finance owns its journals,
AR/AP, credit decisions, settlement and approved fiscal policy.

1. Hotel prepares an immutable source batch with batch ID, schema/mapping version,
   source line/effect IDs, Hotel business dates, amounts/currency and control totals.
2. Finance validates mappings, source identity and period. It returns accepted,
   rejected or pending lines plus its batch/journal references and reasons.
3. Hotel saves the acknowledgment and reconciles source totals against accepted
   lines, rejected lines and corrections. A download or successful send stays
   pending until Finance confirms its actual import/posting.
4. Corrections reference the original source and Finance posting. The accepted
   original batch stays immutable. A correction is reviewed and replayed using
   its own stable effect ID.
5. If corporate direct billing is adopted, Finance separately accepts an AR
   transfer and opening debtor balance. A queued or rejected transfer leaves the
   obligation visible under the accepted Hotel/Finance rules.

| Contract detail | Proposed requirement / pending decision |
|---|---|
| Stable IDs | Property, folio, charge, payment, refund, source document/effect, batch and Finance journal IDs. Optional debtor and AR transfer IDs require explicit mapping. |
| Status/read behavior | Query batch/line and transfer result by original ID. Define paginated rejection/unmatched results and a versioned mapping lookup/change cursor. |
| Revenue and deposits | Finance accepts deposit liability/recognition and one Restaurant revenue model. Proposed starting model is POS-origin sales/revenue with Hotel guest receivable/clearing/collection. Finance must confirm the legal entity, mappings and fiscal issuer before use. |
| Failure/correction | Mapping errors, closed Finance periods and unmatched source lines need an owned exception. Replaying a batch cannot create another posting of an accepted source effect. Hotel dates are preserved. |
| Controlled fallback | Hotel Accounting uses an approved source export/import worksheet with unique line references, totals and a restricted acknowledgment log. If the format is unaccepted, retain source reconciliation and mark the export pending review. |
| Adoption trigger | Finance accepts the format, mapping version, issuer/recognition rules, test import/replay and correction totals. The agreed API can later replace the controlled import process after its own sandbox acceptance. |

### Operational totals and Finance recognition

| Measure | Source and date basis |
|---|---|
| Contracted room obligation | Reservation terms and the folio invoice. Night audit allocates frozen nightly room rates to the covered stay date. Missing rates block close. Early checkout alone preserves the contracted nights and prices. |
| Extra charges | Posted `folio_charges` by operating date. Cancellation/no-show fees and signed debits/credits are separately identifiable ledger effects. Corrections link to the source on the current open date. |
| Deposit | A paid reservation-deposit payment is one collection. Finance proposes advance deposit liability until its approved application/recognition event. Pending proof has no settled collection. |
| Gross collections / refunds / net | Paid non-refund payments, paid refund payments, then gross minus refunds in centavos. Net can be negative. Night audit uses stamped operating date and lists unstamped pre-cutover rows separately. Front Desk Daily Operations uses the Manila calendar window on verified time, with created time as its legacy fallback. Owner totals use settled ledger history. |
| Guest balance / credit | Derived folio invoice balance is the remaining obligation and credit is the separate overpayment amount. Cash payout, folio credits and adjustments carry different references and never substitute for each other. |
| Finance revenue / profit | Finance owns recognition, tax and service-charge treatment, cost attribution and period close. Recognized revenue and profit require Finance journals and policy. Hotel collections and booked room accrual are operational measures. |

Use three independent dates in exports and reviews: stay/service date,
Hotel posting date, and actual settlement time with the property's time zone.
Finance acknowledgment records a fourth timestamp and its receiving period.
Pending or rejected corporate AR transfers stay visible as outstanding under the
approved accounting rule. Accepted AR moves the debtor/receivable using an
acknowledged Finance reference, with no payment effect or double booking.

### Occupancy, ADR and RevPAR definitions

| Metric | Numerator / denominator and limits |
|---|---|
| Booked occupancy, trailing seven days | `countNights` in `lib/analytics/occupancy.ts` counts confirmed/in-house reservations covering the half-open stay dates and checked-out stays on past nights. Pending/expired holds, cancellations and no-shows are excluded. Divide by the dashboard's current serviceable-room count. Historical room capacity is approximate. Dashboard shows 0% when the denominator is zero. |
| Physical occupancy | Rooms with rack status `occupied` at observation over serviceable rooms in that live view. It measures physical status at that point in time. Night audit separately saves the live occupied count, booked nights, closing active capacity and closing serviceable capacity. |
| Proposed operational ADR | Contracted frozen room-only accrual divided by eligible booked room nights on the same service date. Use the eligible nights above. Exclude deposits, refunds, extras and fees from the numerator. Show an em dash for zero nights or unavailable frozen accrual. |
| Proposed operational RevPAR | The same room-only accrual divided by closing serviceable capacity for the same service date. Use stored close snapshots for historical reporting. Show an em dash for zero capacity or unavailable accrual. |

The proposed ADR/RevPAR source is `hotel_daily_metrics` and its immutable
night-close snapshot. The PMS has a configured inclusive tax/service-charge
document calculation. Treat frozen contracted rates on their recorded basis until
Finance approves gross vs. net room-rate reporting, tax treatment, and how to
handle future complimentary or other special room-night types. ADR/RevPAR
definitions are ready for review and carry no new dashboard or posting behavior.

### Fiscal and Restaurant decisions awaiting acceptance

- Hotel Accounting and Finance must record the actual legal entity, authorized
  fiscal issuer, numbering series, correction/void workflow, tax and service-charge
  basis, effective date and approval evidence. One system issues the fiscal invoice
  per sale. Existing PMS snapshots keep their issue numbers and original values.
- Use the **proposed POS-origin sales model** for the Task 15/17 design. POS owns
  the restaurant sale, tax and revenue source. PMS owns the stay folio charge,
  guest receivable/clearing and collection. Finance reconciles the linked effects
  and recognizes restaurant revenue once. If different entities own POS and Hotel,
  Finance must approve debtor/creditor and inter-entity clearing before posting.
- Finance must approve the deposit liability/application events, direct-bill AR
  transfer acknowledgment, refunds and correction examples. Fiscal activation
  and Finance posting remain pending those decisions and sandbox reconciliation.

### Closed-day review downloads

Accounting can download a saved close as CSV, Excel or PDF from the Closed days
list in Hotel Operations. Each format carries the same versioned batch reference,
business date, close timestamp and seven money measures from the saved snapshot.
CSV uses integer centavos, Excel uses numeric PHP cells, and PDF presents the
same values for review. The amounts represent distinct measures, so only gross
collections less refunds reconciles to net collections.

This is the review-download portion of Task 15. An approved line-level import
format, account/tax mapping, Finance acknowledgment and reconciliation workflow,
and partner replay acceptance are still pending. Download issuance is logged
separately from those Finance events.

## 4. HR and Hotel access handoff

Owners use O01–O03 and O22. HR controls employment and official schedules. The
identity operator controls credentials/principals. Hotel Admin controls Hotel
grants, and Hotel departments control task assignment.

1. HR approves a hire or employment change with an immutable employee ID/version.
2. The identity operator establishes the principal mapping. Hotel Admin reviews
   local eligibility and grants the appropriate Hotel role through current rules.
3. Hotel saves a minimal projection for eligible staffing/task decisions. Official
   schedule/availability remains HR data and task completion remains Hotel work.
4. Termination or suspension disables the mapped account/session and blocks new
   assignments. Unfinished work is reassigned with its original history intact.
5. Rehire/reactivation requires reviewed local eligibility/grants. A replayed old
   active event cannot restore a later revoked privilege.

| Contract detail | Proposed requirement / pending decision |
|---|---|
| Minimal fields and IDs | Employee ID, principal subject/issuer, property/department, employment state and source version. Name and approved schedule assignment/availability are included only for the operational need. Salary, health and personnel documents are excluded. |
| Status/read behavior | Authoritative employee read, changed-record pagination/cursor and optional property/date-scoped schedule read. Inactive/deleted records need a retained revocation signal. |
| Event and correction | Employment/schedule change carries employee ID, event ID and source version. Ambiguous name/email matches stop for reviewed mapping. HR corrections never grant Accounting/Admin rights by themselves. |
| Outage and revocation | Show projection age. Agree maximum staleness, missing-feed alerts and what assignments may continue. Block new unknown-eligibility grants. Local emergency disable remains available. |
| Controlled fallback | Hotel Admin uses current local provisioning/disable and a controlled staff eligibility list. The responsible role reviews unfinished assignments and any expiring temporary access. |
| Adoption trigger | HR/identity/Hotel roles accept mappings, scope, outage limits and actual termination/rehire/catch-up tests, including existing-session denial. |

## 5. SCM purchasing, receipt and stock handoff

Owners use O11–O13, O09 and O22. The local Hotel ledger remains authoritative until
a reconciled SCM cutover. SCM then controls accepted purchasing/stock effects,
while Hotel captures the operational request, delivery count and consumption.

### Requisition through invoice matching

1. **Request.** Hotel records item, quantity, UOM, delivery/store location, reason,
   required date and a stable requisition ID. SCM acknowledges or rejects it with
   a reference and reason.
2. **Approval and PO.** SCM applies its accepted purchasing authority and returns
   the approved PO/lines and remaining quantities. While local authority is
   retained, existing Hotel threshold approval rules continue. No current Hotel
   action claims that an order has been transmitted to the supplier.
3. **Count delivery.** Receiving staff record delivered, accepted, damaged/rejected
   and outstanding quantities per original PO line/UOM/location. A receipt of six
   against ten leaves four open. Omitted lines stay undelivered.
4. **Accept receipt.** The active stock authority validates remaining quantity and
   saves the accepted receipt and movement together. Pending evidence stays
   visible. Its later acknowledgment cannot add stock a second time.
5. **Return.** A linked return identifies the original accepted receipt/line,
   quantity, location, reason and approved disposition. Cap it to the remaining
   returnable quantity. Damaged goods rejected before acceptance do not produce
   an accepted-stock increase followed by an invented return.
6. **Invoice matching.** SCM supplies approved PO, accepted receipt and return
   references to Finance. Finance matches the supplier invoice and owns AP,
   payment and verified bank instructions. Resolve quantity/price mismatches with
   the responsible role before approval.

### Consumption and physical count

One Hotel task consuming two mapped items produces two item lines under the
original operation identity and one accepted effect per line. Task completion,
SCM acknowledgment and reconciliation all reference that effect. Linen laundry
custody uses an agreed return/transfer meaning instead of automatic consumption.
A count carries the ledger version staff counted. A newer movement requires a
recount or reviewed correction. Transfers must preserve linked source/destination
effects through the single stock authority.

| Contract detail | Proposed requirement / pending decision |
|---|---|
| Stable IDs and units | Hotel request/task/operation, SKU, UOM/conversion version, store/location, requisition, supplier, PO/line, receipt/line, count and SCM movement IDs. Names cannot establish SKU/UOM equivalence. |
| Location mapping | If the property has one Hotel store, explicitly map that store. Agree locations and unit precision before accepting counts or deliveries. No new warehouse hierarchy is assumed. |
| Status/read behavior | Query requisition, PO, receipt/return and movement by original ID. Catalog/balance changes need pagination, cursor/source version and explicit deletion/retirement meaning. |
| Correction and reconciliation | Compare ordered, accepted, rejected, returned and outstanding quantities and count accepted movements per location/UOM. Reject over-receipt, duplicate lines, invalid units, shortage and stale counts atomically. |
| Controlled fallback | Keep the current local ledger until cutover. During an adopted SCM outage, record uniquely referenced pending/provisional use or receiving evidence under approved limits. Reconcile physical stock and pending work before resumption. Never reactivate conflicting local stock writers as an outage shortcut. |
| Adoption trigger | Reconcile SKU/UOM/store mappings, opening count, open POs/partial receipts and pending operations. Accept exact authority/version/time, single-effect/retry/return tests and first acknowledged totals. |

### SCM opening and cutover worksheet

Task 10 verifies the local authority. Task 20 supplies actual partner mapping and
cutover evidence. Use a restricted worksheet keyed by the accepted contract
version. No opening balances, IDs or operating limits have been approved here.

| Record / control | Opening or cutover evidence required | Accountable role / current status |
|---|---|---|
| Catalog and UOM | Local inventory ID ↔ SCM SKU, exact unit/precision and accepted conversion version. Quarantine ambiguous mappings. | SCM stores + Hotel supplies. Pending. |
| Store | Explicit single Hotel store ↔ SCM location initially, unless real approved locations require more. | SCM stores. Pending. |
| Opening stock | Timestamp/version, physical count, Hotel ledger, SCM opening amount per SKU/UOM/store, differences and approved corrections. | Hotel supplies + SCM stock control. Pending. |
| Open purchasing | Local supplier/PO/line ↔ SCM reference, ordered/cumulative accepted/rejected/returned/remaining quantities and Finance invoice references. Historical unknown delivery detail remains unknown. | SCM purchasing/receiving + Finance AP. Pending. |
| Pending operations | Original task/request/issue/count/receipt IDs, accepted local movements, unresolved result, receiver acknowledgment and control totals. Completed local effects are opening history, never new issues. | Hotel supplies + SCM integration operator. Pending. |
| Pause writers | Stop local issue/count, direct/task fulfillment, PO receipt and legacy adjustment writers for the handoff window. Record paused work and ensure no conflicting generic quantity route. | Hotel operator + SCM operator. Pending. |
| Effective authority | Accepted schema/mapping/config/app versions, exact effective time, final local totals and matching SCM opening totals. Activate the new writer only after reconciliation. | Hotel/SCM authorized leads. Pending. |
| First acknowledgments | Original operation IDs, single SCM movement IDs, source/accepted/rejected/pending counts and quantities, duplicate retry outcome and discrepancies. | SCM stock control + Hotel supplies. Pending. |
| Correction / reversal | Responsible role, original receipt/movement, remaining returnable quantity and Finance adjustment linkage. No arbitrary local quantity overwrite. | SCM stock control + Finance AP for invoice effects. Pending. |
| Outage operating limit | Approved maximum provisional use/receiving exposure, age, support contact and stop/escalate condition. Until approved, pause affected SCM writes and keep uniquely referenced pending evidence. | Hotel duty/supplies + SCM support. Pending. |
| Resumption / switchback | Reconcile unknown results before replay. Before any SCM acceptance, restore the reconciled local mode only under the accepted rollback procedure. After SCM accepts writes, pause both paths and reconcile forward before switching authority. | Hotel release operator + SCM stock control. Pending. |

Hotel linen laundry custody is a service/return record. Do not map it to supply
consumption without an accepted movement meaning. A source task and later SCM
acknowledgment refer to the same movement identity.

## 6. Facilities incident and repair handoff

Owners use O18–O19, O05 and O22. Facilities owns accepted building/equipment work
after handoff. Hotel owns its immediate room restriction, occupancy response,
cleanliness/inspection and final availability decision.

1. **Incident.** Hotel records room/asset, symptoms, severity, time and incident ID.
   Unsafe conditions produce an immediate local restriction and Front Desk
   escalation or guest relocation when needed. Submit the incident with that
   restriction reference and show pending until Facilities accepts it.
2. **Diagnosis.** Facilities acknowledges a work-order ID/version and records
   diagnosis, serviceability, parts/external-provider needs and repair plan.
3. **Assignment.** Facilities names the responsible technician/team and schedule.
   A changed estimate or deferred repair is a visible status update.
4. **Repair.** Facilities records progress, parts and technical completion
   evidence. Completion identifies the work order/version and restriction that
   may be reviewed for release.
5. **Verification.** Hotel confirms the relevant restriction can clear, performs
   cleanup/inspection and checks all other blockers. Another unsafe repair,
   unresolved discrepancy or failed inspection keeps its own restriction active.
   Hotel acknowledges the readiness result back to Facilities.
6. **Reopen.** A failed repair reopens the incident with a later version and
   restores the appropriate immediate restriction. A delayed older completion
   cannot clear the reopened incident.

### Equipment and preventive service

Facilities maintains the accepted building/equipment register, service intervals,
due work and maintenance history. It proposes room-impacting service windows to
Hotel using asset/work-order IDs and the expected restrictions. Hotel checks sold
stays and operational capacity, then acknowledges the agreed window or a conflict
requiring rescheduling/relocation. Planned service cannot silently cancel a sold
night. Technical completion and Hotel availability release remain separate.
Vehicle maintenance stays with Fleet.

| Contract detail | Proposed requirement / pending decision |
|---|---|
| Stable IDs | Hotel incident, room, independent block, inspection, Facilities asset/work order and source version. Map each open incident once during handoff. |
| Status/read behavior | Submit/status query and versioned work-order/asset schedule changes. Agree paginated catch-up and how reopened/cancelled orders appear. |
| Correction and acknowledgment | Hotel retains the immediate block reference. Facilities accepts work responsibility and repair status. Hotel returns its restriction/inspection result. A callback cannot generically set a room available. |
| Reconciliation | Compare open/reopened work, independent active blocks, repair-complete awaiting inspection and unmatched asset/room IDs. Escalate unsafe and stale work to the responsible duty role. |
| Controlled fallback | Before handoff, use Hotel's current local work orders. After adoption, retain immediate Hotel safety blocking and a uniquely referenced manual report/contact log. Reconcile offline incidents into Facilities without creating a second repair ledger. |
| Adoption trigger | Facilities/Hotel accept asset/open-incident mapping, work status/version contract, planned-service conflict handling, outage support and actual reopen/two-repair/inspection acceptance. |

Task 11 local verification uses the existing Maintenance diagnosis and independent
Hotel discrepancy/inspection controls. The current local workflow re-reports a
recurring fault as a new linked work order. It does not implement a versioned
Facilities callback or an in-place Reopen action. Map both historical and active
orders during handoff and retain each independent restriction. Preventive due
dates and creating a service work order alone do not change sold nights or room
availability. Actual Facilities acknowledgment/version handling remains Task 21.

Facilities opening mapping requires the original Hotel work-order/asset ID,
external work-order/asset ID, room ID, source/correction reference, current status
and source version, diagnosis/impact, outstanding parts, assigned responsibility,
independent room restriction, pending cleanup/inspection/discrepancy and accepted
handoff time. Match each open incident once. Hotel rooms and Facilities leads
review unmatched records and release responsibilities before repair authority
transfers. External references and acceptance remain Pending until supplied.

## 7. Fleet request, trip and fare handoff

Owners use O16–O17, O06–O07 and O22. Hotel owns the guest promise/request. Fleet
owns accepted dispatch, driver/vehicle, trip and fare evidence.

1. Hotel submits a stable request with stay reference, pickup/service window,
   route requirements and minimal approved contact details. Display pending until
   Fleet accepts it.
2. Fleet confirms request/assignment IDs, schedule, qualified driver/vehicle and
   later started/completed status. The guest sees only acknowledged commitments.
3. Cancellation carries the original request and expected version. Resolve a
   race with dispatch/start from Fleet's authoritative result before creating a
   replacement trip.
4. Fleet supplies final fare/version and correction linkage. Hotel Billing maps
   that evidence to its original accepted charge. A changed fare is an approved
   delta/reversal rather than another full fare.
5. A completed-trip fare arriving after checkout goes to an Accounting exception.
   Preserve the original stay and current posting rules. An occupied room number
   cannot redirect a charge to its new guest.

Haven currently posts its configured flat fare when a local request is assigned.
Agree the treatment of existing postings and the proposed final-fare timing
before changing that behavior. Operator cancellation does not itself reverse the
folio. Existing Accounting correction authority remains applicable.

| Contract detail | Proposed requirement / pending decision |
|---|---|
| Stable IDs | Hotel transport request/stay, Fleet request/trip, assignment, driver/vehicle reference, fare version and Hotel charge/reversal IDs. |
| Status/read behavior | Request, cancellation and trip status query plus versioned catch-up. Define pagination/cursor for missed assignments, cancellations and fare corrections. |
| Correction and reconciliation | Compare open promises, accepted assignments, completed/cancelled trips and mapped fares. A delayed old update cannot undo a newer cancellation or repost a known fare. |
| Controlled fallback | Keep local Hotel/provider coordination and approved guest promises until adoption. During outage, confirm manually with a unique provider/request reference, show uncertainty and reconcile status/fare before automated replay. |
| Adoption trigger | Provider/Hotel/Accounting accept open-request and posted-fare mapping, assignment/cancellation races, closed-stay exceptions and one-fare round-trip sandbox evidence. |

## 8. Restaurant handoff reference

Owners use O14–O15 and O06–O10. The authoritative proposed Restaurant detail is
[Restaurant charge-to-room](RESTAURANT_CHARGE_TO_ROOM.md), including its payload,
eligibility, authentication, replay, correction and acceptance requirements.
This document reuses that proposal without creating a second schema or endpoint
definition. Finance's accepted revenue/clearing model must agree with it.

Until the partner is ready, use accepted Restaurant alternative tender or a
controlled authorized manual Hotel charge reference. Guest verification, maximum
amount, outlet scope, status/correction capability and actual POS sandbox remain
pending. A reused room lookup cannot authorize a new charge after checkout.

Adoption requires the POS, Hotel and Finance roles to accept the existing
Restaurant contract, provision scoped sandbox credentials and demonstrate lookup,
posting, exact replay, reversal and reconciled revenue/clearing totals against
the actual partner. Until then the controlled alternative above remains in use.

## 9. Per-partner readiness checklist

Every cell is Pending until evidence is recorded against the contract version.
The role is the accountable approver while names are pending. Before activation,
record a usable operational/technical support contact and escalation route.

| Readiness item | Finance | HR | SCM | Facilities | Fleet | Restaurant |
|---|---|---|---|---|---|---|
| Accountable role confirmation and support contact | Pending O09–O10 | Pending O01–O03 | Pending O11–O13 | Pending O18–O19 | Pending O16–O17 | Pending O14–O15 |
| Machine identity, auth scope, rotation and revocation | Pending | Pending | Pending | Pending | Pending | Pending |
| Required schema/version, limits and error meanings | Pending | Pending | Pending | Pending | Pending | Pending |
| Stable IDs, mappings and correction linkage | Pending | Pending | Pending | Pending | Pending | Pending |
| Isolated partner sandbox and controlled data | Pending | Pending | Pending | Pending | Pending | Pending |
| Paging, change cursor, ordering and resynchronization | Pending | Pending | Pending | Pending | Pending | Pending |
| Exact retry, unknown-result status query and bounded delivery | Pending | Pending | Pending | Pending | Pending | Pending |
| Correction authorization, rejection and reversal result | Pending | Pending | Pending | Pending | Pending | Pending |
| Outage limits, alerts and controlled fallback | Pending | Pending | Pending | Pending | Pending | Pending |
| Source/receiver reconciliation and opening records | Pending | Pending | Pending | Pending | Pending | Pending |
| Real partner acceptance, deployment and cutover evidence | Pending | Pending | Pending | Pending | Pending | Pending |

If an agreed contract has no paginated feed or outgoing event requirement, the
reviewer may record Not applicable with the accepted alternative, such as a
scoped authoritative status query and scheduled reconciliation. A missing
implementation or unanswered partner question remains Pending.

### Acceptance record template

| Field | Value to record |
|---|---|
| Partner and contract version | Relevant section and reviewed revision/commit |
| Approver roles | Relevant O01–O22 roles and required counterpart confirmations |
| Accepted items and pending decisions | Checklist item, agreed value, acceptance state and conditions |
| Environment and evidence | Actual partner sandbox, app/schema/config identifiers, executed action, observed source/receiver totals and restricted evidence reference |
| Operational support | Contact channel, duty role, threshold, fallback action and resumption owner |
| Decision date and reference | Pending until authorized role confirmation |
| Activation/cutover | Pending until the applicable runtime acceptance and release gate passes |

Record evidence using the sign-off procedure in the ownership register. Approval
of this written design and acceptance of a working connection are separate
milestones. G1 awaits the relevant local-boundary confirmation. Tasks 15–22 build
and verify each ready partner separately. A blocked partner does not halt
independent Hotel work or authorize an unreviewed ownership transfer.

## 10. Scenarios to validate during implementation

| ID | Scenario | Required result |
|---|---|---|
| C01 | Same business operation is delivered twice, including simultaneous delivery | One accepted effect and its original result |
| C02 | Same identity is reused with changed quantity/amount/content | Visible conflict and no additional effect |
| C03 | Receiver commits, then sender times out | Original status/retry resolves the saved outcome |
| C04 | Revoked identity or unauthorized property/outlet requests data | Refusal before disclosure or mutation |
| C05 | Older HR/repair/trip update arrives after a newer one | Current authority/version is preserved and missing history can be reconciled |
| C06 | Ten ordered, eight delivered, six accepted and two rejected | Six enter stock, four remain due for acceptable delivery, and the two rejected units remain traceable |
| C07 | Two supply lines are consumed by a task and its acknowledgment is retried | Each mapped line produces one stock effect; failed consumption rolls back the operation |
| C08 | One repair completes while another unsafe incident is open, then an old completion is replayed | Relevant restriction alone changes; Hotel readiness and newer reopen state remain authoritative |
| C09 | Scheduled preventive work conflicts with a sold room night | Hotel acknowledges a reviewed plan/conflict before room impact |
| C10 | Finance reimports a batch, rejects a line, then accepts a correction | Original accepted sources post once and all unmatched/corrected totals remain traceable |
| C11 | POS posts a room charge and both systems export their source facts | Finance's one accepted revenue/clearing model reconciles |
| C12 | Existing local transport fare receives a later final fare correction | One mapped original charge plus approved delta/reversal |
| C13 | A new financial event arrives after Hotel day close | Original occurrence time is retained and the new effect uses the current Hotel day |
| C14 | Partner is unavailable, manual references are used, then service resumes | Controlled fallback stays visible and reconciliation prevents duplicate replay |
| C15 | HR termination occurs during an existing Hotel session | Access/assignment revoke under approved rules, with task/financial history retained |

These are required future runtime acceptance cases. Preparing this document does
not execute them. A local simulator can support development, while final partner
acceptance needs the actual counterpart system and reconciled results.

## References

- [Ownership and sign-off register](../ENTERPRISE_BOUNDARIES.md)
- [Implementation plan, Task 3](../plans/2026-11-04-enterprise-architecture-10-of-10.md)
- [Enterprise module audit, Part 7](../audits/ENTERPRISE-MODULE-AUDIT-2026-11-04.md)
- [Existing Restaurant proposal](RESTAURANT_CHARGE_TO_ROOM.md)
