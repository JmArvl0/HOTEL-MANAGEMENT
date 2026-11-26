# Haven module inventory and individual audit

Reviewed against the local tree on 23 November 2026. Findings use the IDs in the [product audit](2026-11-23-haven-product-audit.md). Statuses reflect the repository and the sourced checks described there. Each profile includes frontend states and polish, backend validation and authority, database, workflow, and gaps. Individual screenshots, physical devices, hosted services and every record permutation have separate acceptance work.

## Master audit table

| Module | Frontend | UX | Backend | Logic | Security and authority | Priority |
|---|---|---|---|---|---|---|
| 01 Authentication and recovery | Shared auth shell | Clear sign-in, recovery handoff | Credentials, OTP, sessions | Versioned invalidation | Dependency and hosted OTP checks | P1 |
| 02 Public site and CMS | Cohesive guest branding | Browse to availability | Stored public settings and media | Published content contract | Image stack release gate | P0 |
| 03 Online booking | Guided guest steps | Holds/payment states exposed | Exact availability and verified payment | Parallel allocation guarded | Owned holds, signed callbacks | P0 for live payments |
| 04 Guest portal | Stay and activity views | Contextual actions | Owned financial, request and travel reads | Old records require truthful availability | Guest record ownership | P2 |
| 05 Front Desk bookings and walk-ins | Queues and shared form | Search and task entry need scale check | Idempotent staff creation | Balance fallback corrected | Front Desk writes | P1 |
| 06 Arrival, ID and QR | Readiness and scan | Assisted identity and room step | Shared gates and token revocation | Age/presence controls | Protected ID evidence | P1 release |
| 07 Room Rack and physical rooms | Two card sizes and status | Date and room triage | Shared rack and room detail | Color regression and readiness truth | Department field scopes | P1 |
| 08 Rates, room types, fees and amenities | Catalog and proposals | Config and sellable inventory need separation | Versioned prices and owner approval | Preserved quote terms | Manager proposes, Owner/Admin govern | P2 |
| 09 Guest profiles, loyalty and flags | Profiles and duplicates | Charge/account history linkage | Guarded edit and merge | Reviewed identity evidence | Manager/Owner/Front Desk scopes | P1 |
| 10 Stay changes and departure | Dossier and exception UI | End-of-stay actions distributed | Transactional move/extend/checkout | Holds, balance, turnover | Maker/reviewer/executor split | P1 |
| 11 Requests and approvals | Role inboxes | Filing to execution status | Typed routing and audited decisions | Department and source binding | Matched local SQL change | P1 release |
| 12 Housekeeping | Work queue and inspection | Source-linked work | Protected state transitions | Checkout, cleaning, inspection | Department and assignee | P2 |
| 13 Maintenance and Facilities | Operational incident queue | Distinguish repair and release | Linked work and blocking RPCs | Unsafe stays and inspection | Legacy asset changes retired | P1 partner cutover |
| 14 Folios, payments, refunds and documents | Scoped Folio and PDFs | Payment, payout and document lifecycle | Immutable money records | Provider confirmation and issue-time totals | Separate guest and ledger grants | P0 for live payments |
| 15 Cash, handover and operating close | Drawer lifecycle and day checklist | Separate shift and day close | Locked close and report snapshots | Existing Accounting dependency | Scoped drawer and reconciler | P1 |
| 16 Admin, Owner and audit logs | Role-specific portals | Review vs execution | Account versions, media/policy ops | Protected grants and log history | Explicit access owner required | P1 |
| 17 Hotel Supplies and SCM | Count/use/receiving boards | Legacy deliveries distinguished | Idempotent movements | Source authority handoff | Receive scope; new procurement retired | P1 |
| 18 Staff & Duty and Workforce | Readiness view and handovers | Hotel task assignment distinct | Signed availability adapter | Expiry and shift windows | HR feed cannot grant Hotel roles | P1 |
| 19 Guest transportation and Fleet | Booking/guest trip and desk queue | Status and fare provenance | Scoped dispatcher integration | Terminal and fare reconciliation | Partner/guest data minimization | P1 |
| 20 Breakfast and Restaurant | Catalog and dated passes | Guest proof and staff redemption | Replay-safe redemption | Frozen entitlement and charge | Separate outlet audience | P1 partner cutover |
| 21 Operational exports | Saved report and PDFs | Clear saved vs preview | Persisted review lineage | Snapshot/payment source scopes | Desk prepares, Manager reviews | P2 |
| 22 Analytical and predictive reports | Period reports and forecast views | Context/baseline available | Snapshot jobs and model versions | Accuracy depends on coverage | Manager/Owner analytical views | P2 |
| 23 Notifications, reminders and AI | Bell, inbox and advisory panels | Link to operator next action | Durable guest records and cron | Versioned, read/unread | Scoped inputs and provider boundaries | P2 |
| 24 Lost & Found and emergency register | Custody, claim and register | Confirmation before release | Guarded lifecycle | Care with guest identity | Claim details and print scope | P2 |
| 25 Delivery, configuration and system health | Health surfaces and docs | Release identity can be clearer | CI build, SQL and integrations | Migration/application parity | Package, key and environment gates | P1 |

## Module audits

### 01 Authentication and account recovery

**Purpose and users.** Guests and eight role accounts share credentials and verification. Admin/Owner govern staff account availability. **Current implementation.** `lib/auth.ts`, `lib/customer-auth.ts`, `app/api/auth/otp/`, `app/api/password-reset/`, and `app/api/recover/`.

**Frontend and polish.** Separate authentication and recovery outcomes use shared Haven controls, email/password autocomplete and dedicated verification. Make expired session, network failure and invalid code distinct. Focus the next actionable field after resend or error. **Backend and database.** The pending session is disabled and lacks an authenticated actor. Version changes invalidate active sessions. OTP attempts, reset and encrypted delivery paths have separate controls. Review the explicit read/write capabilities on every legacy manual guard before consolidating it. **Workflow.** Credentials → verification when required → active session → deliberate expiry, suspension or role change. **Gap and priority.** P1 for hosted OTP, successful-login audit evidence and independent recovery checks. A08 for the mail dependency. Run one password-only, one OTP login, one recovery, one role change and one expiry per release.

### 02 Public site, media, location and CMS

**Purpose and users.** Prospective guests research the property. Authorized staff maintain listing copy, location and images. **Current implementation.** `app/(landing-page)/`, `app/api/website/`, `app/api/location/`, and `app/api/admin/website/`.

**Frontend and polish.** Preserve the narrow-screen search CTA, branded editorial treatments and meaningful alt text. Prove bookable, unavailable and no-photo states on real catalog records. Keyboard-check the gallery and booking link. **Backend and database.** Published website and location state are read separately from update and image upload. Check that replaced assets can be traced to the published content version and retained policy. **Workflow.** View amenities or a room → set dates → check availability. **Gap and priority.** P0 dependency exposure at A01 and high in A08. P2 UI for loading, crop consistency and physical-phone verification. Avoid opening unbounded image inputs or surfacing incomplete unpublished content.

