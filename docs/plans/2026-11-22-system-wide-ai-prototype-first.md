# System-Wide HAVEN AI Prototype-First Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task. Follow the repo's one-agent rule in `AGENTS.md`.

**Status:** Supplementary engineering task breakdown. Gate 1's original right-edge overlay was superseded on 2026-11-25 by an exclusive desktop layout column for AI and a collapsible left navigation; both panels remain mutually exclusive at narrow widths. The shared staff drawer and manual, role-scoped Gemini Ask path are implemented locally; one earlier authenticated Front Desk browser check covered the former overlay, while the new layout still needs visual QA. The original fictional sample remains available from `public/prototypes/haven-ai-system-preview.html`. Stored event-driven recommendations, record-specific context, and automatic approvals remain to be implemented. The canonical source for placement, scenarios, and conditions remains `docs/ai-placement-by-account.md`. The old Phase 1–2 module-card plan was discarded after its critical safeguards were carried into the placement report.
Gate 2–4 file and test tasks are provisional until the user reviews Gate 1's
prototype and chooses the exact request and exception policy; decompose them
into code-sized implementation steps after that design freeze.

**Goal:** Prototype, review, and then build one role-scoped Gemini assistant across authorized HAVEN staff modules, with event-driven guidance, a manual complex-question path, and carefully bounded automatic approvals.

**Architecture:** The browser displays current HAVEN facts and stored AI guidance; opening a module or selecting a record never calls Gemini. Relevant server-side data changes trigger analysis for the affected record and summary. Gemini proposes structured conclusions; guarded HAVEN workflows alone decide and record any approved action.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Vitest, Supabase/PostgreSQL migrations and RPCs, Gemini via `@google/genai`, current staff design system. Read the relevant `node_modules/next/dist/docs/` guide before writing Next.js code.

---

## Current authority and decisions still open

- `SYSTEM.md` and current migrations define today's behavior: Gemini is advisory/read-only; Front Desk reviews Guest Request batches; Manager/Owner/Admin review exceptions. This plan does not override them. Update `SYSTEM.md` only after verified implementation.
- The Manager Request Types menu controls visible catalog choices. A booking amenity also requires `active`, `pre_arrival_requestable`, linked inventory, and positive quantity; structured booking services are separate (`lib/inventory-request-options.ts`). Catalog visibility must not itself grant auto-approval. The generic catalog API currently admits Owner/Admin as well as Manager for ordinary fields (`lib/admin-route.ts`); decide whether to narrow it before implementation.
- User direction: no Gemini call merely because a module opens or a record is selected. Refresh only on relevant new/changed system data, plus explicitly approved time-boundary events. Prepare one initial baseline server-side if needed.
- Proposed first auto-approval: entire Guest Request batch filed by confirmed-booking auto-filing or later guest submission, only if every active item passes a separate, versioned routine/no-charge policy and fresh HAVEN checks. A booking-form selection or unconfirmed hold cannot trigger approval. Never auto-reject. Final request-type allowlist and who may edit it remain review gates.
- Proposed later exception candidate: a hotel-caused room-type substitution with a specific clean, serviceable, unassigned alternative room, no guest charge/compensation, no unresolved acceptance, and no Owner escalation. **This is not yet an approved auto-approval category.** If no eligible room exists, produce alternatives for Manager review; do not approve nonexistent capacity. Financial, high-risk, and Owner-escalated exceptions remain staff-reviewed.
- Payment/identity verification, refunds, check-in, and item release stay outside the first automatic set. Stripe integration is a separate payment-authority project. Do not send real payment proofs or identity files to Gemini in the first phase.

## Gate 1 — Interactive prototype before live AI work

### Task 1: Review placement on the existing module layouts

**Files:** `public/prototypes/haven-ai-system-preview.html`, `components/ai/placement-preview-drawer.tsx`, the existing staff/Owner/Admin shells, and the static placement map generated from `docs/ai-placement-by-account.md`. Keep this session-scoped visual layer separate from live Gemini and approval behavior.

1. Sign in as each of the seven staff accounts and inspect its real authorized modules. Use the 94-entry map to check purpose wording without inventing replacement cards, tables, or navigation. The Guest account uses the real portal and its separate concierge.
2. Check the compact right-edge dock and exclusive AI panel. Opening a module or toggling the drawer must not call Gemini. On desktop, the module reflows next to the open AI column; at narrow widths, the panel follows the fixed mobile navigation pattern.
3. Check sample result states, manual Ask for complex hotel questions, and a refusal for personal/code-generation requests. The drawer's sample text must not claim to analyze real displayed records.
4. Review the representative Guest Request, Manager exception, attribution, and catalog scenarios in the canonical report with fictional fixtures before any live automation work. The current placement preview does not execute those workflows.
5. Check desktop, phone, light/dark themes, focus order, and drawer coverage over each module's core work. The ordinary local module controls remain active; no Gemini key, operational write, or new database connection belongs to the preview layer.

