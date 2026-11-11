# Guest Requests implementation

10 November 2026, Asia/Singapore. The approved Guest Requests prototype
was implemented in the local staff workspace.

- Front Desk and Manager see the oldest pending submissions first. The
  counted queue filters by approval, open work, history, department or search.
- The selected submission shows recorded notes, item progress and activity.
  Housekeeping sees its routed work and history. Front Desk uses the existing
  whole-batch review route. Department work and escalation use their existing
  actions. Withdrawn items stay closed.
- Desktop panes share a bottom edge. On phones, Back to queue retains filters
  and returns focus to the request row. Inventory is available from the
  read-only supply disclosure.
- The production build, typecheck, 58 focused tests and touched ESLint
  passed. The full suite reported
  2,411 passes and the two existing purchase-order copy and Billing toolbar
  assertions.
- Chromium opened the page through the staff dashboard. Demo API reads
  returned 401 without a session and 200 for Front Desk. The browser used
  fixture HTTP responses for batch approval and Housekeeping item updates.
  Manager was read-only. Both themes fit from 320 to 1,920 px. The desktop
  panes scrolled independently and the phone return restored search and focus.
