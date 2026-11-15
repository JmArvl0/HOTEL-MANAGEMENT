# Haven and enterprise system boundaries

Status: proposed team agreement, 4 November 2026. This describes intended ownership,
not a confirmed allocation image, active external connection or approved removal of
existing functionality. SYSTEM.md remains the authoritative Haven behavior reference.

Haven covers the seven hotel areas: Guest & Customer; Reservation & Booking; Front
Office; Rooms & Housekeeping; Billing & Payments; Inventory & Staff; Administration
& Analytics. Coverage, implementation, testing, deployment and policy activation are
separate milestones. Role-specific navigation remains appropriate for daily work.

## Ownership acceptance register

Prepared 4 November 2026 against `SYSTEM.md` and the audit's Parts 2 and 8.
All target allocations below remain proposed. Existing Hotel permissions continue
to come from the protected application and database workflows. A requester,
consumer or cached copy has no independent write authority over the source fact.
The accountable role is also the approver role for that responsibility. This
register uses roles while individual assignments are pending. An authorized
representative of the role must confirm acceptance before an external flow is
enabled or ownership is transferred. Record the approver role, decision date and
traceable evidence when that happens. A display name can be added later.
Preparing this register grants no access.

| ID | Proposed final authority / fact | Accountable / approver role | Sign-off status | Accepted date | Evidence |
|---|---|---|---|---|---|
| O01 | Identity platform / login principal and session lifecycle | Identity administrator | Pending sign-off | Pending | Source S1; role confirmation pending |
| O02 | HRMS / employment, official schedule, attendance, leave and payroll | HR lead | Pending sign-off | Pending | Audit Part 2; role confirmation pending |
| O03 | Hotel PMS / Hotel account eligibility, role grants and task assignment | Hotel Admin and operations lead | Pending sign-off | Pending | Source S1; role confirmation pending |
| O04 | Hotel PMS / guest profile, preferences and reviewed identity linkage | Hotel guest operations lead | Pending sign-off | Pending | Source S2; role confirmation pending |
| O05 | Hotel PMS / reservation, occupant register, room, rates and readiness | Hotel Front Office and rooms lead | Pending sign-off | Pending | Source S2; role confirmation pending |
| O06 | Hotel PMS / folio obligation, source charges and corrections | Hotel Accounting lead | Pending sign-off | Pending | Source S3; role confirmation pending |
| O07 | Hotel PMS / payment, refund evidence and physical drawer count | Hotel Accounting and cash-operations lead | Pending sign-off | Pending | Source S3; role confirmation pending |
| O08 | Hotel PMS / operating day, close snapshot and operational reports | Hotel Accounting and reporting lead | Pending sign-off | Pending | Source S4; role confirmation pending |
| O09 | Finance / GL, AR/AP, debtor credit and bank/processor settlement | Finance lead | Pending sign-off | Pending | Audit Part 2; role confirmation pending |
| O10 | Finance / tax policy, fiscal issuer and posting mappings | Finance accountant | Pending sign-off | Pending | Task 13; entity-specific fiscal decision pending |
| O11 | SCM / supplier master, enterprise purchasing and goods receipt | SCM purchasing and stores lead | Pending sign-off | Pending | Source S5; handoff and role confirmation pending |
| O12 | SCM / SKU, UOM, location, accepted stock balance and movements | SCM stores and inventory-control lead | Pending sign-off | Pending | Source S5; handoff and role confirmation pending |
| O13 | Hotel PMS / Hotel service consumption and requisition evidence | Hotel supplies and department lead | Pending sign-off | Pending | Source S5; role confirmation pending |
| O14 | Restaurant / customer, menu, order, POS sale, tender and corrections | Restaurant/POS lead | Pending sign-off | Pending | Restaurant contract proposal; acceptance pending |
| O15 | Hotel PMS / acceptance and reversal of a Restaurant folio charge | Hotel Accounting lead | Pending sign-off | Pending | Restaurant contract proposal; acceptance pending |
| O16 | Hotel PMS / guest transport promise and request | Hotel guest-service lead | Pending sign-off | Pending | Source S6; role confirmation pending |
| O17 | Fleet / vehicle, qualified driver, dispatch, trip and fare evidence | Fleet/provider lead | Pending sign-off | Pending | Source S6; handoff and role confirmation pending |
| O18 | Facilities / building asset, diagnosis, repair and preventive work | Facilities lead | Pending sign-off | Pending | Source S7; handoff and role confirmation pending |
| O19 | Hotel PMS / immediate room restriction and final readiness release | Hotel rooms and safety lead | Pending sign-off | Pending | Source S7; role confirmation pending |
| O20 | Shared storage / private object bytes and storage enforcement | Platform/storage operator | Pending sign-off | Pending | Source S8; storage and recovery sign-off pending |
| O21 | Originating domain / document meaning, access and retention decision | Domain records owner | Pending sign-off | Pending | Source S8; retention/hold approval pending |
| O22 | Originating domain / business approval, audit and source correction | Accountable domain lead | Pending sign-off | Pending | Audit Parts 2/8; role confirmation pending |

