# Hotel location, nearby places and arrival guides

Implementation approved November 6, 2026. Local source implementation complete;
the location schema migration is applied. Hosted application rollout remains pending.

## Local availability repair (November 6)

The user observed missing content on3000 and an unavailable guide on3008.
Port3000 was serving an older Documents/Codex project copy with /api/location404.
The current workspace's production server3008 had the feature API, returning503
because website_location_public was not yet installed in its configured database.

A fresh hosted ledger check returned112 applied versions. An isolated CLI work
directory contained precisely those112 sources plus20261106010000. Supabase
db push --dry-run --skip-vault listed only the location migration; the subsequent
scoped db push applied it successfully. The hosted ledger now has113 entries;
all17 unrelated pending migrations remain excluded. No application deployment,
commit, account modification or unrelated data change accompanied this repair.

The public RPC and /api/location now return the approved demo:4 categories,
4 places and2 origins. The landing's old ISR error was replaced after revalidation.
21 real HTTP assertions pass, including preserved anchors, rendered iframe,
published sample counts, six served WebP files and unauthenticated admin401.
Further read-only checks verify the private5MB image bucket and9 rendered Google
Maps links; the selected airport route targets the configured Rizal Park label.
An initial ad hoc link assertion expected coordinate text; source inspection
confirmed the existing helper deliberately uses the configured Maps label when
present. The corrected approved-origin/destination assertion passes; no source
change was needed. Browser interactions and live uploads are still unverified.

View the integrated app at http://127.0.0.1:3008/#how-to-go or /#nearby.
The3009 component fixture is a separate preview and does not persist changes.

## Scoped commit verification (November 6)

The user requested a commit containing only this feature. The reviewed index
contains47 location-related files. Owner reporting changes, unrelated migrations,
Fleet/finance/housekeeping work, AGENTS/DESIGN changes and other memory entries
are excluded. Shared Owner/SYSTEM/memory files are staged by selected hunks or
section only. Hash comparison confirms107 unrelated dirty files are unchanged.

An export of the staged snapshot passes the full **2,366 tests /222 files** and
the default Turbopack production build; standalone npm run typecheck also passes.
Touched-file lint has0 errors and the
same4 existing Owner warnings. Initial snapshot testing caught omitted sidebar
expectations; including its two location-only expectation changes resolves both.
Earlier2,425/227 results above were for the larger working tree, not this commit.

The isolated build links installed dependencies. Its first default build rejected
that external junction; a Webpack fallback compiled but reported existing extra
route exports in two unchanged files. Both are identical to HEAD and were left
untouched. The final default Turbopack build succeeds with the documented linked-
dependency root set only in the temporary verification copy; its config is restored
afterwards. The approved retry also resolves the sandbox's temporary-directory
write denial. No build-harness config or dependency copy is staged. Node24 was
used; supported-Node22 and browser/authenticated checks remain release follow-ups.

## Implemented behavior

- Added `#how-to-go` and `#nearby` after reviews, before the existing contact
  block. Existing landing content, booking actions, contact anchor, FAQ and
  footer remain. Primary navigation and mobile drawer include the new anchors.
- Connected address/action and live Google Share/Embed map. Native gestures,
  zoom/fullscreen and Open in Google Maps remain available; no custom arrow
  control overlay or paid API/SDK/key. Missing map has a directions fallback.
- Image-led origin cards with independent origin parameters and a central
  current hotel destination. Selected origin updates its arrival guide.
- Featured destination, categories, place photos, descriptions, explicitly
  maintained distances, combined filtering/search, result count and clear/no-match.
  Loading, missing hotel/pin/content, retrieval error/retry and broken-photo
  fallback are independent of the booking flow.
- Admin **Configuration → Location & Places** and Owner **Catalog → Location &
  Places** use one editor with Hotel / Nearby / Categories / Routes / Images.
  CRUD, draft/publish, numeric display order, featured selection, validation,
  preserved failed-save input, stale-version errors and destructive confirmation.
- The singleton hotel can be cleared/unpublished without deleting hotel
  operations. Pin/address/place-ID/embed/demo changes increment a revision and
  return existing places/routes to draft. Their review checkbox binds later
  publication to the current location. A referenced category/image cannot be
  deleted. Changing the featured destination versions the previous selection.
- Public database projection is one consistent SQL statement and omits drafts,
  actor IDs, admin verification-source URLs and private storage keys. All privileged routes use `guardAdmin`
  plus fresh active/recovery/role checks inside audited SQL functions. Manager
  and operational roles cannot edit website content. Service role cannot write
  the new tables directly; it uses audited write RPCs.
- Uploads are ≤5 MB, magic-byte/MIME matched, decoded with bounded resources,
  single-frame, ≤6000 px / 24 MP, resized to ≤1600 px and re-encoded to WebP.
  Reuses the already installed Sharp version, explicitly declared as required
  at runtime; no new package version or Maps dependency. Private bucket,
  generated actor/UUID object names, non-overwriting writes, reference checks and
  deletion tombstones. Draft preview requires Admin/Owner. Public media reads
  check current publication on every request and use `no-store`; already
  downloaded files cannot be revoked.
