# 2026-09-26 - Standards Audit & Approval Execution Fixes

## Task

1. **Full business-process audit** ("check the overall process of the system, the business
   logic and all of the flows — is it a valid hotel management system? what can be
   improved? what can be automated?"). Read-only assessment against standard hotel
   management practice; report delivered in chat.
2. **Priority 6 bug fixes** from the audit's roadmap (user picked these over the
   night-audit cron after research showed the cron would duplicate existing behavior).

## Audit verdict (summary)

**Valid, above-standard core PMS** for a single boutique property: the reservation
lifecycle, front office, housekeeping, maintenance, folio/cashiering, refunds, governance
(RBAC double-enforced, append-only audit, frozen policy snapshots), and reporting are
complete and connected. Commercial gaps: no tax/VAT lines on documents, no payment
gateway (manual proof verification by design), no night audit, flat single rate per type,
no group/corporate blocks, no CRM guest profile, deferred inventory. Prioritized roadmap
was delivered in chat and the session plan.

**Night-audit cron research finding (why it was skipped):** every planned job is already
covered — hold expiry runs lazily at the top of every availability consumer; the payment
deadline was deliberately removed (20260907: staff verification has no deadline);
no-show candidates are derived live on the Manager attention queue
(`lib/manager-attention.ts` "Arrival unresolved"); the daily report snapshot is rebuilt
server-side at submit time; assignment release on cancel is handled by the
`reservations_release_terminal_assignment` trigger; and no code path ever sets
`rooms.status='reserved'`.

## What was delivered (bug fixes)

Migration `20260926010000_approval_execution_fixes.sql` (pushed + live-verified),
recreating two SECURITY DEFINER functions from their LIVE bodies with three fixes:

1. **`reservation_modification` invoice rewrite** — execution used to replace
   `invoices.amount` with a bare room reprice (target rate × new nights), silently
   dropping transportation fares and posted upgrade differences. Now reprices the room
   component only: `new_total = target rate × new nights + sum(folio_charges)`, and
   balances settle through `sync_invoice_financials` (the D-008 never-rewrite-the-folio
   rule). Pre-stay folio charges can only be transport itemization and upgrade
   differences (posting and extensions require `checked_in`), so the sum is exactly the
   non-room component.
2. **Early check-in window** — execution stamped a blanket `now()+8h` and ignored the
   requested time. Now approves through `requested_action.requestedTime` on the check-in
   date, in the reservation's policy-snapshot timezone; the 8h window remains only as
   fallback for legacy/unparseable requests and requests whose time already passed at
   execution (an approval must never be stillborn).
3. **`front_desk_assign_room` missing `administratively_active`** — a retired but clean
   room could be assigned at the desk. Now raises `ROOM_INACTIVE`; the assign route maps
   it to "That room is administratively retired."

## Verification

- `npx supabase db push` applied 20260926010000; live bodies verified via DIRECT_URL
  (`ROOM_INACTIVE` present, folio sum present, `requestedTime` present).
- `lib/approval-execution-fixes.test.ts` — new source-scan test, 3/3.
- `npm run typecheck` clean; `npm run lint` — 1 error only
  (`admin-dashboard-client.tsx:217` render purity), which is the parallel session's
  in-flight AuditView work, pre-existing.
- Full suite 837/838 — the single failure (`lib/room-type-exception.test.ts:52`,
  expects `reservedRooms.map(room)` but the route now maps with color keys) is the
  parallel session's in-flight eligible-rooms refactor, not this work.

## Affected files

- `supabase/migrations/20260926010000_approval_execution_fixes.sql` (new)
- `app/api/front-desk/reservations/[id]/assign/route.ts` (+`ROOM_INACTIVE` message)
- `lib/approval-execution-fixes.test.ts` (new)
- `SYSTEM.md` — §7.4 (assign eligibility incl. retired rooms; early check-in window
  semantics), §7.8 (modification reprice preserves folio charges), §15 (assign-room gap
  bullet removed)
- `nano_bots/05 Memory/Current Status.md`

## Unresolved / next

- Manual UI verification of the three fixes needs role logins (Front Desk assign on a
  retired room → ROOM_INACTIVE message; Manager-approved early check-in honored through
  the requested time; a modification on a folio that carries transport/upgrade charges).
- Roadmap items still open: tax-compliant documents (needs an inclusive-vs-exclusive
  pricing decision), guest profile aggregation, rate plans, guest emails, payment
  gateway, schema.sql refresh.
- The earlier pre-existing flags are now resolved by this migration: the invoice rewrite
  and the 8h window were both listed in [[2026-09-23 - Stay Extension Workflow]]'s
  unresolved-next.
