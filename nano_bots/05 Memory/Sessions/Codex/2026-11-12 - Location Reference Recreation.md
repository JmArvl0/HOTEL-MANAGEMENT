# Location Reference Recreation — 2026-11-12

Implemented the supplied ivory/green/gold photo/map/highlights reference on the
actual homepage, preserving published location/website content, live Google
iframe, directions, full category/search guide and client arrival routes.
The user's follow-up removed the address + Open in Maps footer; the map fills
the entire438px desktop/400px tablet/340px phone card. Directions stays on the
photo. The demo's duplicate contact photo was replaced by this same showcase;
non-demo contact details remain below it, FAQ unchanged.

Added two disclosed built-in-generated sunset/meal WebPs; prompt/provenance in
`public/website-samples/location/README.md`. Real park/museum credits retained.
Only unchanged fictional seed highlights get reference copy/sample walking
times; edited/client copy and uploaded property photos take precedence.

Browser QA caught focus scrolling the photo card's oversized decorative arc.
Shared grid layers plus `overflow:clip` keep image/card tops aligned and the
card scrollTop zero on phone/tablet/desktop. No overflow at1672/1440/768/390/320.
Map fills its card, footer absent, native Google controls/load and full-guide
category/search/no-match/clear behavior verified through CUA.

Node22.22.2 final production build, explicit typecheck, touched lint and focused
31/4 pass. Full suite checkpoint2463/237 passed before the final scoped CSS/
footer edits; final focused checks/build cover those. Initial broad parallel
run hit test timeouts; reduced-worker full rerun passed. One build hit an
existing booking-policy prerender timeout; later builds passed.

Impeccable detector[]; taste source-lint conflicts are pinned by the reference.
Browser inspector not used outside supported CUA. Full-page IAB screenshots
omit cross-origin map paint; final live viewport screenshots are the evidence.
See `docs/qa/location-reference-2026-11-12.md`, ignored
`.tmp/location-reference-qa/`, and local production3026/#how-to-go (session60301).
Development preview3025 stopped. No DB/migration/commit/push/hosted deployment.
Physical-device and authenticated hosted CMS QA were not performed.

Skill-directed finish review found a weak CTA focus outline. Light-gold focus
was recaptured on the final production phone build; reviewer scored the sole
listed fix resolved and returned Ship for that fix verification.

Follow-up: user requested a button instead of the full-guide dropdown row.
Added centered Explore Nearby Places / Hide Nearby Places with accessible
expanded/controlled-region state; filters/search persist. Node22 build,
typecheck, touched lint and14/3 focused tests pass. Production430/1440 CUA
keyboard/open/close/search/filter and overflow checks pass. Same preview3026
now runs session39690. Photo-credit disclosure unchanged; no DB/release action.
