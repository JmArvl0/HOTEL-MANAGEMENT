# 2026-10-21 - Unified Profile Popover (Staff Headers)

## Outcome

COMPLETE locally; browser QA pending.

Admin, Owner and Manager/staff headers now share one anchored account
dropdown (`ProfilePopover`) modelled on Facebook's account menu. The guest
header intentionally keeps its existing `.customer-account-popover` because
`components/customer/customer-shell-notifications.test.tsx` pins that markup
(My Profile / Account security / Sign Out).

## Changes

- `components/ui/ProfilePopover.tsx` (new): identity header, Settings,
  caller-supplied actions, Sound checkbox, Sign Out. Opens anchored under the
  trigger, closes on outside `mousedown`, Escape (submenu first, then menu),
  and item activation. Escape/outside return focus to the trigger. Arrow
  keys, Home/End, Tab focus trap, `role="menu"` + `menuitemcheckbox`.
- `components/ui/profile-popover.css` (new): 280px panel, 44px rows, token
  fallbacks (`--st-*` → `--cp-*` → hex), 140ms fade/translate/scale, danger
  row via `color-mix`, ≤480px fixed bottom sheet (85vh scroll), reduced
  motion, print hide. Imported once in `app/layout.tsx` before staff theme.
- `components/ui/sound-toggle.tsx`: new `useNotificationSound` hook; the
  existing `SoundToggleMenuItem` / `SoundToggleRow` use it.
- Admin / Owner / Manager clients: inline popover markup, per-header
  outside-click effects and `profileMenu` refs removed; trigger buttons kept;
  Settings now opens the existing settings modal; sound persisted through
  the hook. Owner shows `Owner / Super Admin`.
- `app/staff-theme.css`: deleted legacy `.app-shell .profile-popover` rules
  (240px width, 9px text, absolute positioning, light-theme overrides) that
  were overriding the unified sheet.
- `components/ui/index.ts`: exports `ProfilePopover` + types.
- Tests: `components/ui/profile-popover.test.tsx` (7 behaviour tests) and
  `components/ui/profile-popover-wiring.test.ts` (pins the three staff
  headers to the shared component, forbids legacy inline panel, requires the
  stylesheet import).

## Deliberately skipped

- Guest migration: its popover contract tests and markup stay as-is.
- Positioning library / portal: the panel is absolutely anchored inside the
  existing `.profile-menu-wrap`; the ≤480px sheet is fixed. No dependency
  added (the temporary `cn`/tailwind-merge helper was removed).

## Verification (run this session)

- `npm run typecheck` — clean.
- `npx vitest run` on the 3 profile/guest suites — 31/31.
- `npm test` — **189 files / 2093 tests passing**.
- `npm run build` — clean, 88 routes.
- `npx eslint` on touched TS/TSX — 0 errors (pre-existing warnings only;
  `onClose` exhaustive-deps warning retained because callers pass inline
  arrows).

## Pending

- Manual browser QA: per role (Admin/Owner/Manager/Guest), click/Escape/
  outside click/focus return, dark + light, 390px bottom sheet, Settings
  modal, sound toggle persistence, Sign Out once. See [[KI-015]].
- No commit was made.
