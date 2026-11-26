# Front Office Workflow

Implemented the shared Front Desk booking dialog and Book again from the guest
dossier. The database binds save retries to the operator and request, checks the
quoted rate, snapshots the stay phone and commits reservation, invoice and audit
in one transaction. Guest profile edits compare the original snapshot and audit
field names. Arrival actions use the server readiness result and the existing
check-in gate. Room details show separate state dimensions and activity links.

Verified the hosted migration ledger read-only before numbering the new migration.
Disposable PostgreSQL replay, backend and occupant checks, and the Front Office
booking scenarios passed. Edge fixture checks passed at 1440, 768 and 390 pixels.
TypeScript, production build, the full 2,704-test suite, and 82 final targeted
tests passed. Touched-file lint reported zero errors.
Hosted writes and application deployment are pending. Implementation details and
acceptance checks are in the [Front Office workflow plan](../../../../docs/plans/2026-11-23-front-office-workflow.md).

The UI follow-up adds direct Rooms, Bookings and Guests navigation, a List and
Calendar switch that keeps the search and queue, phone layouts for both lists,
and direct editing of completed booking steps. The existing quote stays visible
near the review button on phones. Full Vitest passed 2,705 tests.
Edge verified the dashboard with synthetic data at 1440, 768, 390 and 320
pixels, including keyboard section switching, search retention across views,
and navigating back to edit a guest without losing the selected room.
