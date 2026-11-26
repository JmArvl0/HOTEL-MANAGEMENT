# Front Desk Hold Conflict Feedback

FD-API-004 reuses the database's hold-specific rejection across pre-assignment,
guided check-in and room changes. Guided check-in returns to the room step
and clears the stale choice. Room changes keep **Refresh eligible rooms**
available during an empty refresh.

Edge showed both alerts in the open dialogs and completed both retries after
database expiry. The rejected requests preserved assignment state. The
pre-assignment replay also passed. Verification used disposable data and
zero payment traffic. Typecheck, the local production build, and all 2,756
Vitest tests passed.

[Local evidence and staging acceptance](../../../../docs/audits/front-desk/FRONT-DESK-SHARED-INVENTORY-TEST-REPORT.md#fd-api-004-local-fix--2026-11-26)
