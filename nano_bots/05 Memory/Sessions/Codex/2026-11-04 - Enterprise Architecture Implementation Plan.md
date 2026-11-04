# Enterprise Architecture Implementation Plan — 2026-11-04

User requested an implementation plan to reach the audit's 10/10 architecture
target. Created `docs/plans/2026-11-04-enterprise-architecture-10-of-10.md` using
Writing Plans and Ponytail. One agent; no runtime implementation or delegation.

The plan has 25 tasks across seven phases: establish baseline; accept ownership;
stabilize Hotel core; align seven Hotel modules; integrate Finance/Restaurant;
handoff HR/SCM/Facilities/Fleet when ready; rehearse recovery/release and rescore.
Each task identifies owner, dependencies, exact existing/proposed files, steps
and validation. Includes 18 business acceptance scenarios, supported Node/TEMP
commands, additive migration/ledger rules and explicit activation/cutover gates.

Preserves existing Hotel stock/PO/transport/maintenance until reconciled handoff;
does not rebuild completed occupant/housekeeping/night-audit work. References
existing manual-acceptance and Restaurant contract plans. Partner schema/auth/
sandbox decisions remain dependencies; simulated connections cannot satisfy them.
Automatic gateway repair is proposed future work, not retroactively completed
or released under the earlier scope that excluded it.

Reviewed current clean-code baseline `a3f2438`, existing dirty audit/memory paths,
relevant SYSTEM/source/migrations, prior decisions/issues and current helper
fixtures. Documentation verification passed: 25 ordered task packages with
required fields/steps, seven phases, 18 acceptance cases, table widths/fences,
whitespace and conflict checks. Confirmed 63 existing file references; all 32
nonexistent references are expressly proposed/draft files or the migration
version naming rule. No runtime tests, database check/replay, browser/provider
sandbox, deployment, policy activation or ownership cutover performed here.

Earlier audit results remain historical: Node22 typecheck/build pass, lint
0 errors/88 warnings; full Vitest 2,281 pass/3 fail; isolated 50 pass/2 fail.
No score is automatically increased because a plan exists. Five criteria need
accepted operational/contract evidence and separate local/hosted readiness.

Current handoff refreshed without changing unrelated merge/pre-merge notes.
SYSTEM.md, approved Decisions and project status remain unchanged by planning.
