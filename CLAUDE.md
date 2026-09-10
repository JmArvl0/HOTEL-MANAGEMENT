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

## Authority and Drift

Use the following context order:

1. `SYSTEM.md`
2. Current source code and authoritative migrations
3. `Current Status.md`
4. `Decisions.md` / `Known Issues.md`
5. Other summarized Obsidian memory
6. Historical session notes / terminal transcripts

`SYSTEM.md` always outranks ordinary vault notes.

However, if current source code or migrations conflict with `SYSTEM.md`,
do NOT silently override either source.

Instead:

- identify the discrepancy,
- determine whether SYSTEM.md is stale or the implementation is incorrect,
- preserve existing business logic until the intended behavior is understood,
- and update SYSTEM.md when verified implementation changes make it stale.

For database structure, follow the source-of-truth rules documented in SYSTEM.md.

## Token Discipline

Use the minimum relevant project context required for the current task.

Prefer:
- SYSTEM.md
- Current Status
- relevant Decisions / Known Issues
- summarized handoffs

over raw historical session logs.

Do not load unrelated modules or vault notes simply for additional context.

## Persistent Memory

The Obsidian vault lives in:

`nano_bots/`

Use it to recover:
- prior decisions
- completed work
- unfinished work
- known issues
- rejected approaches
- implementation reasoning
- test/build results
- previous session handoffs

The vault supplements SYSTEM.md; it does not replace it.

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