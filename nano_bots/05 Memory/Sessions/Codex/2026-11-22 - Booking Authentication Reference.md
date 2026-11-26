# Booking authentication reference

Recreated the supplied booking sign-in layout with the existing Haven logo,
published brand name, and shared room gallery. The reservation card displays
catalog details and the date-specific estimate, including a selected breakfast
offer when it still matches. Room type and floor come from the booking data.
The header links to existing public destinations and Front Desk support.

The named Image-to-Code tool was unavailable. A local screenshot-to-wireframe
pass measured the reference and generated the starting layout. The wireframe,
browser captures, and QA harness are in `.tmp/booking-auth-reference/`.

Final production build, typecheck, scoped ESLint, and 69 targeted tests passed.
The full suite passed 2,666 of 2,672 tests. The six cases that hit the default
timeout passed when rerun in their three files with a longer test budget.
Edge inspected six widths from 320 to 1448px and exercised gallery keyboard
controls, room/date editing, native and credential validation, registration,
and password-recovery navigation. Sign-in and registration resumed the same
room, dates, guest count, and breakfast selection against disposable local
PostgreSQL. The migration replay and SQL regression checks passed. The browser
inspector passed with allowances for the reference's warm surfaces, soft card
shadows, and raised primary controls.

## Compact summary and inline photos

The booking header now shows the Haven logo and Front Desk link. Below the
photo, dates and guests share a row, one room block holds the floor and
description, and the estimate sits above the secondary change link. Previous
and next arrows update the inline photo and counter, with the same selection
carried into and out of the shared full-screen viewer.

Edge verified keyboard and touch photo controls, the single-photo viewer,
the layout at six widths from 320 to 1448px, and both auth paths returning to
the selected stay with breakfast. Production build, typecheck, scoped ESLint,
and 45 targeted tests passed. Captures are in `.tmp/booking-auth-reference/`.
