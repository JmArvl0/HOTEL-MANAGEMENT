# Hotel scope and manual acceptance — 4 November 2026

User requested the implementation plan, execution and personal manual website QA.
Worked with one agent, preserving existing cancellation/occupant/guest-control work.

Implemented: accurate procurement/enterprise-boundary docs and proposed POS contract;
fixed the stale cancellation/change assertion, guest-ID-only primary duplication,
one-person register editing/completion, optional-vendor draft validation, hidden PO
history when shortages disappear, and stale stock status after PO receipt.
Two additive local migrations: `20261104010000` and `20261104020000`.

Verified under Node 22.22.2: 204 Vitest files / 2,217 tests, typecheck and build pass;
touched ESLint 0 errors / 3 existing warnings. Real SQL: 24 backend + 13 occupant +
27 Housekeeping + 13 hotel operations + 5 receipt checks pass. Clean schema replay
120; isolated backup restore/upgrade 108 → 120 passes. Live ledger read 112;
linked dry run lists eight pending migrations without applying them.

Personal synthetic browser checks covered Housekeeping DND/declined/late service,
Housekeeping → Front Desk discrepancy resolution, reviewed merge and login-linked
refusal, disabled-session rejection, Owner oversight, occupant save/age gates,
one-person completion/presence/emergency list, split cash/bank collection, drawer
reconciliation, prior-day Accounting close, PO draft/approval/receipt/history, guest
change/cancel backout, mobile/desktop and Escape. The report distinguishes earlier
DNR coverage and unexercised loyalty/above-threshold review from fresh browser checks.

No hosted write, deployment, policy activation, real merge/payment or commit.
Synthetic browser signed out; viewport reset; owned app/PostgREST and PostgreSQL
stopped. The restored-data rehearsal database was discarded; ignored QA evidence
and the pre-existing backup remain local. Final diff check passed.
Restaurant runtime/outbox remains conditional: no partner API/auth/sandbox supplied.
Ownership matrix is proposed, not a new approved enterprise decision.

Evidence: `docs/qa/hotel-scope-integration-and-manual-acceptance-2026-11-04.md`;
plan: `docs/plans/2026-11-04-hotel-scope-integration-and-manual-acceptance.md`.
