# Backend audit — 2026-11-02

**Initial audit result: 24 source findings — 9 P1 (high), 15 P2 (medium).**

**Remediation update:** the user authorized all findings except B-005. The other 23 are
implemented and verified locally; the numbered database migration awaits coordinated rollout.
See [remediation results](C:/Projects/HOTEL-MANAGEMENT/docs/qa/backend-remediation-2026-11-02.md).
The findings/evidence below preserve the original audit state.

This audits checkout `5f3994a` plus the existing working tree. There were substantial pre-existing changes, including `lib/data.ts`; they were preserved. Findings describe the local implementation and ordered migration definitions. They are not an assertion that the deployed database has identical function bodies.

## Scope and evidence

- Inventoried all **141 API route files** and **100 SQL migration files**; inspected route authorization patterns and current definitions across authentication, recovery, booking, payment processing, reservation operations, housekeeping/inventory, loyalty, accounting, analytics, notifications, QR, and deployment checks.
- Read `SYSTEM.md`, current handoff/status, relevant decisions and known issues. Used migration ordering to check replacements rather than treating historical definitions as current.
- Deep review concentrated on boundaries that can change identity, money, ownership, inventory, and operational state. This is a broad, risk-driven audit, not proof that every possible backend defect has been found.
- **Runtime evidence:** the offline probe script executes the real gateway parser and real session-expiry helper with the installed NextAuth encoder. All three intended-behavior probes fail. It performs no network calls or database writes.
- **SQL evidence:** migration definitions and schema constraints were traced statically. No SQL exploit was executed against hotel data.
- Live metadata verification was attempted in a read-only transaction under `service_role`: the connection was refused. The service-role migration-ledger API also failed to connect. Applied versions, live function drift, live data consistency, and production configuration remain unverified.

### Checks actually run

| Check | Result |
|---|---|
| `npm test` | Initial attempt could not import tests because the sandbox denied temporary-cache renames. Retry with workspace-local `TEMP`/`TMP`: **189 files, 2,097 tests passed**. |
| `npx eslint app/api lib --output-file ... --format json` | **0 errors, 2 warnings**. Warnings: `lib/motion/reduced-motion.ts`, unused import in `lib/ota-readiness.test.ts`. |
| `npm run typecheck` | **Failed**, beginning at `.next/dev/types/routes.d.ts:182`: malformed generated declarations. Repeated with the same result. No claim that source typechecking passed. |
| `npm run build` | **Failed**: could not fetch Inter and Playfair Display from Google Fonts. Environment/network blocker; this does not establish a backend compilation defect. |
| `node docs/qa/backend-audit-probes.mjs` | **3/3 intended-behavior probes failed**, reproducing B-005 and B-009. Exit 1 is deliberate when those bugs are present. |
| Browser / live lifecycle / live SQL | **Not run successfully**. No production writes, migrations, payments, account changes, or emails were issued. |

## P1 — fix first

### B-001 — A guest can cancel a reservation that has no linked user

**Location:** [cancellation RPC](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024080000_cancel_settles_pending_state.sql:28), [customer POST route](C:/Projects/HOTEL-MANAGEMENT/app/api/account/reservations/[id]/cancel/route.ts:67).

The RPC tests ownership with `actor='guest' and r.user_id<>p_actor_user_id`. For a Front Desk/walk-in reservation whose `user_id` is NULL, that expression is NULL, so PL/pgSQL does not enter the rejection branch. The customer POST route delegates ownership entirely to this RPC; unlike its GET preview, it does not check the reservation owner first. A signed-in guest who obtains such a reservation ID can cancel another person's eligible stay and affect its folio/refund state. The same function also lacks `actor is null` in its authority guard.

**Fix:** require an active non-null actor and use `r.user_id IS DISTINCT FROM p_actor_user_id` for guests, inside the RPC. Verify the NULL-owner walk-in case as well as ordinary cross-guest access.

### B-002 — Generic reservation PATCH bypasses protected workflows

**Location:** [generic PATCH](C:/Projects/HOTEL-MANAGEMENT/app/api/resources/[resource]/route.ts:8), [direct table update](C:/Projects/HOTEL-MANAGEMENT/lib/data.ts:30).

