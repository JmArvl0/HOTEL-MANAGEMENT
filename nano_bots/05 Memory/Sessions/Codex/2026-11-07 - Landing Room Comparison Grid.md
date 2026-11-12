# Landing room comparison grid — 2026-11-07

User requested a reference-style 2×2 room layout, whole-room/bathroom images and
admin configuration, then explicitly required Current/Proposed review before code.
Prepared an isolated interactive comparison; user approved implementation.

Implemented two-column cards with split photo/details, saved description/facts,
four amenity highlights, three selection thumbnails, shared full-photo viewer and
preserved booking intent. Reused existing catalog admin controls and ordered uploads;
successful catalog changes now invalidate the landing. Uploaded photos win. Three
approved generated Deluxe King concepts are local WebP fallbacks (385KB total), shared
with booking surfaces. No schema change or hosted DB write.

Verified typecheck, touched lint (0 errors/4 existing catalog warnings), focused85/8
and23/2, final full **2431/228**, default production build, design detector empty and
scoped diff whitespace. Browser verified actual production1440/768/390/320, no overflow,
loaded photos, bathroom selection/viewer/Escape focus return and connected booking
search retaining room/dates/guests. Samples HTTP200; unauthenticated catalog401.
Signed-in hosted admin upload/save QA was not performed. Installed Node24 differs
from declared22; repeat release checks on supported engine before deployment.

Updated SYSTEM/DESIGN with verified behavior, preserving unrelated dirty work.
No commit/push/deployment. Local production3013 (session83273) remains available;
comparison8768 is still a separate prototype. Detailed evidence and limitations:
`docs/qa/landing-room-grid-2026-11-07.md`. Screenshots/logs in
`.tmp/room-card-comparison/`. Generated build-only tsconfig/next-env edits restored.
