# Landing audit implementation, November 11, 2026

User authorized the audit prototypes in the actual app and room type lifecycle,
reassignment and amenity exceptions. The 34-item comparison is in
`docs/qa/landing-audit-implementation-2026-11-11.md`. Owner/Admin Website Content
provides the fictional hotel profile, private media, saved drafts, before/after
review and audited publication. Public photos include credited Rizal Park,
National Museum of Fine Arts and Pedro Gil LRT-1 images. Existing catalog,
location, payment and operating settings remain authoritative.

Supabase migrations 020000 through 050000 applied by scoped CLI pushes. Hosted
ledger confirmed 118 applied, 17 unrelated pending. An earlier auto-review
usage limit stopped 050000. The subsequent approved attempt applied it. Real
local tests verified both commit orders for room configuration vs booking and
no stale hold. Catalog/amenities 9, CMS 9, upgrade/client publication 3,
exact-room 9 and mutex 4 all passed. Final clean migration replay passed.

Node22 production build and typecheck passed. Full Vitest checkpoint 2446/233,
then 87 focused checks on final behavior. Impeccable detector returned `[]`.
Landing build CSS 639,109→285,919 raw and 110,827→55,043 local gzip. Read-only
HTTP smoke verified actual public routes, form anchors, demo media and signed-out
editor access denial. Browser verified 320px landing/calendar/credits and actual
editor component in a disposable database fixture. Subsequent CUA access reported
disabled despite user's enabled setting, so verification continued via HTTP and
jsdom at the user's request. Staff login/private Storage upload and final mobile
account layout were not exercised. No hosted app release, commit or Git push.