### How to record role sign-off

1. The authorized representative reviews the responsibility and its matching
   request/write/ID/correction row below. Multiple roles named on one row each
   confirm their part before the whole row can be accepted.
2. Record the approval evidence with the row ID, approver role, decision, date,
   scope/version reviewed and a traceable source such as an email or meeting
   minute reference. Keep private signatures and personal information in the
   approved restricted location; the register needs a reference.
3. Change Sign-off status to Accepted only after all required confirmations.
   Populate Accepted date and Evidence from that confirmation. A proposed role
   assignment or a completed technical test leaves sign-off pending.
4. Reopen review when the accepted writer, correction rules or handoff scope
   changes. Preserve the previous approval reference and record the new version.

Use this blank evidence format when an approval is received. This template is
pending and records no approval by itself.

| Field | Value to record |
|---|---|
| Ownership row | Relevant O01–O22 ID |
| Approver role | Role listed on that row |
| Decision | Pending until confirmed; then Accepted or Changes requested |
| Decision date | Pending until confirmed |
| Reviewed scope/version | Document revision or commit plus any explicit conditions |
| Evidence reference | Restricted email, meeting minute or approval-record reference |

### Record, request and correction boundaries

External ID names below define contract requirements. The partner supplies the
actual ID format and its immutable mapping. They do not imply that an adapter or
new database column already exists. Current Hotel row IDs remain the local IDs.

