# Haven Role Based Access Control Audit

## Existing architecture and roles

Haven serves one property. NextAuth Credentials authenticates against `user_accounts` with bcrypt, an optional login OTP policy, a signed session cookie and per-device idle and absolute expiry. Account deactivation, recovery requirements and `auth_version` changes invalidate existing sessions. The database stores one constrained role per account. Next.js handlers use a server-only Supabase service client, so handler and RPC authorization are required even with RLS. Guests are scoped by the account on the reservation, hold, receipt or service request. Staff scope follows the role, with additional department, assignment and state checks in individual workflows.

| Role | Existing purpose and authority | Hosted accounts / sign-in eligible | Audit concern |
|---|---|---:|---|
| Owner | Executive oversight, protected account governance, critical exceptions, catalog and payment destination | 4 / 2 | Broad operational reads make field allowlists important |
| System Administrator | Account lifecycle, operational and security settings, website, catalog and technical audit | 5 / 2 | Keep protected accounts and department execution outside this grant |
| Manager | Hotel oversight, exception review, coordination, reports, workforce and catalog proposals | 6 / 2 | Preserve manager review as a distinct action from Front Desk or Accounting execution |
| Front Desk | Property-wide stay operations, guest profiles, cashiering, guest services and transport | 5 / 3 | Room Rack shows a dispatch action that points at a denied generic writer |
| Housekeeping | Cleaning, readiness, housekeeping requests, supplies and custody intake | 4 / 3 | Approval filing trusted caller-provided record links |
| Maintenance | Work orders, assets, readiness restrictions and supplies | 1 / 1 | Department scoping was incomplete on approval filing and room reads included rates |
| Accounting | Collections, reconciliation, refunds, corrections, documents and operating-day close | 1 / 1 | Financial authority must be tied to action and folio, with limited operational details |
| Guest | Public booking and owned-account self-service | 27 / 20 | Booking pages should require the same complete session used by protected APIs |

Eligibility above means active and free of a recovery requirement. Active sessions were outside that count.

## Module and entry point inventory

| Area | Pages, sections and route families | Main records and actions |
|---|---|---|
| Public website and catalog | Landing, gallery, policies, privacy, terms, room search and exact rooms. `location`, `website`, `catalog`, `security-policy/public` | Public content and images, published rooms/types and amenities, nightly rate overlays, vehicle and request types, breakfast and public policy. Catalog editing has separate gates |
| Identity and access | Login, registration, verification, recovery, account settings, admin Users/Roles/Security. `auth`, `register`, `recover`, `password-reset`, `admin` | Accounts, role assignment, suspension, invitations, password/reset evidence, session counters and audit |
| Guest portal and booking | Booking details/review/payment/confirmation, My Reservations, receipts, My Stay, requests, transportation, payments, loyalty, profile, notifications, help and stay guide. `booking`, `account` | Owned holds and stays, deposit checkout, eligible changes and cancellations, receipts, request batches, breakfast, rides, rewards and reviews |
| Front Office | Dashboard, Room Management, Bookings, Guest Management, breakfast desk, QR kiosk and placards. `front-desk`, `rack`, `qr`, `resources`, `staff/reservations`, `staff/guests`, `staff/breakfast` | New bookings, walk-ins, readiness, arrivals and departures, room assignments, room moves and extensions, occupant identity and presence, guest profile and flags, check-in/out, cancellation and no-show |
| Guest service and hotel operations | Guest Requests, Hotel Operations, Operational Handover, Lost & Found. `guest-requests`, `front-desk/guest-requests`, `staff` | Review and routing, qualifying service progress, Do Not Disturb, discrepancies, handovers, rosters, custody and claim decisions |
| Housekeeping and Maintenance | Department dashboards, Housekeeping, Maintenance and Assets. `housekeeping`, `maintenance`, `manager/housekeeping`, `manager/maintenance` | Cleaning and inspection, service outcomes, assignment suggestions, work orders, repair and room service restrictions, parts, asset and preventive work |
| Inventory and procurement | Inventory, replenishment, purchase orders and receiving. `inventory` | Stock movements, counts, internal issues, draft/submission, review, receipt, cancellation and vendor reference data |
| Billing and Accounting | Billing, Transactions, Guest Folios, Payment History, Refunds, Cash & Shifts, Reconciliation and Financial Documents. `accounting`, Front Desk payment and charge actions, `staff/operational-date`, `staff/night-audit` | Folios, charges, settled payments, corrections, refund attempts, cash drawers, receipts, reconciliations, postings and immutable daily close snapshots |
| Approvals and oversight | Approvals & Escalations, Staff & Duty, Reports, Predictive Analytics, HAVEN AI and Owner workspace. `manager`, `owner`, `analytics`, `ai`, `staff/command-center`, `staff/analytical-report` | Exception intake/decision/execution, high-risk escalation, daily reports, forecasts and rate proposals, executive oversight and operational staffing |
| Governance and integrations | Admin and Owner workspaces, System Health, website and location editors, transportation and external services. `admin`, `owner`, `transportation`, `integrations`, `guest-reminders`, `webhooks` | Policies, audit, room configuration, payment destination, Xendit, Fleet, Workforce, Restaurant, delivery status and scheduled jobs. Machine endpoints use their own tokens or provider signatures |

