# System-wide Gemini assistance by account and module

**Canonical prototype and placement brief — right-edge layout approved, 2026-11-22.**
The capstone scope is AI
assistance for the **hotel management system as a whole**, not a feature
centered on Bookings or any other single module. This report maps the visible modules for all seven
staff accounts: five operational accounts in `config/role-navigation.ts` and
`components/manager/manager-dashboard-client.tsx`, plus the separate Owner and
System Administrator portals. The entries describe intended AI purposes; they
are not new permissions. The shared drawer and deliberate Gemini Ask path are
implemented locally across these staff placements. Stored event-driven AI
recommendations, selected-record context, and the automation below remain
proposals. Automatic approval requires a separate, reviewed eligibility policy
and implementation design. The Guest
portal already has a separate floating concierge; guest-facing coverage is
outside this staff map. **Follow this report for prototype placement, scenarios,
and review conditions.** [`AI_ASSISTANT_SPEC.md`](../AI_ASSISTANT_SPEC.md)
records the supporting AI operating boundaries; the separate
[`prototype-first engineering task breakdown`](plans/2026-11-22-system-wide-ai-prototype-first.md)
is subordinate to this report and can be revised after prototype review.
`SYSTEM.md` remains the authority for what the current system actually does.
Existing Reports permissions stay unchanged.

## Coverage recommendation

Build **one shared, server-side Gemini assistant available throughout every
authorized staff module**. It has two complementary interactions:

1. **Proactive module assistance:** When an authorized person opens a module,
   a compact right-edge HAVEN AI dock is already visible with the result state
   and a one-line preview of the latest stored recommendation. Its toggle opens
   the full assistance drawer **over** the module; the module's cards, filters,
   table, and detail do not resize or move. The drawer begins below the app
   header, and its toggle stays at the same upper-right height whether the
   drawer is open or closed. Align the toggle's top edge with the collapsed
   one-line guidance label below the module's top action buttons. Its X hides
   only that label for the current module visit; the toggle remains visible,
   and the label returns when the
   person leaves and opens that module again. The drawer shows current HAVEN
   facts and the stored recommendation. Opening the module, reopening it, or
   toggling the drawer does not call Gemini. Relevant new or changed hotel data
   triggers background analysis, so the toggle is only a display control.
2. **Manual Ask HAVEN AI:** Keep an explicit button for a complicated question,
   evidence comparison, exception preparation, or follow-up explanation. It
   uses the open module or selected record as context and may answer general
   hotel-management questions using only records authorized for that account.
   It is not the trigger for routine assistance or automatic approvals.

This is **one AI capability with system-wide reach**, not a different Gemini
agent or model for each module. A module without a special workflow question
still has access to the general assistant and can supply its current context.
The tables describe useful module-specific prompts and recommendations so that
the assistant does more than repeat a generic summary. The existing Manager
HAVEN AI page can remain a dedicated full workspace in addition to the shared
entry point.

| Staff account | Visible module entries covered |
|---|---:|
| Front Desk | 17 |
| Housekeeping | 8 |
| Maintenance | 6 |
| Accounting | 13 |
| Manager | 20 |
| Owner | 16 |
| System Administrator | 14 |
| **Total** | **94 account/module entries** |

## How the assistance should work

Show the proactive dock throughout staff modules, with its full drawer on the
right edge of the workspace. When the person
selects a booking, task, work order, payment, approval, or claim, that record
becomes the assistant's current context. Recommendations name their purpose,
use only the account's permitted records, cite the HAVEN source or forecast
basis, and point to the ordinary workflow. Manual Ask HAVEN AI also answers
general questions when no record is selected. Gemini may extract permitted
document details, cross-check them against authorized HAVEN records, and
prepare a structured recommendation or proposed action.
HAVEN establishes eligibility and missing requirements from current records;
the server alone executes an allowed action after its role, policy, and state
checks. Only the narrowly defined routine cases below are candidates for
automatic approval. Predictions come from HAVEN analytics and are labeled
separately from recorded facts.

## When assistance runs and what appears