Front Desk is allowed to PATCH reservations through the generic resource route. Only truthy `status`, `room_id`, and `room_number` are blocked. Other supplied columns are forwarded to a service-role table update without a field allowlist or reservation-specific schema. This admits changes to dates, room type, totals, deposit requirements, ownership, identity state, and policy snapshots without the protected RPC's locks, pricing, approval, or audit rules. For example, changing stay dates this way leaves room-assignment dates unsynchronized.

**Fix:** remove reservations from generic mutation entirely and route supported edits through their existing protected operations. This matches SYSTEM.md's architecture and is smaller than maintaining another business-rule implementation.

### B-003 — Incorrect OTP attempts roll back their own counter and audit

**Location:** [OTP verifier](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261010010000_login_otp.sql:144).

On a wrong code, `auth_otp_verify` increments `attempt_count`, may set `invalidated_at`, writes a failure audit row, then raises `OTP_INCORRECT`. The uncaught exception aborts that RPC transaction, rolling back those writes. The too-many-attempts and expired branches likewise write before raising. Normal incorrect submissions therefore do not accumulate toward the configured attempt limit or preserve their failure audit. Both login and password-reset verification use this RPC.

**Fix:** return a failure result after committing the counter/audit changes; translate it to HTTP 401/403 in the route. Keep the row lock. Add a real PostgreSQL test that submits wrong codes across separate committed RPC calls. PostgreSQL's [exception semantics](https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING) explain why the present writes disappear.

### B-004 — Self-service reset reactivates suspended/inactive accounts

**Location:** [reset request](C:/Projects/HOTEL-MANAGEMENT/app/api/password-reset/request/route.ts:43), [recovery completion](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261022010000_password_reset_audit.sql:65).

The public reset request reads `active` but does not reject an inactive/suspended account. After email OTP and image upload, the common recovery RPC unconditionally sets `account_status='active'`, `active=true`, and `recovery_required=false`. A staff member who was administratively suspended but still controls their email can therefore undo that governance decision via self-service recovery. Reset tokens are not distinguished from an administrator's onboarding/reactivation authorization.

**Fix:** preserve lifecycle state on self-service password changes. Allow activation only for a separately identified, authorized onboarding/reactivation token, checked atomically at completion.

### B-005 — Real PayMongo paid-event envelopes are silently ignored

**Location:** [event parser](C:/Projects/HOTEL-MANAGEMENT/lib/gateway-store.ts:24), [webhook route](C:/Projects/HOTEL-MANAGEMENT/app/api/webhooks/payments/route.ts:33), [existing fixture](C:/Projects/HOTEL-MANAGEMENT/lib/paymongo.test.ts:32).

`confirmGatewayEvent` reads top-level `event.type`. The documented events envelope places the event type at `data.attributes.type`; the Hosted Checkout documentation also shows an envelope with `data.type` and `data.data`. The route passes the raw parsed request directly into the parser. Both documented envelopes return `ignored` before any payment lookup. The webhook responds HTTP 200, so collected money can remain an unconfirmed reservation with no provider retry. Existing tests place `type` at an invented top-level position and miss the failure.

