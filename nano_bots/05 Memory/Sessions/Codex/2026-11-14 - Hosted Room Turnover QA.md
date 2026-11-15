# Hosted Room Turnover QA

Used `haven-hotel-management-ten.vercel.app` with temporary Front Desk and
Housekeeping accounts. Seeded one isolated checked-in stay with a zero balance.
Exercised the deployed endpoints used by the staff screens. Verified the task in
the signed-in Housekeeping queue response and the room in the rack and Front Desk
availability responses. No browser walkthrough was performed.

- Checkout of `RSV-7E67ECFF` closed the room assignment and marked `QA-ae17fdb1`
  dirty. Queue task `HKT-20A16949` appeared as `Post-checkout room turnover`,
  pending and high priority. Same-day availability was zero.
- Housekeeping started and completed cleaning. With inspection required, the task
  awaited inspection. Same-day search and the exact-room availability check still
  excluded the room even though its raw room status was `available`.
- Passing inspection made the room clean. Same-day availability returned one
  room, and the exact-room check returned true.
- Disabled the test room, room type, and staff accounts after verification.
  Retained the test reservation, task, and audit records.
