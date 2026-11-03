# Hotel Operations Batch 1 — 3 November 2026

User authorized implementation of the hotel/Housekeeping plan and delegated policy
choices. One agent; existing dirty work preserved; no commit or hosted operational write.

Completed local first batch: P0 compatibility/ledger manifest, P1 durable automated
Housekeeping integration, P2 nightly inventory and availability-error recovery.
P1 controlled staff browser acceptance and P3 onward remain pending at plan review.

- Actual failure reproduced in TS and seven SQL assertions; corrected through the
  shared inventory layer. All nine inventory RPCs use the new SQL helper with aligned
  advisory locks and own-claim exclusions. Prices/frozen rates/roles remain intact.
- Live metadata: 100 applied migrations, latest `20261024130000`; relevant function
  definitions/signatures/grants inspected before numbering `20261103010000`.
  Final dry-run lists earlier remediation then nightly availability; neither applied.
- 138 targeted tests; final full suite **197 files / 2175 tests**; typecheck, explicit
  touched-file eslint and production build passed. Initial build hit Windows EPERM;
  filesystem-access retry completed. Installed Node 26.6.0 versus declared Node 22.x
  recorded as a release-runtime verification gap.
- Sequential actual PostgreSQL replay/regressions: **23 backend + 27 Housekeeping +
  24 availability/parity checks**. New harnesses own/discard clones and never read hosted
  env. Verified two-connection conflicts, conversion, inspection/stock exactly once and
  shortage rollback. Fixed UTC+8-versus-UTC date mismatch in existing B-023 fixture.
- Browser inventory available again; successful production-build public search showed
  four types/ten units for two guests; submitting eight guests returned genuine zero
  with dates retained. Error/retry covered in rendered tests, not induced hosted failure.
  No staff operational walkthrough claimed; real inspections remain untouched.
- User-delegated operating-day direction recorded as D-034, not implemented/activated.
  Further financial metric/locking contracts remain prerequisites for P6–P8.
- Test cluster stopped after verification; app stays hosted Supabase. Local production
  server remains available on localhost:3000 (PID 9920).

Detailed evidence and paired-release checklist:
`docs/qa/hotel-operations-batch-1-2026-11-03.md`. The plan tracker and SYSTEM.md reflect
verified local behavior while distinguishing pending release and remaining roadmap.
