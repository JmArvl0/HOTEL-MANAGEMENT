# Room Management cards — 2026-11-23

The staff room rack now has a large card based on the reference and a compact grid.
A single result expands automatically. Room card layout also offers Large cards
for every result. Both card sizes use the room type's catalog photo with the
existing image fallback, live room statuses, linked guests, and readable dates.
Linked stays remain visible on dirty and out-of-service cards while the existing
room action rules still govern the dossier and ellipsis actions.

Measured the supplied artwork directly because a dedicated Image-to-Code tool
was unavailable. Compared the rendered card in Edge at 1448, 1100, 768, 390, and
320px using controlled rack data. Verified the missing-photo fallback, empty
stay fields, keyboard action trigger, reservation routing, and layout selection.
The comparison uses the bundled Deluxe King photo.

The Turbopack production build passed with Windows junction creation enabled
after the workspace sandbox denied the first build's junction for Sharp.
Typecheck passed, alongside 44 focused tests and all 2,708 tests in the full suite.
ESLint reported the existing unused `onNavigateReservations` parameter warning.
