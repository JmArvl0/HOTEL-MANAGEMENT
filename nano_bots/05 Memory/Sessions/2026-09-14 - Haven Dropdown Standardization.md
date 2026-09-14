# 2026-09-14 - Haven Dropdown Standardization

## Summary

Standardized all dropdown/select controls onto one Haven visual language.
New shared `HavenSelect` primitive (button + listbox) for filters and
room selectors; styled native `<select>` fallback for forms/booking/guest.
No business logic, RBAC, API, or schema change.

## What changed

- NEW `components/ui/haven-select.tsx` — `HavenSelect` (value/onChange,
  options/groups, placeholder, disabled, leading icon; arrows/Home/End/
  Enter/Escape, focus return, outside-click close, selected-row scroll).
  Menu labeled "<field> options" so it never collides with the trigger name.
- NEW `components/ui/haven-select.css` — `--select-*` tokens (dark shell +
  `.theme-light` mirrors), trigger/menu/item/group styles, styled-native
  select rules (custom chevron, focus ring, error, disabled), mobile
  full-width + 60vh menu, reduced-motion off. Imported in `app/layout.tsx`.
- Migrated to `HavenSelect`: reservations Source; approvals Type (grouped)/
  Dept/Severity; transportation Service; Staff & Duty Dept/Duty; admin Users
  (Role/Status/Recovery/Dept), Rooms (Status/Type/Wing), Audit (Action/
  Entity); arrival exception Target type / Physical room / Reason (grouped).
- Forms, booking, guest, date/time, action menus, arrival wheel, room
  radiogroup: intentionally native/unchanged, styled to match.
- Rule (also in DESIGN.md §11): never nest `HavenSelect` inside `<label>` —
  labels forward clicks on non-interactive descendants to the toggle and
  reopen the menu. Use `.haven-filter` / `.arrival-field.haven-field` divs
  with a stable trigger `aria-label`.
- Tests: new `haven-select.test.tsx` (7/7); arrival/admin/approvals tests
  updated to the listbox interaction model.
- Docs: DESIGN.md §11 (new) documents the primitive + usage rules.

## Verification

- typecheck clean; lint 0 errors (69 warnings, pre-existing pattern +1 same-kind).
- Full suite: 1039/1040 — the single failure
  (`lib/ai/brief-indicators.test.ts`, untracked parallel-session file) passes
  solo; order-dependent flake unrelated to this work (nothing under `lib/ai`
  touched).
- Build passes (62/62 routes). Impeccable `detect.mjs` clean.

## Pending

- Manual browser QA pass (filters per role, arrival dialog, light/dark,
  mobile widths, keyboard + screen reader) — needs live role sessions.
- Searchable combobox: deferred until a list proves too long for scroll
  (no current list requires it).

## Files

`components/ui/haven-select.{tsx,css,test.tsx}`, `components/ui/index.ts`,
`app/layout.tsx`, `components/manager/{transportation-panel,
staff-duty-panel,manager-dashboard-client,front-desk-arrival-dialog}.tsx`,
`components/admin/admin-dashboard-client.tsx`,
`components/{admin/{admin-views,users-view},manager/{front-desk-arrival-dialog,
approvals-view}}.test.tsx`, `DESIGN.md`.