## Findings before implementation

| Severity | Finding | Proposed repair |
|---|---|---|
| High | Exception filing checked whether the role could file any approval. The database accepted caller-supplied links and department metadata. Department staff could reach reservation exception logic outside their role, and a guest-service escalation could update a request outside the caller's department. Filer history joined reservation details to those links. | Check the action at the HTTP boundary and again in PostgreSQL. Bind the source, department and reservation to the same approved guest request under lock and limit departmental history fields. |
| Medium | Accounting reservation detail included service request text, room assignment reasons and operational turnover data. Housekeeping and Maintenance room detail selected room rates and administrative notes. | Use role-specific projections and skip unrelated queries. |
| Medium | Generic resource writes relied on a series of exceptions. Room Rack sent reclean dispatches to that generic endpoint, which already denied housekeeping task creation. | Make generic resources read-only and route dispatch through a narrow, audited command with a server-selected room and task state. |
| Medium | Staff sidebar and selected section had separate allowlists. Some booking pages treated a disabled or pending session as signed in, and Analytics POST returned 401 for a signed-in user without the grant. | Derive staff workspace navigation from one policy and use consistent session and authorization checks at affected entry points. |
| Low | Protected bookable catalog records and other read models included broad column selections. Future columns could inherit access accidentally. | Use explicit field lists on the affected read models and preserve compatibility with older schema revisions. |

No critical issue was confirmed from this source review. Historical hosted records and provider activity require independent operational review.

## Role and approval model

Keep the eight existing roles and every account assignment. Owner retains business governance and protected-role authority. System Administrator retains delegated administration. Manager controls operational oversight and decisions. Department roles keep separate execution grants. Guest remains an owned-record role. The current application has no separate payroll, security, concierge team, independent reservation desk, enterprise purchasing team, Fleet staffing or audit-only workspace. A new role should follow a distinct implemented workflow and an approved operational need.

Use named action checks alongside resource-view grants. Every new module starts denied until it declares its access. Authentication identifies the actor and revalidates the session. HTTP handlers reject missing sessions with 401, missing capabilities with 403 and inaccessible guest-owned IDs with 404 where the workflow uses privacy-preserving lookups. Database commands bind the business object and verify the actor before writing. Machine audiences retain independent credentials and routes.

Front Desk files stay exceptions. Accounting may file refund and compensation exceptions. Housekeeping and Maintenance may escalate approved, unresolved guest requests in their own department. Front Desk may escalate approved, unresolved requests from its cross-department inbox. Manager reviews, with the existing escalation to Owner for high or critical authority and existing self-review protection. Front Desk executes authorized stay operations and Accounting executes authorized financial decisions. Normal policy refunds remain an Accounting action. Prices, limits, cutoff rules and eligibility continue to come from the original server-side workflow. Direct arbitrary discounts, overbooking, deletion of stay history, transaction deletion and reopening a closed operating day have no new grant.