| Trigger | Proposed behavior | Staff view |
|---|---|---|
| **Module opens** | Load current role-scoped HAVEN facts and any stored recommendation. Do not call Gemini on open, even if the stored result is absent or stale. | Show the right-edge dock immediately with the result state and one-line stored-guidance preview. The full facts, source, and analysis time appear in the toggleable overlay drawer. |
| **Selected record changes** | Load that authorized record's stored analysis without calling Gemini. Discard a late result for a record the person has left. | Update the dock preview and, if open, the drawer for the selected record, with source links and a visible analysis time. |
| **Person toggles the AI drawer** | Open or close the stored context display. Do not call Gemini or change an operational record. | The drawer overlays the right side of the module without shifting its contents. The edge toggle remains available to close it; Escape also closes it. |
| **Relevant data changes** | A server-side event creates or refreshes only affected record analysis and genuinely affected module summaries. Coalesce repeated events and enforce usage limits. | The open module receives the new result; a closed module shows it when next opened. |
| **Guest Request batch is filed** | Evaluate the proposed routine auto-approval workflow when booking confirmation auto-files selected requests or a guest submits a later batch, independently of whether Front Desk has opened the module. A booking-form selection alone is not a trigger. | Front Desk sees either an attributed auto-approval or a pending batch requiring staff review. |
| **Person clicks Ask HAVEN AI** | Start a role-scoped conversation or detailed analysis for a complex case. | Show the answer as AI assistance; any staff-confirmed action remains attributed to that employee. |

If Gemini is unavailable, the dock and drawer still show authoritative HAVEN facts and
marks the AI recommendation unavailable or stale. An uncertain or failed
automatic-approval attempt leaves the batch pending for Front Desk; it never
becomes approved because someone opened a screen. Keep the collapsed dock compact;
opening the drawer temporarily covers part of the module but never changes its
layout or position. Generate an initial baseline in a
server-side job; do not use first page open as a hidden provider trigger. See
the trigger and fallback contract in
[`AI_ASSISTANT_SPEC.md`](../AI_ASSISTANT_SPEC.md).

## Proposed bounded automation (Option 3 — for review)

The assistant remains general across staff modules, but **automation is
approved per workflow**, not granted globally to Gemini. The three levels can
coexist: (1) extract, compare, and draft; (2) recommend an action for the
authorized employee to confirm; and (3) automatically execute an allowlisted,
low-risk action when every deterministic HAVEN rule passes. A model's wording
or confidence alone cannot approve a record. Gemini can request an action;
HAVEN's server decides whether to perform it and records what happened.

| Proposed use | Gemini's contribution | HAVEN decision and result |
|---|---|---|
| **First automatic approval candidate: routine Guest Requests** | Classify a submitted batch, explain the request types, and compare it with the booking, active catalog, stock, and queue facts visible to Front Desk. | Auto-approve and route the **whole batch** only if every included request is explicitly allowlisted as routine, the booking and request are eligible, the request is not duplicated or escalated, required stock is available, and no charge or exception is involved. Send every uncertain or failed case to Front Desk for review. Never auto-reject. Existing departmental routing then creates the work. |
| **Other low-risk automation candidates** | Prepare source-linked handover and report drafts, maintenance/housekeeping triage suggestions, inventory shortage alerts, and missing-configuration checklists in the relevant modules. | HAVEN may save a clearly labeled draft or alert under a separately approved workflow. Staff remain responsible for submitting reports, closing work, changing stock, or saving configuration. These are candidates, not blanket permission to alter records. |
| **Document review in authorized modules** | Read a permitted image or PDF, extract fields, compare them with a reservation, claim, or payment record, and flag missing or conflicting evidence. | Staff see the source and differences before making sensitive decisions. Document extraction does not prove authenticity or grant access to restricted identity/payment files. QR code scanning remains HAVEN's separate QR workflow. |

For a capstone demonstration, an allowlisted, no-charge housekeeping request
could move from guest submission to AI classification, HAVEN cross-checks,
automatic whole-batch approval, departmental routing, and an audit entry.
A mixed, charged, escalated, or uncertain batch would remain in Front Desk's
review queue. This shows a real approval outcome without giving Gemini a
general power to approve hotel operations.