- Seed data is the expressly requested demo: a verified public Rizal Park pin,
  two sample origin guides, four generic place categories/concepts and six AI
  photos. Distances are labeled manually maintained samples, not asserted travel
  distances/times. Generic concepts open relevant category searches. Real client
  publication requires verified coordinates/source/date and rejects sample
  images/category searches. Legacy demo fields remain clearable after demo mode
  is switched off. Hotel JSON-LD is only for verified, published, non-demo data;
  script-like text is escaped.

## Main implementation files

- `components/landing/location-sections.tsx` / `.css`: public presentation and
  lightweight local filtering/selection. `website-location.tsx` is the server
  wrapper, verified SEO and configured contact-map link.
- `components/admin/location-content-panel.tsx` / `.css`: shared authorized editor.
- `lib/location-content.ts`: pure schemas, Maps URLs, distance/media helpers;
  server I/O stays in `location-content-server.ts` and routes.
- `/api/admin/location`, `/api/admin/location/images`, `/api/location` and
  `/api/location/images/[id]`: scoped endpoints, separate from generic resources.
- `supabase/migrations/20261106010000_website_location_content.sql`: independent
  additive schema, privileges/RPCs, private bucket and explicitly labeled demo.
- `public/location-samples/`: six optimized images. Exact prompts/provenance:
  `docs/design/location-sample-assets.json`, generated using built-in ImageGen.

## Verification

- **Full Vitest: 2,425 tests / 227 files passed. `npm run typecheck` and the
  production `npm run build` passed.** Tests exercise public interaction, URL encoding,
  missing coordinates (including valid zero), invalid/external embed URLs, image
  bytes/limits/decoding, role/active/recovery gates, mutation binding/revalidation,
  private-media visibility, admin create/publish/edit/conflict/delete/cancel,
  demo-to-client cleanup, and non-demo SEO/script escaping.
- `scripts/location-content-db-test.mjs`: **15 real SQL regression groups** pass
  after a clean chronological replay of **130 migrations**. Covers all protected
  roles, anonymous grants/RLS, direct service-write denial, CRUD/publication,
  ordering, feature uniqueness, stale versions, category references, image
  lifecycle, invalid coordinates/embeds, location re-review, audit rollback and
  clearing/deleting content. Dedicated random local database is removed afterwards.
- The same 15 groups pass after replaying the **112 captured applied migrations
  plus only this new migration** (113 total), excluding all 17 unrelated pending
  migrations. No hidden dependency on the pending Fleet/operations changes.
  Optional invocation: `node scripts/location-content-db-test.mjs --linked-baseline`
  uses the locally captured nonsecret ledger in `.tmp/location/ledger.json`.
- **22 real HTTP assertions** passed against the local production build: all old
  and new section anchors, graceful missing-migration fallback, unauthenticated
  admin GET/POST/DELETE 401, private-preview denial and all six WebP assets served.
  This was read-only; no hosted account or content was modified.
- New/touched feature files pass ESLint with 0 errors/0 warnings. The existing
  Owner shell retains four unrelated warnings (unused Sparkles and existing hook
  dependencies/effect behavior); its changes are limited to the new module.
- These local checks used installed Node24.21.0. The repository's declared
  production engine remains Node22.22.2–22.x; repeat the release checks on that
  supported runtime. No engine change was made as part of this feature.
- Earlier design previews had desktop/768/390/320 real-browser verification.
  **The integrated implementation's final browser review is pending:** local
  browser control continued to report disabled in Work settings. No preview
  screenshot is passed off as implementation QA. A controlled-fixture component
  QA bundle was prepared from the actual source in `.tmp/location/`; it uses a
  Next Image display adapter and local state, and is not an authenticated or
  Supabase end-to-end test.
- Live Supabase Storage upload/download and authenticated hosted admin UI have
  not been exercised; the migration is not applied there. Physical-phone
  touch/pinch and iOS Safari remain pending. Tests do not claim live travel-time
  calculation, geocoding or verification of fictional nearby businesses.

## Remaining application rollout gate

The initial ledger probe found112 applied versions through20261103150000. The
scoped repair above applied only this feature (now113 total), with **17 pre-existing
unrelated local migrations still pending**. No application deployment/commit was made. Do not run a root
`supabase db push --include-all` and accidentally release other sessions' work.

For the coordinated release:

1. Repeat build/tests on the declared Node22 runtime and complete real-browser
   desktop/1024/768/390/320 checks of the integrated public
   page and Admin/Owner forms, including keyboard/modal cancellation, long copy,
   light/dark editor, actual image upload/removal and publication rereads.
2. Re-read the linked ledger before application release and confirm
   20261106010000 remains applied. No further database push is needed for this
   feature. Preserve all17 unrelated pending migrations outside any release.
3. Review the application diff and demo seed/public labels before deployment.
   The shared working tree contains unrelated unfinished work; do not deploy
   all of it as a location-feature release. Any future schema change needs a
   fresh isolated directory and reviewed one-scope dry run; never use the legacy
   `npm run migrate` path.
4. This feature's scoped migration is already applied. After the outstanding
   release checks, deploy the matching application. Recheck admin role gates,
   private media and publication invalidation against the real service.
5. Before any client launch, replace demo details/photos/distances, disable demo
   mode and re-verify/re-publish current places/routes. The sample is not a real
   Haven hotel address. To hide the feature, draft the hotel; retain the additive
   schema/private files and audit history rather than dropping unrelated data.

No reservation, billing, room-inventory, transportation pricing, check-in or
check-out code/database rules were changed by this feature.
