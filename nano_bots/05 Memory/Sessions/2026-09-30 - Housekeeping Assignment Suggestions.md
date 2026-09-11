# Housekeeping Assignment Suggestions (Roadmap Phase 6)

**Date:** 2026-09-30
**Scope:** Post-audit roadmap Phase 6 — housekeeping assignment **assistance, advisory only**.
Suggested plan → human review → manual assignment through the existing audited route.
Nothing auto-assigns. No migration.

## What was built

- **`lib/housekeeping-suggestions.ts`** (pure, no Supabase import): `suggestAssignments(tasks, staff)` —
  - Candidates: unassigned `pending`/`assigned`/`deferred` tasks; **inspections excluded** (they
    belong to the inspection workflow); anything with `assigned_user_id` or an `assignee` name excluded.
  - Order: stored priority (`urgent>high>normal>low`) → next arrival (rooms hosting today's guests
    first) → age. Same ranking as the queue panel's `queueTaskOrder`.
  - Dealing: round-robin to the Housekeeping teammate with the **fewest open assignments** — running
    load = existing open work (seeded from the Staff & Duty derivation) + suggestions already handed
    out, so the plan stays balanced as it is dealt; ties rotate by fewest-received then name
    (deterministic).
  - Each suggestion carries a human-readable reason ("urgent priority · next arrival 2026-10-01 ·
    Ana has the fewest open tasks (2)"). **No skill scores, no invented preferences.**
  - `SUGGESTION_BASIS_NOTE` states the workload basis (operational records, never login).
- **Route `GET /api/housekeeping/assignment-suggestions`** (housekeeping/manager/owner/admin —
  session-guarded): open unassigned tasks + per-room next arrival + housekeeping teammates with
  workload from **`getStaffDutySnapshot`** (`activeWork.filter(source === "housekeeping")` —
  maintenance orders and cash shifts never influence housekeeping balancing). Demo mode maps the
  demo store's name-based assignments, same caveat as the Staff & Duty demo snapshot. Read-only.
- **UI** — HousekeepingQueuePanel renders a "Suggested assignments" strip above the queue, clearly
  labeled *"Suggestion — you decide… nothing is assigned automatically"*; each row shows room,
  task type, priority badge, suggested teammate, and the reason. Rows drop out client-side the
  moment their task stops being open unassigned work (claimed/reassigned/done) — the strip can
  never show a stale suggestion. Role buttons: Housekeeping **"Assign to me"** (self-assign),
  Owner **"Assign to <teammate>"**, Manager sees the plan read-only ("coordinate via Prioritize"
  — manager has no assign authority by design), Front Desk sees neither (read-only queue).
- **Applying** routes through the unchanged audited `POST /api/housekeeping/tasks/[id]/assign` →
  `housekeeping_assign_task` RPC. Housekeeping self-assign path (`SELF_ASSIGNMENT_ONLY` rule
  untouched); Owner passes the suggested `assignedUserId`. The plan refetches (30 s cadence +
  immediately after an apply) so it re-balances live.

## Decisions / notes

- **The panel stays presentational.** An existing contract test
  (`lib/housekeeping-queue.test.ts`: "adds no write path of its own" — no `fetch(` in the panel)
  pinned that design; rather than loosen the contract, the dashboard client fetches the plan and
  passes it as a prop (`suggestions`), exactly like every other panel input. Good constraint.
- Duty is **not** "logged in = on duty": workload comes from the Staff & Duty derivation
  (operational records only), per the phase's hard rule. A teammate with zero open work is simply
  the lightest-loaded — that's the correct suggestion signal.
- Live-filtering the suggestions client-side (against the queue's `items`) means the strip and the
  queue can never disagree — same task list, same predicates.
- Owner assign authority: the RPC permits owner/admin to assign anyone; the UI now surfaces that
  through the suggestion strip only — no new authority was created.

## Verification

- `npx vitest run lib/housekeeping-suggestions.test.ts lib/housekeeping-queue.test.ts` — 23/23.
- Full gates: typecheck ✓, lint 0 errors (72 warnings pre-existing), `npm test` **935/935**
  (9 new), `npm run build` ✓.
- No migration, no RPC changes — nothing to live-verify in the DB.

## Affected files

- `lib/housekeeping-suggestions.ts` (new), `lib/housekeeping-suggestions.test.ts` (new)
- `app/api/housekeeping/assignment-suggestions/route.ts` (new)
- `components/manager/housekeeping-queue-panel.tsx` (suggestion strip)
- `components/manager/manager-dashboard-client.tsx` (fetch + `applySuggestion` + prop wiring)
- `SYSTEM.md` (§7.5 Suggested assignments block, §11 housekeeping API line, route count 101)
- `Current Status.md`, this note

## Unresolved / next

- Phase 7 — inventory draft replenishment (predicted shortage → **draft** PO → Manager review;
  no external send, ever).
- Manual UI verification pending: Housekeeping strip + self-assign, Owner assign, Manager
  read-only plan (needs role logins).
