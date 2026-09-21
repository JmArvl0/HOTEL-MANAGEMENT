# AGENTS.md — Haven Hotel Management (shared AI operating guide)

Canonical, tool-neutral instructions for every coding agent working in this
repo (Claude Code via `CLAUDE.md`, OpenCode and Codex via this file — both
auto-discover root `AGENTS.md`; no extra config exists or is needed).
One agent only: never spawn or delegate to subagents unless the user
explicitly requests them.

## 1. Session start — smallest sufficient bundle

| Task | Read |
|---|---|
| Quick / read-only | This file + only what the request needs |
| Normal development | + `SYSTEM.md`, `nano_bots/05 Memory/Current Status.md`, `nano_bots/05 Memory/AI Session Handoff.md` |
| Architecture / DB | + relevant `SYSTEM.md` sections, `Decisions.md`, actual migrations/source |
| UI/UX | + `DESIGN.md`, relevant components/pages |
| Security | + implementation, migrations, `Known Issues.md` |
| Continuation | + latest relevant handoff/session, then verify the working tree |

Never auto-read the whole vault, all sessions, or unrelated modules.

## 2. Authority order (SYSTEM.md wins)

1. `SYSTEM.md` (authoritative reference; outranks all vault notes)
2. Current source code + `supabase/migrations/` (migration files are the DB authority, applied with `supabase db push` — never `npm run migrate`)
3. `Current Status.md` → `Decisions.md` / `Known Issues.md` → other vault memory → historical sessions

If code conflicts with `SYSTEM.md`, identify the drift, preserve business
logic, and update `SYSTEM.md` when verified changes make it stale.

## 3. Memory files and their jobs

- `05 Memory/Project Memory.md` — durable reviewed knowledge (≤3k tokens)
- `05 Memory/AI Session Handoff.md` — current execution state (≤2k tokens)
- `05 Memory/Current Status.md` — project-level now (not a second handoff)
- `05 Memory/Decisions.md` — approved decisions + rationale (add only real decisions)
- `05 Memory/Known Issues.md` — open defects/risks (not history)
- `05 Memory/Sessions/` — per-session records; new sessions go in the
  `Claude Code/`, `OpenCode/`, or `Codex/` subfolder. History is reference,
  never startup context. Archive, don't delete.

## 4. Safety rules

- **Concurrency:** check `git status`, read the target file's latest version,
  preserve unrelated notes, never blind-replace shared memory. Don't touch
  another session's unfinished work. No fake cross-session sync.
- **Secrets:** never write API keys, service-role keys, SMTP/OTP secrets,
  tokens, or passwords into memory docs, examples, or reports. Placeholders
  only. `.env*` (except `.env.example`) is git-ignored — keep it that way.
- **Database:** reads via service-role server code only; migrations are
  additive files, verified against the live ledger before numbering.
- **Scope:** fix the root cause where all callers route through; fewest
  files; no speculative abstractions; no unrelated rewrites.

## 5. Verification before done

`npm run typecheck`, `eslint` on touched files, targeted `vitest`, full
`npm test` + `npm run build` at checkpoints. Test real behavior, not mocks.
Report browser QA honestly (no headless runner exists — jsdom + manual list).
Never claim a check passed without running it.

## 6. Session end (substantial work only)

Record verified outcomes (never plans as done) in the session file, refresh
`AI Session Handoff.md`, and touch `Current Status` / `Decisions` / `Project
Memory` only when each genuinely changed. Keep entries small and linked.