## Permission matrix

✓ action allowed, △ limited to the stated resource, conditions or approval, R read access, ✗ denied. Owner and Administrator also have role-specific workspaces. The table describes business authority, including endpoints used outside a sidebar. Public content remains available to every role and unauthenticated visitors.

| Module and action | Owner | Admin | Manager | Front Desk | Housekeeping | Accounting | Maintenance | Guest |
|---|---|---|---|---|---|---|---|---|
| Dashboard | R executive | R system | R property | R arrivals/stays | R cleaning | R finance | R work orders | R own stay |
| Reservations and history | R oversight | ✗ | R oversight | R operations | ✗ | R billing fields | ✗ | △ own |
| Book online and start deposit checkout | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | △ own, current hold |
| Staff reservation, walk-in, availability and quote | R rack | ✗ | R rack | ✓ | ✗ | ✗ | ✗ | ✗ |
| Occupants, ID check, presence, arrival readiness | R operational | ✗ | R operational | ✓ | ✗ | ✗ | ✗ | △ own portal |
| Private guest ID attachment | ✗ | ✗ | ✗ | △ purpose and audited | ✗ | ✗ | ✗ | △ own upload where applicable |
| Room assignment, same-type move, check-in/out, eligible stay extension | ✗ | ✗ | R | △ room, dates, balance, identity and workflow | ✗ | ✗ | ✗ | △ own express check-in |
| Cancel, no-show, guest stay change | R | ✗ | △ review exception | △ state, policy and reason | ✗ | R financial impact | ✗ | △ own policy/requests |
| Guest list, contact and request preferences | R | ✗ | R | R | ✗ | ✗ | ✗ | △ own |
| Guest saved contact and preferences | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | △ own |
| Guest flags, Do Not Rent, merge and loyalty administration | △ governance | ✗ | △ reviewed decisions/merge | △ operational flags/loyalty workflow | ✗ | ✗ | ✗ | △ own rewards |
| Ask for Manager exception | ✗ | ✗ | ✗ | △ stay and service | △ own-department service | △ refund or compensation | △ own-department service | △ own guest workflows |
| Review/execute exception | △ escalated decision | ✗ | △ version, scope and reason | △ approved operational | ✗ | △ approved financial | ✗ | ✗ |
| Room rack, condition and readiness | R | R configuration status | R | △ dispatch reclean, manage discrepancy | △ cleaning and inspection | ✗ | △ defects and repair | △ availability only |
| Housekeeping assignments, service conditions and inspection | R | ✗ | △ prioritize | △ DND, dispatch and oversight | △ assignment and role rules | ✗ | ✗ | △ own request |
| Maintenance work orders, assets, parts and serviceability | R | ✗ | △ escalation and asset workflow | R room condition | △ report issue | ✗ | △ work-order lifecycle | ✗ |
| Guest requests and progress | R oversight | ✗ | R oversight | △ intake, review and own-department progress | △ approved department requests | ✗ | △ routed work orders | △ own submission/withdrawal |
| Lost & Found | ✗ | ✗ | △ custody approval | △ custody and claims | △ custody and intake | ✗ | ✗ | ✗ |
| Handover/roster and Staff & Duty | △ oversight | ✗ | ✓ | △ department and own duty | △ department and own duty | △ department and own duty | △ department and own duty | ✗ |
| Transport requests and Fleet | R oversight | ✗ | △ review/cancel | △ booking and dispatch | ✗ | ✗ | ✗ | △ own ride and safety profile |
| Breakfast setup, entitlement and service | △ catalog | △ catalog | △ catalog/service | △ service | ✗ | ✗ | ✗ | △ own stay/date |
| Supplies and stock movement | △ oversight | △ procurement/catalog scope | △ authorized stock workflow | △ desk supplies | △ department intake/count | ✗ | △ department parts | ✗ |
| Purchase orders | △ draft/review | △ draft/review | △ draft/submit | ✗ | △ approved receiving | ✗ | ✗ | ✗ |
| Operational folio, payment history, receipts and cash | R oversight | ✗ | R stay financial summary | △ charges, permitted collections, shared drawer and documents | ✗ | ✓ | ✗ | △ own folio and eligible receipts |
| Refund payout, overpayment, financial corrections and reconciliation | R oversight | ✗ | △ exception approval | △ request only | ✗ | △ verified procedure and decision | ✗ | △ view own outcome |
| Operating day and daily close | R | ✗ | R | R blockers and operational actions | R operating date | △ activate, reconcile and close | R operating date | ✗ |
| Reports and export | R executive | R technical | △ operational review and analytics | △ daily submission and approved downloads | ✗ | △ finance and closed-day export | ✗ | △ own documents |
| Forecast, analytics and AI | △ executive | △ technical/authorized tools | △ advice and rate proposal | ✗ | ✗ | ✗ | ✗ | △ guest concierge |
| Room units, room types, amenities, photos and transport catalog | ✓ | ✓ | △ catalog and proposal controls | R operational | R room attributes | ✗ | R room attributes | R published |
| Base rates and dated plans | ✓ | ✓ | △ propose or retire | R selling quote | ✗ | R posted money | ✗ | R published quote |
| Guest request type catalog | ✓ | ✓ | ✓ | R available options | △ own work | ✗ | △ own work | R published options |
| Account provisioning, recovery and operational role assignment | ✓ | △ operational roles and targets | ✗ | ✗ | ✗ | ✗ | ✗ | △ own registration/security |
| Protected roles and Owner exception authority | △ protected target rules | ✗ | △ escalate only | ✗ | ✗ | ✗ | ✗ | ✗ |
| Hotel policies, website and public content | ✓ | ✓ | R operational policy | R operational policy | R applicable policy | R applicable policy | R applicable policy | R published |
| Security policy change | R | △ audited change | ✗ | ✗ | ✗ | ✗ | ✗ | R public sign-in policy |
| GCash payment destination configuration | ✓ | R | ✗ | ✗ | ✗ | ✗ | ✗ | △ published checkout details |
| Audit trail and System Health | R executive/audit | R governance/system | R domain activity | R authorized operational events | R own workflow history | R financial history | R work history | R own activity |
| Permanent deletion of financial or stay history, arbitrary permission editing, impersonation | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