| Register | Originating requester | Permitted writer after accepted cutover | Stable identity | Permitted copied fields | Correction authority |
|---|---|---|---|---|---|
| O01 | Staff or domain provisioning request | Identity administrator/service; local authentication remains until adopted | Principal subject/issuer mapped to `user_accounts.id` | Principal ID and eligibility/revocation status | Identity operator revokes credentials/sessions; Hotel independently disables local access |
| O02 | Employee and authorized HR operator | HRMS protected employment/schedule/payroll process | Immutable external employee ID mapped to the principal | Minimal employee ID, name, employment state and version; approved schedule when needed | HR corrects employment records; Finance owns its payroll journal |
| O03 | Hotel supervisor and Admin | Hotel Admin grants roles; department workflows assign tasks | `user_accounts.id`, task/handover ID and external employee mapping when adopted | Role/status or workload summary only for the agreed consumer | Hotel Admin changes grants; assigned department corrects task state; history retained |
| O04 | Guest and authorized Hotel staff | Hotel protected guest/profile and reviewed merge operations | `guests.id`, account link and reviewed merge references | Minimal stay eligibility or guest reference required for the agreed service | Hotel guest operations; a partner cannot merge or rewrite the guest master |
| O05 | Guest, Front Desk, rooms staff and catalog authority | Hotel protected booking, occupant, catalog and readiness operations | Reservation/occupant/room/rate IDs and assignment history | Stable stay reference, room display, dates and current eligibility; private ID evidence excluded | Authorized Hotel operation owns amendments, room moves, cancellation and inspection |
| O06 | Guest service, Front Desk or accepted partner charge request | Hotel protected financial transaction under current role rules | Invoice, charge and adjustment IDs with original source linkage | Obligation, currency, business date, source and reversal references | Hotel Accounting posts linked corrections; Manager approves policy exceptions where required |
| O07 | Collector or Accounting payout operator | Hotel collection/refund/count/reconciliation RPC | Payment/refund-request/drawer IDs and retry identity | Amount, method/classification, receipt, drawer and source references | Hotel Accounting records refunds/reconciliation; original settled evidence and counts retained |
| O08 | Hotel operator and report reader | Accounting closes the Hotel day; reports derive from source facts | Business date plus close ID/version and source transaction IDs | Closed metrics, source totals and defined date/capacity basis | Later corrections post on the current Hotel day; historical close snapshots remain immutable |
| O09 | Hotel/Restaurant source export or debtor request | Finance accepted journal/AR/AP/settlement process | Source effect ID mapped to Finance batch/journal/debtor IDs | Source amounts, dates, currency, account mappings, acknowledgment and correction references | Finance corrects its journal; Hotel corrects its source effect; rejection remains visible |
| O10 | Finance accountant and entity policy owner | Finance-approved policy/configuration and exactly one accepted fiscal issuer | Entity, effective policy version and fiscal document identity | Approved rates/treatment/mappings and issuer reference; PMS snapshots applied treatment | Finance authorizes policy changes and issuer corrections; acceptance required before fiscal reliance |
| O11 | Hotel/Restaurant/Facilities/Fleet requisition or receiving staff | SCM purchasing/receiving process | Supplier, requisition, PO, receipt and return IDs mapped from existing local IDs | Approved order, remaining quantity, accepted/rejected receipt and status references | SCM corrects through linked receipts/returns; Finance controls supplier bank details and disbursement |
| O12 | Hotel use/count/receipt evidence | SCM movement API after the opening balance is reconciled | SKU/UOM/location plus original operation and SCM movement IDs | Approved balance/version and accepted movement status | SCM accepts count/return/transfer correction; Hotel cannot maintain a second active quantity ledger |
| O13 | Housekeeping, Maintenance or another authorized Hotel department | Hotel service workflow captures evidence; one active stock authority accepts its movement | Guest request/task/stock-operation ID | Quantity, mapped SKU/UOM/store, time, reason and acknowledgment | Hotel corrects source evidence; current stock owner posts linked correction once |
| O14 | Diner and Restaurant staff | Restaurant POS and its authorized correction workflow | Outlet/check/external transaction ID | Minimal sale amount, currency, tax evidence and correction reference | Restaurant owns sale correction; Hotel/Finance separately acknowledge their linked effects |
| O15 | Authenticated Restaurant outlet | Narrow Hotel charge adapter through existing financial authority, after contract acceptance | Partner/outlet/external transaction mapped to stable stay and folio charge ID | Charge acceptance/status and linked reversal; no account directory | Accounting accepts linked reversal within the remaining reversible amount; exact accepted replay survives checkout |
| O16 | Guest and Hotel service staff | Hotel request workflow | Hotel transportation request ID mapped to provider reference | Pickup/service requirements and acknowledged status needed for the trip | Hotel corrects guest promise/request; Fleet independently confirms dispatch changes |
| O17 | Accepted Hotel request or Fleet dispatcher | Fleet/provider dispatch/trip/fare process | External trip/fare version mapped to Hotel transport and posted charge IDs | Minimal assignment/status/final fare evidence; current trip contact only when needed | Fleet corrects fare evidence; Hotel Accounting posts one linked delta/reversal on its folio |
| O18 | Hotel incident report and Facilities technician | Facilities asset/work-order process after handoff | External asset/work-order/version mapped to Hotel incident | Accepted diagnosis, restrictions and repair result | Facilities corrects/reopens repair status; it cannot bypass Hotel readiness |
| O19 | Hotel incident, room discrepancy and inspection workflow | Hotel protected block/inspection/readiness process | Room, incident/block and inspection IDs | Restriction type/version and readiness result | Hotel clears only the relevant restriction after its readiness checks; another blocker still applies |
| O20 | Owning domain's authorized upload/download | Platform private storage service under domain authorization | Private bucket/object/version linked to source record ID | Private object reference and metadata; authorized short-lived access only | Platform restores bytes and metadata; domain approves retention/hold/disposal |
| O21 | Domain user or records officer | Originating domain access/document-version workflow | Source record/document/version and audit reference | Purpose-limited document metadata; no public cross-domain archive | Domain records owner decides access/hold/disposal with the platform enforcing the accepted rule |
| O22 | Requesting user/system in that domain | Domain approval state machine and protected transaction | Approval/action/source ID, actor and immutable audit reference | Decision, version and outcome needed by the recipient | Domain-authorized approver/executor; identity, storage and BI cannot approve a business transaction |

