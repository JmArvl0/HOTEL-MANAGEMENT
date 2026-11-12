# Amenities and dining reference — 2026-11-12

Applied the user's supplied UI specification directly to the homepage, using
the image as visual reference and omitting the amenity arrows. Responsive ivory/
navy/gold facilities sit beside a forest-green dining card with generated demo
breakfast art. Natural description growth preserves hours/fees. Dining remains
top-aligned and independent of list height; tablets/phones stack the layout.

The first eight enabled amenities are followed by a native overflow disclosure.
The existing Owner/Admin CMS now supports facility icon/order plus optional
dining schedule, price caption and internal action text/path. Existing documents
keep defaults and the existing draft/review/publish flow. Client photos come from
the first Dining gallery entry; only the unchanged fictional gallery receives
the disclosed food concept. No migration, DB mutation, commit or deployment.

Node22.22.2 production build, typecheck, touched ESLint and16 focused tests pass.
Full suite2486/239 passes at two workers; initial high-concurrency registration
timeouts are resolved by rerunning without changing tests. Production Edge at
nine widths320–1672 has no overflow/page errors. Real component fixtures0/8/10/32
confirm keyboard expansion and independent dining height; booking navigation,
focus and reduced motion pass. The broader taste detector retains findings for
the user's requested styling and unrelated homepage treatments; not called clean.

See `docs/qa/amenities-dining-2026-11-12.md` for evidence and design critique.
Asset prompts/provenance live beside the generated breakfast and botanical files.
Final local preview: `http://127.0.0.1:3078/#amenities`.