## Front Desk authority

Front Desk operates reservations across the property. It can create a staff booking or walk-in, search profiles and available rooms, record government-ID verification and occupant presence, assign eligible rooms, extend eligible stays, handle arrivals and departures, and cancel or mark no-show under the applicable state and policy. It records permitted charges and payment, operates the shared drawer, and issues supported documents. Staff can triage guest service requests, report discrepancies, dispatch reclean, record Lost & Found custody and arrange consented transportation.

Requests for early/late overrides, nonstandard upgrades, exception refunds or compensation are filed for review. Front Desk can see the outcome and execute only the approved operational portion. Accounting handles proof review where supported, authorized refunds, overpayments, reconciliation and corrections. Front Desk has read access to operational housekeeping status and the selling quote. Account grants, configuration, protected audit, payout, rate governance and historical deletion are denied.

## Manager permissions

Manager monitors and prioritizes work, reviews reports and approvals, controls supervisory exceptions and proposes rates. The role is limited to decision and oversight authority on financial exceptions.

## Housekeeping permissions

Housekeeping reads readiness, turnover and relevant request information. Assignment, cleaning, inspection and serviceability integration use dedicated workflows. Approval filing and history follow the department and the originating guest request.

## Accounting permissions

Accounting oversees cash, approved exceptions, folios, records and the operating day. Reservation detail is scoped to financial workflow fields. Proof access, payout, reconciliation and correction each have separate checks and business rules.