### Current local authority and handoff gates

| Facts that could change authority | Current authority retained | Required effective handoff | Support and fallback before activation |
|---|---|---|---|
| Staff employment and Hotel access | Existing local account eligibility, sessions and Hotel grants | Named HR/identity/Hotel owners accept immutable employee/principal mappings, revocation and a bounded outage policy; employment state cannot grant Hotel permissions | Hotel Admin locally provisions/disables accounts; named support contact pending |
| Local stock, supplier reference, PO and receipts | Hotel local protected stock/PO ledger | Map SKU/UOM/store and open POs/partial receipts; reconcile opening counts and pending movements; pause conflicting writers; record effective authority/version and first accepted SCM acknowledgment | Hotel supplies owner uses the current ledger until acceptance; external purchasing/support contact pending |
| Local maintenance and external repair work | Hotel current maintenance workflow | Map open incidents and work orders; Facilities accepts repair ownership/versioning; acknowledge transition before disabling duplicate work-order writes | Hotel rooms team retains immediate safety blocks and final inspection; Facilities support contact pending |
| Local transport coordination and final fares | Hotel current request/coordination workflow | Map open promises, assignments and posted fares; provider acknowledges effective responsibility; agree corrections and closed-stay exceptions | Hotel guest-service owner retains local coordination and accepted fare evidence; provider contact pending |
| Hotel source money and Finance postings | Hotel source subledger; existing accounting handoff | Finance accepts schema/mappings, opening balances, unique source IDs, accepted/rejected acknowledgments and one revenue/clearing model | Hotel Accounting keeps source reconciliation; no transfer is treated as paid merely because it was sent |
| Restaurant charge-to-room | Existing authorized manual Hotel folio charge | Restaurant, Hotel Accounting and Finance accept authentication, stable stay lookup, no-post/credit rules, exact replay, correction and real sandbox reconciliation | Restaurant keeps an accepted alternative tender; Hotel records approved manual charge references until adoption |
| Private objects and retention | Existing private storage and domain access checks | Named platform/domain owners accept object mapping, access, hold/disposal rules and joint DB/object restore evidence | Existing restricted access remains; retention durations and support contacts remain pending approval |

Handoff records must contain the exact effective time and version, opening totals,
unmatched items, paused writers, accepted receiver result and responsible operator.
If the new owner has accepted writes, pause and reconcile before switching back.
An application rollback cannot silently reactivate a second stock or fare ledger.

### Seven Hotel coverage areas

| Official area | Ownership rows | Existing scope to preserve |
|---|---|---|
| Guest & Customer | O04, O05, O21 | Guest profile, occupant/identity evidence and authorized history |
| Reservation & Booking | O05, O06 | Holds, dates/rates, availability, booking changes and policy snapshots |
| Front Office | O03, O05, O07, O08, O16 | Arrival/departure, room assignment, collections and handover |
| Rooms & Housekeeping | O05, O13, O18, O19 | Service tasks, DND/discrepancies, repair restrictions and final inspection |
| Billing & Payments | O06–O10, O15 | Folio, source collections/refunds, count/reconciliation and Finance handoff |
| Inventory & Staff | O02, O03, O11–O13 | Hotel supplies and team operations; retained local ledger and operational task assignment |
| Administration & Analytics | O01, O03, O08, O10, O20–O22 | Hotel policies, permissions, audit, operational measures and private access |

Optional groups/OTA, chain-wide CRM, AI expansion and optimization remain deferred.
Enterprise payroll/GL/POS/procurement implementation stays with the owning domain.
Neither a new module label nor this register activates an external integration.

### Module map to current screens and authorities (Task 8)

All staff workspaces below use `/manager_dashboard`, switched by role/section.
The official Inventory & Staff Management heading (Inventory & Staff above) has
the internal architecture name **Hotel Supplies & Team Operations**. Inventory
balances and staff workload remain separate responsibilities. Existing navigation
labels stay in place. This map does not establish payroll, official attendance
or supplier transmission. The seven headings are evaluation coverage areas,
not seven new applications or seven menus shown to every role.

