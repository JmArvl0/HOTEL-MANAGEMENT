# Location content implementation

November 6, 2026. User approved implementation after reviewing the premium
photo layout, temporary public landmark pin and live interactive Google map.

## Outcome and boundaries

Implemented the approved two landing sections after reviews and before the
retained contact/FAQ/footer, with origin-specific directions, photos/manual
distances, featured place, category/search and honest loading/empty/error/media
states. Live Google iframe, native gestures/fullscreen and fallback link; no
custom directional overlay and no paid Maps API. No changes to booking, money,
inventory, fare or check-in/out rules. Contact Maps now uses the configured hotel.

Admin Configuration and Owner Catalog use one Location & Places editor. CRUD,
publication/order/feature, confirmations, version conflicts and private media.
Fresh `guardAdmin` plus SQL actor checks excludes Manager and operational roles.
Hotel geography/demo changes draft and version the existing local guide. Legacy
demo search/photo fields stay removable after switching to real client mode.

One new migration: `20261106010000_website_location_content.sql`, five RLS tables,
audited writers and explicit service-only RPC grants; service role cannot
directly mutate content. Private `location-images` storage, validated decoded
JPEG/PNG/WebP (5 MB / 6000 px / 24 MP / one frame), normalized owned WebP uploads,
publication-checked non-cacheable reads and race-safe reference/deletion gates.
Declared already-installed Sharp0.35.3 as required runtime dependency; lockfile
reuses existing resolved version/integrities, no package upgrade.

Haven remains fictional. Approved seed is Rizal Park demo pin, generic places,
two origin examples, labeled sample distances and six AI concept photos. Client
publication rejects sample photos/searches and requires verification. Non-demo
verified/published hotel SEO is escaped and uses configured coordinates only.
Image provenance/prompts: `docs/design/location-sample-assets.json` (built-in
ImageGen, six optimized workspace files under `public/location-samples/`).

## Verified results

- Full Vitest **2,425 / 227 files** passed. Targeted public/editor/API/media/SEO
  checks cover behavior, input failures, role gates, stale saves, delete cancel,
  private publication, valid/invalid bytes and non-demo JSON-LD/script escaping.
- `npm run typecheck` and production `npm run build` pass. Isolated output
  `.tmp/location-build`. Initial sandbox builds failed Windows junction/directory
  permissions; an automatic approval retry initially failed due to usage limit,
  then subsequent approved build runs completed. No unresolved build blocker.
  Checks used installed Node24.21.0; production engines remain22.22.2–22.x and
  need a matching-runtime release run. Normal generated type paths restored
  after the isolated build; task-only tsconfig includes removed.
- Feature/touched-file ESLint **0 errors/0 warnings**. Existing Owner shell has
  **4 unrelated warnings**, preserved (Sparkles and existing hooks/effect).
- Real PostgreSQL: clean replay **130 migrations + 15 regression groups** pass.
  Same **15 groups** pass on the captured hosted **112-applied + this migration**
  upgrade (113 total), excluding all 17 unrelated pending migrations. Random
  local DBs dropped by the test harness. Includes anon deny, service direct-write
  deny, SQL role/active/recovery, CRUD/status/order/feature/version, media references,
  location revision, audit rollback and clear/delete.
  Task-owned loopback PostgreSQL cluster55441 stopped after verification.
- **22 HTTP assertions** against the actual local production build pass: retained
  and new anchors, honest missing-migration public fallback, unauthenticated
  admin/private-preview rejection and all six sample WebP assets.
- Final implementation browser QA **not run**: CUA kept reporting local browser
  use disabled in Work settings, including after user said they would enable it.
  Earlier design screenshots are not implementation evidence. Actual-source
  controlled-fixture bundle prepared under `.tmp/location/` using Vite/Next Image
  display adapter; no screenshots or visual pass claimed for it. Original design
  artifact preserved/restored. Physical phone/iOS and live Supabase Storage/
  authenticated hosted admin checks remain pending.

