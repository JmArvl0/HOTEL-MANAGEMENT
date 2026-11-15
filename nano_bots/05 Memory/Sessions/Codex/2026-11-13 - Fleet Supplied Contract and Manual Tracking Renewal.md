# Fleet supplied contract and manual tracking renewal — 2026-11-13

## Scope and authority

User supplied Fleet's actual `schema.txt` and complete wrapped acceptance after
the earlier alignment proposal. Read relevant SYSTEM/source/migrations and live
handoff. One agent. Preserved the large unrelated working tree and initial
generated type-file changes. Reused Impeccable guidance for the narrow staff
control, keeping the existing UI. No hosted deployment, migration push, real
credentials exchanged, external messages, production activation or PayMongo.

## Implemented locally

- Exact schema saved under `docs/integrations/contracts/`; SHA-256 matches the
  provided file. Supplied sample saved separately. Schema metadata explicitly
  includes uncommitted partner implementation; no deployed-revision claim.
- Persist flat guest fields, HAVEN source, envelope round-trip reference and
  lowercase leg. Optional photo and increasing removal versions retained.
  Both legs carry preferences/luggage/notes and local contact defaults.
- Strict complete wrapped ACK/plain callback validation, alias agreement,
  source revision/journey/leg binding, immutable raw wire evidence. Atomically
  store create ACK reference and snapshot. Durable duplicate/stale protection;
  reject new legacy PMS callbacks, permit existing exact inbox replays.
- Photo signing requires exact request/photo/version/current assignment and
  permission/active stay/trip. Response uses `url`, not `photo_url`, with a
  60-second private HTTPS URL. Optional photo never blocks creation.
- Explicit Front Desk renewal button and durable command table/RPCs. Original
  event ID, version and assignment persist across retries, including callback
  before lost HTTP response. Current assignment/consent/state checked before
  sending. Leases/backoff, bounded attempts, root `outcome:renewed`, changed
  unexpired URL and higher version required. No automatic renewal.
- Fare/correction PHP-centavo evidence stored only; no folio/status writer.
- New additive migration `20261113010000_fleet_wire_and_tracking_renewal.sql`.
  Live ledger checked read-only before numbering: 118 applied, latest
  `20261111050000`. All three Fleet migrations remain local in this session.
- SYSTEM/current adapter guide updated; previous wire drafts marked superseded.

## Verification actually run

- Isolated full migration replay and existing SQL harness: **24 cases, 0 failures**.
- Original Fleet SQL: **26 preparation +14 safety passed**. New supplied-wire SQL:
  **17 passed**, including independent JSON Schema validation of persisted
  photo/no-photo and both-leg payloads, atomic ACK rollback, bad identity/revision,
  four-field signing, concurrency/role guards, stable retry/lease, callback-first,
  terminal/stale behavior, legacy replay and no fare posting.
- Focused Vitest: **103/4 passed**. Initial baseline had 79 pass/1 source-scan
  timeout at the default 5 seconds; rerun used 30 seconds and passed. No concealed
  functional baseline failure. Full Vitest: **2,511 tests /240 files passed**.
- Production build passed with isolated output and all hosted env credentials
  blanked. `npm run typecheck` passed; repeated after restoring generated type
  paths. Touched ESLint: **0 errors/0 warnings**.
- Real local Edge/Playwright with Haven NextAuth/API/PostgreSQL, synthetic HTTPS
  Fleet and private storage: account autofill, optional photo, preferences/notes,
  both-leg outgoing wire, complete ACK/callback, driver/plate/tracking, new-tab
  provider page, share invocation/copy fallback, duplicate/conflict/stale/unsafe
  callbacks; explicit staff renewal and callback-first lost-response retry with
  identical saved operation. Reassignment/expiry/completion and permission
  withdrawal clear/disable guest links. Guest cannot renew. Photo signing rejects
  wrong/missing/auth/stale bindings, reassignment and removal; private image
  preview works. No transport charges appeared.
- Desktop and emulated 390/320px, light/dark screenshots inspected. Staff renewal
  controls fit at320px. Native share/clipboard boundaries observed with test
  doubles, without real messages or changing the system clipboard.
- Fresh off-mode Edge fixture: preparation remains local, two send controls
  disabled, direct delivery/renewal/callback/photo calls gated, **zero partner
  requests**. All browser network requests loopback/synthetic only.
- QA corrections: cold compile needed a longer assertion timeout; test-only
  folio reservation ID cast changed UUID→text; signing lifetime checked against
  the supplied ≤120-second ceiling rather than an exact millisecond boundary.
  Final checks passed; no product workaround introduced for these harness issues.

Ignored evidence: `.tmp/fleet-wire/` logs/screenshots. Owned browser process trees
and their exact recorded clones removed. The local PG cluster started for this
session was stopped after verifying zero other clients. Generated imports/includes restored to
the initial snapshots, preserving unrelated changes. No commit/release.

## Remaining / release boundaries

Task22 remains **in progress**, not production-ready. Need real HTTPS staging
addresses, approved tracking/storage origins, deployed Fleet revision, separate
secure test credentials, joint staging and physical-device/OS/GPS testing, and
authorized Front Desk/Fleet/Accounting sign-offs. Tracking origin allowlist stays
blank; connection stays off.

Fleet's DELETE revocation path has no supplied complete body/response/replay
contract. Do not invent it or claim Haven revokes already shared Fleet tokens.
Source lookup recovery/update/cancel/reconciliation are not implemented by this
alignment. Automatic fare posting awaits a separately approved accounting
adapter/schema/authority/correction policy. Never activate these from this note.

Manual staging procedure: `docs/integrations/HAVEN_FLEET_PREPARATION.md`.
