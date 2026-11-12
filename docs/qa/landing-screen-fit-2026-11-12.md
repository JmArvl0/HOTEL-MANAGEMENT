# Rooms and Gallery screen fit — 2026-11-12

The user requested that clicking Gallery, then Rooms in the homepage navigation,
show each complete section beneath the fixed header in one screen.

Gallery uses its existing viewport flex layout and corrected anchor offset.
Rooms now reserves the remaining `100svh` height below the header. The current
four catalog types fit a 2×2 desktop comparison. At ≤900px a native horizontal
snap track displays a full card and a peek of the next, with touch, scrollbar,
keyboard and normal tab access to every type. Extra desktop types remain
reachable by scrolling the region. There is no catalog truncation.

The photo and card spacing adapt to the available height. Optional amenity chips
and thumbnail controls disappear at compact heights; full photographs remain
available through the existing viewer. Room titles and descriptions show at
most two lines and do not shrink into clipped text. Full copy is available on
the room-type route. Pricing, booking links, uploaded photos and retained dates/
party size still come from their existing sources.

Short landscape/zoomed windows use normal page flow to preserve readability;
expanded Gallery credits also grow naturally. These are intentional exceptions
to the default single-screen presentation.

Verification against the final Node22 production build:

- Rooms nav/drawer clicks: 1910×942,1920×1080,1440×900,1366×768,1280×720,
  1024×768,768×1024,390×844 and320×640. The whole section/caption fits, titles
  retain at least one full line, photo panels remain ≥140px, and all four desktop
  booking actions stay inside their cards. No horizontal page overflow.
- All room types remain reachable by native keyboard scrolling/focus. Actual
  touch input scrolls the phone cards without opening the photo viewer.
- Room-photo opening/Escape/focus flow pass. Focused tests cover the existing
  uploaded-photo selection, failure states, full viewer and preserved booking
  intent: 15 tests / three files pass. Touched TypeScript ESLint passes.
- Gallery nav/drawer clicks: the prior ten sizes, adding700×900, pass in the same
  build. CTA/credit and heading stay visible below the nav. Category, arrows,
  viewer/Escape and expanded credit checks pass.
- Final Node22 production build and TypeScript checks pass. Full regression
  suite: 2,463 tests /237 files pass (outside Windows sandbox, four workers with
  15s test/hook ceilings). CSS mechanical detector returned `[]`.
- The first Gallery follow-up sandbox suite had reminder timeouts and worker
  startup errors; isolated reminders7 and an outside-sandbox full2463 rerun
  passed. These required no application/test-source repair.

All final viewport captures were opened. The first look revealed flex-shrunk
room headings in the smallest layout; fixed by retaining text height and using
the intended compact price/action row. Final browser checks explicitly detect
that regression. Evidence: `.tmp/rooms-fit/` and `.tmp/gallery-fit/`.

Local Node22 production preview: `http://localhost:3042/#stay` and `/#gallery`.
No commit, push, deployment, migration or database write. No physical-device or
authenticated hosted CMS publication QA was performed. Concurrent unrelated
location work and generated type references were preserved.