### Task 2: User review and design freeze

**Files:** Update `docs/ai-placement-by-account.md` and `AI_ASSISTANT_SPEC.md` with the reviewed layout and wording. Create `docs/qa/haven-ai-system-prototype-review.md` for the accepted outcome.

1. Walk the user through the representative workflows before implementing a live AI surface.
2. Record requested placement, arrangement, copy, mobile, and attribution changes; revise the sample prototype and review again where needed.
3. Treat the reviewed prototype and exact request-type/exception policy as the gate for live code. Do not infer approval from this plan's existence.

## Gate 2 — Read-only assistant and event-driven guidance

### Task 3: Define the account, module, and output contracts

**Files:** Modify `lib/ai/guard.ts`, `lib/ai/tools.ts`, `lib/ai/prompts.ts`, `lib/ai/schemas.ts`, `lib/ai/module-metadata.ts`; add targeted tests alongside those modules. Consult `config/role-navigation.ts`, `SYSTEM.md` §7.13, and the reviewed prototype.

1. Write failing role and purpose tests for all seven staff accounts, selected records, cross-role denial, personal-use prompts, code/SQL/export requests, and prompt injection in record text. Run the targeted Vitest files and confirm the failures.
2. Implement server-owned module purposes, minimal authorized context, explicit read tools, and structured fact/recommendation/action IDs. Reject unsupported model text and unauthorized tool or action IDs server-side. Re-run targeted tests.
3. Keep predictions labeled as HAVEN analytics, not Gemini calculations; keep QR and Stripe authority separate. Preserve existing guest concierge isolation.

### Task 4: Event-driven analysis and stored results

**Files:** Create `lib/ai/event-analysis.server.ts`, `lib/ai/event-analysis.server.test.ts`, `lib/ai/stored-results.server.ts`, and `lib/ai/stored-results.server.test.ts`; add an additive `supabase/migrations/<next-verified-timestamp>_ai_stored_results.sql`; modify the authorized module read route and UI chosen after prototype review.

1. Write failing tests: opening a module and selecting a record read stored results and make **zero** Gemini calls; an unrelated data change makes zero calls; one relevant changed source version schedules one affected analysis despite repeated events.
2. Define a server-owned event contract for new/changed Guest Requests, reservations, room readiness, stock, policy/catalog, and exception records. Coalesce bursts. Define any time-boundary event separately; do not refresh all 94 placements for one change.
3. Store only structured role-scoped results, source version, model/prompt version, status, and analysis time; no raw prompts, response bodies, documents, or secrets. Seed an initial baseline via a controlled server job, never a first-page-open call.
4. Add invalidation, deduplication, concurrency, per-user/module and hotel-wide budgets, retry/failure status, and stale-response protection. Test both normal and provider-outage paths.
5. Check the live migration ledger before naming/applying the additive migration. Use `supabase db push` after a dry run and approval gate; never use `npm run migrate`.

### Task 5: Integrate the reviewed module dock, AI panel, and manual Ask HAVEN AI

**Files:** Modify the staff components/pages identified in Gate 1, likely `components/manager/manager-dashboard-client.tsx` and the Owner/Admin workspaces; add focused component tests. Reuse reviewed design tokens in `DESIGN.md`.

1. Write failing tests for immediate HAVEN facts, stored result states, record switching, role scope, and the retained manual button. Verify module navigation and record selection make no provider request.
2. Implement the reviewed right-edge dock and exclusive AI panel across authorized module layouts. On desktop it reflows the work area and collapses navigation; on narrow screens it uses the fixed overlay pattern. The Manager HAVEN AI page remains the dedicated workspace, without a nested duplicate.
3. Connect manual Ask HAVEN AI to the role-scoped, purpose-limited route. It may analyze complex cases but cannot bypass a guarded write workflow.
4. Check all 94 account/module entries for availability and permission boundaries, then perform browser QA in representative desktop/mobile layouts and both themes.

## Gate 3 — Bounded workflow automation

### Task 6: Separate request visibility from automatic eligibility

**Files:** Modify `app/api/catalog/request-types/[id]/route.ts`, `lib/inventory-request-options.ts` only where needed, the Manager Request Types UI, and targeted tests; add an additive migration for the versioned auto-approval policy after checking the ledger.

