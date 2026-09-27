# Next Tasks

Not a backlog. Only tasks relevant to upcoming development. Completed tasks are removed once
their outcome is captured in [[Current Status]], [[Decisions]], or a session note.

## Immediate

- [ ] **System Health visual QA (KI-005)** — needs an Admin session on `:3000`. In
      **both themes**: no card text is tinted (tone sits on the value line only); the
      dark-mode tone contrast reads correctly (the old `--ops-*-ink` tones were
      2.77–3.58:1 there). At ~1100 / ~900 / ~700px: cards step 4 → 2 → 1, the lower
      split collapses at 1100px, and the ledger table never crushes. Confirm the audit
      table's **Entity** column is left-aligned. Confirm the automations rail shows a
      real last-run time, or "No sends recorded" / "No runs recorded".
      **Ledger panel specifically** ([[2026-09-26 - System Health Ledger Conflict Fix]]):
      the three pills are inset from the card border and **tabbing to them shows a
      full focus ring** (it was clipped by the theme's `overflow:hidden`); on each of
      the three tabs the heading, the rows/table and the pagination share one left
      edge; at ~680px and ~390px the migrations table's Name column stays readable.
      **Column geometry** ([[2026-09-26 - Ledger Table Column Geometry]], [[D-031]]):
      the migrations Status badge and the audit Entity value should sit **immediately
      after** the previous column's text, with the empty space only at the far right
      of the card — the leftover is carried by the last column of each table on
      purpose. Shrinking the card must move that trailing edge, not reopen the gaps.
      **The wide Status column is confirmed correct** — do not report it as a defect
      or "fix" it by giving Status a width; that is the layout the user rejected.
- [ ] **Add `VERCEL_TOKEN` as a Vercel project env var.** Deployment tier 1 (env /
      branch / commit) renders today; tier 2 — the actual newest-build outcome — stays
      dormant until the token is set. Verified-safe: a missing or failing token is not
      an error, it just falls back to tier 1.

- [ ] Authenticated visual QA of the universal UI foundation at desktop, tablet, and
      390px: My Reservations; Manager Reservations; one Front Desk, Accounting,
      Housekeeping, Maintenance, Owner, and System Administrator searchable module;
      verify light/dark contrast, search-first order, All-first/default, no Apply,
      HavenSelect keyboard behavior, clear controls, and no page-level overflow.
      **Search/filter-specific (D-026):** in **light theme** confirm no card, border,
      radius, shadow or padding has reappeared around the search+chips row, the search
      input is a **single** surface (no nested second box), chips keep their fill and
      active state, and the results table/cards **keep** their own container. The
      stylesheet guard passes whether or not this is visibly right — it is not a
      substitute.

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
