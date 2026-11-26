# Exclusive staff AI panel — 2026-11-25

The user dropped the bubble interaction prototype and requested exclusive
left-navigation/right-AI behavior. The desktop AI drawer now mounts as a
third `.app-shell` flex child. Opening it collapses the navigation; expanding
navigation closes AI; closing either one leaves the other as it was. The open
AI column takes 320–420px (clamped to 30vw) and scrolls its own content.
At 1000px and below, both panels keep their existing fixed positioning and
opening one closes the other. Manager/staff, Owner, and Admin shells control
the AI open state. The dedicated Manager HAVEN AI page clears any open drawer.
The sample drawer follows the same layout. The bubble sample code was removed;
the prior session record is marked superseded. Guest concierge and AI data
routes were not changed.

Verification: focused drawer and admin shell tests passed (10 tests); full Vitest passed
(248 files, 2,547 tests); `npm run typecheck`, touched-file ESLint (0 errors,
6 existing warnings), `git diff --check`, the design detector, and an isolated
webpack production build passed. Build-generated config changes and output
were removed. Browser navigation to `/manager_dashboard` redirected to sign-in,
so authenticated visual review of desktop, narrow screen, and themes remains.
No deployment, migration, or operational write occurred.
