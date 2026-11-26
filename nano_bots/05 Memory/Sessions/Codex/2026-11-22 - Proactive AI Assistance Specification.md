# Proactive AI assistance specification — 2026-11-22

The user requested documentation for proactive module AI, a retained manual
Ask HAVEN AI action for complex cases, and a dedicated file defining AI
purpose and conditions. This is a proposed design for review, not a runtime
change.

- Updated `docs/ai-placement-by-account.md`: module-open panel, background
  refresh, event-triggered routine Guest Request approval, manual complex Q&A,
  actor attribution, and acceptance checks. All 94 account/module entries
  remain present.
- Created root `AI_ASSISTANT_SPEC.md`: proposed authority, triggers, decision
  levels, first auto-approval conditions, exclusions, audit labels, Gemini
  instruction contract, and pre-implementation review gates.
- Added D-044 and refreshed the current-status and handoff summaries. D-043
  remains the system-wide placement decision, amended by D-044.
- Verified the 94 rows, seven account headings, core trigger and attribution
  requirements, exclusions, cross-document link, final newlines, and whitespace
  with a local Python assertion. `git diff --check` exited 0. No runtime code,
  migrations, or Stripe integration changed; code tests were not run for this
  documentation-only update.

Current `SYSTEM.md` still describes Gemini as read-only and Front Desk as the
sole Guest Request batch approver. The new specification explicitly preserves
that current authority until a separately verified implementation changes it.

## Follow-up: prototype-first implementation plan

The user clarified Manager-controlled request visibility, a desire to explore
automation for Manager exceptions, and event-driven analysis only when relevant
hotel data changes. Added `docs/plans/2026-11-22-system-wide-ai-prototype-first.md`
with a sample-only prototype gate, separate visibility and auto-approval policy,
per-batch Guest Request race handling, AI briefs for all exceptions, a later
narrow room-type candidate, structured-data-first privacy, and an
observation-only acceptance stage. Reconciled the placement report and root AI
specification: opening a module or selecting a record never calls Gemini;
confirmed-booking auto-filing and later guest submission both trigger
per-batch review. Added D-045 and refreshed current status/handoff.

Verified seven account sections and 94 module rows, prototype/event/filing/
exception/attribution requirements, cross-document links, final newlines, and
whitespace with a Python assertion. Tracked memory changes passed
`git diff --check`. No prototype, code, migration, provider call, or live
business write occurred; code tests were not run for this documentation turn.

## Follow-up: placement report becomes the prototype brief

The user chose `docs/ai-placement-by-account.md` as the file to follow for the
prototype. Audited the old Phase 1–2 plan and moved its still-relevant
grounded-output, role/privacy, atomic usage-limit, testing, and migration
checks into the report. The report now includes the prototype scenario matrix,
per-batch race behavior, Manager catalog/exception conditions, document
boundary, observation-only evaluation, and release gates. Removed the obsolete
`docs/plans/2026-11-21-role-aware-ai-modules-phase-1-2.md`; the newer
prototype-first task breakdown is explicitly supplementary. Updated spec and
memory references accordingly. Verified all seven account sections and 94
module rows remain, required conditions are present, links/whitespace are
clean, and the old plan file is gone. No prototype or runtime change occurred.
