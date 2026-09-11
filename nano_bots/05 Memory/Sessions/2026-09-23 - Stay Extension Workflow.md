# 2026-09-23 - Stay Extension Workflow + Exception Dropdown Audit

Task: implement an explicit **stay extension** workflow (extra nights — the checkout *date*
changes) as a supported business case, and audit the entire Manager Exception dropdown end to
end. Stay extension stays deliberately distinct from late checkout (same date, later *time*).
Full rule: SYSTEM.md §7.4 (extend stay) and §7.8 ("Stay extension"); decision record [[D-009]].

## What was delivered

- **Dropdown audit (all options functional — nothing removed).** Every generic
  "Request Manager exception" option traced UI → route → RPC → review → execution → audit:
  `room_upgrade`, `reservation_modification` (this **is** the pre-arrival checkout-extension
  path), `early_check_in`, `late_checkout`, `guest_compensation`, `refund_exception`,
  `checkout_exception` — all live business cases with working handlers, server validation,
  correct routing, and audit trails. Actions: label clarifications only ("Room type change
  (mid-stay)", "Stay extension (extra nights)", "Late checkout (same day)", "Checkout exception
  (folio override)"). `room_type_exception` remains intentionally absent from the generic form
  (arrival dialog only, [[D-003]]).
- **Migration `20260923010000_stay_extension_exception.sql`** (pushed, live-verified; RPCs
  recreated from LIVE bodies): `stay_extension` added to the approval-type allowlist in
  `request_manager_approval` with in-house (`STAY_EXTENSION_REQUIRES_IN_HOUSE`) + later-date
  (`STAY_EXTENSION_INVALID_DATE`) gates and a server-stamped
  `requested_action.stayExtension` snapshot (`{currentCheckOut, requestedCheckOut, nights,
  rate, additionalAmount, projectedTotal, roomConflict, roomNumber, roomType}`; client-supplied
  snapshot stripped, `financials` pattern); `review_manager_approval` approves only in-house
  with a valid stamp (a room conflict does NOT block approval — execution enforces integrity);
  `front_desk_execute_manager_approval` stay_extension branch performs the **same**
  `front_desk_extend_stay` (idempotency key = approval id — one extension implementation, all
  guards re-run atomically) after an optional validated **same-type** room move
  (`EXTENSION_ROOM_NOT_READY` / `EXTENSION_ROOM_UNAVAILABLE`); new read-only
  `front_desk_extend_stay_preview` (service_role only, revoked from public/anon/authenticated).
- **Normal path first:** Front Desk's plain extension never routes through the Manager when the
  room is free. The new `components/manager/extend-stay-dialog.tsx` (replaces the old askForm)
  previews every figure from the new `GET /api/front-desk/reservations/[id]/extend-preview`
  (debounced; nights/rate/additional lodging/projected total/balance/room conflict — never
  client-derived), and on `EXTENSION_REQUIRES_ROOM_CHANGE` shows the "Request Manager exception"
  handoff button that posts the `stay_extension` request pre-filled (no re-entry). Departure
  transportation booked on the old checkout date is flagged, never rescheduled.
- **Review/execution UI:** `ApprovalReviewModal` renders the stamped stay-extension section
  (current → requested checkout, nights, rate × nights, additional lodging, projected total,
  room-conflict badge + same-type-move note); `stay_extension` is Front Desk-executable
  (`canExecuteNow`); `executeManagerApproval` prompts for a same-type room and retries once
  when execution hits `EXTENSION_REQUIRES_ROOM_CHANGE`. `stayExtension` joins `financials` in
  approval-display's hidden keys; `requestedCheckOut` labeled. Approvals route validates
  `requestedCheckOut` (and rejects a client-supplied `stayExtension` stamp); execute route maps
  the new error codes.
- Pricing rule unchanged and reused: current room-type `base_rate` × added nights (the same
  rule `front_desk_extend_stay` already applied). No new pricing policy.

## Verification

- typecheck clean, lint 0 errors (70 pre-existing warnings — the new dialog's effect was
  restructured to add none), **788/788 tests pass** (25 new: `lib/stay-extension.test.ts`
  source-scan 18, `extend-stay-dialog.test.tsx` jsdom 6, approvals-view stay_extension case 1),
  build clean (57/57).
- `supabase db push` applied 20260923010000 (number checked against local files AND remote
  ledger first, [[D-001]]); live verification: all four RPC bodies carry the stay_extension
  markers, preview grants limited to postgres + service_role, and a real preview call against
  dev reservation RSV-1045 returned correct server-computed figures
  (`nights 3, rate 11600, additionalAmount 34800, projectedTotal 58000, roomConflict false`).

## Affected files

Migration 20260923010000; `components/manager/extend-stay-dialog.tsx` (+test);
`components/manager/manager-dashboard-client.tsx`; `components/manager/approvals-view.test.tsx`;
`lib/stay-extension.test.ts`; `lib/manager.ts`; `lib/approval-display.ts`;
`app/api/manager/approvals/route.ts`; `app/api/manager/approvals/[id]/execute/route.ts`;
`app/api/front-desk/reservations/[id]/extend-preview/route.ts` (new); SYSTEM.md §7.4, §7.8,
§10, §11; vault memory.

## Unresolved / next

- Manual UI verification pending (needs logged-in Front Desk + Manager accounts): normal
  extension via the new dialog; room-conflict → exception → Manager approve → FD execute in
  place; execute with same-type room move; Manager reject (no date/charge change);
  preview-server authority; late checkout still same-day-only.
- Pre-existing (flagged in the audit, deliberately not changed): `reservation_modification`
  execution rewrites `invoices.amount` (can drop unrelated charges such as transportation
  fares) — same class of bug D-008 fixed for room-type changes; early check-in's approved
  window is 8h from execution (requested time is informational).

## Manual UI checklist

1. Front Desk → in-house reservation → Extend stay: server preview figures, conflict pill,
   transportation flag when a departure trip is booked on the old date.
2. Room-conflict case: submit → conflict error + handoff → approval appears in the Approvals
   queue with the stamped extension figures.
3. Manager login → Approvals & Escalations → Review: Stay extension section, conflict badge,
   same-type note; approve.
4. Front Desk → execute: extends in place if the conflict cleared; room-move prompt if not
   (same-type only); folio gains one `extension` charge at the current rate; QR/checkout dates
   follow automatically.
5. Manager reject: no date or folio change.
6. Late checkout option still demands a same-day timestamp; stay extension demands a later date.
