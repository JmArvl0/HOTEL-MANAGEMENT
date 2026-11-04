# Cancellation Folio Settlement — 2026-11-03

Implemented the user's approved explicit cancellation/no-show folio design.
Frozen cancellation tiers still determine the deposit fee; no-show retains settled
deposits only. Cancellation/no-show atomically credits unused booking obligations,
posts a named policy fee, and queues remaining credit for Accounting. Independent
transportation survives closure and can be collected through staff payment RPCs.
Approved refund exceptions post linked fee reversals before payout. Original
payments remain immutable. New settlement metadata and fee policy snapshots are
preserved; issued folios include the original obligation and settlement. Historical
reservations and documents are not backfilled. Existing reservation tax treatment
continues; no new tax rule or GL journal was introduced.

Guest preview itemizes settled payments, fee, retained transportation and refund.
Folio detail shows credit/adjustments, and received-payment figures include unapplied
credit. Daily close reports separate net cancellation/no-show fees. The real SQL
regressions exposed a posting trigger accessing OLD.status on financial_adjustments;
nested table branches fix the missing-field error.

Verification:
- Linked migration ledger read: 112 entries through 20261103150000, repository matched.
- Supabase dry-run: only 20261103160000_cancellation_folio_settlement.sql pending.
- Real PostgreSQL: baseline reproduced failures; clean and hosted-order replays passed.
  Final clean replay: 17 behavior cases covering policy tiers/snapshots, cents,
  unverified funds, extra prepayments, no-show timing/retries, concurrent cancellation,
  helper permissions, metadata immutability, actual refund credit, approved waiver,
  transportation preservation/collection, fee reports and document snapshots.
- Node22 full suite: 204 files / 2208 tests passed; final affected suite 135 passed.
  System Node26 first attempt had an unrelated Admin dependency read failure; supported
  Node22 rerun passed. jsdom navigation/canvas limitations reported by existing tests.
- Typecheck, touched-file ESLint (0 errors/warnings), production build passed.
- No manual browser QA; review cancellation preview, folio credits, Accounting payout,
  no-show and daily close metrics after migration/app rollout.

No hosted financial mutations, db push, deployment, commit or credential change.
Migration/app release remains pending. Owned loopback PostgreSQL stopped after checks;
fixtures and logs remain under ignored .tmp. Preserve the prior production-cutover
backup and unrelated release artifacts.


## Follow-up: Manual browser QA completed

User requested manual browser QA. Real production build/NextAuth/PostgREST/PG
walkthrough passed Guest, Front Desk, Accounting and Manager flows using only local
synthetic data. Full/partial/no refunds, independent transport, expired proofs,
no-show cutoff and fee posting, ordinary refund persistence, approved fee waiver,
issued statements and daily net fee reporting verified. Mobile390px and desktop1366px
checked. The approved exception posted a linked reversal and preserved original
cash receipts. Direct read-only DB assertions confirmed ten browser fixture outcomes.

Fixed and retested six issues: stale rack history after closure, original obligation
omitted by the statement viewer, zero-deposit preview wording, Accounting's overview
reservation shortcut, missing balance falsely labeled settled, and Enter bubbling
from Exception into the row's View action. Applied-payment labels clarified.
Final Node22 suite204files/2213tests; typecheck/build/diff-check pass; touched lint0errors
and4existing warnings. Report: `docs/qa/cancellation-folio-browser-qa-2026-11-03.md`.
Screenshots/evidence remain ignored in `.tmp/cancellation-browser-qa/`. Synthetic
sessions signed out, browser viewport restored, owned services stopped and browser
fixture databases removed. Hosted `.env.local` hash unchanged; no production writes,
external payout/email, migration/deployment, credential change or commit.
