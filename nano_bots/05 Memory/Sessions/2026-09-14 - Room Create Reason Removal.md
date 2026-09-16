# 2026-09-14 - Room Create Reason Removal

## Summary

Add Physical Room no longer asks for "Reason for change". Creation is
audited automatically; edits/retire/reactivate still require a reason.
No business-logic, RBAC, API-shape, or availability change beyond the
create-reason requirement itself.

## Changes

- Migration `20261002010000_room_create_reason_optional` (pushed +
  live-verified, ledger 67/67): `admin_create_room` drops the reason
  blank-check (number/type/floor guards identical); audit row still always
  written, `after_data.reason` present only when supplied — no fabricated
  placeholder. `admin_update_room_metadata` untouched.
- `POST /api/catalog/rooms`: zod `reason` optional, passes null when
  absent. PATCH routes untouched.
- `room-roster-panel.tsx`: reason gate + payload key + field all edit-only;
  edit helper text explains the audit requirement.
- `lib/physical-rooms.test.ts`: updated + new create/edit assertions (18/18).
- SYSTEM.md physical-room governance paragraph updated.

## Verification

- Live probe in rolled-back transaction, 7/7: create-without-reason ok +
  audit row without reason key; supplied reason preserved; duplicate still
  `ROOM_NUMBER_TAKEN`; update-without-reason still refused; zero residue.
- typecheck clean, lint 0 errors, full suite 1067/1067, build 62/62 routes.
- Note: a parallel session is actively editing the tree (notification bell
  work); one transient typecheck failure from their mid-edit file resolved
  itself. Gates re-ran green after.

## Pending

- Manual browser QA: add room (no reason field) → edit (reason required) →
  retire/reactivate (reason + audit intact). Needs role sessions.
