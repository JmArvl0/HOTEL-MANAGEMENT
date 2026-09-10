# AI Session Handoff

How AI development sessions use this vault's memory layer. Copy the handoff prompt below into
a new session, or just point it at this note.

---

## Handoff prompt

> Before making changes, establish project context using the project's memory system.
>
> Read the authoritative `SYSTEM.md` (repo root) first. Then read
> `05 Memory/Current Status.md`.
>
> Use `05 Memory/Decisions.md` and `05 Memory/Known Issues.md` only as needed for the current
> task. Follow Obsidian links from Current Status to relevant documentation when deeper
> context is required.
>
> Do not read the entire Obsidian vault, all previous sessions, or the entire source tree
> unless the current task genuinely requires historical investigation. Inspect the actual
> source code before making implementation decisions.
>
> At the end of meaningful development work, update the project's session memory, Current
> Status, decisions, known issues, next tasks, and relevant system documentation.

---

## Session-start protocol

1. Read `SYSTEM.md` (repo root) — the authoritative governance file.
2. Read `05 Memory/Current Status.md`.
3. Read `05 Memory/Decisions.md` — focus on decisions related to the current feature.
4. Read `05 Memory/Known Issues.md` — only issues related to the current task.
5. Follow Obsidian links from Current Status only when deeper context is required.
6. Inspect the source code relevant to the actual task.

Do **not** automatically read every session, every documentation file, the entire source
tree, the entire vault, or every historical decision.

## Selective retrieval rule

SUMMARY FIRST → RELATED NOTE SECOND → HISTORICAL SESSION ONLY IF NECESSARY → SOURCE CODE FOR
CURRENT IMPLEMENTATION.

Example: "Fix alternative room assignment" →

Current Status → [[Check-in & Room Assignment]] → [[D-003 — Structured-ID room-type
exceptions]] → the room-assignment source code. Not 50 unrelated session notes.

## Session-end protocol

At the end of every meaningful development session:

1. Create or update today's `05 Memory/Sessions/YYYY-MM-DD - Session NN.md`.
2. Update `05 Memory/Current Status.md` (keep it about NOW — see compression below).
3. Add new meaningful decisions to `05 Memory/Decisions.md` (business rules, architecture,
   workflow, security/RBAC, DB constraints, major UI behavior — not implementation trivia).
4. Update `05 Memory/Known Issues.md`.
5. Update `05 Memory/Next Tasks.md`.
6. Update the normal system documentation **if actual system behavior changed**.
7. Add Obsidian links between related notes.
8. Do not duplicate large amounts of information; keep active memory concise.
9. Do not overwrite historical session information unnecessarily.

Memory maintenance is part of the Definition of Done: Implement → Test → Verify → Document
system change → Update project memory. Keep it small.

## Memory compression

When Current Status grows, do not keep appending: move historical detail into the relevant
session note, preserve decisions in Decisions, preserve unresolved problems in Known Issues,
and keep only the current state in Current Status. Completed tasks leave Next Tasks once
their outcome is captured.

## Authority order

```
SYSTEM.md / project governance
        ↓
Current implemented system + database/schema
        ↓
Architecture / system documentation (01–03)
        ↓
Approved Decisions (05 Memory/Decisions.md)
        ↓
Current Status
        ↓
Session History (05 Memory/Sessions/)
```

If a historical session conflicts with the current system or `SYSTEM.md`, the historical
session does **not** override the current authoritative state — document the conflict if
necessary.

## Efficiency rules

- Current Status stays concise; it describes now, not project history.
- No source code pasted into memory notes (tiny snippets only when essential).
- No chat transcripts as active memory; sessions are summarized outcomes.
- Prefer links over repeated explanations; one authoritative doc location per concept.
- Historical files are never part of startup context.
- Storing files in Obsidian does not itself save tokens — savings come from selective
  retrieval.