The Manager's catalog switch governs **guest visibility**, not automatic
approval. Pre-arrival amenities additionally require the booking-specific
flag, inventory link, and positive stock; structured service choices are
separate. A second, versioned policy must determine which visible request
types may be auto-approved. Disabling a type hides future selection, preserves
existing requests, and prevents pending batches of that type from automatic
approval. The current Request Types menu is Manager-only, while generic
catalog API access also permits Owner/Admin; reconcile this if Manager-only
control is required for all fields.

For **Manager exceptions**, propose AI cross-examination and a short decision
brief for every case. A later automatic candidate could be a hotel-caused
room-type substitution with an exact eligible alternative room, no guest
charge or compensation, and fresh room/booking checks. If no eligible room
exists anywhere, the assistant proposes alternatives for Manager review; it
cannot approve an impossible room assignment. Automatic exception approval
requires a separate policy owner, financial ceiling, disable switch,
correction path, observation-only trial, and explicit authority change.

The first automatic approval candidate changes the present Guest Requests
rule: `SYSTEM.md` currently assigns **whole-batch approval to Front Desk**.
Implementation would therefore require an explicit policy and server/RPC
change, an AI-automation actor in the audit trail, and an update to `SYSTEM.md`
after that change is verified. Until then, Front Desk continues to approve or
reject every batch. This report does not authorize an AI call to use Front
Desk credentials or bypass that role's existing workflow.

For any automatic action, define an exact request-type allowlist and policy
version; recheck current eligibility, record version, inventory, and duplicate
status in the executing transaction; make retries idempotent; record the
model proposal, decisive HAVEN facts, policy result, and actor; and fall back
to the staff queue on missing data, conflicts, or provider failure. The first
Guest Request auto-approval must not silently change a price, collect money,
consume stock, or perform an exception. Any later exception automation needs
its own reviewed policy and audit path.

Analyze **one filed customer batch**, not the whole Guest Requests module, for
an approval decision. Booking selections become eligible only after the
confirmed reservation auto-files them; later guest submissions are separate
batches. If Front Desk approves while AI is analyzing, discard the late AI
proposal. If automation approves first, a stale staff click must report that
the batch was already reviewed. One guarded, locked decision and one audit
outcome must win. A module-wide summary may update from the new records but
cannot itself approve a request. Provide a disable switch and an audited
correction path for an incorrect automatic approval.

Make the decision source visible in both the operational table and its audit
detail. A human approval reads **“Approved by [staff member]”**; a human
confirmation after Gemini advice reads **“Approved by [staff member] · AI
assisted”**; and an automatic routine approval reads **“Auto-approved by HAVEN
AI”** with the policy checks, timestamp, and audit reference available on
inspection. Never assign an automatic decision to whichever employee is logged
in. The proposed data contract records an explicit approval source and a
separate automation/audit reference; a free-text note alone is insufficient.
Stripe-confirmed payment status has its own source label, not an AI approval.

**Outside the first automatic approval set:** payment verification, identity
verification, refunds, check-in, and Lost & Found item release. Manager/Owner
exceptions remain staff-reviewed in that first set; the narrow operational
candidate above is a later proposal. Financial posting, room release, and
security or permission changes also remain staff-controlled. Gemini may prepare evidence and a
recommendation for these workflows, subject to each account's data access.
The planned **Stripe** integration is a separate payment-authority path:
HAVEN should reconcile verified Stripe events with its own payment and booking
records; Gemini's interpretation of an uploaded screenshot is not payment
confirmation. Stripe integration and any later change to deposit verification
need their own design and review.

In the first AI implementation, send only structured, role-authorized HAVEN
facts for request and exception analysis. The prototype uses fictional data
and documents. Real document scanning needs a separate role, field,
minimization, retention, and review contract; existing payment proof is for
the paying guest and Accounting, not Gemini. Extraction never establishes
identity or payment authenticity.

