# Landing Background Continuity — 2026-11-12

Rooms, Gallery, Location, FAQ and the public information pages share the hero's
warm ivory canvas. Brass doorway outlines carry from the introduction into Rooms
and appear in the full Gallery. Carousel linework extends vertically between
sections while side previews stay clipped horizontally. The Location foliage
fades into the shared background. The final availability link floats above the
navy footer and still leads to the booking form.

Node 22 production build, standalone typecheck, touched TypeScript ESLint and
41 targeted landing tests passed. The full 2,467-test suite passed before the
final CSS-only foliage fade and concurrent Nearby Guide follow-up. Impeccable
reported no findings on the changed files. Local Edge confirmed the shared
canvas, no horizontal overflow, fixed-header anchor fit, closing booking link,
Nearby Guide and full-gallery viewer/Escape at desktop, tablet and phone widths.
The whole-page design inspector still flagged existing patterns such as small
labels and the startup loader. Its screenshots and the measured interaction
results are in `.tmp/landing-continuity/`. The final local preview is at
`http://127.0.0.1:3059/`. No hosted release or database write.
