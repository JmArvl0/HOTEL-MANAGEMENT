# Home and Rooms & suites separation

Removed the homepage Policy Snapshot at the user's request. The hero and Plan
your stay fill a stage at least one viewport tall. Rooms & suites begins after
it, and its decorative arch starts within the room section. The dedicated
booking policy page still displays its live snapshot.

Production build, standalone typecheck, touched-file ESLint, the layout detector,
and 23 focused tests passed. The full suite passed 2,527 tests and failed one
transportation source assertion that expects the previous formatting of the
booking holds route. That route has concurrent changes outside this task.

Verified HTTP 200 on Home and Booking policy at `http://127.0.0.1:3083/`.
The served HTML puts the hero and booking form before Rooms & suites, and the
production stylesheet includes the minimum viewport height. The browser tool
reported local browser access unavailable, so visual QA remains pending.

## Public navigation follow-up

The shared header and drawer show Log in for signed-out visitors and My
account for valid sessions. The login form offers Create an account. The Home
header omits the duplicate availability button, leaving the primary action
with Plan your stay and a single shortcut in the drawer. All 23 navigation
and booking-policy tests passed with one Vitest thread worker.
The updated production build and its TypeScript check passed. The refreshed
preview served the expected Home header, booking form, login and registration
link, booking policy header, and anonymous session response. Browser access
was unavailable for a visual check.
