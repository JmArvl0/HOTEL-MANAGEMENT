# 2026-09-15 - Notification History Modal

User-authorized build: "View all notifications" opens a filterable history modal instead of
navigating, on the guest bell and (D-011 amendment, user-approved) the staff operations bell.

## What changed

- Shared `components/customer/notification-history-modal.tsx` + `notification-history.css`
  (branded `Modal` xl at min(880px, 100vw-48px) / 85vh, sticky HavenSelect day filter +
  native date input, unread-first then read newest-first, counts, spec empty states,
  View preserving existing href/section targets, "Mark this day as read").
- Hotel-day helpers in `lib/notifications.ts` (`hotelDayKey`, `hotelTodayKey`,
  `resolveNotificationDay`, `filterNotificationsByHotelDay`, `splitUnreadRead`;
  `CustomerNotification` now exposes `readAt`/`type`). No migration.
- Guest: `GET/POST /api/account/notifications[/read]` (session-scoped, date filter,
  day-scoped mark-read); `CustomerShell` bell keeps its dropdown, View-all is now a button
  opening the modal, one aggregate unread badge, focus returns to the bell.
  `/account/notifications` page kept intact.
- Staff: modal reuses `dashboard.notifications`; read ids in per-user `localStorage`
  (see [[D-013]]); bell counts unread only; sidebar badges and toast diff untouched.
- Tests: `lib/notification-history.test.ts` (13), `notification-history-modal.test.tsx` (9),
  `customer-shell-notifications.test.tsx` (3), `staff-notification-history.test.tsx` (5).
- Docs: `SYSTEM.md` §7.3/§7.9, [[D-013]].

## Verification

typecheck clean · lint 0 errors (71 pre-existing warnings) · **1137/1137 tests (103 files)** ·
`next build` 64/64 routes (incl. 2 new API routes).

## Pending

Manual browser QA per the task spec (bell → dropdown → View-all → modal on desktop/mobile,
light/dark, Yesterday/specific-date, bell/sidebar independence, transient toast).
Working tree still uncommitted — coordinate with parallel sessions before committing.

## Related

[[D-011]] · [[D-013]] · `SYSTEM.md` §7.3, §7.9
