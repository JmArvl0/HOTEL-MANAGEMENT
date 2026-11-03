# Hotel operations implementation completion — 2026-11-03

User requested all implementation after the first batch and delegated policy
choices. Continued without routine batch pauses; no subagents used.

## Verified local outcome

- Completed P3–P10 applicable local work: readiness, effective room diary,
  registered primary/companions and profile separation, scoped audited handover,
  explicit operating-day activation, atomic immutable close/reconciliation,
  optional Accounting fee catalog with existing folio snapshots, conservative
  Manager/Owner identity review. Preserved P0–P2 and pre-existing HK fixes.
- P10 merge not adopted: actual read-only candidate-group counts 0 exact-email,
  0 shared-account. P11 optional concepts explicitly remain conditional absent
  property need/policy. No reference constants or excluded webhook changes added.
- Added migrations `20261103020000` and `20261103030000` after live ledger/body/grant
  reads; all 104 files replayed. Dry-run exactly four pending: earlier remediation,
  nightly availability, operations, operating day. Hosted latest stays `20261024130000`.
- Final Node 22.22.2: **202 files / 2,196 tests**, typecheck, production build pass;
  touched-source ESLint 0 errors / 10 existing warnings. Verified official Node
  binary checksum; did not change system runtime.
- Actual isolated PostgreSQL: **23 backend + 27 HK + 24 availability + 13 operations**
  checks/groups pass. Concurrent postings/close, allocation and duplicate closes,
  snapshot failure rollback, primary protection and fee-key collision covered.
- Final review caught operational inputs not serialized with close. New regression
  failed before fix; close now takes nonwaiting SHARE table locks after the date
  lock and returns a retryable conflict if inputs are busy. Prevents a mixed
  assessment without waiting on a writer that may await the date lock.
- Public page and anonymous boundary smoke checks on final local production build:
  2 public pages 200; 9 staff GETs + 6 mutation probes 401. No authenticated write.
- Prior public browser search checks passed. Real new components received isolated
  desktop/mobile fixture preview QA; this is not authenticated staff E2E. Controlled
  property role walkthrough remains release acceptance work.

## Verification corrections

Windows sandbox denied loopback, CLI telemetry and build paths; authorized-access
retries completed. A file move during encoding-test enumeration caused an ENOENT
earlier; stable-tree retry passed. Parallel build/test caused two existing request
UI wait failures; focused suite and final full run without competing build passed
unchanged. No assertion/timeout weakening. A new test SQL alias was corrected.

## Release boundary and artifacts

No hosted migration, activation, financial close, merge, commit or deployment.
Normal `.env.local` stays hosted. The old local server was replaced by the verified
candidate, port 3000, PID 20908, build `jVAYyeac2YIRRI3Pth39A`.
Temporary preview/isolated PG helpers were stopped at session end; test clones
discarded. Base HEAD `d2ea413` alone does not include this dirty candidate.

P12 requires a coordinated Vercel app/DB transition with all affected writes gated,
including background/gateway processors, because earlier stock-consumption contracts
cannot run independently. Asked user for controlled environment/window selection;
no selection received at recording time. Do not mark rollout complete.

- `docs/qa/hotel-operations-completion-2026-11-03.md`: contracts, feature/evidence
  matrix, commands, browser limits and concrete release/recovery checklist.
- `docs/qa/hotel-operations-candidate-2026-11-03.json`: exact changed-source hashes,
  migration sequence and build/test evidence. Regenerate if source changes.
- `docs/plans/2026-11-03-hotel-operations-and-housekeeping.md` §18: final tracker.
- `SYSTEM.md` §7.16 and D-034: implemented local controls, never deployed-state claims.

Next: controlled test-property role walkthrough, reviewed paired release commit,
fresh live checks, maintenance window, four migrations + paired Vercel release,
controlled smoke before reopening writes. Activate clock separately via Accounting.