## Maintenance permissions

Maintenance uses room readiness, work orders and asset history. It can restrict serviceability through authorized repair actions and escalate a routed guest request within its department.

## Administrator and Owner permissions

Administrator manages system and operational accounts within protected-role limits, with explicit grants for security and catalog changes. Owner handles executive oversight, designated policy authority, escalated business exceptions and protected roles. Routine department execution stays with the relevant operational roles.

## Account migration and rollout

The hosted ledger contained 155 entries and ended at `20261120040000` during the read-only check. The hosted approval RPC matched the repository definition and the pending queue was empty. The working tree contains newer migrations from ongoing development. The RBAC change preserves account IDs, existing roles and the authorization version contract. There are no new seeded grants or bulk account changes. Roll out the additive migration and app as a matched release. Verify current hosted state and designated staff accounts in a controlled acceptance window.

## Changes implemented

- Named permission checks in `lib/permissions.ts` and session handling in `lib/authorization.ts` drive the updated staff, finance and hotel route guards. Staff and guest booking pages validate the session before rendering. Forecast refresh, hold release and the breakfast pass distinguish a missing session from a signed-in user without permission.
- `app/api/manager/approvals/route.ts` checks the requested exception type. Migration `20261123020000_scope_approvals_and_reclean_dispatch.sql` rechecks the actor, resolves the actual associated stay, enforces department and request state, and appends actor role and resource references to the approval audit event. Manager and Owner decisions and Front Desk and Accounting execution use their existing guarded commands.
- `app/api/resources/[resource]/route.ts` allows reads with ownership or a resource grant and rejects generic writes. The retired writer helpers were removed from `lib/data.ts`. Explicit projections in `lib/staff-data.ts`, `lib/manager.ts` and the dashboard limit contact, pricing, service notes and linked record details to their intended audience.
- `config/role-navigation.ts` supplies both the visible staff sidebar and allowed section state. Front Office uses a dedicated, audited reclean command. The approval dialog offers only permitted exception types, and the generic Add and status-advance controls were removed.

## Remaining recommendations

- Run hosted acceptance with designated accounts after the coordinated migration and application release. Existing roles were verified using synthetic accounts and source-level scope, and the hosted account and ledger check was read-only.
- Confirm job assignments for the active governance accounts during the next access review. Owner and System Administrator together had four sign-in-eligible accounts. That count does not establish whether a particular account should retain its role.
- Continue migrating existing service-role read models to explicit field lists as their workflows change. The fixed projections cover the affected dashboard, guest directory, room, reservation and approval responses.
- Complete hosted monitoring of login successes when enabling stricter sign-in controls. The current login flow records failed attempts and session activity. An explicit end-to-end login-success audit event for both password and OTP flows remains outside this change.

## Verification

| Check | Outcome |
|---|---|
| TypeScript and production build | Passed on Node 22.22.2. Turbopack required Windows junction creation outside the workspace sandbox. |
| ESLint on touched files | Zero errors. Existing warnings remain in the staff dashboard and room rack. |
| Focused Vitest | 266 passed, including the eight-role HTTP matrix, inactive and pending sessions, guest ownership, and action visibility. |
| Full Vitest | 2,723 passed, 1 failed. The existing Room Rack style test expects the old `colorKey` expression in `room-board.tsx`. That file was outside these changes. |
| Isolated PostgreSQL | Migration replay and existing database regressions passed. The RBAC tests passed for all eight roles, including department and reservation binding, separate review, concurrent reclean, audit event attribution, service-role grants and protected role changes. |
| Edge and Next.js | All eight synthetic accounts signed in through NextAuth in the local production build. Protected direct URLs redirected anonymous visitors, and staff navigation and protected APIs followed each role. An existing session lost access after suspension and a version change. A guest could open their own hold and saw the not-found screen for another guest's hold. The browser used synthetic storage fixtures. |
| Hosted database | Read-only migration ledger, aggregate role eligibility, approval RPC comparison and pending approval count. App deployment and applying migrations are pending. |