## Release and continuation

Read-only hosted ledger probe: **112 applied**, latest20261103150000; **17
unrelated pending local migrations**. No root DB push, hosted content write,
application deploy or commit. New migration remains local. Until applied, the
integrated guide correctly shows unavailable rather than fake content.

Audit/plan updated; SYSTEM §7.1 records verified local architecture. Full
verification/rollout gate: `docs/qa/location-content-implementation-2026-11-06.md`.
Use an isolated release directory containing all currently applied sources plus
only this migration; fresh ledger + dry run must show only this feature file.
Do not release unrelated Fleet/operations work. Next: enable browser control,
finish integrated public/admin responsive QA, then coordinated schema/app release.

## Local-view follow-up

User asked where to view locally and how to enable the browser tool. Started
the existing production build on loopback3008 with NEXTAUTH_URL matching that
temporary local origin (session69166; no .env file edit). Repeated HTTP22 passes;
the guide still correctly shows unavailable until the hosted migration is applied.
Rebuilt the controlled-fixture source-component preview and served it on
loopback3009 (session42930, `.tmp/location/serve-preview.cjs`). Public sections and
admin editor can be inspected with temporary local state; this is not DB-backed
CRUD or completed browser QA. Original design at8769 remains unchanged.

Opened3008/3009 using `open_in_codex`; the app returned queued, not a visual
verification. Official OpenAI Docs confirmed the Browser settings deep link and
Agent permissions. No setting was changed by the agent. Later checks showed the
plugin enabled and the user reported Browse permission enabled, while this chat
still denied browser access; a disabled user toggle is not an established cause.

## Applied schema and restored integrated local content

After the user reported the local feature missing, read-only HTTP and the other
chat's commands confirmed3000 serves an older Documents/Codex project copy
(/api/location404). Current workspace3008 had the source/API but503 because the
configured database lacked the location migration. This was incomplete delivery,
not a browser-permission issue or a missing landing component.

Refreshed ledger112; prepared an ignored, isolated CLI directory with exactly
the112 applied sources plus the location migration. Dry run with skip-vault
listed only20261106010000; scoped supabase db push applied it. Ledger now113,
all17 unrelated pending migrations excluded. No application deploy/commit.
No hotel operational/account data changed; only the approved content schema,
private image bucket and expressly requested labeled demo seed were introduced.

API200 and published projection4 categories/4 places/2 routes verified. After
ISR revalidation, actual3008 HTML contains the map, airport/city cards and demo
content with no unavailable message.21 HTTP assertions pass; further read-only
checks confirm private5MB storage and9 rendered Maps links, with NAIA Terminal3
origin and configured Rizal Park destination. An ad hoc test initially expected
coordinate text; source deliberately prefers configured Maps labels. Corrected
expected approved label passes without a code change. No new build/test-suite
run was needed: this follow-up changed deployment state/docs, not app source.

Use3008/#how-to-go or /#nearby;3009 remains a nonpersistent fixture preview.
Browser/mobile interactions, authenticated hosted CRUD/upload, physical-phone
gestures and Node22 release verification remain pending. Older no-push notes
above describe the original pre-repair state and are superseded by this entry.

## Location-only commit verification

User explicitly requested committing this work without unrelated edits. Reviewed
and staged47 feature files, with partial staging for Owner reporting, SYSTEM and
shared memory. Excluded unrelated code/migrations/notes. Hashes verify107 unrelated
dirty files remain unchanged. An initial staged export omitted the sidebar test's
two location expectations; including those resolves both failing assertions.
The isolated snapshot's full suite passes2366/222, touched lint0 errors/4 existing
Owner warnings, standalone typecheck and default Turbopack production build pass. The temporary
dependency junction required a documented Turbopack root override in the verification
copy only (restored afterwards). A prior Webpack fallback exposed two unchanged
HEAD route-export guards; neither unrelated file was edited. Sandbox build directory
denial was resolved by approved retry. No push or application deployment requested.
