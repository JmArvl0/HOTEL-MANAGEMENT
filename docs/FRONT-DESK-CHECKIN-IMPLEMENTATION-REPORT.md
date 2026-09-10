# HAVEN — FRONT DESK ROOM ASSIGNMENT & CHECK-IN IMPLEMENTATION REPORT

**Scope:** Guided Front Desk arrival → room assignment → check-in workflow, plus the Manager-authorized **room-type exception** consumed atomically inside the check-in RPC.
**Deliverable status:** READY FOR REVIEW.

---

1. **Requirement met.** A `confirmed` reservation arriving on its check-in date can now be walked through a guided Identity → Financial → Eligible room → Check-in flow by a `front_desk` user, reusing the existing single Reservations board, existing RBAC, existing audit trail, and existing authoritative `front_desk_check_in` RPC. No duplicate reservation or room systems were introduced; nothing existing was redesigned.

2. **Constraint compliance.** Purely additive surface: three RPC bodies recreated with new branches spliced in, one widening CHECK constraint, one optional query parameter on an existing route, one error-map extension, one new client component, one dashboard wiring edit, one new CSS block, one new vitest file. No schema tables added, no reservation history rewritten, no data deleted.

3. **Room-type exception decision (per approved plan).** The one permitted deviation — checking a guest into a *different* active room type when no eligible room of the reserved type exists — is a **new Manager-approval type `room_type_exception`**, consumed **inside** `front_desk_check_in`. It does **not** reuse the `room_upgrade` executor, which would have split check-in away from the single atomic gate suite and re-introduced the forbidden double system.

4. **Additive migration created.** `supabase/migrations/20260912020000_room_type_exception_checkin.sql` (numbered free in both local files and the remote ledger). It recreates `request_manager_approval`, `review_manager_approval`, and `front_desk_check_in` from their current authoritative bodies (as patched NULL-safe by `20260830040000`) with the exception branches spliced in, preserving every pre-existing line.

5. **Recreation mechanism is ACL-safe.** All three RPCs are recreated with `create or replace function` (not drop+create), so the execute grants established by earlier migration files are preserved — no `revoke`/`grant` tail is needed and no permission hole is opened.

6. **Constraint widen is additive-only.** `manager_approval_requests_request_type_check` is dropped `if exists` and re-added with the same nine values plus the new `'room_type_exception'` — a pure widening, applied in the same migration that uses it.

7. **`request_manager_approval` — allowlist.** The inline type check now admits `'room_type_exception'` alongside `'room_upgrade'`, `'reservation_modification'`, `'early_check_in'`, `'late_checkout'`, `'guest_compensation'`, `'refund_exception'`, `'checkout_exception'`, `'guest_escalation'`.

8. **`request_manager_approval` — new-type validation.** When `p_request_type='room_type_exception'`, the RPC raises `ROOM_TYPE_EXCEPTION_TYPE_REQUIRED` if `requested_action->>'roomType'` is missing/blank, `ROOM_TYPE_EXCEPTION_SAME_TYPE` if the target equals the reservation's current `room_type`, and `ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE` if the target is not an active `room_types` row. Reason remains mandatory under the existing `INVALID_APPROVAL_REQUEST` gate.

9. **`request_manager_approval` — actor and audit unchanged.** The null-safe actor gate (`actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting') → APPROVAL_REQUEST_FORBIDDEN`), the `normal_result` snapshot, the unique-pending guard, and the `'request_manager_approval'` audit entry are byte-for-byte the existing logic.

10. **`review_manager_approval` — reviewer gate unchanged.** Manager/owner/admin-only null-safe gate (`MANAGER_REVIEW_FORBIDDEN`), `SELF_APPROVAL_FORBIDDEN`, and version-safe compare (`a.status<>'pending' or a.version<>p_expected_version`) are untouched — the exception cannot be self-approved and cannot approve a stale row.

11. **`review_manager_approval` — approve branch.** A new `p_decision='approve' and a.request_type='room_type_exception'` branch mirrors the existing `room_upgrade` review: it re-reads the target type (must be active and differ from the reserved type), counts **same-type eligible** rooms under the same clean/available/serviceable/conflict predicate the eligible-rooms route uses — `>0` raises `ROOM_TYPE_EXCEPTION_NOT_NEEDED` — and counts **target-type eligible** rooms — `0` raises `ROOM_TYPE_EXCEPTION_UNAVAILABLE`. Approval leaves `execution_status='awaiting_execution'`, exactly like the non-escalation types.

12. **`review_manager_approval` — deny branch.** The existing deny path (`execution_status='cancelled'`, `reviewed_by/at`, version bump, audit) is preserved unchanged for the new type.