### 03 Online booking, holds and payment confirmation

**Purpose and users.** Guests select a sellable room, verify their booking and obtain confirmation. **Current implementation.** `app/(booking)/booking/`, `app/api/booking/`, `lib/booking.ts`, and `lib/xendit.ts`.

**Frontend and polish.** Keep dates, party, exact room type, deposit and outstanding amounts visible through checkout. The page distinguishes cancellation and a returning pending checkout. Rehearse refresh, interrupted payment and small-screen selection with network throttled. **Backend and database.** Server quote, room availability, expiry, pricing and payment status precede confirmation. Provider callbacks and attempt replay must agree with the saved hold. Never ledger a payment based on a browser redirect. **Workflow.** Quote → sign in → hold → payment attempt → verified status → confirmation and document. **Gap and priority.** A02 P0 for real-money rollout. Later evaluate waitlist or corporate booking only with an operational owner. Preserve current collision protections.

### 04 Guest portal and reservation self-service

**Purpose and users.** Guests manage their own current and historical stay, rates, receipts, requests, preferences and review. **Current implementation.** `app/(booking)/(customer)/`, `lib/customer.ts`, `components/customer/reservation-detail-view.tsx`.

**Frontend and polish.** Lead with the next stay action, booking reference, dates and balance. In the Folio tab expose whether a checkout statement has been issued. Keep loading and unavailable text in the relevant tab and avoid an apparently empty account on a source error. **Backend and database.** Reservation ownership protects detail, receipts and PDF routes. Older snapshot and missing invoice cases differ from true settlement. **Workflow.** Sign in → current/upcoming/past → selected booking → payment, change request, cancellation or issue-specific action. **Gap and priority.** P2 for a consistent no-upcoming-stay state and issuance discoverability. P1 if guest can be told settled without authoritative evidence. Contract-test legacy records, ownership and pending payments.

### 05 Front Desk booking queue and walk-in

**Purpose and users.** Front Desk books guests and manages incoming workload. Manager reads the list for oversight. **Current implementation.** `app/api/front-desk/reservations/`, `app/api/front-desk/availability/`, `components/manager/walk-in-dialog.tsx`, `lib/staff-data.ts`.

**Frontend and polish.** Put guest, stay dates, room, status, balance and actions first. Search by confirmation or guest and preserve the current queue when closing detail. The guided form can prefill an existing guest. Recover by request identity after an uncertain result. **Backend and database.** The command validates scoped identity, availability, guest capacity and duplication. The list and related invoice/guest reads need a bounded pagination contract. **Workflow.** Select new booking or walk-in → find guest → quote selected stay → commit once → reservation detail. **Gap and priority.** A04/A05 P1. Test missing/failed invoice read, duplicate submission, sold-out race and rapid date changes. Keep Manager oversight separate from Front Desk creation.

### 06 Arrival, occupant verification and QR check-in

**Purpose and users.** Front Desk verifies fit for arrival, assigns rooms and records check-in while guests may present a QR. **Current implementation.** `app/api/front-desk/check-in/route.ts`, `app/api/qr/`, `app/api/staff/reservations/[id]/readiness/`, `components/manager/front-desk-arrival-dialog.tsx`.

**Frontend and polish.** Show next unresolved blocker first, including age, primary ID, deposit, room readiness and verification. Permit manual confirmation when a camera is denied. Use clear distinction between no valid QR, expired token, and a stay that exists but is ineligible. **Backend and database.** QR resolution and express check-in share transactional stay gates and current ID evidence. Room QR rotation invalidates a printed placard. Record the person verified instead of including scans in ordinary screens. **Workflow.** Resolve reference → review role-visible readiness → verified identity and room → checked in. **Gap and priority.** P1 release gate for matched age/QR migration and physical camera/placard test. Verify async return with no duplicate room assignment.

### 07 Room Rack, Room Management and room restrictions

**Purpose and users.** Front Desk and Managers find a sellable, clean room and investigate blocks. Housekeeping/Maintenance see their role-scoped detail. **Current implementation.** `app/api/rack/`, `lib/room-rack.ts`, `components/front-desk/room-board.tsx`, `app/api/staff/rooms/[id]/`.

**Frontend and polish.** The board supports compact and large cards. The newer card renders a fixed room-type pill although the rack model carries a governed room type color. The old style regression is evidence of that changed contract. Check status colors and text under both themes. **Backend and database.** Physical active status, active stay assignment, room blocks and cleaning/inspection contribute distinct facts. Match each to one writer and protect the shared eligibility function. **Workflow.** Find room/date → read readiness → assign, hold, investigate or dispatch reclean. **Gap and priority.** A09 P1 as a test/release gate, P2 visual treatment. Reconfirm the approved room-type color contract and test rendered data for one seeded room with governance color.

### 08 Catalog, rates, fees and amenities

**Purpose and users.** Manager proposes current bookable product and rates. Owner/Admin govern catalogs and room assets. **Current implementation.** `app/api/catalog/`, `app/api/accounting/hotel-fees/`, `lib/hotel-policy.ts`.

**Frontend and polish.** Distinguish a room type, physical room and rate plan by label and headings. Surface pending/declined proposals and effective dates next to the edited amount. **Backend and database.** Rate changes use approved, versioned paths. Confirm active rate plans cannot overlap contrary to configured policy. Existing holds and confirmed stays carry frozen terms. **Workflow.** Propose → review → effective version → new quote. **Gap and priority.** P2 for a clear preview of affected future dates and a no-photo state. Checkout fee edits and fiscal mappings belong in the explicitly approved operating policy or Finance handoff.

### 09 Guest management, duplicate identity, flags and loyalty

**Purpose and users.** Front Desk serves the guest quickly. Manager and Owner review identity, guest controls and authorized history. **Current implementation.** `app/api/staff/guests/`, `components/manager/guest-profile-editor.tsx`, `app/api/account/loyalty/`.

**Frontend and polish.** Prioritize contact and current stay. Keep flags and merges behind context-specific confirmation. Expose what a reviewer changes and where previous bookings remain. **Backend and database.** Role allowlists protect contact and policy overrides. Merge preview and identity linkage can preserve historical financial records. Validate duplicate account results before committing a merge. **Workflow.** Search guest → review scoped history → update or request governed merge/override. **Gap and priority.** P1 for hosted access review and approved retention. P2 for phone/email normalization and focused search metrics from synthetic data. Avoid merging verified identities automatically.

### 10 Stay changes, checkout and turnover

**Purpose and users.** Front Desk resolves room moves, extensions and departure. Manager reviews exceptions, Housekeeping gets the next task. **Current implementation.** `app/api/front-desk/reservations/[id]/`, `lib/reservation-closure.ts`, `components/manager/reservation-readiness-panel.tsx`.

