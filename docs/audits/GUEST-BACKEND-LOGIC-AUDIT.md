# Guest backend, business logic and privacy audit

Audit date: November 24, 2026, Philippine time. The evidence and release verdict are indexed in the [Guest Experience Audit](GUEST-EXPERIENCE-AUDIT.md).

## Request and record trace

| Guest action | Frontend and server path | Authoritative records and enforcement |
| --- | --- | --- |
| Browse and search | Landing planner or `StaySearchPanel` → `/booking/search` → `parseSearchIntent` and `getAvailability` | Active room types, physical rooms, overlapping reservations and holds, maintenance and active rate plans. Exact-room page reads `guest_room_choices`. |
| Register and return | `RegisterForm` → `/api/register` → NextAuth credentials → safe internal callback | `user_accounts` and guest profile creation. Separate login policy controls OTP, account status, retry budgets and session lifetime. Browser signup preserved the selected stay and breakfast. |
| Hold and review | `GuestDetailsForm` → `POST /api/booking/holds` → `create_booking_hold_attempt` | SQL claim checks the actor, dates, capacity, exact room and idempotency key, then freezes rates and the optional breakfast offer. |
| Wallet checkout and confirmation | `XenditCheckout` → `/api/booking/payments/xendit` → provider → `/api/webhooks/xendit` → `hotel_process_xendit_event` | SQL supplies the payable amount and owns attempt creation and transition. The webhook reads the provider session independently before applying a payment to the folio. The browser return only shows or polls state. |
| My Stay and documents | Customer layout → `requireCustomerSession` → `getCustomerOverview`, `getCustomerReservationDetail` and `/api/documents/[kind]/[id]` | Reservation ownership comes from `reservations.user_id`. The guest booking PDF requires ownership. Checkout folio reads also constrain guest ownership and require an issued record. |
| Manage booking | `ReservationActions` → change request or cancellation route | Change requests have their own review history. Eligible self-service changes can execute through SQL. Cancel delegates pricing and policy to `cancel_reservation`. |
| Guest services | Booking details, My Stay requests and transportation | Breakfast uses dated offers and entitlements. Requests persist against the owned stay. Transportation can be requested with consent and filed after verification, with confirmed fare and dispatch handled through the Fleet boundary. |
| Account | Profile and password routes with a signed-in customer session | The profile write is scoped by authenticated actor. Password changes call the account-security workflow and require reauthentication. Browser/session enforcement and database policies merit separate release acceptance. |

## Detailed findings

### GUEST-001 · Live payment is unavailable

**Page / feature** Public booking and wallet checkout · **Category** Functional bug / release readiness · **Severity** Critical · **Priority** P0 · **Effort** Large · **Verification** Confirmed mode constraint.