The current local code already has limited, on-demand summary cards on the
Front Desk dashboard and in Housekeeping, Maintenance, Transactions/Accounting,
Inventory, Guest Requests, and Lost & Found. It **does not** yet provide the
proactive, system-wide staff dock/drawer or all contextual purposes below. These
local cards still require a Generate click and make no automatic provider
calls. The existing
general Ask HAVEN API currently permits Manager/Owner/Admin, the Manager has a
HAVEN AI workspace, and the Guest portal has its separate concierge. No
proposed staff coverage below is implemented merely because it appears in this
report. Automatic approval, document review, and Stripe integration are not
implemented by this report.

## Prototype brief and review gate

Review placement on the **existing local module layouts** before changing
Gemini routes, the database, or approval processes. The launcher at
`public/prototypes/haven-ai-system-preview.html` opens the real staff workspace;
sign in as each of the seven staff accounts to inspect its authorized modules.
The preview-only right-edge drawer uses sample wording from this report for the
staff account/module entries. It overlays current cards, filters, tables, and
details without replacing or moving them, and does not call Gemini or analyze
a guest record. The Guest link opens the real Guest
portal and its existing separate concierge. It does not grant the Guest a staff
AI drawer or staff authority. The scripted scenario requirements below remain
reference material for workflow discussion; invented module layouts must not
be treated as the placement design.

| Prototype scene | Required behavior to review |
|---|---|
| Front Desk Bookings | The right-edge AI dock immediately previews reservation readiness; its overlay drawer shows room and QR context, source-linked blockers, and the retained Ask HAVEN AI button. It cannot perform check-in. |
| Front Desk Guest Requests and Manager Request Types | Demonstrate Manager on/off guest visibility separately from automatic-approval eligibility, booking-confirmation and later-submission batches, pending/mixed/auto-approved/human-approved states, and the decision-source label. A disabled item disappears from future guest choices but does not erase submitted work. |
| Manager Approvals & Escalations | Show an AI cross-examination brief for all exception types, a hotel-caused room-type substitution with an exact eligible alternative, and a fully booked case that stays with Manager because no room can be assigned. Mark any later automatic exception example as proposed, not currently authorized. |
| Housekeeping, Maintenance, Accounting, and Lost & Found | Show the different module purposes from the account tables, the right role scope, a selected-record change, and ordinary staff authority for completion, payment verification, and item release. |
| Owner and System Administrator | Show the permitted oversight context without a duplicated assistant or cross-role operational authority. The Manager HAVEN AI page remains its dedicated general workspace. |
| Guest account | Show the guest's own booking, visible additional-request choices, submitted request status, and separate guest concierge. Carry a fictional submitted request into the Front Desk queue and show that Manager catalog visibility affects future guest choices without deleting history. |

For placement review, show sample current, stale, absent, and provider-unavailable
AI states and a scope refusal for personal requests such as code generation.
Switching modules or opening the drawer must **not** simulate a Gemini call.
The drawer's content is fictional and must never claim to analyze the local
app's displayed records. Existing local module controls and data remain the
current app; a visual reviewer should avoid treating them as scripted demo
actions. Before live automation implementation, review the representative
workflow scenes above with fictional fixtures and source/decision attribution.
Inspect desktop and phone widths, both themes, keyboard/focus behavior, and
dock/drawer placement alongside each module's metrics, filters, table, and primary action.
Review the right-edge toggle near the top of the module workspace. It must
remain near the header when closed; opening the drawer must keep it at that
height, start the drawer below the header, and overlay rather than reflow the
underlying content. The toggle and collapsed guidance label must sit at the
same height below the module's primary action row. The label has its own close
button and returns on a later visit to that module without moving the toggle.
At phone width, keep the pair side by side below any stacked primary actions.
The user reviews the prototype and requests placement, arrangement, or format
changes before any live AI implementation begins.

## Grounding, privacy, and usage conditions