**Frontend and polish.** Put selected-stay balance, outstanding departure blockers and actions in one view. Offer the existing checkout folio issuance action once closure succeeds. Make an approved late checkout and pending payment visibly distinct. **Backend and database.** Changes and closure lock the affected reservation, assigned rooms and posting state. Checkout triggers dirty/turnover work. A manual document issuance remains a separate action. **Workflow.** Review departure → post/settle authorized charges → close stay → release room to turnover → issue statement. **Gap and priority.** P1 for an agreed document issuance/recovery path and tracking checkout exceptions with positive balance. Keep closure and cleaning separate states.

### 11 Guest requests, approvals and escalations

**Purpose and users.** Guest requests reach the right department. Front Desk files stay exceptions, Manager reviews and Owner handles authorized escalations. **Current implementation.** `app/api/guest-requests/`, `app/api/manager/approvals/`, `lib/permissions.ts`, migration `20261123020000_scope_approvals_and_reclean_dispatch.sql`.

**Frontend and polish.** Show the source record, decision, current owner and separate execution state. Preserve selected queue and focus on return. **Backend and database.** The latest local guard binds the request type and department to the same related record. Review and execution validate versions and actor role. Never authorize a second financial effect during retries. **Workflow.** File → review → approve or reject → authorized execution or escalation. **Gap and priority.** P1 release parity for the narrowed SQL and app. P2 progress notifications and immediate source links with missing records handled gracefully.

### 12 Housekeeping

**Purpose and users.** Room attendants complete turnover and service; inspection controls room readiness. **Current implementation.** `app/api/housekeeping/`, `components/manager/housekeeping-queue-panel.tsx`, `lib/room-rack.ts`.

**Frontend and polish.** Lead with assigned room, task, priority and inspection outcome. Keep do-not-disturb, deferred and reclean states readable in compact mode. Keep destructive reassignment and duplicate start actions guarded. **Backend and database.** Assign, start, complete, inspect and reclean use audited commands. Occupancy protection and multiple independent blockers matter. **Workflow.** Created → assigned → started → completed → inspected/reclean if required. **Gap and priority.** P2 for phone-sized active room tasks and count consistency. P1 workforce activation gate stays separate. Rehearse concurrent checkout and inspections to prove readiness remains correct.

### 13 Maintenance, equipment history and Facilities

**Purpose and users.** Hotel technicians and managers protect room safety. Facilities will own repair dispatch/equipment master after acceptance. **Current implementation.** `app/api/maintenance/`, `components/manager/preventive-work-panel.tsx`, room discrepancy operations.

**Frontend and polish.** Show the unsafe-room restriction, current repair state and inspection requirement separately. Immediately confirm which room remains blocked when a defect is updated. **Backend and database.** Technical diagnosis and room restrictions are separate. Completed service can link to an existing record. New equipment and preventive planning writes are retired. **Workflow.** Report → diagnose/block → repair → clean/inspect → release exact restriction. **Gap and priority.** P1 for Facilities mapping and signed repair acknowledgement before transfer. P2 print a work record only if Facilities needs it. Preserve Hotel authority to protect and release rooms.

### 14 Folios, payments, refunds and documents

**Purpose and users.** Guest and Front Desk manage a selected stay folio. Accounting handles property financial exceptions while Finance owns future posting/disbursement. **Current implementation.** `app/api/accounting/`, `app/api/documents/`, `lib/accounting.ts`, `lib/hotel-document-data.ts`.

**Frontend and polish.** Keep booking confirmation, per-payment receipt, final folio and refund evidence distinct. Use closed/settled language only from recorded status. **Backend and database.** Payments, immutable issue-time documents, adjustments, refunds and provider events use their existing guards and replay keys. Guest owns the PDF source; Front Desk sees the selected folio and authorized drawer. **Workflow.** Post → collect → issue document → reconcile → approved refund/correction where needed. **Gap and priority.** A02/A03/A06. The base accommodation breakdown should come from frozen issued data where present; the current issued PDF proves totals, payments and recorded charge/adjustment lines. Verify historical statement issuance and after-checkout corrections before expanding document types.

### 15 Cash & Shifts, handover and hotel operating day

**Purpose and users.** Cashier counts and closes a drawer, Accounting reconciles, operations manages the day. **Current implementation.** `components/manager/cash-shifts-workspace.tsx`, `app/api/staff/operational-date/`, `app/api/accounting/night-audit/`, `lib/accounting.ts`.

**Frontend and polish.** The drawer workspace cleanly separates count, expected amount and recorded variance. Display a clear next action when reconciliation or unresolved stays block close. **Backend and database.** Opening, count drafts, closure and reconciled state retain actor attribution and protect transaction history. Close checks unresolved events under a lock and advances the date once. **Workflow.** Open → collect → count → close → reconcile → close business date. **Gap and priority.** A03 P1. Add a scoped close capability only after designating primary and backup operators and planning remaining Accounting-only duties. Hotel operating close stays a PMS workflow.

### 16 Admin, Owner, policy and audit history

**Purpose and users.** Admin governs users, system settings, media and health. Owner reviews business and protected role changes. **Current implementation.** `app/api/admin/`, `app/api/owner/`, `components/admin/`, `components/owner/`.

**Frontend and polish.** Put changed scopes and account version in the confirmation, with actor and reason visible in review. Separate system-health state from business operating metrics. **Backend and database.** Protected actions and identity conversion have their own audit/version checks. Stored audit evidence and append-only records matter when a role is removed. Two legacy policy reads use wildcard projections. **Workflow.** Review actor → authorize policy/account change → audit → invalidate when relevant. **Gap and priority.** P1 for release ledger and verified role roster; P2 explicit fields and export/download audit policy. New Accounting assignment is already retired locally.

### 17 Hotel Supplies and Supply Chain

**Purpose and users.** Property staff count, use and receive hotel supplies. Supply Chain owns new procurement. **Current implementation.** `app/api/inventory/`, `components/manager/inventory-replenishment-panel.tsx`, stock movement RPCs.

**Frontend and polish.** Put item, unit, variance and approved outstanding delivery first. Show reserved quantity vs actually received. Clarify legacy cancellation separately from procurement. **Backend and database.** Receipt, stock and movement results are atomic and replay-safe, with role restrictions on purchasing versus receiving. **Workflow.** Count/use → protected movement; approved historical order → partial or final receipt. **Gap and priority.** P1 A06 for SKU/UOM/location mapping and opening balance reconciliation. P2 support a filtered CSV for reconciliation if Supply Chain agrees a contract. Avoid a second active quantity writer.

### 18 Staff & Duty and HR/Workforce

**Purpose and users.** Manager and departments coordinate Hotel tasks and shift handover. Workforce owns official schedules and attendance. **Current implementation.** `app/api/manager/staff-duty/`, `app/api/staff/operations/`, `app/api/integrations/workforce/availability/`.

