# Next Tasks

Not a backlog. Only tasks relevant to upcoming development. Completed tasks are removed once
their outcome is captured in [[Current Status]], [[Decisions]], or a session note.

## Immediate

- [ ] Manual UI verification of the staff notification surfaces: Manager approvals badge + toast
      on a new exception, accounting-only Deposit Verification/Refunds badges (Front Desk gains
      none), housekeeping badge decrement on task completion, toast auto-dismiss leaves bell +
      badge intact, 390px layout (Front Desk + Manager + Accounting logins; checklist in
      [[2026-09-11 - Session 06]])
- [ ] Manual UI verification of the stay extension flow: Extend stay dialog (server preview
      figures, conflict pill, transportation flag), room-conflict → exception handoff →
      Manager approve → Front Desk execute (in place and with same-type room move),
      Manager reject, pre-arrival reservation routes to modification, late checkout still
      same-day-only (checklist in [[2026-09-23 - Stay Extension Workflow]])
- [ ] Manual UI verification of the room-type change flow: reason select, hotel-caused warning,
      acceptance button, Manager financial-responsibility section, hotel vs guest end-to-end
      (Front Desk + Manager logins; checklist in [[2026-09-22 - Room-Type Change Responsibility]])
- [ ] Manual UI verification of the booking Review page (guest login + live hold; checklist in
      [[2026-09-09 - Session 01]])
- [ ] Manual UI verification of the payment-proof upload flow (checklist in
      [[2026-09-09 - Session 02]])
- [ ] Commit the uncommitted working tree (exception flow + responsibility rework + parallel
      features: room catalog, transport, event notifications, payment proofs)

## Soon

- [ ] Refresh the stale Level-1 vault docs ([[KI-006]]) — Overview, Roadmap, API Routes,
      Data Model, Folder Structure, Setup & Commands
- [ ] Refresh `supabase/schema.sql` from the live schema ([[KI-002]]; now also missing the
      20260922010000 and 20260923010000 columns/RPCs)

## Deferred

- [ ] Deploy the current tree to Vercel (project/team IDs and the Hobby commit-attribution
      workaround are recorded in the Claude auto-memory `vercel-deploy-facts`, not in this
      vault)