- Build role-scoped context on the server from the same authoritative HAVEN
  records used by the module. Do not let a selected record ID or user question
  expand the account's permissions. Housekeeping sees only its routed work;
  Accounting-only financial facts and restricted proof stay out of other roles.
  Front Desk room-readiness facts must exclude rooms held for confirmed
  arrivals or blocked by maintenance, matching the shared room board.
- Gemini may select permitted fact and action IDs, but server-owned labels,
  quantities, source links, and allowlisted next steps form operational claims.
  Reject invented figures, unsupported recommendations, empty/unknown IDs,
  and responses outside the module's purpose. Label forecast basis and limits.
- Restrict manual Ask HAVEN AI to authorized hotel tasks. Refuse personal use,
  code/SQL generation, bulk export, secrets, and prompt instructions embedded
  in guest notes or documents. Do not send guest-identifying free-text
  questions to Gemini. Use explicit tools and a checked output schema, not a
  prompt alone, to enforce the boundary.
- Enforce durable per-user, per-module, and hotel-wide usage limits, concurrency
  limits, and event deduplication **before** provider calls. Reserve usage
  atomically so concurrent calls cannot exceed the cap. Keep interaction
  metadata and refusal reason codes for audit without storing raw prompts,
  responses, or documents. A provider outage must leave facts and ordinary
  hotel workflows usable and never convert an uncertain case to approval.

## Front Desk account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Shift priorities | Connect today's arrivals, departures, room readiness, and unresolved guest work into a short starting list. |
| Hotel Operations | Close readiness | Explain recorded blockers and handover items before the operator reviews the hotel day. |
| Room Management | Room choice guidance | Explain why a room is ready, held, dirty, or blocked; suggest eligible rooms using HAVEN's authoritative availability result. |
| **Bookings** | **Booking process guide** | **Walk the operator through reservation status, required identity and deposit checks, room readiness, and QR check-in context; point to the next authorized step without performing check-in.** |
| Guest Management | Stay context | Summarize relevant stay history, preferences, and flags visible to Front Desk before service; do not send contact or identity details to Gemini. |
| Guest Requests | Request triage and bounded approval candidate | Classify and cross-check a submitted batch. Under the proposed policy above, HAVEN could auto-approve an entirely eligible routine batch; Front Desk reviews all other batches and remains the current approver until implementation. |
| Transportation | Dispatch preparation | Flag pickup timing, itinerary, and vehicle conflicts that could affect an arrival; staff confirms the dispatch. |
| Approvals & Escalations | Exception preparation | Explain the applicable rule and missing evidence before Front Desk files or executes an approved exception. |
| Housekeeping | Arrival turnover watch | Highlight cleaning or inspection work that may delay a booked arrival; Housekeeping retains task authority. |
| Reports | Daily report explanation | Turn the generated daily snapshot into a source-linked narrative and identify incomplete sections before submission. |
| Billing | Folio explanation | Explain booked stay, charges, recorded payments, and remaining balance to support an authorized collection conversation. |
| Transactions | Payment status explanation | Distinguish submitted, verified, settled, and refunded activity; identify the source record for follow-up. |
| Deposit Verification | Read-only readiness | Explain that a booking is waiting for Accounting review and what Front Desk can do next, without viewing proof or verifying it. |
| Cash & Shifts | Drawer close checklist | Explain expected cash, recorded count, and any variance or unresolved step before the human closes a shift. |
| Financial Documents | Document readiness | Explain when a receipt or statement can be issued and which settled payment or folio it would represent. |
| Operational Handover | Source-linked handover draft | Suggest a concise carry-forward note from unresolved Front Desk items; staff edits and submits it. |
| Lost & Found | Claim readiness check | Show custody stage and missing claim or handover checks; never assert ownership or release an item. |