**Frontend and polish.** Label the source and timestamp. Distinguish on-duty evidence, recent operational activity and an unavailable feed. **Backend and database.** External identity mapping and availability expiry gate automatic work assignment. A Workforce event cannot create or grant a Haven role. **Workflow.** External attendance evidence → Hotel eligibility → Hotel task assignment → department handover. **Gap and priority.** P1 named HR mapping owner and fallback rehearsal. Schedule creation is already retired at the Hotel application boundary. Keep payroll and employee records out of the Hotel workflow.

### 19 Guest transport and Fleet

**Purpose and users.** Guests and Front Desk coordinate transfers. Fleet handles dispatch/trip confirmation and fare evidence where enabled. **Current implementation.** `app/api/transportation/`, `app/api/account/transportation/`, `app/api/integrations/fleet/`.

**Frontend and polish.** Show requested versus confirmed trip and whether a fare is pending. Invite action when pickup information changes or a trip falls outside the stay. **Backend and database.** Scope trip/leg identities, signed partner messages, retries and narrowly available pickup evidence. Folio posting must deduplicate a confirmed fare and distinguish corrections. **Workflow.** Guest request → dispatch → trip events → confirmed fare → folio. **Gap and priority.** P1 independent end-to-end fare/revocation verification for the matching deployment. Keep local transfer-service categories, with Fleet governing driver or vehicle master data.

### 20 Breakfast and Restaurant

**Purpose and users.** Guests hold breakfast entitlements. Authorized breakfast service staff or Restaurant redeem them. **Current implementation.** `app/(manager)/breakfast-service/`, `app/api/staff/breakfast/`, and `app/api/integrations/restaurant/breakfast/v1/`.

**Frontend and polish.** Keep date, quantity remaining and redemption result large enough on a handheld device. Provide a no-camera fallback. **Backend and database.** Offers and price are frozen through discovery/hold. Redemption is versioned and replay-safe. The partner route has an independent credential and activation flag. **Workflow.** Offer → frozen booking benefit → dated pass → redeem. **Gap and priority.** P1 partner sandbox and scoped replay proof. Restaurant charge-to-room needs a separate posting/reversal contract and agreement on revenue attribution. POS stays with Restaurant.

### 21 Daily operations reports and PDF downloads

**Purpose and users.** Front Desk summarizes activity and Manager reviews it. Guests receive confirmation/folio; cashier gets closed-shift evidence. **Current implementation.** `app/api/front-desk/reports/`, `components/manager/front-desk-reports-panel.tsx`, `app/api/documents/[kind]/[id]/route.ts`.

**Frontend and polish.** Preview and saved status must stay distinct. Use the shared download interaction and clear errors before creating a local file. **Backend and database.** Persisted daily snapshots and review version govern submitted, acknowledged, returned and resubmission history. Private role/ownership guards recheck each downloadable source. **Workflow.** Preview → submit → review → PDF from saved snapshot. **Gap and priority.** P2 for document download telemetry and explicit folio issuance missing state. Audit PDF fonts, wrapping and page breaks with both long guest names and large historic folios.

### 22 Analytical reports and predictive analytics

**Purpose and users.** Manager and Owner plan operations with actuals, comparisons and dated forecasts. **Current implementation.** `lib/analytics/`, `components/manager/analytical-report-panel.tsx`, forecast and evaluation panels.

**Frontend and polish.** Keep period, model version, confidence and sample coverage in context and CSV metadata. Combine duplicate measures into a shared definition while keeping booked vs recorded occupancy legible. **Backend and database.** Frozen model outputs and operational snapshots support baseline scoring and missing-actual handling. Date-bounded queries still need workload profiling. **Workflow.** Capture → predict → evaluate against held actuals/baseline → generate governed rate or scheduling decision. **Gap and priority.** P2 prospective evidence and snapshot alerting. Do not use descriptive historical recovery or missing observations as proof of predictive lift.

### 23 Notifications, reminders and AI assistance

**Purpose and users.** Guests and staff receive actionable reminders. AI provides advisory summaries scoped to the audience. **Current implementation.** `app/api/account/notifications/`, `app/api/guest-reminders/`, `app/api/ai/`, `vercel.json`.

**Frontend and polish.** Group duplicates, prioritize pending work and deep-link to the related record. Ensure loading/failed requests stay visible and recoverable. **Backend and database.** Durable guest rows and delivery deduplication protect retries. Cron and partner actions have separate gates. Prompt summaries should receive only permitted data. **Workflow.** Event → record → deliver/notify → acknowledged action or retry. **Gap and priority.** P2 delivery alerting and a role test for dead action links/redaction. P1 mail runtime compatibility when enabling provider-backed OTP or operational email.

### 24 Lost & Found, emergency occupancy and safety evidence

**Purpose and users.** Departments record found property, Front Desk verifies claims and room occupants, Manager approves disposition. **Current implementation.** `app/api/staff/lost-found/`, `app/api/staff/occupants/in-house/`, `components/manager/emergency-occupancy-panel.tsx`.

**Frontend and polish.** Show custody, case readiness and whether occupant information is complete. Confirm before release, print or archive. **Backend and database.** Restrict claim notes, protect uploads and record release/approval identity. Do not equate a named guest with confirmed physical presence. **Workflow.** Found → stored → claim → authorized release, or escalated disposition. **Gap and priority.** P2 named record-retention policy, secure print handling and an emergency access rehearsal. Document the authorization rule for every export of an occupant list.

### 25 Platform delivery, configuration, background jobs and health

**Purpose and users.** The maintainers ship coordinated app/SQL releases and operate provider connections. **Current implementation.** `package.json`, `.github/workflows/ci.yml`, `next.config.mjs`, `supabase/migrations/`, `vercel.json`, `.env.example`.

**Frontend and polish.** System Health should show migration, deployment and partner status with a recorded check time. **Backend and database.** Environment config, service-role access, RLS and scheduler secrets are separate. CI verifies frontend/server build and Vitest. SQL rehearsal and signed-in Edge coverage are separate from the configured CI. **Workflow.** Freeze → locked install and checks → compare ledger → rehearsal → monitored rollout. **Gap and priority.** A01/A07/A08. Keep a distinct infrastructure and system ownership plan for backup, restore, alerting, provider outage and isolated audit data. Do not put source credentials in logs or reference files.

## Route inventory

The inventory below enumerates file entry points in the reviewed tree. Guard presence is derived from source markers and is not a substitute for evaluating delegated guards, row ownership and SQL authority.
### Public and authenticated pages