13. **`front_desk_check_in` — every existing gate still runs.** The full suite is preserved in order inside the one transaction: `RESERVATION_NOT_CHECKIN_READY`, `GUEST_DETAILS_REQUIRED`, `RESERVATION_DEPOSIT_REQUIRED`, `OUTSIDE_CHECKIN_WINDOW`, `EARLY_CHECKIN_NOT_ALLOWED`, `IDENTITY_VERIFICATION_REQUIRED`, `FOLIO_NOT_FOUND`, `REMAINING_BALANCE_REQUIRED`, then room selection with `ROOM_TYPE_MISMATCH`, `ROOM_NOT_READY`, `ROOM_UNDER_MAINTENANCE`, `ROOM_ALREADY_ASSIGNED`. `expire_booking_holds()` runs first and the reservation/invoice/room rows are still locked `for update`.

14. **`front_desk_check_in` — same-type path unchanged.** When `room.type = r.room_type` the original branch is taken verbatim; reservations with no exception are unaffected in any way.

15. **`front_desk_check_in` — mismatch path.** On a type mismatch the RPC looks for the reservation's newest **approved, `execution_status='awaiting_execution'`** exception whose `requested_action->>'roomType'` equals the chosen room's type. None found → the original `ROOM_TYPE_MISMATCH` is raised; found → execution continues.

16. **`front_desk_check_in` — target still active.** The target type is re-verified against `room_types` inside the transaction; a deactivated type raises `ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE`.

17. **`front_desk_check_in` — repricing arithmetic.** `new_total := round(t.base_rate * (r.check_out − r.check_in), 2)`; `new_paid := i.paid` — identical semantics to the existing `reservation_modification` executor so revenue stays consistent. Deposits are never touched, re-charged, or refunded.

18. **`front_desk_check_in` — balance rollback.** If `new_total > new_paid` the RPC raises `ROOM_TYPE_EXCEPTION_BALANCE_DUE`, rolling the whole transaction back — the operator must collect the repriced difference first, then re-submit the check-in.

19. **`front_desk_check_in` — booking records.** The invoice is updated exactly as the modification executor does: `amount=new_total`, `balance=greatest(new_total−new_paid,0)`, `credit_balance=greatest(new_paid−new_total,0)`, and `status` set to `credit`/`paid`/`partial`/`unpaid` accordingly. The reservation gets `room_type=room.type` and `total=new_total`; the shared assignment-and-occupied tail is untouched.

20. **`front_desk_check_in` — exception consumption and audit.** On success the approval row is marked `execution_status='executed'` with `executed_by`, `executed_at`, a `version` bump, and an `'execute_room_type_exception'` audit entry carrying `reservationId`, `previousRoomType`, `roomType`, `room`, and `newTotal`. The normal `'reservation_check_in'` audit still records the shared tail.

21. **Single atomicity guarantee.** Assignment insert/reuse, reservation `checked_in`/`checked_in_at`, room `occupied`, and both audit rows all commit or roll back together in the one RPC — there is no separate pre-execution step that could strand a half check-in.

22. **Eligible-rooms route — normal behavior unchanged.** `app/api/front-desk/reservations/[id]/eligible-rooms/route.ts` with no query param returns byte-for-byte what it returned before (available + clean + `administratively_active`, minus maintenance-blocked/out-of-service and conflicting assignments).

23. **Eligible-rooms route — `?exceptionType=`.** The optional parameter is server-authoritative: it returns only rooms of the requested type **and** only when the reservation actually has an approved, unexecuted `room_type_exception` matching that type (`.eq("request_type","room_type_exception").eq("status","approved").eq("execution_status","awaiting_execution").eq("requested_action->>roomType",exceptionType)`). The client can never widen its own options.

24. **Eligible-rooms route — rate exposed.** The row includes `rate` so the arrival dialog can preview the repriced total before the Manager exception is executed.

25. **Check-in route — error map extended.** `app/api/front-desk/check-in/route.ts` now maps `ROOM_TYPE_EXCEPTION_BALANCE_DUE` → "Collect the repriced balance for the approved room type before check-in." and `ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE` → "The approved room type is no longer active." All pre-existing mappings and the `front_desk`-only allowlist are unchanged.

26. **Manager approval library already understood the type.** `lib/manager.ts` `MANAGER_APPROVAL_TYPES` already included `'room_type_exception'`, so the approvals route (`z.enum(MANAGER_APPROVAL_TYPES)`) accepted it with no change; the request-builder in the dashboard now surfaces the type with its target-room-type field.

27. **New client component — `components/manager/front-desk-arrival-dialog.tsx`.** A self-sufficient, stateless four-step wizard (`0 identity → 1 financial → 2 room → 3 review`) rendered in the existing branded `Modal` kit (`dialogs.view`), fed the reservation detail already fetched by `viewReservation` (`/api/staff/reservations/{id}` → reservation + invoice).

28. **Wizard Step 0 — Identity.** Shows `identity_status`; when unverified, "Verify identity" calls the existing identity POST and refreshes the detail before the step advances.