## HTTP route inventory

Methods below include compatibility handlers. Retired manual payment routes return 410. The NextAuth catch-all delegates to NextAuth protocol handling. Integration and scheduled endpoints use independent machine credentials.

### account

- POST `/api/account/ai/concierge`
- POST `/api/account/loyalty/redeem`
- GET `/api/account/loyalty`
- POST `/api/account/notifications/read`
- GET `/api/account/notifications`
- PATCH `/api/account/password`
- GET, PATCH `/api/account/profile`
- POST `/api/account/receipts/[paymentId]/email`
- GET `/api/account/receipts/[paymentId]`
- POST `/api/account/requests/[id]/withdraw`
- POST `/api/account/requests`
- GET `/api/account/reservations/[id]/breakfast/[date]`
- POST `/api/account/reservations/[id]/cancel-attempt`
- GET, POST `/api/account/reservations/[id]/cancel`
- POST `/api/account/reservations/[id]/change-request`
- GET, POST `/api/account/reservations/[id]/payments`
- GET `/api/account/reservations/[id]/room-options`
- GET, POST `/api/account/reviews`
- POST `/api/account/transportation/[id]/cancel`
- GET, POST `/api/account/transportation/[id]/pickup-profile`
- GET `/api/account/transportation/[id]/ride-safety`
- POST `/api/account/transportation`

### accounting

- POST `/api/accounting/adjustments`
- GET, POST `/api/accounting/cash-exceptions`
- GET `/api/accounting/cash-shifts/[id]/follow-up`
- GET, PATCH, PUT `/api/accounting/cash-shifts/[id]`
- GET, POST `/api/accounting/cash-shifts`
- POST `/api/accounting/charges/[id]/reverse`
- POST `/api/accounting/documents`
- GET `/api/accounting/exports`
- POST `/api/accounting/hotel-fees`
- GET `/api/accounting/ledger`
- POST `/api/accounting/night-audit/close`
- POST `/api/accounting/payments/[id]/reject`
- POST `/api/accounting/payments/[id]/verify`
- POST `/api/accounting/reconciliations`
- POST `/api/accounting/refunds/[id]/fail`
- POST `/api/accounting/refunds/[id]/process`
- GET, POST `/api/accounting/xendit-reconciliation`

### admin

- GET `/api/admin/data`
- PATCH `/api/admin/deposit-method`
- GET, POST `/api/admin/email-delivery`
- DELETE, POST `/api/admin/location/images`
- DELETE, GET, POST `/api/admin/location`
- GET, PATCH `/api/admin/occupant-policy`
- GET `/api/admin/password-resets/[id]/selfie`
- PATCH `/api/admin/policy`
- PATCH `/api/admin/rooms/[id]`
- GET, PATCH `/api/admin/security-policy`
- POST `/api/admin/users/[id]/action`
- POST `/api/admin/users`
- DELETE, POST `/api/admin/website/images`
- GET, POST `/api/admin/website`

### ai

- POST `/api/ai/ask`
- GET `/api/ai/brief`
- POST `/api/ai/explain`
- POST `/api/ai/report-summary`

### analytics

- GET `/api/analytics/evaluation`
- GET, POST `/api/analytics/generate`
- GET `/api/analytics/insights`
- POST `/api/analytics/pricing-recommendations/propose`
- GET `/api/analytics/pricing-recommendations`
- GET `/api/analytics/seasonal-occupancy`

### auth

- GET, POST `/api/auth/[...nextauth]`
- GET `/api/auth/otp/challenge`
- POST `/api/auth/otp/resend`
- POST `/api/auth/otp/verify`
- GET, POST `/api/auth/session-status`

### booking