| URL | Page file |
|---|---|
| `/auth/continue` | `app/(auth)/auth/continue/page.tsx` |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` |
| `/login` | `app/(auth)/login/page.tsx` |
| `/register` | `app/(auth)/register/page.tsx` |
| `/verify` | `app/(auth)/verify/page.tsx` |
| `/account/find-room` | `app/(booking)/(customer)/account/find-room/page.tsx` |
| `/account/help` | `app/(booking)/(customer)/account/help/page.tsx` |
| `/account/loyalty` | `app/(booking)/(customer)/account/loyalty/page.tsx` |
| `/account/notifications` | `app/(booking)/(customer)/account/notifications/page.tsx` |
| `/account` | `app/(booking)/(customer)/account/page.tsx` |
| `/account/payments` | `app/(booking)/(customer)/account/payments/page.tsx` |
| `/account/profile` | `app/(booking)/(customer)/account/profile/page.tsx` |
| `/account/receipts/[id]` | `app/(booking)/(customer)/account/receipts/[id]/page.tsx` |
| `/account/requests` | `app/(booking)/(customer)/account/requests/page.tsx` |
| `/account/settings` | `app/(booking)/(customer)/account/settings/page.tsx` |
| `/account/stay-guide` | `app/(booking)/(customer)/account/stay-guide/page.tsx` |
| `/account/transportation` | `app/(booking)/(customer)/account/transportation/page.tsx` |
| `/my-reservations` | `app/(booking)/(customer)/my-reservations/page.tsx` |
| `/my-reservations/[id]/breakfast` | `app/(booking)/(customer)/my-reservations/[id]/breakfast/page.tsx` |
| `/my-reservations/[id]` | `app/(booking)/(customer)/my-reservations/[id]/page.tsx` |
| `/booking/confirmation/[id]` | `app/(booking)/booking/confirmation/[id]/page.tsx` |
| `/booking/details` | `app/(booking)/booking/details/page.tsx` |
| `/booking/payment/[token]` | `app/(booking)/booking/payment/[token]/page.tsx` |
| `/booking/review/[token]` | `app/(booking)/booking/review/[token]/page.tsx` |
| `/booking/rooms/[type]` | `app/(booking)/booking/rooms/[type]/page.tsx` |
| `/booking/search` | `app/(booking)/booking/search/page.tsx` |
| `/booking-policy` | `app/(landing-page)/booking-policy/page.tsx` |
| `/gallery` | `app/(landing-page)/gallery/page.tsx` |
| `/` | `app/(landing-page)/page.tsx` |
| `/privacy` | `app/(landing-page)/privacy/page.tsx` |
| `/terms` | `app/(landing-page)/terms/page.tsx` |
| `/breakfast-service` | `app/(manager)/breakfast-service/page.tsx` |
| `/manager_dashboard` | `app/(manager)/manager_dashboard/page.tsx` |
| `/checkin/kiosk` | `app/checkin/kiosk/page.tsx` |
| `/qr-placard/[roomId]` | `app/qr-placard/[roomId]/page.tsx` |
| `/recover/[token]` | `app/recover/[token]/page.tsx` |

### HTTP surface register

Entries without a named source marker include re-exports, individual inline checks, and provider/public endpoints. Consult the role and partner profiles above for actual authority.

#### account

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/account/ai/concierge` | POST | `getServerSession` |
| `/api/account/loyalty/redeem` | POST | `getServerSession` |
| `/api/account/loyalty` | GET | `getServerSession` |
| `/api/account/notifications/read` | POST | `getServerSession` |
| `/api/account/notifications` | GET | `getServerSession` |
| `/api/account/password` | PATCH | `getServerSession` |
| `/api/account/profile` | GET, PATCH | `getServerSession` |
| `/api/account/receipts/[paymentId]/email` | POST | `getServerSession` |
| `/api/account/receipts/[paymentId]` | GET | `getServerSession` |
| `/api/account/requests` | POST | `getServerSession` |
| `/api/account/requests/[id]/withdraw` | POST | `getServerSession` |
| `/api/account/reservations/[id]/breakfast/[date]` | GET | `getAuthenticatedSession` |
| `/api/account/reservations/[id]/cancel` | GET, POST | `getServerSession` |
| `/api/account/reservations/[id]/cancel-attempt` | POST | `getServerSession` |
| `/api/account/reservations/[id]/change-request` | POST | `getServerSession` |
| `/api/account/reservations/[id]/payments` | GET, POST | `getServerSession` |
| `/api/account/reservations/[id]/room-options` | GET | `getServerSession` |
| `/api/account/reviews` | GET, POST | `getServerSession` |
| `/api/account/transportation` | POST | `getServerSession` |
| `/api/account/transportation/[id]/cancel` | POST | `getServerSession` |
| `/api/account/transportation/[id]/pickup-profile` | GET, POST | Delegated or endpoint-specific |
| `/api/account/transportation/[id]/ride-safety` | GET | Delegated or endpoint-specific |

#### accounting

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/accounting/adjustments` | POST | `guardFinancial` |
| `/api/accounting/cash-exceptions` | GET, POST | `guardFinancial` |
| `/api/accounting/cash-shifts` | GET, POST | `guardFinancial` |
| `/api/accounting/cash-shifts/[id]/follow-up` | GET | `guardFinancial` |
| `/api/accounting/cash-shifts/[id]` | GET, PUT, PATCH | `guardFinancial` |
| `/api/accounting/charges/[id]/reverse` | POST | `guardFinancial` |
| `/api/accounting/documents` | POST | `guardFinancial` |
| `/api/accounting/exports` | GET | `guardFinancial` |
| `/api/accounting/hotel-fees` | POST | `guardFinancial` |
| `/api/accounting/ledger` | GET | `guardFinancial` |
| `/api/accounting/night-audit/close` | POST | `guardFinancial` |
| `/api/accounting/payments/[id]/reject` | POST | Delegated or endpoint-specific |
| `/api/accounting/payments/[id]/verify` | POST | Delegated or endpoint-specific |
| `/api/accounting/reconciliations` | POST | `guardFinancial` |
| `/api/accounting/refunds/[id]/fail` | POST | `guardFinancial` |
| `/api/accounting/refunds/[id]/process` | POST | `guardFinancial` |
| `/api/accounting/xendit-reconciliation` | GET, POST | `guardFinancial` |

#### admin

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/admin/data` | GET | `guardAdmin` |
| `/api/admin/deposit-method` | PATCH | `guardAdmin` |
| `/api/admin/email-delivery` | GET, POST | `getServerSession` |
| `/api/admin/location/images` | POST, DELETE | `guardAdmin` |
| `/api/admin/location` | GET, POST, DELETE | `guardAdmin` |
| `/api/admin/occupant-policy` | GET, PATCH | `hotelGuard` |
| `/api/admin/password-resets/[id]/selfie` | GET | `guardAdmin` |
| `/api/admin/policy` | PATCH | `guardAdmin` |
| `/api/admin/rooms/[id]` | PATCH | `guardAdmin` |
| `/api/admin/security-policy` | GET, PATCH | `guardAdmin` |
| `/api/admin/users` | POST | `guardAdmin` |
| `/api/admin/users/[id]/action` | POST | `guardAdmin` |
| `/api/admin/website/images` | POST, DELETE | `guardAdmin` |
| `/api/admin/website` | GET, POST | `guardAdmin` |