| Official area | Current screens / routes | Domain implementation and authority | Role scope |
|---|---|---|---|
| Guest & Customer | Guest Management, reservation folio/occupants, `/account/*`, `/my-reservations`, `/api/staff/guests/[id]` | `lib/customer.ts`, `lib/staff-data.ts`, `lib/guest-flags.ts`, protected profile/occupant operations. Hotel owns guest facts and evidence access. | Front Desk maintains guest operations, Manager/Owner see permitted profiles, guests see their own records. Restricted flags and private evidence have narrower gates. |
| Reservation & Booking | `/booking/*`, Reservations, Room Management, `/api/front-desk/reservations/*` | `lib/booking.ts`, `lib/reservation-workspace.ts`, protected holds/assignment/check-in/cancellation. Hotel owns stays and frozen terms. | Front Desk executes stay changes, Manager coordinates exceptions, guest self-service stays under its own authorization. |
| Front Office | Room Management, Guest Requests, Transportation, Operational Handover, Daily operations report | `hooks/use-front-office-rack.ts`, `lib/transportation.ts`, `lib/hotel-operations.ts`, `lib/front-desk-reports.ts`. Hotel owns arrival/departure, guest promises and handover. | Front Desk operates, Manager reviews/co-ordinates. Cash collection is distinct from Accounting proof review. |
| Rooms & Housekeeping | Housekeeping, Maintenance, Hotel Operations/discrepancies, `/api/housekeeping/*`, `/api/maintenance/*` | `lib/housekeeping-service.ts`, `lib/room-discrepancies.ts`, maintenance/inspection RPCs. Hotel owns room restrictions and readiness, with local repair authority until Facilities handoff. | Housekeeping cleans/inspects, Maintenance diagnoses/repairs, Front Desk investigates discrepancies and handles relocation, Manager prioritizes/escalates. |
| Billing & Payments | Billing, Guest Folios, Transactions, Deposit Verification, Refunds, Cash & Shifts, Reconciliation, Financial Documents | `lib/accounting.ts`, `lib/financial-route.ts`, cash/refund/day-close RPCs. Hotel owns operational source money, Finance owns its accepted journals and fiscal policy. | Front Desk collects and issues permitted documents. Accounting verifies, refunds, reconciles and closes the day. Owner has separate executive visibility. |
| Inventory & Staff Management | Inventory, purchase-order queue, Staff & Duty, Operational Handover, account administration in the Admin/Owner portal | `lib/purchase-orders.ts`, `lib/staff-duty.ts`, `lib/permissions.ts`, stock/PO and account-governance RPCs. Hotel supplies and team operations retain local authority. | Housekeeping/Maintenance issue/count supplies. Manager supervises workload and local procurement. Admin/Owner govern accounts. A planned roster or login does not prove attendance. |
| Administration & Analytics | System Administration, Owner governance, Reports, Predictive Insights, HAVEN AI | `lib/auth.ts`, `lib/permissions.ts`, `lib/security-policy.ts`, `lib/analytics/*`, `lib/system-health.ts`. Domain decisions remain with their authorized roles. | Admin manages system/account controls, Owner handles its policy/executive decisions, Manager sees operational reports/assistance. Analytics/AI do not approve transactions. |

`config/role-navigation.ts` defines visible sections. `lib/permissions.ts`, route
guards and protected SQL operations enforce actions. Sidebar visibility alone
does not authorize a request. Owner/Admin use separate dashboard clients, not
the operational Manager menu. Local verification and hosted/policy status are
recorded separately in the [acceptance register](qa/enterprise-architecture-acceptance-2026-11-04.md).

### Local staff identity and eligibility procedure (Task 9)

On 14 November 2026 the user authorized Hotel-side Workforce integration
preparation. The local `haven-workforce-v1` receiver, reviewed employee mapping
and opt-in checkout assignment consume Workforce availability separately from
Hotel task activity. Workforce remains the source of official schedules,
attendance and leave. Both connection and automatic assignment default off.
This preparation does not record partner contract acceptance or hosted activation.
See [the Workforce integration guide](integrations/WORKFORCE_MANAGEMENT.md).

- `user_accounts.id` is the current local login principal. `staff.user_id` links
  its operational mirror, while `staff.id` identifies that mirror. Tasks and
  work orders use `assigned_user_id` referencing the principal. A future HR
  `employeeId` requires an explicit reviewed mapping with issuer/property and
  source version. Names/emails and free-text employee references are not identity
  joins or automatic grants.
