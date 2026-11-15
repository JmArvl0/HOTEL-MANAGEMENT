# Remaining Backup Items Port

Date: 2026-11-15. OpenCode session in worktree `.tmp/remaining-backup-items-20261115`
(branch `codex/remaining-backup-items-20261115`).

Companion to the scoped reconciliation [[2026-11-15 - Handoff before Remaining Audit Closeout]]
branch: that branch carried the 38-change series on top of `origin/main`; this
session ported the missing earlier local history instead.

## What was ported

An audit of the 21 pre-reconciliation local commits against `origin/main`
(`794eca8`) found 10 fully missing commits plus two partially missing pieces
(both DB-test scripts of `30512aa`). The user asked to port them onto a separate
branch based on `origin/main`, resolve all conflicts, verify with tests, and
stop there: no merge to main, no push.

- Ported via a three-way tree merge (`git merge-tree --write-tree` with merge
  base `b1bda41`), then resolved 22 conflict hunks across 14 files manually;
  the two missing test files were extracted separately into
  `scripts/hotel-breakfast-db-test.mjs` and the updated
  `scripts/inventory-replenishment-db-test.mjs`.
- Resolution principle: keep every current `origin/main` safeguard (attempt-based
  holds, Xendit-only checkout, error microcopy, durable email, deposit gating)
  and add the old breakfast / booking-policy / landing features on top. The old
  PayMongo/GCash manual payment UI from the old chain was discarded; the current
  Xendit-only payment page kept, with the breakfast line added.
- Breakfast remains feature-flagged: `HAVEN_BREAKFAST_ENABLED` (default false in
  `.env.example`), wired through `create_booking_hold_attempt` RPC routing to
  `hotel_create_breakfast_booking_hold`; `BREAKFAST_FORBIDDEN`,
  `BREAKFAST_EXACT_ROOM_REQUIRED` and `BREAKFAST_OFFER_CHANGED` are mapped in
  `app/api/booking/holds/route.ts`.
- Docs and vault conflicts were resolved keep-ours (the old content was older or
  duplicated); the old chain's Codex session notes are preserved verbatim as
  staged files under `nano_bots/05 Memory/Sessions/Codex/`.
- Committed as `b1b97a2` (amended once to fold in a duplicate-`zod` import fix
  on the booking details page): 67 files, +2,737/−75, single commit on top of
  `794eca8`. The five coverage exclusions are intentional: four docs already
  matched remote and the breakfast migration is already on remote.

## Verification (all run, all passing)

- Node 22.22.2 toolchain throughout (engines `>=22.22.2 <23`).
- `tsc --noEmit` clean. Scoped ESLint on the 43 touched code files: 0 errors,
  9 warnings matching pre-existing patterns.
- Full Vitest: 2,637 tests across 265 files pass.
- Next.js 16.3.2 Turbopack production build passes (130 routes).
- Real SQL on the disposable local PostgreSQL (`ops-pg`, 127.0.0.1:55432):
  `backend-remediation-db-test.mjs` replayed every repository migration (now
  including `20261113030000_hotel_breakfast.sql` and
  `20261115020000_audit_booking_integrity.sql`) with 25 PASS / 0 failures;
  `hotel-breakfast-db-test.mjs` 5 PASS; `inventory-replenishment-db-test.mjs`
  PASS. Server stopped afterwards.
- No browser QA was possible (no headless runner in this harness); UI confidence
  comes from the committed Vitest component tests plus the passing build.

## State

Branch `codex/remaining-backup-items-20261115` is local only, clean tree. The
main checkout remains on `codex/backup-nine-local-commits-20261115`. No merge to
main, no push, no hosted database write, no deployment. Both reconciliation
branches now await the user's release decision.

## Double-check: old content in the port (2026-11-15)

Follow-up audit (`audit-port-coverage.cjs`, report and script in ignored
`.tmp/commit-batches-20261115/`) compared every file the 11 old commits touched
against commit `b1b97a2`:

- 70 old-touched files; 65 are in the port. **47 are byte-identical** to the old
  chain (all breakfast libs/routes/pages, booking-policy and landing pages,
  scroll reveals, breakfast DB test, docs, QA records, Codex session notes,
  decor assets).
- The 18 integrated files all preserve the old changes: 13 with zero missing
  old lines; 5 whose only line-level differences are documented supersessions
  with semantics kept — payment page (old PayMongo/GCash UI discarded by
  decision, Xendit-only + breakfast line), rooms page (same breakfast actions
  plus current `canPay` deposit gating), holds route (old direct RPCs replaced
  by `create_booking_hold_attempt`; `BREAKFAST_OFFER_CHANGED`,
  `BREAKFAST_EXACT_ROOM_REQUIRED` and the 400 transport mapping present),
  guest-details-form (raw fetch upgraded to `fetchPublic` with attemptId;
  breakfast fieldset and `breakfastOfferId` payload present) and
  `lib/customer.ts` (`breakfast_snapshot` in the reservation select).
- All 5 exclusions verified intentional: the breakfast migration is
  byte-identical on remote; DESIGN.md and the two vault files are keep-ours;
  `lib/transportation.test.ts` is keep-ours because remote's version already
  regex-matches the current attempt-based route (old tweak targeted the old
  route shape; full suite passes).
- Both `30512aa` pieces are byte-identical in the port:
  `components/manager/inventory-replenishment-panel.test.tsx` (absent on
  remote) and `scripts/inventory-replenishment-db-test.mjs`. The latter
  replaces remote's simpler version, which would fail against the port's
  replay-idempotent receiving semantics; the ported version passed the real
  disposable-PostgreSQL run.

No old feature was lost; nothing beyond the old chain plus the two `30512aa`
pieces was added.

