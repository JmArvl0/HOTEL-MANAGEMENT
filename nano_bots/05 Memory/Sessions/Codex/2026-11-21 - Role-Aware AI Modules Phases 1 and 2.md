# Role-Aware AI Modules — Phases 1 and 2 (2026-11-21)

Local implementation on `codex/staff-redesign-qa`; no hosted write or deployment.
The user limited Phase 2 to AI modules. Reports permissions remain unchanged.

## Verified changes

- Front Desk readiness now uses the shared room rack rules, including assigned
  stays and maintenance blockers. A held-room regression test passed.
- Gemini returns only fact and advisory action IDs. The server validates each
  ID and composes all displayed operational wording from its own facts and
  allowlisted actions. Request topics are controlled IDs; no free-text guest
  question reaches Gemini. The card states that usage metadata is audited.
- Added Housekeeping, Maintenance, Accounting, Inventory, Guest Requests, and
  Lost & Found aggregate contexts and role-scoped cards. Housekeeping request
  facts are department scoped. Accounting facts are Accounting only. Found item
  custody and request approval counts follow the existing domain rules.
- Added a per-user/module atomic reservation RPC and reserved audit status.
  Denied calls add no audit row; a reserved call is finalized after the provider
  result. Other AI features keep their existing audit path.
- `SYSTEM.md` and `docs/innovation-architecture.md` now describe the module
  role matrix, data flow, audit behavior, and migration prerequisite.

## Checks

- `npm run typecheck` passed after implementation and after build cleanup.
- Scoped ESLint: zero errors; three existing dashboard hook warnings.
- Targeted Vitest passed; final full `npm test`: 244 files, 2,526 tests passed.
- `npx next build --webpack` passed in an isolated build directory outside the
  Windows sandbox. Default Turbopack build hit the known junction `EPERM`, and
  sandboxed Webpack hit a generated-directory `EPERM`.
- Canonical migration and updated manual execution script each replayed in
  isolated PostgreSQL 18. The manual script preserved an existing audit row;
  a first reservation was allowed and the next was limited. Eleven concurrent
  local PostgreSQL reservations admitted ten and limited one, leaving ten
  rows. This does not verify the hosted PostgreSQL 17 database.
- `git diff --check` passed after the memory update.

The available runtime was Node 26.6.0; `package.json` requires Node 22.22.2
through 22.x. Browser QA, a real Gemini call, live migration-ledger/backup
verification, and hosted migration acceptance were not performed. The
`20261118010000_ai_module_assistants.sql` migration is pending. Do not run
`supabase db push` from this checkout: the prior handover reported remote-only
migration versions, and this session could not verify the live ledger. The
earlier handover's SQL hashes are obsolete after the reservation RPC change.
The locally replayed SHA-256 values are
`81AC34CDF8FDCAE9399CD104C58177DAF152E5D3886215396E400A8CEA5F8841`
for the canonical migration and
`8F0E4D986B742CB3EA53045AF143A305AAD6C40523A1F0BA875C1F4C22D7D05F`
for the manual execution script.

The original Phase 1–2 plan was later discarded; its applicable safeguards
were carried into `docs/ai-placement-by-account.md`. This session note remains
historical implementation evidence, not the current prototype brief.