## Housekeeping account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Room-care priorities | Rank recorded turnover, stayover, and inspection work by due time and upcoming arrival. |
| Hotel Operations | Department blockers | Explain Housekeeping work that may affect readiness or the next shift's handover. |
| Guest Requests | Routed work guidance | Summarize only requests approved and routed to Housekeeping, with the next permitted fulfillment step. |
| Approvals & Escalations | Exception request preparation | Explain what evidence is needed when Housekeeping asks Manager for an exception. |
| Housekeeping | Cleaning and inspection guide | Suggest the next room task from due times, assigned work, and readiness state; the cleaner records actual completion. |
| Inventory | Supply watch | Flag low or predicted-shortage supplies relevant to room care using recorded stock and HAVEN forecasts. |
| Operational Handover | Room-care carry-forward | Draft unresolved room and inspection notes with source links for staff review. |
| Lost & Found | Custody checklist | Remind staff to record finding, storage, and handover stages without exposing claimant notes. |

## Maintenance account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Repair priorities | Surface urgent orders and rooms blocked from service using the current work queue. |
| Hotel Operations | Serviceability handover | Explain which unresolved faults affect operations and need a next-shift owner. |
| Approvals & Escalations | Exception request preparation | Summarize the policy reason and source evidence for a Manager request. |
| Maintenance | Work-order guidance | Relate severity, prior incidents, room impact, and required checks; suggest investigation steps without diagnosing or closing an order. |
| Inventory | Parts availability | Show stock or predicted shortages for parts linked to open work, with source and data-quality labels. |
| Operational Handover | Repair carry-forward | Suggest an ETA and unresolved-work note from recorded orders for staff to verify and submit. |

## Accounting account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Financial queue priorities | Summarize pending verifications, refunds, balances, and shift variances without making decisions. |
| Hotel Operations | Financial close blockers | Explain only the Accounting items preventing a clean operating-day close. |
| Bookings | Payment readiness | Explain the payment and refund status attached to a booking; do not suggest Front Desk check-in actions. |
| Approvals & Escalations | Financial exception guidance | Explain an approved exception's permitted financial execution path and source evidence. |
| Reports | Financial narrative | Explain collections, outstanding balances, and exceptions from the authorized report snapshot. |
| Billing | Folio reconciliation | Trace the booked stay, charges, corrections, applied payments, and balance to help identify a discrepancy. |
| Transactions | Transaction investigation | Highlight unusual or unmatched ledger activity and show the records an accountant should inspect. |
| Deposit Verification | Verification checklist | Compare permitted proof metadata or a future Stripe-confirmed payment event with the booking obligation and identify missing evidence; Accounting retains deposit verification in the first automation set. |
| Refunds | Refund policy explanation | Explain the policy amount, approved exception if any, and payout preconditions before staff processes the refund. |
| Cash & Shifts | Cash variance explanation | Relate drawer movements and the saved physical count; require human recount or review where needed. |
| Reconciliation | Difference investigation | Group the ledger entries behind a variance and suggest which source documents to compare. |
| Financial Documents | Receipt/statement basis | Explain the settled-payment or unchanged-folio rule and point to the source of an issued document. |
| Operational Handover | Finance carry-forward | Suggest a source-linked note for unresolved verifications, refunds, and variances. |

## Manager account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Hotel priorities | Connect operational risks, room readiness, service queues, and forecasts into a review list. |
| Hotel Operations | Cross-team coordination | Explain close blockers and handover ownership across permitted departments. |
| Room Management | Availability overview | Explain ready versus blocked room capacity and its effect on near-term bookings. |
| Bookings | Booking bottleneck review | Identify reservations waiting on room, service, or exception work; Manager reviews, Front Desk executes. |
| Guest Management | Service trend review | Summarize permitted guest-service patterns without exposing identity details to Gemini. |
| Guest Requests | Backlog and escalation | Explain aging or escalated requests and the department responsible for the next step. |
| Transportation | Dispatch exception review | Flag timing, capacity, or cancellation cases that need coordination. |
| Approvals & Escalations | Decision brief | Present the normal policy, submitted evidence, and operational impact; Manager alone decides. |
| Housekeeping | Turnover capacity | Connect task load, inspections, arrivals, and HAVEN's workload forecast. |
| Maintenance | Repeat-issue review | Explain urgent orders and HAVEN's recurrence-risk classification without predicting a failure date. |
| Inventory | Replenishment outlook | Explain current low stock separately from HAVEN's predicted consumption and shortage. |
| Reports | Performance explanation | Summarize authoritative daily reports and flag changes or data-quality gaps. |
| Operational Handover | Ownership review | Group unresolved items by department, age, and owner for Manager follow-up. |
| Lost & Found | Custody oversight | Flag aging claims, incomplete chain of custody, and release-readiness gaps without deciding ownership. |
| Staff & Duty | Workload balance | Suggest where recorded duty or task load is uneven; Manager controls assignments. |
| Room Types & Photos | Catalog and rate review | Check missing content and explain HAVEN's demand-based price recommendation before a rate proposal. |
| Transfer Vehicles | Fleet coverage | Compare recorded vehicle capacity and trip demand before Manager changes availability. |
| Request Types | Routing review | Identify request categories with repeated rerouting or missing department coverage; Manager edits the catalog. |
| Predictive Insights | Forecast explanation | Explain model factors, observation counts, and fact-versus-prediction labels without recomputing a forecast. |
| HAVEN AI | Existing general assistant | Keep cross-module questions here; contextual assistants above should also work within their own modules. |