#### ai

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/ai/ask` | POST | Delegated or endpoint-specific |
| `/api/ai/brief` | GET | Delegated or endpoint-specific |
| `/api/ai/explain` | POST | Delegated or endpoint-specific |
| `/api/ai/report-summary` | POST | Delegated or endpoint-specific |

#### analytics

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/analytics/evaluation` | GET | `getServerSession` |
| `/api/analytics/generate` | GET, POST | `requirePermission` |
| `/api/analytics/insights` | GET | `getServerSession` |
| `/api/analytics/pricing-recommendations/propose` | POST | Delegated or endpoint-specific |
| `/api/analytics/pricing-recommendations` | GET | Delegated or endpoint-specific |
| `/api/analytics/seasonal-occupancy` | GET | `getServerSession` |

#### auth

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/auth/otp/challenge` | GET | Delegated or endpoint-specific |
| `/api/auth/otp/resend` | POST | Delegated or endpoint-specific |
| `/api/auth/otp/verify` | POST | Delegated or endpoint-specific |
| `/api/auth/session-status` | GET, POST | `getServerSession` |
| `/api/auth/[...nextauth]` | Delegated export | Delegated or endpoint-specific |

#### booking

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/booking/holds` | POST | `getServerSession` |
| `/api/booking/holds/[token]/confirm` | POST | Delegated or endpoint-specific |
| `/api/booking/holds/[token]/proof` | POST, DELETE | Delegated or endpoint-specific |
| `/api/booking/holds/[token]` | DELETE | `requirePermission` |
| `/api/booking/payments/gateway` | POST | Delegated or endpoint-specific |
| `/api/booking/payments/xendit` | POST | `getServerSession` |
| `/api/booking/payments/[id]/proof` | GET | `getServerSession` |

#### catalog

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/catalog/breakfast` | GET, POST | `getServerSession` |
| `/api/catalog/photos` | POST, DELETE | Delegated or endpoint-specific |
| `/api/catalog/rate-plans/[id]/retire` | POST | Delegated or endpoint-specific |
| `/api/catalog/rate-plans/[id]/review` | POST | Delegated or endpoint-specific |
| `/api/catalog/request-types` | GET, POST | Delegated or endpoint-specific |
| `/api/catalog/request-types/[id]` | PATCH, DELETE | Delegated or endpoint-specific |
| `/api/catalog/room-types/rate-proposals/[id]/review` | POST | Delegated or endpoint-specific |
| `/api/catalog/room-types` | GET, POST | Delegated or endpoint-specific |
| `/api/catalog/room-types/[id]/archive` | POST | `guardAdmin` |
| `/api/catalog/room-types/[id]/rate-plans` | GET, POST | Delegated or endpoint-specific |
| `/api/catalog/room-types/[id]/rate-proposal` | POST | Delegated or endpoint-specific |
| `/api/catalog/room-types/[id]` | PATCH | Delegated or endpoint-specific |
| `/api/catalog/rooms` | GET, POST | Delegated or endpoint-specific |
| `/api/catalog/rooms/[id]` | PATCH | Delegated or endpoint-specific |
| `/api/catalog/transport-vehicle-types` | GET, POST | Delegated or endpoint-specific |
| `/api/catalog/transport-vehicle-types/[id]` | PATCH | Delegated or endpoint-specific |

#### documents

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/documents/[kind]/[id]` | GET | `getAuthenticatedSession` |

#### front-desk

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/front-desk/arrivals/readiness` | GET | `hotelGuard` |
| `/api/front-desk/availability` | GET | `getServerSession` |
| `/api/front-desk/cash-drawer` | GET | `guardFinancial` |
| `/api/front-desk/check-in` | POST | `getServerSession` |
| `/api/front-desk/deposits/[id]/verify` | POST | Delegated or endpoint-specific |
| `/api/front-desk/fees/quote` | POST | `hotelGuard` |
| `/api/front-desk/guest-requests/review` | POST | `getServerSession` |
| `/api/front-desk/guests` | GET | `hotelGuard` |
| `/api/front-desk/reports` | GET, POST | `getServerSession` |
| `/api/front-desk/reports/[id]/review` | POST | `getServerSession` |
| `/api/front-desk/reservations` | GET, POST | `hotelGuard` |
| `/api/front-desk/reservations/[id]/assign` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/change-room` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/charge` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/checkout` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/eligible-rooms` | GET | `getServerSession` |
| `/api/front-desk/reservations/[id]/extend` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/extend-preview` | GET | `getServerSession` |
| `/api/front-desk/reservations/[id]/guest` | PATCH | `getServerSession` |
| `/api/front-desk/reservations/[id]/guests` | POST | `hotelGuard` |
| `/api/front-desk/reservations/[id]/identity` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/occupants/[occupantId]/presence` | POST | `hotelGuard` |
| `/api/front-desk/reservations/[id]/occupants/[occupantId]/verify` | POST | `hotelGuard` |
| `/api/front-desk/reservations/[id]/payment` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/requests` | POST | `getServerSession` |
| `/api/front-desk/reservations/[id]/service-condition` | GET, POST | `hotelGuard` |
| `/api/front-desk/room-discrepancies/[id]/resolve` | POST | `hotelGuard` |
| `/api/front-desk/rooms/[id]/reclean` | POST | `guardManager` |

#### guest-reminders

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/guest-reminders` | GET, POST | `getServerSession` |

#### guest-requests

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/guest-requests/[id]/progress` | POST | `getServerSession` |

#### housekeeping

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/housekeeping/assignment-suggestions` | GET | `getServerSession` |
| `/api/housekeeping/reservations/[id]/service-condition` | POST | `hotelGuard` |
| `/api/housekeeping/rooms/[id]/discrepancies` | POST | `hotelGuard` |
| `/api/housekeeping/tasks/[id]/assign` | POST | Delegated or endpoint-specific |
| `/api/housekeeping/tasks/[id]/complete` | POST | Delegated or endpoint-specific |
| `/api/housekeeping/tasks/[id]/defer` | POST | Delegated or endpoint-specific |
| `/api/housekeeping/tasks/[id]/inspect` | POST | Delegated or endpoint-specific |
| `/api/housekeeping/tasks/[id]/maintenance` | POST | Delegated or endpoint-specific |
| `/api/housekeeping/tasks/[id]/service-outcome` | POST | `hotelGuard` |
| `/api/housekeeping/tasks/[id]/start` | POST | Delegated or endpoint-specific |

#### integrations

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/integrations/fleet/pickup-photo` | POST | Delegated or endpoint-specific |
| `/api/integrations/fleet/transport-status` | POST | Delegated or endpoint-specific |
| `/api/integrations/restaurant/breakfast/v1` | POST | Delegated or endpoint-specific |
| `/api/integrations/workforce/availability` | POST | Delegated or endpoint-specific |

