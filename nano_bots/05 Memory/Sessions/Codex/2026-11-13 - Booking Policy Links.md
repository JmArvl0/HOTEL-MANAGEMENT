# Booking policy links — 2026-11-13

User requested removal of the Quick links block, separate Booking terms/Privacy
policy pages, and three separate footer links. Removed the block/dead CSS;
public footers and the landing booking summary now use one Booking policy
destination. Old `/terms` and `/privacy` routes redirect to `/booking-policy`,
verified in the real browser. Existing policy/settings and legacy saved CMS
drafts remain untouched. Full policy stays on its own page; the homepage's
existing short summary near the booking form remains.

At-a-glance facts use the freed sidebar area; short windows omit the generic
intro instead. Screen-fit/tabs, full policy copy and contact actions remain.
Node22 production build/typecheck/touched ESLint, focused19, full2528/242 and
mechanical detector pass. Browser verifies the homepage footer's single policy
link and navigation, route redirects and no Quick links on the policy page.
See `docs/qa/booking-policy-links-2026-11-13.md` for final captures and limits.

Local preview3083 updated. No DB write, commit or hosted deployment. Own
generated-type build entries removed; unrelated working-tree/memory preserved.