## Owner account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Executive brief | Explain current hotel performance, open risks, and forecast quality from authorized summaries. |
| Executive Operations | Cross-department outlook | Connect occupancy, room readiness, and unresolved service work for executive oversight. |
| Financial Overview | Financial trend explanation | Explain recorded revenue, collections, and balances alongside authorized trends. |
| Departments | Department performance context | Summarize workload and unresolved issues by department without directing staff actions. |
| Admin Governance | Governance oversight | Explain account and configuration exceptions that need Owner review, using sanitized metadata. |
| Roles & Permissions | Authority explanation | Explain which role can perform a hotel action and why, based on the fixed capability catalogue. |
| Critical Policies | Policy impact explanation | Describe how a proposed policy setting affects booking or operations before a human changes it. |
| Payment Settings | Destination review | Explain enabled payment routes and configuration completeness without giving Gemini account numbers or secrets. |
| Owner Exceptions | Exception decision brief | Present the policy, source evidence, and business impact; the Owner makes the decision. |
| Room Types & Photos | Catalog and rate oversight | Explain room-type completeness and HAVEN's demand-based rate basis before an Owner decision. |
| Transfer Vehicles | Fleet configuration overview | Highlight capacity or coverage gaps from approved vehicle records. |
| Location & Places | Public content review | Identify missing or inconsistent hotel-location content before publication. |
| Transportation | Service trend explanation | Summarize transfer demand, exceptions, and fulfillment outcomes at the Owner's read scope. |
| System Audit | Change explanation | Explain sanitized patterns in recorded governance changes without exposing raw sensitive events. |
| Security Events | Security trend explanation | Summarize event categories and trends, leaving investigation and access decisions to authorized people. |
| Executive Reports | Performance narrative | Explain authoritative report results and labeled forecasts for executive planning. |

## System Administrator account

| Module | AI purpose | Brief description of the help |
|---|---|---|
| Dashboard | Administration brief | Summarize system health, account queues, and configuration issues visible to Admin. |
| Users & Staff | Account workflow guide | Explain lifecycle steps and missing requirements without sending identity or recovery data to Gemini. |
| Roles & Permissions | Capability reference | Answer which role has a capability from the fixed catalogue; do not change access. |
| Room Configuration | Configuration check | Flag inconsistent room setup while leaving operational room status to the responsible department. |
| Room Types | Catalog check | Explain inactive or incomplete type configuration and the effect of proposed changes. |
| Transfer Vehicles | Vehicle configuration check | Identify missing or conflicting vehicle setup fields before an Admin saves changes. |
| Location & Places | Content validation | Explain incomplete public location and nearby-place configuration. |
| Hotel Policies | Policy change explanation | Summarize the effect and dependencies of a proposed policy value before approval and save. |
| Audit Logs | Audit summary | Group sanitized administrative change events by type and time; keep raw identities and secrets out of model context. |
| Security events | Event pattern summary | Explain authentication or session event patterns from safe aggregates; do not take security actions. |
| Security Configuration | Setting explanation | Describe session and OTP setting effects without receiving keys, tokens, or secret values. |
| Password reset audit | Recovery trend summary | Explain counts and failure categories; never receive recovery links or tokens. |
| Admin Reports | Governance narrative | Summarize account distribution, configuration status, and documented exceptions. |
| System Health | Diagnostic explanation | Interpret probe failures and migration status from safe server facts; an Admin chooses any repair. |

