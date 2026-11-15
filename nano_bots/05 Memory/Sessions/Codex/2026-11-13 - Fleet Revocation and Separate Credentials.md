# Fleet revocation and separate credentials — 2026-11-13

## Scope

Fleet accepted the Bitwarden exchange and requested Haven readiness on existing
deployments. Completed the previously identified local revocation/purpose-key
gaps while keeping integration off. One agent; relevant SYSTEM, live memory,
decisions/source/migrations read. Impeccable hardened the narrow existing modal;
project guidance/craft floor loaded, detector returned no findings. No subagents.
Large unrelated dirty tree preserved. No real credential/Send, external message,
hosted migration apply/deployment or activation. PayMongo/fare posting deferred.

## Implemented locally

- Three distinct server-only keys (minimum32 characters): Fleet-issued
  HAVEN_FLEET_OUTBOUND_KEY, Haven-issued HAVEN_FLEET_CALLBACK_KEY and separate
  HAVEN_FLEET_PHOTO_KEY. Legacy shared inbound key ignored. Wrong-purpose
  callback/photo credentials rejected. Defaults remain off/blank.
- New additive migration20261113020000. Hosted ledger read-only check before
  numbering:118 versions, latest20261111050000. RLS/service-only per-leg
  fleet_tracking_revocations, atomic guest-withdrawal trigger for attempted legs,
  permanent cached-tracking filter and SQL renewal guard. Unattempted preparation
  produces no fabricated remote revoke. Re-consent/new callbacks cannot restore
  withdrawn public links. Guest local save does not claim partner completion.
- Pickup-profile POST dispatches saved withdrawals only when configured; remote
  failure cannot roll back local permission withdrawal. Pending status returned.
  Front Desk can confirm permanent one-leg revoke, retry failures or explicitly
  confirm a reviewed409 version. Guest/Manager cannot execute staff actions.
- DELETE sends exactly expected_request_version, no event/idempotency/Origin.
  Leases and bounded retries preserve its version through uncertainty. Parse
  complete revoked/already_revoked snapshots; latter may be a newer current
  snapshot. Save receipt/evidence atomically.409 saves current evidence and stops
  until explicit version/intent review; no silent advancement.429 honors
  Retry-After; eight-attempt bound requires coordination.
- If create ACK was lost and version unknown, authenticated original-source GET
  discovers/saves version before first DELETE. This is narrow revoke recovery,
  not general reconciliation/update/cancel integration. Existing local transport/
  stay cancellation still needs Fleet coordination; no remote booking cancel.
- Staff modal adds plain-language confirmation, retry/conflict/pending/success
  states. Guest permission copy explains public tracking withdrawal/permanence.
  No shared layout/style rewrites.

## Actual verification

- Fresh local replay of137 migrations; existing SQL24 cases/0 failures.
- Existing Fleet preparation26, safety14, supplied-wire17 all pass. New revoke
  SQL16 pass: transactional rollback, both legs, re-consent, concurrent lease,
  lost result/backoff, stale lease, mismatched/unsafe receipt, newer already-
  revoked snapshot,409 confirmation, one-leg isolation, late callback/renewal
  guard, terminal receipt, unknown-version lookup, no-attempt leg, browser-role
  denial and no fare charge. Total Fleet SQL73 cases.
- Focused Vitest114/5 files pass. Full npm test:2522/241 pass. Production build
  passes in isolated output with all hosted env credentials blanked. Typecheck
  passes including after restoring original generated imports/includes. Touched
  ESLint0 errors/0 warnings (removed one fixture-validator unused warning).
- Real local Edge via Playwright, Haven NextAuth/API/PostgreSQL, synthetic HTTPS
  Fleet/private-storage: callback/photo keys work only at intended endpoints;
  actual optional photo signing succeeds. Guest withdrawal queues two legs,
  hides links and blocks signing. Callback-before-lost-DELETE replays original
  version and accepts already_revoked. Staff confirmation/409 review and wrong-
  role denial pass. Unknown create ACK uses GET then DELETE without duplicate
  booking.429/backoff blocks early resend. No transport charges appeared.
- Desktop,390px guest and320px light/dark staff confirmation/pending screenshots
  inspected, no page overflow. Native mobile OS/real provider GPS/token behavior
  not established. Synthetic partner lifecycle needs real joint testing.
- Fresh off-mode Edge fixture passes local prepare/disabled-send/route gating
  and zero provider requests. No hosted integration test or activation.
- Official Supabase db push --dry-run with a scoped migration directory lists
  exactly20261105010000,20261105020000,20261113010000,20261113020000. No other
  pending files, seeds/roles, or actual apply. Dry-run is selection/ledger proof,
  not proof those functions have run against the hosted DB.

Harness corrections: initial PG start omitted explicit loopback port; corrected
to127.0.0.1:55432. Fixed new PL/pgSQL CASE parentheses after replay caught syntax.
Synthetic provider concurrency flag initially dropped both DELETE responses;
corrected fixture before rerun. Browser test tried hidden desktop table at phone
width; remaining phase rerun opening before resize. Initial verifier core checks
and separate final/off checks passed; never claimed a hung whole run passed.

Ignored logs/screenshots: .tmp/fleet-revocation/. Owned process trees and exact
recorded clones removed; prior generated-file changes preserved. Local test PG
server stopped after confirming no other clients. No commit/release.

## Remaining

Task22 remains in progress. Existing Haven routes last hosted404; deployment,
four migration apply, actual production image-origin check, private credential
exchange, agreed Asia/Manila window, real partner/device/GPS/public-token QA and
authorized sign-offs remain. Bitwarden channel accepted; actual verified private
recipient details still needed. Do not enable from this note. Keep tracking
allowlist blank until the agreed hosted configuration/test window. Production
fare adapter/schema/authority/corrections and general source read/update/cancel/
reconciliation remain deferred. Existing original fare behavior preserved.

Manual steps/current contract: docs/integrations/HAVEN_FLEET_PREPARATION.md.