29. **Wizard Step 1 — Financial.** Shows Total / Deposit paid / Balance from the invoice; when a balance is due, "Collect payment" reuses the existing payment collection action; the step only advances once the server reports the reservation check-in-ready.

30. **Wizard Step 2 — Room (type-locked).** Fetches eligible rooms with no parameter and renders selectable room cards (number, type, housekeeping/availability state). The reserved type always constrains the list — a guest can never be assigned from an arbitrary room card.

31. **Wizard Step 2 — empty list → exception request.** When no eligible room of the reserved type exists, the primary action becomes "Request Manager approval" pre-filled as `room_type_exception` with a free-text target room type (validated to differ from the reserved type) and a reason. On approve/deny the dialog detects the outcome via the approvals API.

32. **Wizard Step 2 — refresh after approval.** With an approved, awaiting-execution exception in hand, "Refresh eligible rooms for {type}" fetches `?exceptionType=` and lists only that type's eligible rooms; selecting one arms the final step. Selecting a room always re-checks that the reservation is still check-in-ready.

33. **Wizard Step 3 — review & check in.** Shows guest, room, dates, and any repriced total; the final action posts to the existing `/api/front-desk/check-in` route and renders any gate error inline with a go-back affordance to Identity/Financial. Success → toast, parent list refresh, dialog closes, and the row/detail render the reservation as `checked_in` with the existing in-house actions.

34. **Dashboard wiring — `components/manager/manager-dashboard-client.tsx`.** `checkIn` call sites now route through `openArrival`, the reservations row and detail "Assign & check in" actions both open the guided dialog, and the dialog renders above the detail modal. The dialog stays owned by the parent so one modal renders at a time.

35. **Arrivals lane.** For `front_desk`, the Reservations section now shows a readiness strip under the queue pills computed from already-fetched rows (no new fetch): total arriving today, already in-house, plus warn chips for confirmed arrivals that need ID verification, are unassigned (`!room_number`), or carry a folio balance due — or an "all confirmed ready" ok chip.

36. **Approvals Execute special-case.** For `request_type==="room_type_exception"`, the Approvals list's "Execute as Front Desk" button opens the guided arrival dialog for that reservation (execution *is* the final check-in) instead of the generic room-number prompt — so an approved exception flows straight into the same wizard that consumes it.

37. **Style integration.** `app/manager-dashboard-theme.css` gained one self-contained `.arrival-*` block (lane, stepper, option cards, fields, notices) with explicit `.theme-light .app-shell` overrides matching the incumbent dark/light token conventions; no global tokens were changed.

38. **Tests — new `lib/room-type-exception.test.ts`.** A vitest text-assertion suite (repo style, no live DB) reading the migration plus the check-in/eligible/review/request routes, `lib/manager.ts`, and both dashboard components, covering: normal-check-in gate and row-lock retention; eligibility denials; RBAC/actor gates; the exception request validation; Manager review (NOT_NEEDED / UNAVAILABLE / SELF_APPROVAL); in-RPC consumption, repricing, balance rollback, execution marking, and audit; and the client wiring (Arrival lane, wizard, approvals Execute special-case).

---

## Quality gates (fresh runs, 2026-09-06)

- **`npm test`** — 382 passed / 24 files (includes the new suite and every pre-existing suite).
- **`npm run typecheck`** — clean, exit 0.
- **`npm run lint`** — 0 errors, 60 warnings (pre-existing, repo-accepted).
- **`npm run build`** — success, exit 0.
- **`git diff --check`** — CLEAN (only informational CRLF line-ending notices).

## Verification performed

- Migration numbered free in local files **and** the remote ledger (ledger currently ends at `20260912010000`; `20260912020000` is not present).
- **Live-schema dry-run against `DIRECT_URL` (rolled back, nothing persisted):** the full migration executes cleanly inside `BEGIN…ROLLBACK` — the widened constraint re-adds, all three recreated bodies carry the `room_type_exception` branches, and the transaction commits nothing.
- **Live migration NOT applied:** per the standing "do not push production unless explicitly requested" constraint, `supabase db push` was not run. The three live RPC bodies still predate the exception branches. Applying is a one-step action owned by you: `! supabase db push` — after which a re-read of the three live bodies will confirm them in place (drift check).

## Suggested manual browser pass (after push)

Sign in as `front_desk` → Reservations → Arrival readiness lane → "Assign & check in" on a confirmed arrival → walk Identity → Financial → Room → Check in; when the reserved type has no eligible room, request the exception, approve it as `manager`, return, "Refresh eligible rooms for {type}", select, check in; confirm the row flips to `checked_in`, the detail shows in-house actions, and a second operator's concurrent check-in of the same room is refused with `ROOM_ALREADY_ASSIGNED`.

---

**READY FOR REVIEW** — the sole outstanding environment step is the one-command `supabase db push` of the additive migration, which awaits your explicit go-ahead per the push constraint.
