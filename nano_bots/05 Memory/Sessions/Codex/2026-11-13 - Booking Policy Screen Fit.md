# Booking policy screen fit — 2026-11-13

User asked for the policy page to fit without scrolling. Actual in-app view
was631x883. Desktop now uses compact spacing/type,250px sidebar and a legal
footer; short windows omit duplicated summaries/optional copy. At <=1100px,
keyboard tabs show one complete policy section at a time. Direct fragments,
hash changes, arrow/Home/End focus and resizing are supported. No-JS markup
retains every section. Live policy/published identity/contact sources unchanged.

Node22 final production build, standalone typecheck, touched ESLint, focused8
and full2527/242 pass. Mechanical detector clean. Real browser measurements
show exact viewport-height pages at1440x900,1366x768,1280x720,1024x768 and
the user's631x883. Production checks verify all desktop sections and each of
the three631px tabs. Small phones preserve16px policy text and natural
scrolling; no universal no-scroll claim. See
`docs/qa/booking-policy-screen-fit-2026-11-13.md` for captures and limitations.

Replaced this task's previous preview process with the new production build
at `http://127.0.0.1:3083/booking-policy` (hidden background process).
Own temporary generated-type config entries removed; prior config and unrelated
concurrent guest-journey notes preserved. No DB write, commit or deployment.