- While HR is unavailable, Admin provisions operational roles through current
  inactive/recovery-required onboarding. Owner controls protected-role grants
  and the approved guest-history conversion exception. An HR active flag cannot
  grant Accounting/Admin or bypass local recovery. Eligibility evidence and
  reasons stay in the restricted operational/account audit.
- Admin/Owner can use the existing account status action for an urgent disable
  under protected-role rules. It rotates `auth_version`. Every subsequent
  session validation loses the old authority, and protected actions reject
  inactive actors. Disabled people cannot receive new housekeeping/maintenance
  assignments. Existing task and financial history stays intact for authorized
  reassignment/review.
- Guest-to-staff conversion uses the dedicated recovery workflow, never a plain
  role edit. The ordinary path refuses booking/financial history. The Owner-only
  history path preserves linked stays and invoices and creates an inactive,
  recovery-required staff mirror. Reactivation does not bypass recovery.
- A temporary locally provisioned account uses the existing restricted eligibility
  review and emergency-disable process. Its department review owner and any
  temporary expiry must be recorded by the authorized role. The system does not
  currently enforce an employment/contract expiry or claim an HR feed is fresh.
  The future HR adapter's maximum eligibility age, outage limit and escalation
  contact remain **Pending** HR/identity/Hotel acceptance. Until those are agreed,
  do not activate automatic HR-based eligibility or assume an indefinite grace
  period. Existing local access remains explicitly locally administered.

### Local stock writer inventory (Task 10)

All current stock effects write the same Hotel `inventory` ledger under database
locks. Quantity changes are not permitted through generic resource PATCH.

| Entry / writer | Current effect and protection | Handoff treatment |
|---|---|---|
| `/api/inventory/movements` → `hms_stock_movement` | Housekeeping/Maintenance issue/count. One operation identity, payload conflict check, row lock, shortage rejection and original count version. | Map original operation, item/UOM/store and accepted movement once. |
| PO receive route → `inventory_receive_purchase_order` | Accepted outstanding receipt, append-only delivery reference, stock/status/movement in one transaction, retry guard and approval checks. | Reconcile open PO lines, cumulative receipts and remaining quantities before switching authority. |
| Protected guest-request fulfillment → `consume_fulfilled_request_stock` | Direct fulfillment consumes the mapped item under its lock. | Preserve guest-request identity and accepted movement. |
| Housekeeping completion → `hms_consume_request_stock` | Task-linked fulfillment checks the existing request movement, prevents a second deduction and rolls back on shortage. | One source request/task effect, never a second issue on acknowledgment. |
| Legacy service-role-only `adjust_inventory_stock` | Earlier count function remains installed. Current generic quantity PATCH is blocked and the current count UI uses `hms_stock_movement`. It is not an approved SCM fallback. | Include it in the writer-disable inventory before any SCM cutover. No second ledger or generic balance writer may be re-enabled. |