**Fix:** validate and normalize the actual provider envelope at the boundary, then extract event ID, session ID, paid status, currency, and amount consistently. Use recorded/sanitized provider fixtures. **Runtime reproduced:** both envelope probes fail. Provider references: [Events](https://docs.paymongo.com/docs/developer-tools-webhooks-events), [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout).

### B-006 — Opening a cash shift calls a nonexistent PostgreSQL function

**Location:** [latest cash-shift opener](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024110000_shared_cash_drawer.sql:34), also migration `20261024090000`.

The advisory lock calls `hashtextended('cash_shift_open',0)`. PostgreSQL's function is `hashtextextended`; there is no compatibility helper defining the misspelled name in this repository. On a database matching these migrations, every valid open-shift call fails before inserting a shift. The route's generic error hides this cause. This directly explains a source-level failure consistent with the still-active drawer-less cash workaround.

**Fix:** add a migration correcting the name in the current function body, verify open/collect/close/reopen, then retire the cash bypass once its prerequisite is fixed. PostgreSQL's [implementation](https://github.com/postgres/postgres/blob/master/src/backend/access/hash/hashfunc.c) confirms the actual function spelling. Live function bodies were unavailable, so a deployed manual correction is not ruled out.

### B-007 — Mixed nightly prices violate the booking-hold schema

**Location:** [mixed-rate calculation](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20260929010000_room_rate_plans.sql:233), [hold constraint](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20260826132411_guest_booking_flow.sql:59).

`create_booking_hold` intentionally computes `v_uniform=NULL` when a stay has more than one nightly rate, then inserts it into `booking_holds.nightly_rate`. That column is `NOT NULL`; no later migration removes the constraint. A stay crossing a weekend/seasonal rate boundary therefore fails to create a hold even though the search can show it and the per-night total is valid.

**Fix:** migrate the display-only legacy column to nullable, or write a valid compatibility value while preserving `nightly_rates`/`subtotal` as the price authority. Test a stay spanning two distinct prices against the migration-built schema.

### B-008 — The supported migration-only install lacks `room_is_sellable`

**Location:** [migration caller](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20260916010000_physical_room_management.sql:76), [snapshot-only definition](C:/Projects/HOTEL-MANAGEMENT/supabase/schema.sql:1828).

Inventory and booking functions call `room_is_sellable`, but none of the 100 migration files defines it. Its body exists only in `schema.sql`, which SYSTEM.md explicitly excludes from the supported installation path (`supabase db push`). A clean migration-built environment cannot reliably execute these booking workflows. This confirms the previously documented remote-only-helper gap; it is not a claim that the existing remote database lacks it.

**Fix:** add the verified helper definition and service-role permissions to an additive migration. Verify a clean schema replay and actual booking calls, not just an already-provisioned database.

### B-009 — Session renewal resets the clock used as the absolute lifetime

**Location:** [session enforcement](C:/Projects/HOTEL-MANAGEMENT/lib/auth.ts:143), [expiry calculation](C:/Projects/HOTEL-MANAGEMENT/lib/security-policy.ts:174). Installed dependency trace: `next-auth/core/routes/session.js:73` → `next-auth/jwt/index.js:44`.

The app treats JWT `iat` as the original sign-in time. NextAuth's session endpoint re-encodes the token and its installed encoder always replaces `iat` with the current time. A session refreshed through `/api/auth/session` before expiry therefore receives a fresh absolute-lifetime origin. An active user can repeatedly renew beyond the configured maximum. This also defeats SESSION_MAX_AGE as an absolute sign-in ceiling because `exp` is renewed. The ordinary App Router `getServerSession` call itself does not send the renewed cookie; the public NextAuth session endpoint does.

**Fix:** store an immutable login-issued timestamp in the token, set it only at successful password/OTP authentication, and enforce the maximum against it through renewals and updates. **Runtime reproduced:** a login originally seven hours old, renewed, is still `active` two hours later under an eight-hour maximum.

## P2 — correctness and reliability

### B-010 — Guests can delete payment proof after it becomes financial evidence

**Location:** [proof DELETE](C:/Projects/HOTEL-MANAGEMENT/app/api/booking/holds/[token]/proof/route.ts:45), [proof stored on payment](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20260921010000_payment_proof.sql:53).

DELETE checks hold ownership and path shape but not hold status or whether a payment references the object. Submission attaches the same `pending/<token>/...` path to the payment; it does not move it. The guest can reuse the deletion endpoint after submission or verification, leaving an immutable payment pointing to missing proof. An error/retry cleanup in the confirmation route can also remove a referenced path because it does not check reference state before deletion.

**Fix:** delete only truly unreferenced staging objects, with a submission/deletion protocol that prevents races, or move/copy submitted evidence into a protected finalized namespace.

### B-011 — Gateway submission ignores the seasonal-rate resolver

**Location:** [restored gateway RPC](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024040000_restore_submit_gateway_deposit.sql:65).

The latest gateway submit compares `room_types.base_rate` to `hold.nightly_rate`, while manual submit correctly compares the resolved per-night sum to the held subtotal. A valid uniform promotional/seasonal hold is rejected as RATE_CHANGED when its rate differs from base. Gateway reservations also omit the frozen `nightly_rates` breakdown. Mixed-rate holds remain separately blocked by B-007.

**Fix:** bring the gateway path onto the same per-night validation and snapshot contract as manual submission. Test base, seasonal-uniform, mixed, and changed-after-hold cases.

### B-012 — Booking/check-in paths disagree on whether a room is usable

**Location:** [gateway inventory](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261021010000_paymongo_gcash_automation.sql:76), [latest direct check-in](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024130000_eta_honored_checkin.sql:37), [canonical eligibility](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20260919010000_room_assignment_exception_inventory.sql:11).

Gateway settlement uses the old `status <> 'maintenance'` count, omitting administrative activation and the full maintenance-block predicate. Direct Front Desk check-in accepts any available/clean matching room and never checks `administratively_active`; posting directly can bypass the room picker's exclusion of a retired room. Its maintenance test also differs from the canonical serviceability helper. Consequently search, picker, settlement, and execution can disagree about capacity/readiness. The exception trigger checks eligibility only for type-changing check-ins, leaving the same-type path exposed.

**Fix:** apply the existing authoritative sellability/eligibility predicates in every execution path, retaining required locks. Verify both positive and negative paths for inactive and maintenance-blocked rooms.

### B-013 — Loyalty redemption on a pending deposit makes it unverifiable

**Location:** [redemption eligibility and invoice update](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261015010000_guest_loyalty_submodule.sql:101), [deposit invariant](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024070000_gateway_abandonment.sql:106), [gateway invariant](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261021010000_paymongo_gcash_automation.sql:74).

Redemption admits `pending` reservations and reduces `invoices.amount`, while leaving `reservations.total` and the staged deposit unchanged. Both manual and gateway deposit verifiers require invoice amount to equal reservation total and raise PAYMENT_AMOUNT_MISMATCH otherwise. A guest with points can therefore strand their own submitted reservation by making a valid redemption before Accounting/provider confirmation.

**Fix:** block redemption until deposit confirmation, or explicitly make the pricing/deposit/redemption model consistent inside one transaction. The first option is the smaller change if it matches product policy.

### B-014 — Loyalty tier calculation counts the latest stay twice

**Location:** [award function](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261015010000_guest_loyalty_submodule.sql:55).

The function first adds the stay total to `guests.lifetime_spend`, then selects that updated value and adds the same stay total again when calculating the tier. A guest with zero previous spend completing a PHP 10,000 stay has PHP 10,000 recorded spend but is promoted using PHP 20,000. Since downgrades are forbidden, the premature tier and its higher future point multiplier persist.

**Fix:** derive the tier from the updated lifetime spend once. Verify just below, at, and across the actual thresholds.

### B-015 — Redemption can consume more points than the credit it grants

**Location:** [credit cap](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261015010000_guest_loyalty_submodule.sql:104), [full point deduction](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261015010000_guest_loyalty_submodule.sql:106).

The credit is capped at `least(p_points, invoice.amount)`, but the guest loses all `p_points` and the ledger records that full debit. Redeeming 500 points against a PHP 100 folio burns 500 points for PHP 100 of credit. The route has no cap against the folio amount/balance.

**Fix:** reject excessive redemptions or deduct only the points actually converted. Explicitly settle whether redemption may create folio credit on a fully paid stay.

### B-016 — Stock consumption is non-atomic and depends on the completion endpoint

**Location:** [consumption helper](C:/Projects/HOTEL-MANAGEMENT/lib/inventory-movements.ts:58), [task completion caller](C:/Projects/HOTEL-MANAGEMENT/app/api/housekeeping/tasks/[id]/complete/route.ts:9), [other completion route](C:/Projects/HOTEL-MANAGEMENT/app/api/guest-requests/[id]/progress/route.ts:7).

Consumption reads quantity, calculates a replacement in JavaScript, writes quantity, and separately inserts a movement after task completion has committed. Concurrent completions can read the same stock and overwrite one another; a write failure can still produce a movement, and a later failure cannot roll back the task. Completing the same inventory-linked request through `staff_progress_guest_request` performs no stock deduction at all. Generic quantity adjustment also records its movement before updating stock.

**Fix:** use one transaction for the fulfillment transition, locked/atomic decrement, and uniquely keyed movement, shared by all completion paths. An optional forecast log must not masquerade as authoritative stock consumption.

### B-017 — Deposit method OFF is not enforced by manual confirmation

**Location:** [manual confirm policy gate](C:/Projects/HOTEL-MANAGEMENT/app/api/booking/holds/[token]/confirm/route.ts:30), [independent method toggle](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024050000_deposit_method_toggle.sql:41).

Manual confirmation rejects only `deposit_method='paymongo'`; it accepts `off` if the independently stored GCash destination is enabled and complete. The toggle changes `deposit_method` without disabling `gcash_enabled`. A guest can therefore submit a fresh manual deposit while new deposits are explicitly switched off by posting to the API. Already-submitted payments should remain verifiable, but that does not require allowing a new submission.

**Fix:** require `deposit_method='manual'` for a new manual submission and enforce it transactionally in the submission RPC. Preserve verification of existing submissions separately.

### B-018 — Financial/operational metrics are computed from truncated lists

**Location:** [ledger fetch limits](C:/Projects/HOTEL-MANAGEMENT/lib/accounting.ts:75), [metrics](C:/Projects/HOTEL-MANAGEMENT/lib/accounting.ts:103), [Owner reads](C:/Projects/HOTEL-MANAGEMENT/app/api/owner/data/route.ts:126), [dashboard table loader](C:/Projects/HOTEL-MANAGEMENT/lib/data.ts:13).

Ledger metrics sum only the newest 300 payments/invoices and 200 other records. Owner metrics use similar latest-300/500 slices. An old unpaid invoice or pending refund disappears from totals once enough newer rows exist. Other table loaders fetch without pagination and encounter the configured PostgREST row cap. These are not complete aggregates or consistently defined reporting windows, so totals and open-work counts drift as history grows. Supabase documents a [default 1,000-row response maximum](https://supabase.com/docs/reference/javascript/select); the live project's actual limit was not available.

**Fix:** compute complete filtered aggregates/counts in SQL, and paginate display lists independently. Include an old open item outside the first page in verification.

### B-019 — Read failures become healthy-looking empty/zero financial data

**Location:** [ledger `take`](C:/Projects/HOTEL-MANAGEMENT/lib/accounting.ts:75), [rack queries](C:/Projects/HOTEL-MANAGEMENT/app/api/rack/route.ts:34), [customer financial joins](C:/Projects/HOTEL-MANAGEMENT/lib/customer.ts:60).

Several service-role reads discard Supabase's `error` and use `data ?? []`. Ledger failures therefore return HTTP success with zero revenue/balance/queue metrics; rack failures look like no reservations or unavailable balances; customer financial join failures look like no payments/refunds. This can drive incorrect operational decisions during a DB outage or schema mismatch.

**Fix:** distinguish authoritative query failure from a genuinely empty dataset. Fail the payload or return an explicit unavailable section; never silently present zero money as measured fact.

### B-020 — Durable notification writes are detached from the request lifetime

**Location:** [cancel notification](C:/Projects/HOTEL-MANAGEMENT/app/api/account/reservations/[id]/cancel/route.ts:86), similar calls in deposit verification, payment review, change requests, and transportation.

Routes call `void notifyWithOptionalEmail(...)` and return. The durable notification insert occurs asynchronously before email delivery, outside the business transaction and without a runtime continuation mechanism. A process freeze/termination or a DB error after the operation commits can lose the bell event permanently, with no retry record. This conflicts with treating in-app notifications as durable event history, even though email is intentionally best-effort.

**Fix:** await the durable insert at minimum while preserving non-fatal error handling. If delivery must survive retries/outages, write an idempotent event/outbox with the business transaction and process email separately. Do not count a started promise as a committed notification.

### B-021 — Analytics reports a completed generation before predictions exist

**Location:** [completed model row](C:/Projects/HOTEL-MANAGEMENT/lib/analytics/runner.ts:55), [later prediction writes](C:/Projects/HOTEL-MANAGEMENT/lib/analytics/runner.ts:68).

Each model run is inserted as `completed`, followed by a separate prediction insert. Failure during that insert leaves a successful-looking empty run, can prevent the remaining models from running, and activates the one-hour cooldown. The health panel uses this stored status as success. The cooldown is also checked separately from claiming a generation, allowing concurrent refresh requests through.

**Fix:** claim the run atomically, record running/failed states, and mark completed only after all required prediction writes succeed. Keep the cooldown based on the intended success/attempt policy rather than an orphan completed row.

### B-022 — Recovery accepts a selfie belonging to another recovery token

**Location:** [upload path/log association](C:/Projects/HOTEL-MANAGEMENT/app/api/recover/[token]/selfie/route.ts:46), [completion storage read](C:/Projects/HOTEL-MANAGEMENT/app/api/recover/[token]/route.ts:34), [RPC shape-only validation](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261022010000_password_reset_audit.sql:60).

The uploader associates an image with a token via `password_reset_logs`, but completion only checks that the supplied path has the shared UUID filename shape and contains image bytes. Neither route nor RPC checks that it was staged for the token being consumed. A person who has a valid recovery link can reuse another known recovery image path, compromising the reset's identity-evidence attribution. This does not independently bypass the recovery token or prove that any uploaded image is a real identity match.

**Fix:** bind the staged object to the recovery token and compare that association under the token lock before accepting it. Preserve an immutable record of the accepted proof.

### B-023 — Expired early-check-in approval still authorizes express check-in

**Location:** [express timing gate](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261016010000_express_checkin_and_gateway.sql:158), [staff timing comparison](C:/Projects/HOTEL-MANAGEMENT/supabase/migrations/20261024130000_eta_honored_checkin.sql:34).

Express check-in rejects early arrival only when `early_check_in_approved_until IS NULL`. Any non-null timestamp, including one in the past, bypasses that restriction. Staff check-in correctly tests `early_check_in_approved_until > now()`. The two entry points therefore apply different approval expiry rules.

**Fix:** use the current timestamp verdict in both paths and test NULL, expired, and live approvals with the same reservation snapshot.

### B-024 — Production builds explicitly bypass TypeScript verification

**Location:** [Next configuration](C:/Projects/HOTEL-MANAGEMENT/next.config.mjs:10).

`typescript.ignoreBuildErrors=true` permits production builds with application type errors. The repository has no checked-in CI workflow enforcing the separate typecheck gate. The current generated-declaration failure illustrates that this gate is not green; a successful future build alone would not establish type safety of route contracts or database payloads.

**Fix:** restore build-time checking, or enforce a mandatory separate typecheck gate before deployment. Regenerate the malformed ignored Next artifacts without modifying source types to hide them. The Google Fonts build failure observed during this audit is a separate environmental limitation.

## Additional risks and known limitations

These are not additional counted findings:

- `CASH_BYPASS_ACTIVE=true` in the Front Desk payment route currently permits paid cash rows with no drawer. This is an explicit existing workaround, not a newly discovered policy change. B-006 should be resolved before deciding when to remove it; audit and reconcile existing unattributed cash.
- Password-only NextAuth cookies use the fixed route configuration, while the custom OTP mint path applies cookie-policy lifetime options. The documented cookie-policy-OFF/browser-session behavior needs an explicit integration test on both authentication paths.
- Reset requests claim enumeration-safe responses, but successful known-account requests return `challengeId` while unknown-account requests do not, and delivery failures can return a different status. This exposes account existence. No email addresses were enumerated in this audit.
- Snapshot and documentation drift are already recorded in KI-002/KI-003. `SYSTEM.md`'s startup counts and several workflow claims lag current code. This audit does not rewrite business authority to match defective behavior.
- Real provider delivery, database grants/RLS, storage lifecycle/retention, deployed schema constraints, current balances, and actual migration checksums still need a connected staging/live metadata check. Passing local contract tests is not equivalent to those checks.

## Suggested repair sequence

1. Close the ownership, generic mutation, OTP, recovery-lifecycle, and session-lifetime failures (B-001–004, B-009). Verify their negative cases against real PostgreSQL where applicable.
2. Repair payment intake and cash opening (B-005–008, B-010–013, B-017); verify provider-shaped events, clean schema replay, and room eligibility before accepting new production traffic through changed paths.
3. Correct loyalty and inventory accounting (B-014–016), then complete aggregates and error reporting (B-018–019).
4. Make notifications/analytics execution durable (B-020–021), bind recovery evidence and approval expiry (B-022–023), and restore deployment verification (B-024).

No remediation, migration application, commit, or deployment is included in this audit.