**Evidence and steps** Search an available room in the isolated build with legacy manual payment configured. Checkout remains closed. With the development wallet fixture configured, proceed to payment. The screen says Test mode. `xenditConfig()` accepts only development keys, `testCheckoutUrl()` accepts only test-hosted URLs, and `bookingCheckoutEnabled()` requires Xendit. [Checkout unavailable](evidence/2026-11-24-guest/checkout-unavailable.png) · [Configuration](../../lib/xendit.ts#L5) · [Checkout gate](../../lib/booking-checkout-policy.ts#L5).

**Expected** The approved production environment collects and reconciles real payments or presents a deliberate assisted reservation path. **Actual / impact** The audited build cannot collect real online payments. A property relying on direct checkout cannot onboard real paying guests through this candidate. The test-mode guard is intentional and correctly prevents live collection.

**Solution / acceptance** Owner and Finance choose the production payment contract or explicitly operate an assisted-only launch. For direct booking, separately authorize production mode, keep strict environment isolation, verify provider account and returns, and pass settlement, expiry, cancellation/refund and reconciliation on the intended release before enabling guest traffic.

### GUEST-007 · Bodyless guest actions receive HTTP 415

**Page / feature** Signed-in guest shell, booking pages and active room holds · **Category** Functional bug / session reliability · **Severity** High · **Priority** P1 · **Effort** Small · **Verification** Both requests failed in Edge. Expiry during a real 30-minute session was untested.

**Evidence and steps** Sign in on the local build and interact with the guest-details form. Network records show `POST /api/auth/session-status` returning 415 repeatedly. Open an owned active hold and confirm Release hold from My Reservations. `DELETE /api/booking/holds/[token]` also returns 415 and PostgreSQL still reports `active`. Both clients intend to send a bodyless request. The proxy applies its JSON or multipart requirement when the runtime exposes a request body stream, and neither handler expects a payload. [Hold error](evidence/2026-11-24-guest/release-hold-error.png) · [Release client](../../components/customer/active-booking-holds.tsx#L38) · [Activity client](../../components/auth/session-expiry-guard.tsx#L93) · [Proxy](../../proxy.ts#L19).

**Expected** Guest interaction renews the eligible idle session within its absolute limit, and release clears the owned active hold so the room becomes sellable. **Actual / impact** Both requests are rejected before their route handlers run. An active guest may hit the idle deadline, and a guest who no longer wants their held room cannot release it through the browser while the blocked inventory waits for expiration.

**Solution / acceptance** Define explicit request-body contracts for these actions while retaining origin checks, and audit other bodyless mutations at the same boundary. Verify a browser click produces 200 plus persisted activity, and that release returns 204 plus freed stock. Verify idle and absolute expiry, wrong-account and already-submitted hold denials, and that malformed or disallowed payloads still fail.

### GUEST-012 · Guest history reads scale with the whole account

**Page / feature** My Stay, My Reservations, Payments and Requests · **Category** Performance / backend · **Severity** Medium · **Priority** P2 · **Effort** Medium · **Verification** Potential issue from source. No guest-scale latency or truncation was measured.

**Evidence and review steps** Follow the customer overview request. Its financial and requests helpers read the guest's reservation history, then fan out using reservation or invoice IDs and slice overview sections in application memory. The access scope is correct and common-case local browsing was usable. [Overview and loaders](../../lib/customer.ts#L77).

**Expected** Upcoming stays and their next actions load predictably as visit history grows, with separate bounded history navigation. **Actual / impact** Query size, result size and work increase with the history. Large histories may slow the account or exceed upstream row limits.

**Solution / acceptance** Push overview snapshot limits and past-stay pagination to the query/model boundary. Keep totals and ownership intact and measure short and long histories with a dedicated fixture. Record completeness, request count, payload and p95 before and after the change.

## Security and privacy observations

- Registration and credential flows have separate validation and rate-budget checks in source. The SQL gate preserved failed OTP attempts across separate transactions. Browser-driven account recovery, real delivery and session revocation acceptance are still due. [Auth](../../lib/auth.ts) · [SQL results](GUEST-QA-TEST-RESULTS.md#database).
- Guest routes enforce actor ownership before loading reservation details and guest documents. State changes delegate to SQL with an actor ID. The reviewed activity bug is a reliability defect and did not demonstrate an authorization bypass. [Reservation read](../../lib/customer.ts#L139) · [Document route](../../app/api/documents/%5Bkind%5D/%5Bid%5D/route.ts).
- State-changing JSON routes run through an origin/content-type guard. NextAuth and provider callbacks have their own protocols. Release acceptance should exercise normal denials for anonymous and wrong-role requests and owned versus other synthetic records. [API proxy](../../proxy.ts) · [Authorization](../../lib/authorization.ts).
- The public privacy destination is missing substantive privacy information. See GUEST-003 for the guest impact and acceptance criteria. Separate policy review should cover account and ID data, retention, service providers, Fleet sharing, and privacy contact before accepting real guest details. [Policy finding](GUEST-UI-UX-AUDIT.md#guest-003).

## Production data and partner dependencies

The local database replay proves migration compatibility in this PostgreSQL fixture. Compare the target applied migration ledger with the release SHA as part of rollout acceptance. Property approval is required for rate presentation, cancellation and refund terms, deposit policy and actual room media. Finance owns settlement and revenue reconciliation. Fleet owns vehicle/driver availability and trip execution. The guest UI needs honest handoffs for both. [System contract](../../SYSTEM.md) · [Partner boundaries](../ENTERPRISE_BOUNDARIES.md).