Use one initial Hotel store mapping until actual location requirements are
accepted. The [SCM cutover worksheet](integrations/ENTERPRISE_CONTRACTS.md#scm-opening-and-cutover-worksheet)
records opening totals, pending movements, writer pause, receiver acknowledgment
and switchback responsibility. SCM integration is still pending.

### Room condition and repair controls (Task 11)

| Independent dimension | Recorded source | Effect on operations |
|---|---|---|
| Occupancy and sold nights | Reservation/room assignment and physical room state | Preserve the stay and arrival promise. An unsafe occupied room needs Front Desk escalation/relocation, never a false checkout. |
| Cleanliness and inspection | `rooms.housekeeping`, housekeeping tasks and inspection result | Dirty/cleaning/inspection/reclean state prevents same-day readiness under the existing policy. Cleaning and inspection stay with Housekeeping. |
| Guest service instruction | In-house reservation's DND/service condition | DND stops routine stayover start. Guest decline/late service changes the task outcome/priority, not occupancy or cleanliness. |
| Technical restriction | Open local work orders with blocked/out-of-service diagnosis | Local Maintenance can apply a restriction without external Facilities. All independent active technical blocks must clear. A reporter does not decide technical serviceability. |
| Occupancy discrepancy | Unresolved `room_discrepancies` | Blocks new room assignment/check-in through eligibility and DB guards until Front Desk investigates and resolves it. Repair/cleaning cannot resolve it. It is not a fabricated occupancy change. |
| Administrative inventory | Room active/archive state and dates | Archived inventory is excluded. Archive is governance, not a substitute for a repair restriction. |

Urgent reports use the current incident workflow, immediate local Maintenance
diagnosis and Front Desk escalation. Repair resolution clears only its own work
order. Cleanup-required repairs create a Housekeeping task, with inspection
under current policy. An occupied room stays occupied while service/relocation
is coordinated. Staff dashboards expose recorded status, open orders and
discrepancies separately. Booked occupancy and live physical room status remain
different report measures.

The current local work-order state machine has no in-place Reopen action. A
recurring unsafe fault is a new linked incident (`source_type`/`source_id`
referencing the prior repair), with a new diagnosis/block and retained history.
Replaying resolution against the old resolved order refuses the state change.
Future Facilities callbacks need accepted source versions and correction linkage
under Task 21. No callback or external Reopen endpoint is claimed here.

Preventive asset due dates and linked service work are scheduling evidence.
Creating them does not block a room, cancel a sold stay or mark a room clean.
Technical work that affects occupied/sold inventory requires the existing
diagnosis and Front Desk coordination. Map open work-order/asset IDs and every
independent restriction before Facilities handoff. Vehicle work remains Fleet.

### Source evidence for register review

- S1 uses `SYSTEM.md` §6 and §13, `lib/auth.ts`, `lib/permissions.ts` and `lib/security-policy.ts`.
- S2 uses `SYSTEM.md` §7.2–7.5 and §7.16.1, booking/rack/guest routes and protected occupant/room-assignment SQL.
- S3 uses `SYSTEM.md` §7.4, `lib/accounting.ts`, `lib/financial-route.ts` and migrations `20261103100000`, `20261103160000`, `20261104040000`.
- S4 uses `SYSTEM.md` §7.16, `lib/hotel-operations.ts` and migration `20261103150000`.
- S5 uses `SYSTEM.md` §7.15, inventory movement/PO routes and migrations `20261103080000`, `20261104030000`.
- S6 uses `SYSTEM.md` §7.11, `lib/transportation.ts` and the existing transportation transition routes.
- S7 uses `SYSTEM.md` §7.5–7.6, `lib/maintenance-operations.test.ts`, `lib/room-discrepancies.ts` and the maintenance/readiness functions.
- S8 uses `SYSTEM.md` §13, `lib/payment-proof.ts`, identity/proof routes and the private storage policies.

Source evidence describes current behavior or a locally verified candidate. Each
release retains its own app/schema/policy status. All rows await confirmation
from their authorized role representatives before the corresponding activation
or transfer.

## Current behavior and transition

Night Audit, operating-day controls and handover records exist. Unreleased local
occupant/guest-control/housekeeping additions must retain their acceptance and
deployment status; this document does not activate them.

Local procurement already has draft editing, submission, threshold approval,
Owner/Admin exception review, receiving and cancellation. Receiving updates hotel
stock; it does not establish supplier communication or enterprise goods receipt.
Transportation also has a local operational workflow. Keep both until a reviewed
handoff maps their states, open records, financial consequences and fallback rules.
Do not achieve separation by renaming tables or deleting working records.

Before cutover, each pair of teams must agree on stable external identifiers, which
fields each team may change, cancellation/correction handling, delayed messages,
reconciliation, support ownership and behavior during an outage. One record can
have references in multiple systems; add mappings for concrete integrations rather
than synchronization columns on every table. No cross-team direct table writes or
shared service-role credentials.

## Private document register

Platform owns the shared storage and recovery controls. Each originating domain
keeps the business record and authorizes access. The limits below are current
technical configuration, pending confirmation by the property and storage owners.

| Category | Domain and record link | Current access and controls | Retention approver and restore pair |
|---|---|---|---|
| Staged and submitted payment proofs, `payment-proofs` | Booking/Hotel Accounting. Staged path belongs to an active hold. The finalized payment references the retained path and upload metadata. | Guest owning the hold can stage JPEG, PNG or WebP up to 5 MiB. The server checks bytes at upload and confirmation. Submitted evidence is outside the staging deletion path. Paying guest or Accounting can request an audited 60-second preview. | Hotel Accounting + Privacy. Restore the storage objects and linked hold/payment metadata together. |
| Guest IDs, `guest-ids` | Front Desk. Each document belongs to a reservation and uploader. The review references the current document ID. | Front Desk receives an audited 60-second link. Bucket is private, JPEG/PNG/WebP up to 5 MiB. Current checkout contains a review route and no guest ID upload route. Replacement invalidates the earlier reservation approval and preserves the earlier row. | Front Desk lead + Privacy. Restore document bytes, rows, reviews and reservation state together. |
| Recovery selfies, `recovery-selfies` | Account Security. Recovery attempt and restricted audit link the selfie. | Token-bound upload, JPEG/PNG/WebP up to 5 MiB. Authorized security reviewers use a 60-second link through the recovery queue. | Account Security + Privacy. Restore restricted objects, recovery metadata and related access policy together. |
| Transfer destination QR, `payment-qr` | Owner/payment policy. The active policy references the object. | Owner-managed, private bucket, JPEG/PNG/WebP up to 5 MiB. Server reads the configured image for eligible booking flows. It is payment instructions rather than guest evidence. | Owner/payment policy lead. Restore the active config pointer and its bytes. |
| Room catalog photos, `room-photos` | Catalog. Room type photo records reference their objects. | Public room marketing photos, JPEG/PNG/WebP up to 5 MiB. Catalog authorization governs write access. | Catalog owner. Restore the images and catalog references. |
| Issued receipts, folios and invoices | Hotel Accounting. The immutable `financial_documents` row holds the issue-time snapshot, payment/folio link and number. | Authorized staff ledger; guest receipt delivery rechecks booking ownership and settled non-refund eligibility. Customer preview, download and email use the original issue-time details where a receipt was issued. | Hotel Accounting + Finance/Privacy. Restore source rows, document snapshots and numbering together. |

Private buckets have no direct public object policy in repository migrations.
Only room catalog photos have public storage reads. The proof and ID routes log
successful link issuance with actor, action and document reference. URLs and bytes
stay out of the audit trail. A link already issued is usable until it expires.
Supabase provider enforcement and object recovery require a separate rehearsal.

Retention periods, disposal authorization, backup coverage and legal-hold owner
acceptance are **Pending**. Proposed hold procedure for Task 23 is a restricted
register of protected records and object paths, an authorized owner to apply and
release holds, and a hold check before any disposal batch. The current application
has no general evidence-disposal job or legal-hold flag. Keep submitted evidence
and issued documents in place until the procedure and durations are approved.
The [Task 23 recovery worksheet](runbooks/enterprise-recovery.md) records the
restore procedure, missing approvals and cleanup paths to verify.

## First integration candidate

The proposed [enterprise workflows and partner readiness checklist](integrations/ENTERPRISE_CONTRACTS.md)
define the Finance, HR, SCM, Facilities and Fleet handoffs and reference the
Restaurant proposal. Written definitions do not supply pending role acceptance
or activate the corresponding connections.

Restaurant charge-to-room is the first candidate if its team can supply a sandbox
and agree on the contract in `integrations/RESTAURANT_CHARGE_TO_ROOM.md`. Until then,
Front Desk can use existing authorized manual folio charge posting. Proposed APIs
are not implemented or live merely because they are documented.

Use the existing financial calculations and server-owned posting dates. A restaurant
charge increases the folio obligation; it is not a second payment. Finance must agree
how POS revenue and Hotel settlement references are reconciled to avoid double
counting. Night Audit must not add room charges over an existing contracted obligation.

Reliable outgoing messages are built alongside an actual receiving system: save the
business change and event atomically, retry deliveries and deduplicate the receiving
effect. Track outcomes per destination when there is more than one recipient. An
event table without a sender, receiver and reconciliation is not an integration.

## Deferred until required

Group/corporate room blocks and OTA synchronization remain legitimate Hotel future
work, not prerequisites to representing seven modules. Stock issue and physical-count
operations already exist through `hms_stock_movement`. Additional transfers/returns,
lost property and pricing need confirmed property workflows.
Payroll, fleet dispatch, restaurant POS and a general ledger do not belong in this
hotel implementation batch.
