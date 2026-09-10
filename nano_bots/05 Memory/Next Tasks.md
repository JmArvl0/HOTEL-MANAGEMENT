# Next Tasks

Not a backlog. Only tasks relevant to upcoming development. Completed tasks are removed once
their outcome is captured in [[Current Status]], [[Decisions]], or a session note.

## Immediate

- [ ] Manual UI verification of the booking Review page (guest login + live hold; checklist in
      [[2026-09-09 - Session 01]])
- [ ] Manual UI verification of the payment-proof upload flow (checklist in
      [[2026-09-09 - Session 02]])
- [ ] Fix the 2 deterministic failures in the untracked
      `components/manager/manager-reservations-panel.test.tsx`
- [ ] Manual UI verification of the check-in exception flow (Front Desk + Manager logins)
- [ ] Commit the uncommitted working tree (exception flow + parallel features: room catalog,
      transport, event notifications, payment proofs)

## Soon

- [ ] Confirm the exception repricing policy with the business ([[KI-001]])
- [ ] Refresh the stale Level-1 vault docs ([[KI-006]]) — Overview, Roadmap, API Routes,
      Data Model, Folder Structure, Setup & Commands
- [ ] Refresh `supabase/schema.sql` from the live schema ([[KI-002]])

## Deferred

- [ ] Deploy the current tree to Vercel (project/team IDs and the Hobby commit-attribution
      workaround are recorded in the Claude auto-memory `vercel-deploy-facts`, not in this
      vault)