## System-wide implementation and acceptance

1. Build and review the scripted prototype in the **Prototype brief and review
   gate** above. Treat that reviewed placement and wording as the gate before
   any live AI, database, or approval change.
2. Establish the shared AI capability and one role-enforced server tool policy.
   Show a proactive dock and overlay drawer in each authorized module while retaining Ask HAVEN AI
   for complex questions and general Q&A.
3. Give each module an explicit context adapter and purpose from the tables.
   A selected record can sharpen the answer, but no module loses general AI
   access. Build adapters in engineering batches; **system-wide coverage is
   the target**, rather than one highlighted module defining the capstone.
4. Audit the 94 staff account/module entries against the live navigation and
   permission gates. For every entry, verify immediate HAVEN facts, a clearly
   timestamped current, stale, or absent AI result, no provider call on module
   open or record selection, event-driven refresh of affected context, a
   manual Ask HAVEN AI path, and no retrieval of another role's restricted
   records. Deduplicate events and reject late results for a prior record.
   The Manager's existing HAVEN AI page is counted as the dedicated general
   workspace, not a second AI nested inside itself.
5. Specify and review the first routine Guest Requests allowlist, whole-batch
   policy, event trigger when a batch is filed, fallback queue, audit actor,
   and current-state checks before any write-capable AI tool is added. Reconcile
   the proposed rule with the existing Front Desk-only approval RPC and
   `SYSTEM.md`. Verify the table label and audit source distinguish human,
   AI-assisted human, automated, and Stripe-sourced outcomes. Test the staff/
   automation race, disable switch, and audited correction. Keep the excluded
   sensitive actions staff-confirmed.
6. Prepare all Manager exceptions with source-linked AI briefs. Review any
   narrow automatic exception candidate separately, observe proposed outcomes
   against human decisions before enabling writes, and retain Manager review
   for impossible, financial, high-risk, or Owner-escalated cases.
7. Run an **observation-only trial** before enabling any automatic approval:
   log what AI and HAVEN policy *would* decide without changing approval
   status. Compare with Front Desk/Manager decisions on routine, mixed,
   disabled-catalog, insufficient-stock, stale-record, occupied/blocked-room,
   fully booked, and provider-failure cases. Review disagreements and false
   approvals, time saved, latency, and model usage. Model confidence alone is
   not an acceptance threshold.
8. Verify connected workflows end to end: reservation and QR check-in context,
   room readiness, Housekeeping, Maintenance, finance, Lost & Found, Manager
   approvals, Owner governance, and Admin configuration. A provider outage
   must leave all ordinary hotel operations available.
9. Before release, run targeted behavioral tests, touched-file ESLint,
   `npm run typecheck`, full `npm test`, and `npm run build` on the supported
   Node version; inspect role boundaries and desktop/mobile behavior with a
   real Gemini staging call. Reconcile the hosted migration ledger, rehearse
   additive migrations, and use `supabase db push` only after the normal
   release review. Update `SYSTEM.md` after verified runtime changes.

Each placement needs a precise role-and-data contract. The existing summary
cards can be reused where their facts are correct, but they do not establish
coverage by themselves. Test permission boundaries and source facts for each
module, then verify live Gemini and browser behavior in an authorized test
environment. The hosted AI migration is still unapplied. Guest-facing AI is
already presented through the separate concierge and should be audited as its
own surface before making a whole-product availability claim.

Technical references for the proposed integration boundaries: [Gemini document
understanding](https://ai.google.dev/gemini-api/docs/document-processing),
[Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling),
and [Stripe webhook events](https://docs.stripe.com/webhooks).