- POST `/api/booking/holds/[token]/confirm`
- DELETE, POST `/api/booking/holds/[token]/proof`
- DELETE `/api/booking/holds/[token]`
- POST `/api/booking/holds`
- GET `/api/booking/payments/[id]/proof`
- POST `/api/booking/payments/gateway`
- POST `/api/booking/payments/xendit`

### catalog

- GET, POST `/api/catalog/breakfast`
- DELETE, POST `/api/catalog/photos`
- POST `/api/catalog/rate-plans/[id]/retire`
- POST `/api/catalog/rate-plans/[id]/review`
- DELETE, PATCH `/api/catalog/request-types/[id]`
- GET, POST `/api/catalog/request-types`
- POST `/api/catalog/room-types/[id]/archive`
- GET, POST `/api/catalog/room-types/[id]/rate-plans`
- POST `/api/catalog/room-types/[id]/rate-proposal`
- PATCH `/api/catalog/room-types/[id]`
- POST `/api/catalog/room-types/rate-proposals/[id]/review`
- GET, POST `/api/catalog/room-types`
- PATCH `/api/catalog/rooms/[id]`
- GET, POST `/api/catalog/rooms`
- PATCH `/api/catalog/transport-vehicle-types/[id]`
- GET, POST `/api/catalog/transport-vehicle-types`

### front-desk

- GET `/api/front-desk/arrivals/readiness`
- GET `/api/front-desk/availability`
- POST `/api/front-desk/check-in`
- POST `/api/front-desk/deposits/[id]/verify`
- POST `/api/front-desk/fees/quote`
- POST `/api/front-desk/guest-requests/review`
- GET `/api/front-desk/guests`
- POST `/api/front-desk/reports/[id]/review`
- GET, POST `/api/front-desk/reports`
- POST `/api/front-desk/reservations/[id]/assign`
- POST `/api/front-desk/reservations/[id]/change-room`
- POST `/api/front-desk/reservations/[id]/charge`
- POST `/api/front-desk/reservations/[id]/checkout`
- GET `/api/front-desk/reservations/[id]/eligible-rooms`
- GET `/api/front-desk/reservations/[id]/extend-preview`
- POST `/api/front-desk/reservations/[id]/extend`
- PATCH `/api/front-desk/reservations/[id]/guest`
- POST `/api/front-desk/reservations/[id]/guests`
- POST `/api/front-desk/reservations/[id]/identity`
- POST `/api/front-desk/reservations/[id]/occupants/[occupantId]/presence`
- POST `/api/front-desk/reservations/[id]/occupants/[occupantId]/verify`
- POST `/api/front-desk/reservations/[id]/payment`
- POST `/api/front-desk/reservations/[id]/requests`
- GET, POST `/api/front-desk/reservations/[id]/service-condition`
- GET, POST `/api/front-desk/reservations`
- POST `/api/front-desk/room-discrepancies/[id]/resolve`
- POST `/api/front-desk/rooms/[id]/reclean`

### guest-reminders

- GET, POST `/api/guest-reminders`

### guest-requests

- POST `/api/guest-requests/[id]/progress`

### housekeeping

- GET `/api/housekeeping/assignment-suggestions`
- POST `/api/housekeeping/reservations/[id]/service-condition`
- POST `/api/housekeeping/rooms/[id]/discrepancies`
- POST `/api/housekeeping/tasks/[id]/assign`
- POST `/api/housekeeping/tasks/[id]/complete`
- POST `/api/housekeeping/tasks/[id]/defer`
- POST `/api/housekeeping/tasks/[id]/inspect`
- POST `/api/housekeeping/tasks/[id]/maintenance`
- POST `/api/housekeeping/tasks/[id]/service-outcome`
- POST `/api/housekeeping/tasks/[id]/start`

### integrations

- POST `/api/integrations/fleet/pickup-photo`
- POST `/api/integrations/fleet/transport-status`
- POST `/api/integrations/restaurant/breakfast/v1`
- POST `/api/integrations/workforce/availability`

### inventory

