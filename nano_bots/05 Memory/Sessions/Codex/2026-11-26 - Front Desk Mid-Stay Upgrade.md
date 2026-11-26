# Front Desk Mid-Stay Upgrade

Migration `20261126030000` validates the approved upgrade and authorized
assignment for a guest who is already checked in. Arrival exceptions still
use the exact approved room. The Front Desk approval dialog records guest
acceptance and exposes execution when consent is saved.

Edge confirmed acceptance persisted on reopening. A live exact hold rejected
the move and preserved the original assignment. After expiry the approved
move succeeded and posted one ₱560 charge in the synthetic fixture.
Retry returned `APPROVAL_NOT_EXECUTABLE` and kept one charge. The separate
arrival regression passed. Typecheck, the local production build, and all
2,757 Vitest tests passed. The fixtures used synthetic data on loopback.

[Audit evidence and staging acceptance](../../../../docs/audits/front-desk/FRONT-DESK-SHARED-INVENTORY-TEST-REPORT.md#fd-api-006-and-fd-ux-005-local-fix--2026-11-26)