#### inventory

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/inventory/movements` | GET, POST | `getServerSession` |
| `/api/inventory/purchase-orders/approvals/[id]/review` | POST | `getServerSession` |
| `/api/inventory/purchase-orders` | GET, POST | `getAuthenticatedSession` |
| `/api/inventory/purchase-orders/[id]/cancel` | POST | `getServerSession` |
| `/api/inventory/purchase-orders/[id]/receive` | POST | `getServerSession` |
| `/api/inventory/purchase-orders/[id]/submit` | POST | `getAuthenticatedSession` |

#### location

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/location/images/[id]` | GET | `guardAdmin` |
| `/api/location` | GET | Delegated or endpoint-specific |

#### maintenance

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/maintenance/asset-work` | GET, POST | `getServerSession` |
| `/api/maintenance/assets` | GET, POST | `getAuthenticatedSession` |
| `/api/maintenance/assets/[id]/[action]` | POST | `requirePermission` |
| `/api/maintenance/orders` | POST | `getServerSession` |
| `/api/maintenance/orders/[id]/[action]` | POST | `getServerSession` |

#### manager

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/manager/approvals` | GET, POST | `guardManager` |
| `/api/manager/approvals/[id]/escalate-owner` | POST | `guardManager` |
| `/api/manager/approvals/[id]/execute` | POST | `guardManager` |
| `/api/manager/approvals/[id]/financial-execute` | POST | `guardManager` |
| `/api/manager/approvals/[id]/record-acceptance` | POST | `guardManager` |
| `/api/manager/approvals/[id]/review` | POST | `guardManager` |
| `/api/manager/housekeeping/[id]/prioritize` | POST | `guardManager` |
| `/api/manager/maintenance/[id]/escalate` | POST | `guardManager` |
| `/api/manager/staff-duty` | GET | `getServerSession` |

#### manager_dashboard

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/manager_dashboard` | GET | `requirePermission` |

#### owner

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/owner/data` | GET | Delegated or endpoint-specific |
| `/api/owner/exceptions/[id]/review` | POST | Delegated or endpoint-specific |
| `/api/owner/payment-destination` | PATCH | Delegated or endpoint-specific |
| `/api/owner/payment-qr` | POST, DELETE | Delegated or endpoint-specific |

#### password-reset

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/password-reset/request` | POST | Delegated or endpoint-specific |
| `/api/password-reset/verify` | POST | Delegated or endpoint-specific |

#### qr

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/qr/express-checkin` | POST | `getServerSession` |
| `/api/qr/reservation/[id]` | GET | `getServerSession` |
| `/api/qr/resolve` | POST | `getServerSession` |
| `/api/qr/room/[roomId]/rotate` | POST | `getServerSession` |
| `/api/qr/room/[roomId]` | GET | `getServerSession` |

#### rack

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/rack` | GET | `getServerSession` |

#### recover

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/recover/[token]` | POST | Delegated or endpoint-specific |
| `/api/recover/[token]/selfie` | POST | Delegated or endpoint-specific |

#### register

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/register` | POST | Delegated or endpoint-specific |

#### resources

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/resources/[resource]` | GET, POST, PATCH | `getAuthenticatedSession` |

#### security-policy

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/security-policy/public` | GET | Delegated or endpoint-specific |

#### staff

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/staff/analytical-report` | GET | `guardManager` |
| `/api/staff/breakfast` | POST | `getServerSession` |
| `/api/staff/command-center` | GET | `guardManager` |
| `/api/staff/guests/duplicates` | GET, POST | `hotelGuard` |
| `/api/staff/guests/merge/preview` | POST | `hotelGuard` |
| `/api/staff/guests/merge` | POST | `hotelGuard` |
| `/api/staff/guests/[id]/flags` | GET, POST, PATCH | `hotelGuard` |
| `/api/staff/guests/[id]/loyalty` | PATCH | `getServerSession` |
| `/api/staff/guests/[id]` | GET, PATCH | `getServerSession` |
| `/api/staff/handover/assignees` | GET | `hotelGuard` |
| `/api/staff/handover/references` | GET | `hotelGuard` |
| `/api/staff/handover` | GET, POST | `hotelGuard` |
| `/api/staff/handover/[id]` | GET, PATCH | `hotelGuard` |
| `/api/staff/handovers` | GET, POST | `getServerSession` |
| `/api/staff/hotel-fees` | GET | `hotelGuard` |
| `/api/staff/lost-found` | GET, POST | `getServerSession` |
| `/api/staff/night-audit` | GET | `hotelGuard` |
| `/api/staff/occupants/in-house` | GET | `hotelGuard` |
| `/api/staff/operational-date` | GET, POST | `hotelGuard` |
| `/api/staff/operations` | GET, POST | `getServerSession` |
| `/api/staff/reservations/[id]/flag-overrides` | GET, POST | `hotelGuard` |
| `/api/staff/reservations/[id]/flag-overrides/[overrideId]` | DELETE | `hotelGuard` |
| `/api/staff/reservations/[id]/guests` | GET | `hotelGuard` |
| `/api/staff/reservations/[id]/readiness` | GET | `hotelGuard` |
| `/api/staff/reservations/[id]` | GET, PATCH | `getServerSession` |
| `/api/staff/reservations/[id]/verify-id` | GET, POST | `getServerSession` |
| `/api/staff/room-discrepancies` | GET | `hotelGuard` |
| `/api/staff/rooms/[id]` | GET | `getServerSession` |
| `/api/staff/workforce` | GET, POST | `getServerSession` |

#### transportation

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/transportation/guests` | GET | Delegated or endpoint-specific |
| `/api/transportation` | GET, POST | Delegated or endpoint-specific |
| `/api/transportation/[id]/fleet` | GET, POST | Delegated or endpoint-specific |
| `/api/transportation/[id]/transition` | POST | Delegated or endpoint-specific |

#### webhooks

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/webhooks/payments` | POST | Delegated or endpoint-specific |
| `/api/webhooks/xendit` | POST | Delegated or endpoint-specific |

#### website

| URL | Method exports visible in scan | First named session marker |
|---|---|---|
| `/api/website/images/[id]` | GET | `guardAdmin` |

### Database and test cross-reference

