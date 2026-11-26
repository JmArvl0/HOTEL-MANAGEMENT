# Front Desk Same-Room Extension Holds

FD-API-007 is verified locally. Migration `20261126040000` extends the
same-room preview with a guest-hold flag for the added nights. A stale submit
returns `ROOM_HELD_FOR_GUEST`. Front Desk can refresh the quote and keep the
requested checkout and reason.

Edge verified the active hold, expiry and a lost-confirmation retry using
synthetic bookings. One ₱200 extension charge and one receipt remained on
the folio. PostgreSQL verified the hold overlap boundaries and preview
permissions. Typecheck, scoped ESLint, the local build and all 2,760 Vitest
tests passed. The tests ran on disposable loopback databases with zero payment
or refund requests. Hosted connection-pool verification remains pending.

[Audit report and screenshots](../../../../docs/audits/front-desk/FRONT-DESK-SHARED-INVENTORY-TEST-REPORT.md#fd-api-007--same-room-extension-hold-feedback)
