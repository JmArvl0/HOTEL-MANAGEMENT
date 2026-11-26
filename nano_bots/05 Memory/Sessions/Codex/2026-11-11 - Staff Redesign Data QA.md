# Staff redesign data QA

11 November 2026, Asia/Singapore. Replayed 129 migrations into a disposable
PostgreSQL database. Chrome and the actual Next.js endpoints used authenticated
fictional users through local PostgREST. Readback queries checked committed rows.

- Guest Management showed the linked stay and folio. Front Desk saw the VIP
  flag without its restricted note. Housekeeping could not read the directory.
- A Front Desk batch approval created the correct Housekeeping and Maintenance
  work once. The portal request kept its catalog inventory link. Housekeeping
  completion recorded one consumption and a shortage rolled back completion.
- A round-trip assignment posted one fare to the linked folio. Stale transitions
  and unauthorized roles were rejected. The guest schedule was recorded.
- A handover saved its assigned department, actor, Manila due time and history.
  Accounting close advanced the operating day and recorded one snapshot on retry.
- The Manager room exception authorized the exact Front Desk check-in room.
  Owner approval led to one Accounting adjustment. Refund settlement recorded
  one payout and completed its approval. A repeated card payment posted once.
- Room Management, Bookings and Billing read the linked records. A folio balance
  blocked checkout and kept the room assignment active. Partial purchase receipts
  retained the remaining quantity and each delivered quantity posted once.

Fixed the portal stock link and cross-reservation batch reuse, the response for
closing the current calendar day, cumulative purchase-order receipts and their
quantity dialog, and the Billing toolbar spacing. Older unlinked requests keep
their audit history and require explicit inventory review.

All 14 workflow checks passed. All 2,419 Vitest tests, the production build, and
typecheck passed. ESLint reported no errors and five existing dashboard warnings.
The hosted ledger was read for numbering. The application changes and the two
QA migrations are ready locally for deployment.