- GET, POST `/api/inventory/movements`
- POST `/api/inventory/purchase-orders/[id]/cancel`
- POST `/api/inventory/purchase-orders/[id]/receive`
- POST `/api/inventory/purchase-orders/[id]/submit`
- POST `/api/inventory/purchase-orders/approvals/[id]/review`
- GET, POST `/api/inventory/purchase-orders`

### location

- GET `/api/location/images/[id]`
- GET `/api/location`

### maintenance

- GET, POST `/api/maintenance/asset-work`
- POST `/api/maintenance/assets/[id]/[action]`
- GET, POST `/api/maintenance/assets`
- POST `/api/maintenance/orders/[id]/[action]`
- POST `/api/maintenance/orders`

### manager

- POST `/api/manager/approvals/[id]/escalate-owner`
- POST `/api/manager/approvals/[id]/execute`
- POST `/api/manager/approvals/[id]/financial-execute`
- POST `/api/manager/approvals/[id]/record-acceptance`
- POST `/api/manager/approvals/[id]/review`
- GET, POST `/api/manager/approvals`
- POST `/api/manager/housekeeping/[id]/prioritize`
- POST `/api/manager/maintenance/[id]/escalate`
- GET `/api/manager/staff-duty`

### manager_dashboard

- GET `/api/manager_dashboard`

### owner

- GET `/api/owner/data`
- POST `/api/owner/exceptions/[id]/review`
- PATCH `/api/owner/payment-destination`
- DELETE, POST `/api/owner/payment-qr`

### password-reset

- POST `/api/password-reset/request`
- POST `/api/password-reset/verify`

### qr

- POST `/api/qr/express-checkin`
- GET `/api/qr/reservation/[id]`
- POST `/api/qr/resolve`
- POST `/api/qr/room/[roomId]/rotate`
- GET `/api/qr/room/[roomId]`

### rack

- GET `/api/rack`

### recover

- POST `/api/recover/[token]`
- POST `/api/recover/[token]/selfie`

### register

- POST `/api/register`

### resources

- GET, PATCH, POST `/api/resources/[resource]`

### security-policy

- GET `/api/security-policy/public`

### staff

- GET `/api/staff/analytical-report`
- POST `/api/staff/breakfast`
- GET `/api/staff/command-center`
- GET, PATCH, POST `/api/staff/guests/[id]/flags`
- PATCH `/api/staff/guests/[id]/loyalty`
- GET, PATCH `/api/staff/guests/[id]`
- GET, POST `/api/staff/guests/duplicates`
- POST `/api/staff/guests/merge/preview`
- POST `/api/staff/guests/merge`
- GET, PATCH `/api/staff/handover/[id]`
- GET `/api/staff/handover/assignees`
- GET `/api/staff/handover/references`
- GET, POST `/api/staff/handover`
- GET, POST `/api/staff/handovers`
- GET `/api/staff/hotel-fees`
- GET, POST `/api/staff/lost-found`
- GET `/api/staff/night-audit`
- GET `/api/staff/occupants/in-house`
- GET, POST `/api/staff/operational-date`
- GET, POST `/api/staff/operations`
- DELETE `/api/staff/reservations/[id]/flag-overrides/[overrideId]`
- GET, POST `/api/staff/reservations/[id]/flag-overrides`
- GET `/api/staff/reservations/[id]/guests`
- GET `/api/staff/reservations/[id]/readiness`
- GET, PATCH `/api/staff/reservations/[id]`
- GET, POST `/api/staff/reservations/[id]/verify-id`
- GET `/api/staff/room-discrepancies`
- GET `/api/staff/rooms/[id]`
- GET, POST `/api/staff/workforce`

### transportation

- GET, POST `/api/transportation/[id]/fleet`
- POST `/api/transportation/[id]/transition`
- GET `/api/transportation/guests`
- GET, POST `/api/transportation`

### webhooks

- POST `/api/webhooks/payments`
- POST `/api/webhooks/xendit`

### website

- GET `/api/website/images/[id]`
