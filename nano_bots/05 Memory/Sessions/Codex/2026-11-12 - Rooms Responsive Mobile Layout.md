# Rooms Responsive Mobile Layout — 2026-11-12

The user requested responsive Rooms cards after finding the horizontal mobile
track hard to browse. At 680px and below, cards now form one vertical column.
At 681–900px, two photo-over-details columns grow with their content. Both use
normal document scrolling. Full descriptions use 16px text, amenities and
thumbnails appear, and phone booking actions span the available width. The
desktop comparison retains its viewport layout. SYSTEM.md and DESIGN.md reflect
the revised mobile behavior.

Node22 production build, standalone typecheck, 37 focused tests and the CSS
detector passed. The full 2,473-test suite passed across 238 files. Local Edge
verified ten sizes from 320px to 1440px, including
landscape, fifth-card layout, actual vertical touch scrolling, photo selection,
viewer Escape/focus return and the room booking link. Every final screenshot
was inspected. Evidence is in `.tmp/rooms-responsive/`; preview is
`http://127.0.0.1:3062/#stay`. The first sandbox full-suite process ended without
a test result; the outside-sandbox rerun passed. No hosted release or DB write.
