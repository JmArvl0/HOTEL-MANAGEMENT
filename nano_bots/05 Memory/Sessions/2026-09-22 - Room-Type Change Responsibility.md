# 2026-09-22 - Room-Type Change Responsibility

Task: implement room-type change / upgrade financial responsibility rules — the system derives
who pays from a Manager-approved structured reason, never a manual "who pays?" control.
Supersedes [[D-004]]; resolves [[KI-001]]. Full rule: SYSTEM.md §7.8 "Room-type change
financial responsibility"; decision record [[D-008]].

## What was delivered

- **Migration `20260922010000_room_type_change_responsibility.sql`** (pushed, live-verified):
  `room_type_change_responsibility()` reason→payer helper; `guest_accepted_at/by` columns on
  `manager_approval_requests`; recreated `request_manager_approval` (reasonCode validation,
  client-financial-field strip, server-stamped `requested_action.financials` frozen at request
  time), `review_manager_approval` + insert/approval triggers (NOT_NEEDED / SAME_TYPE gates now
  branch on responsibility — guest-requested voluntary upgrades are legitimate while reserved-type
  rooms remain; legacy rows without `financials` are rejected with `ROOM_TYPE_EXCEPTION_REASON_REQUIRED`),
  `front_desk_execute_manager_approval` (room_upgrade uses the stamped difference, requires
  acceptance), `front_desk_check_in` (responsibility branch replaces unconditional repricing;
  nights staleness guard; invoice rewrite removed), new `record_room_type_change_acceptance`
  (posts the folio charge for arrival-time exceptions at acceptance, idempotent on the approval
  id; assigns no room, checks nobody in). All recreated from LIVE bodies (drift preserved).
- **Latent bug fixed en passant:** the old check-in exception branch overwrote
  `invoices.amount`, silently dropping transportation-fare and other charges from the folio
  total; the new branch never rewrites the invoice.
- **Server routes:** `/api/manager/approvals` (reasonCode required for room_type_exception +
  room_upgrade; `CLIENT_FINANCIAL_FIELDS` rejected; new error maps), new
  `/api/manager/approvals/[id]/record-acceptance`, eligible-rooms endpoint always returns
  `alternativeRoomTypes` + stamped `financials` + `guestAcceptedAt` + `typeRate`.
- **UI:** arrival dialog — grouped reason select (Hotel-caused / Guest-requested), hotel-caused
  warning while reserved-type rooms remain, preview line, approved-exception financial callout
  with "Record guest acceptance" button, financial-step upgrade-charge row, responsibility-aware
  step-3 totals. Manager dashboard — `ApprovalReviewModal` Financial responsibility section
  (reason, payer, original total, target rate × nights, difference; negative-difference flag;
  legacy no-financials note); generic form gains the reason select, loses
  `priceDifference`/`waived`. FormDialog gained `groups` (optgroups); approval-display hides
  `financials` and labels `reasonCode`.
- Wizard-resume persistence (parallel Session 05 work) completed and integrated.

## Verification

- typecheck clean, lint 0 errors (70 pre-existing warnings, none in touched code), **759/759
  tests pass** (the previously-failing `room-type-exception` pin test rewritten; the
  reservations-panel and room-catalog flakes did not recur), build clean.
- `supabase db push` applied 20260922010000; live verification: columns exist, all 8 recreated
  RPC bodies carry this migration's markers, no anon/authenticated/public EXECUTE grants,
  `room_type_change_responsibility()` returns hotel/guest/null correctly, ledger row present.

## Affected files

Migration 20260922010000; `lib/room-type-change-reasons.ts` (+test); `lib/room-type-exception.test.ts`;
`lib/manager.ts`; `lib/approval-display.ts`; `app/api/manager/approvals/route.ts`;
`app/api/manager/approvals/[id]/review/route.ts`; `app/api/manager/approvals/[id]/record-acceptance/route.ts`;
`app/api/front-desk/reservations/[id]/eligible-rooms/route.ts`; `app/api/front-desk/check-in/route.ts`;
`components/manager/front-desk-arrival-dialog.tsx`; `components/manager/manager-dashboard-client.tsx`;
`components/ui/FormDialog.tsx`; `app/manager-dashboard-theme.css`; SYSTEM.md; vault memory.

## Unresolved / next

- Manual UI verification pending (needs logged-in Front Desk + Manager accounts): reason
  select, acceptance button, Manager financial section, hotel vs guest end-to-end flows.
- Working tree still uncommitted — commit before new work.