| Business authority | Tables and representative constraints | Primary verification |
|---|---|---|
| Stay and physical room | `rooms`, `reservations`, `booking_holds`, `reservation_room_assignments` and nightly availability functions. Active assignments and eligible dates are transactionally guarded. | `front-office-booking-db-test.mjs`, `hotel-operations-db-test.mjs` |
| Money and operating day | `invoices`, `payments`, `refund_requests`, `cash_shifts`, `financial_documents`, `hotel_night_audits`. Role, locked writes, issuance/replay keys and preserve-history triggers apply. | `hotel-operations-db-test.mjs`, `audit-business-rules-db-test.mjs` |
| Room care and requests | `housekeeping_tasks`, `maintenance_orders`, `guest_requests`, `manager_approval_requests`, room discrepancy records. Role, state and source linkage are checked. | `rbac-db-test.mjs`, `enterprise-boundaries-db-test.mjs`, `occupant-guest-controls-db-test.mjs` |
| Supplies and handover | `inventory`, `inventory_movements`, `purchase_orders`, receipts and handovers. Receipt quantities and versioned events are recorded atomically. | `inventory-replenishment-db-test.mjs`, `hotel-operations-db-test.mjs` |
| Partners | Workforce availability, Fleet provider trips and breakfast entitlement/redemption tables. Each contract applies its own identity, transaction key, auth and replay boundary. | `workforce-integration-db-test.mjs`, `fleet-automatic-dispatch-db-test.mjs`, `hotel-breakfast-db-test.mjs` |
| Governance and analytics | `user_accounts`, activity/challenge tables, `audit_logs`, `analytics_model_runs` and prediction/actual snapshots. Use read-only reporting grants and validated operations for writes. | `rbac-db-test.mjs`, evaluation and role-specific Vitest suites |
## Forms and tables source register

64 page and component files contain 50 native form occurrences, 47 native table occurrences and 1 direct FormDialog occurrences. This is a TypeScript JSX source count. It includes conditional render branches and excludes test fixtures. The markers refer to code in the same file. Shared hooks, composed dialogs and controls delegated to a child still require checking at the workflow entry point.

| Source | Forms | Tables | FormDialog | Local control markers |
|---|---:|---:|---:|---|
| `app/recover/[token]/page.tsx` | 1 | 0 | 0 | status / progress |
| `components/account/account-forms.tsx` | 2 | 0 | 0 | field validation, status / progress |
| `components/account/customer-profile-modal.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/admin/admin-dashboard-client.tsx` | 0 | 7 | 0 | search, pagination, sorting, status / progress |
| `components/admin/location-content-panel.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/admin/occupant-policy-section.tsx` | 1 | 0 | 0 | status / progress |
| `components/admin/pending-migrations-modal.tsx` | 0 | 1 | 0 | status / progress |
| `components/admin/system-health-ledger.tsx` | 0 | 2 | 0 | pagination, status / progress |
| `components/admin/website-content-panel.tsx` | 0 | 2 | 0 | field validation, status / progress |
| `components/auth/forgot-password-form.tsx` | 2 | 0 | 0 | status / progress |
| `components/auth/login-form.tsx` | 1 | 0 | 0 | status / progress |
| `components/auth/register-form.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/auth/verify-form.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/booking/booking-search-form.tsx` | 2 | 0 | 0 | status / progress |
| `components/booking/guest-details-form.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/catalog/breakfast-offers.tsx` | 1 | 0 | 0 | status / progress |
| `components/catalog/request-types-panel.tsx` | 0 | 1 | 0 | pagination, sorting, status / progress |
| `components/catalog/transport-vehicle-types-panel.tsx` | 0 | 1 | 0 | pagination, sorting, field validation, status / progress |
| `components/checkin/express-kiosk.tsx` | 1 | 0 | 0 | status / progress |
| `components/customer/breakfast-service-form.tsx` | 2 | 0 | 0 | field validation, status / progress |
| `components/customer/guest-ai-concierge-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/customer/guest-request-form.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/customer/loyalty-card-panel.tsx` | 0 | 1 | 0 | pagination, status / progress |
| `components/customer/transport-pickup-profile.tsx` | 1 | 0 | 0 | status / progress |
| `components/customer/transportation-request-form.tsx` | 1 | 0 | 0 | field validation, status / progress |
| `components/front-desk/board-reservation-tabs.tsx` | 0 | 1 | 0 | pagination, status / progress |
| `components/front-desk/room-calendar.tsx` | 0 | 1 | 0 | status / progress |
| `components/manager/analytical-report-panel.tsx` | 1 | 2 | 0 | export / print, status / progress |
| `components/manager/cash-count-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/cash-shifts-workspace.tsx` | 1 | 2 | 0 | search, pagination, status / progress |
| `components/manager/forecast-evaluation-panel.tsx` | 0 | 1 | 0 | export / print, status / progress |
| `components/manager/front-desk-reports-panel.tsx` | 0 | 1 | 0 | pagination, export / print, status / progress |
| `components/manager/front-desk-ride-booking.tsx` | 1 | 0 | 0 | search, status / progress |
| `components/manager/guest-duplicates-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/guest-flags-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/guest-profile-editor.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/handover-panel.tsx` | 1 | 0 | 0 | Shared or implementation-specific |
| `components/manager/haven-ai-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/hotel-fee-picker.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/lost-found-panel.tsx` | 0 | 1 | 0 | pagination, status / progress |
| `components/manager/manager-dashboard-client.tsx` | 0 | 5 | 0 | search, pagination, sorting, status / progress |
| `components/manager/manager-reservations-panel.tsx` | 0 | 1 | 0 | pagination, status / progress |
| `components/manager/operational-handover-panel.tsx` | 2 | 0 | 0 | status / progress |
| `components/manager/payment-collection-dialog.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/performance-reports.tsx` | 0 | 1 | 0 | export / print |
| `components/manager/predictive-insights-panel.tsx` | 0 | 6 | 0 | pagination, status / progress |
| `components/manager/predictive-pricing-panel.tsx` | 0 | 2 | 0 | pagination, status / progress |
| `components/manager/refund-payout-dialog.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/reservation-party-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/room-discrepancy-panel.tsx` | 1 | 0 | 0 | status / progress |
| `components/manager/seasonal-occupancy-panel.tsx` | 1 | 1 | 0 | status / progress |
| `components/manager/staff-duty-panel.tsx` | 0 | 1 | 0 | pagination, sorting, status / progress |
| `components/manager/stock-integrity-panel.tsx` | 1 | 1 | 0 | status / progress |
| `components/manager/transportation-panel.tsx` | 0 | 1 | 0 | pagination, status / progress |
| `components/manager/walk-in-dialog.tsx` | 1 | 0 | 0 | search, status / progress |
| `components/manager/workforce-panel.tsx` | 2 | 1 | 0 | status / progress |
| `components/manager/xendit-reconciliation-panel.tsx` | 2 | 0 | 0 | status / progress |
| `components/owner/owner-dashboard-client.tsx` | 0 | 1 | 0 | search, pagination, sorting, status / progress |
| `components/owner/owner-primitives.tsx` | 0 | 1 | 0 | pagination |
| `components/qr/qr-scanner.tsx` | 1 | 0 | 0 | Shared or implementation-specific |
| `components/ui/AccessibleChart.tsx` | 0 | 1 | 0 | Shared or implementation-specific |
| `components/ui/FormDialog.tsx` | 2 | 0 | 0 | field validation, status / progress |
| `components/ui/Modal.tsx` | 2 | 0 | 0 | field validation, status / progress |
| `components/ui/action-dialogs.tsx` | 0 | 0 | 1 | status / progress |