1. Write tests that disabling an item removes it from future guest selection without deleting submitted requests; a visible item is not automatically eligible for AI approval; an item disabled while pending cannot auto-approve.
2. Specify and review Manager/catalog authority, the exact routine request-type allowlist, no-charge and inventory rules, policy version, and disable switch. Do not use the existing `active` field as the automatic-approval switch.
3. Implement only the reviewed catalog/policy controls and their audit trail. Preserve `pre_arrival_requestable` and stock gates for booking amenities; structured service constants are not silently added to the auto-approval allowlist.

### Task 7: Automatic Guest Request batch decision

**Files:** Create `lib/ai/guest-request-automation.server.ts` and `lib/ai/guest-request-automation.server.test.ts`; add a separate guarded SQL/RPC migration after ledger review; modify `app/api/front-desk/guest-requests/review/route.ts` only for display/conflict integration if needed; add route/UI tests. Consult `supabase/migrations/20260908020000_guest_request_batches_and_approval.sql`.

1. Write failing cases for eligible whole batch, mixed batch, charged/disabled item, missing stock, duplicate delivery, stale reservation, provider failure, and no auto-rejection. Keep the batch pending for Front Desk on every uncertain result.
2. Run per-batch Gemini classification only after the batch is filed at confirmed-booking auto-filing or a later guest submission. Recheck policy, role, record version, stock, reservation, and pending state in one guarded transaction before automatic approval; never impersonate a logged-in Front Desk employee.
3. Make staff-versus-automation decisions mutually exclusive under row locking/version checks. If Front Desk decides first, discard the late AI proposal; if automation decides first, return an already-reviewed response to a stale staff click. Confirm exactly one decision and one audit outcome.
4. Store explicit decision source, policy version, structured evidence/action IDs, timestamp, and audit reference. Show “Auto-approved by HAVEN AI” in the queue and detail, while human-confirmed AI advice remains attributed to the person.

### Task 8: Manager exception briefs, then optional narrow automation

**Files:** Create `lib/ai/exception-brief.server.ts` and `lib/ai/exception-brief.server.test.ts`; extend the Manager Approvals UI/tests; consult `app/api/manager/approvals/[id]/review/route.ts`, `SYSTEM.md` §7.8, and the latest `review_manager_approval` migration. A separate migration/RPC is required only if the user later approves an automatic exception type.

1. First show source-linked AI briefs for **all** exception requests: reason, normal policy, current reservation/room state, financial effect, missing evidence, and Manager next step. Keep Manager/Owner/Admin approval and department execution unchanged.
2. Test room-type substitution with a real eligible alternative, no same-type room, changed room state, no room anywhere, guest-pays difference, high/critical escalation, and stale approval. Never call a fully booked hotel “approved.”
3. In observation-only mode, log the structured decision the narrow candidate *would* make and compare it with human review. Do not write an approval during this trial.
4. Only after separate user review of observed results and policy may a guarded automatic path be planned. It must have a policy owner, financial ceiling, instant disable switch, correction/audit path, fresh room check at approval and execution, and explicit non-impersonating attribution. Financial/Owner-escalated exceptions stay manual.

## Gate 4 — Privacy, evaluation, and release

### Task 9: Document policy and acceptance evidence

**Files:** Update `AI_ASSISTANT_SPEC.md`, `docs/ai-placement-by-account.md`, and `SYSTEM.md` after verified runtime changes; create `docs/qa/haven-ai-acceptance.md` for staging evidence.

1. Phase one sends structured, role-authorized HAVEN facts to Gemini; prototype documents are fictional. Define document type, role, field minimization, retention, and source display before any real image/PDF feature. Existing payment proof stays outside AI and with its current guest/Accounting access.
2. Build an anonymized or synthetic case set covering eligible/ineligible Guest Request batches, catalog toggles, stock/room races, impossible capacity, prompt injection, unrelated personal requests, provider outages, and cross-role access.
3. Compare observation-only AI proposals with Front Desk/Manager decisions; record disagreement, false approvals, time saved, latency, usage, and why each case failed or passed. Do not enable writes merely because the model sounds confident.
4. Verify typecheck, touched-file ESLint, targeted Vitest, full `npm test`, and `npm run build` on supported Node. Run role-based browser QA and at least one authorized live Gemini staging pass. Report every unrun gate honestly.
5. Reconcile any verified system changes in `SYSTEM.md`, migration/source documentation, and memory. Deploy only after migration-ledger reconciliation and the reviewed prototype, policy, shadow trial, and rollback controls are complete.
