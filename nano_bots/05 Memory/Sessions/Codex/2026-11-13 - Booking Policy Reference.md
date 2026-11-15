# Booking policy reference — 2026-11-13

Implemented the user's supplied screenshot and pasted design spec directly on
`/booking-policy`, preserving the public nav/footer and the established brand.
Four highlights, overview/quick links/at-a-glance sidebar, three open policy
sections and bell/flowers support CTA. At <=900px the page stacks and supplies
a native section-jump disclosure; snapshot becomes 2x2. Duplicate at-a-glance
is hidden on small screens because the same facts remain in the main content.

Live values remain owned by existing deposit/operational readers. Fixed and
disabled deposits, changed refund thresholds, taxes, times, age/ID requirement
and published email are covered by component tests. No DB or CMS schema change.
Generated decorative artwork and exact prompt are documented in
`public/decor/README.md`; PNG also embeds its prompt.

Verified: Node22 final production build, standalone typecheck, touched ESLint,
mechanical detector, focused6 and full2525 tests across242 files. Default
sandbox build failed at a Turbopack junction; webpack also hit output EPERM.
Authorized execution outside the sandbox passed the production build.
Final build includes the adjusted support-art crop. Full suite emits existing
jsdom navigation/canvas notices but passes. Browser QA at1440/768/390/320,
no horizontal overflow, loaded artwork, native jump links below fixed nav,
2px keyboard focus and 44px support actions. No headless test run was claimed.
See `docs/qa/booking-policy-reference-2026-11-13.md`.

Local production preview at `http://127.0.0.1:3083/booking-policy`.
Temporary build additions to tsconfig and next-env restored to their previous
working-tree values. Existing unrelated changes preserved. No commit,
database write or hosted deployment.
