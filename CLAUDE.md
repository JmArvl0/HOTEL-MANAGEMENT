# Haven Hotel Management — AI Session Context

This project currently uses ONE coding agent only.

Do not spawn, delegate to, or create additional agents/sub-agents unless
the user explicitly requests them.

## Session Initialization

Before making implementation changes:

1. Read `SYSTEM.md` at the repository root.
   - It is the authoritative documented reference for the current HAVEN system.

2. Read:
   `nano_bots/05 Memory/Current Status.md`

3. Read only when relevant:
   - `nano_bots/05 Memory/Decisions.md`
   - `nano_bots/05 Memory/Known Issues.md`

4. Follow only relevant links from Current Status.
   Do NOT read the entire Obsidian vault.
   Do NOT read all historical sessions automatically.

5. Inspect the actual source code, migrations, and relevant tests before
   making implementation decisions.

## Authority, Memory, Safety, Verification

Shared rules live in `AGENTS.md` (repo root) — authority order, the
`nano_bots/` Obsidian vault and its files, safety rules, and verification
commands. They agree with this file by design; where they overlap, `AGENTS.md`
is canonical. Do not duplicate them here — edit them there.

## Session Handoff

At the end of meaningful work, update the memory layer according to:

`nano_bots/03 Reference/AI Session Handoff.md`

Record:
- work completed
- important decisions
- affected files/modules
- verification/test/build results
- unresolved issues
- recommended next action

If implementation changes alter documented system behavior, update
`SYSTEM.md` as part of the same work.

Do not create unnecessary memory entries for trivial work.

## Shared multi-AI rules

`AGENTS.md` (repo root) is the canonical tool-neutral operating guide shared
with OpenCode and Codex — same memory files, same authority order, same
safety rules. This file stays Claude Code's entry point: init steps and the
handoff record above. Point OpenCode/Codex collaborators to
`AGENTS.md`, never by duplicating these rules.