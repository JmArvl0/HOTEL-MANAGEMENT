# Landing Mobile Labels and Startup — 2026-11-12

The homepage bypasses the 1.22-second startup splash on initial visits.
Edge with the external Next scripts held and CPU throttled confirmed visible
hero copy before hydration. The 300ms position transition starts at full
opacity and is absent with reduced motion.

Booking labels use sentence case and the affected room, gallery, navigation
and location labels are at least 13px. At 320px the compact room layout keeps
the 140px photo, the complete room details area and the booking action in the
card. Rooms, Gallery and Location still fit below the fixed nav at all five
tested sizes. The closing booking link and date picker passed interaction QA.

Final Node22 build, standalone typecheck, touched ESLint and 43 focused tests
passed. All 2,469 tests passed before the last compact spacing and caption
polish. The repeat design inspection no longer reports small-text, micro-label
or late-title. Evidence is in `.tmp/landing-readability/`. Local preview is
`http://127.0.0.1:3061/`. No hosted release or database write.
