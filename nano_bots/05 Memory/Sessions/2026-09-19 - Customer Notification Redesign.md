# 2026-09-19 - Customer Notification Redesign

User-authorized continuation of a limit-hit session (Impeccable brief). The prior session had
audited the codebase, gotten two answers (**keep day-filter alongside tabs** · **add offset +
Load more**), and written the lib helpers + shared row component before dying mid-edit; the
garbled shell edits from its transcript never landed (tree was clean). This session finished
the build.

## What changed

- `lib/notifications.ts` (additive): `BELL_PREVIEW_LIMIT = 7`, `previewNotifications()`
  (unread-first then read, capped), `?offset` support in `getCustomerNotifications`
  (offset 0 keeps the legacy `.limit()` shape; offset > 0 uses `.range()`), and
  `reservation_cancelled → CalendarX` added to `NOTIFICATION_TYPE_ICONS` (was a live
  typecheck gap).
- `lib/fake-supabase.ts`: added `range(from, to)` (inclusive, PostgREST semantics) so the
  offset path is testable.
- `app/api/account/notifications/route.ts`: additive `?offset=` (default 0, same guards,
  limit 1–200; date filter stays a client-side slice of loaded rows).
- `components/customer/customer-notification-row.tsx`: shared row for dropdown + modal
  (semantic icon via direct map lookup with Bell fallback — lint rule bans render-time
  component calls; relative/clock time variants; accessible unread dot; chevron only when
  `href`).
- `components/customer/customer-shell.tsx`: **click-to-open** bell (`bellPinned` only; hover
  gone), preview groups Unread/Earlier (≤7), skeleton / empty / error+retry states, "Mark all
  read" (reuses `POST /read` for loaded unread ids), row click = mark-one-read (optimistic)
  + route if `href`, View-all footer (teal) closes the popover then opens the modal. Bell
  click kicks the initial history fetch (100 rows); the fetch response is **merged** with
  local optimistic read stamps so a mark-read during the flight can't be clobbered.
  `historyExhausted` tracks load-more state (server short-read = exhausted).
- `components/customer/notification-history-modal.tsx`: title "All notifications" + subtitle;
  **All/Unread/Read tabs** (All first, default, counts from loaded set); Newest/Oldest
  HavenSelect sort; day filter retained, now defaulting to "All days" (per user answer);
  recency grouping (Today/Yesterday/Earlier this week/Earlier, hotel days) for the full view
  with unread/read sections inside day view; "Load more" + "Showing all N / most recent N"
  footer; rows through the shared row component. **Staff consumer stays source-compatible**
  (new props optional; staff rows without `type` fall back to the bell icon).
- CSS: `notification-history.css` rewritten (dropdown skin, `.cnr` row system, `.nh-tabs`,
  skeleton, footer, reduced-motion guard); legacy per-surface row rules removed from
  `guest-booking.css` / `customer-portal.css` (positioning + portal overrides kept).
- Tests: new `lib/notification-display.test.ts` (12); rewrote
  `customer-shell-notifications.test.tsx` (10) and `notification-history-modal.test.tsx`
  (13); added offset-paging case to `lib/notifications.test.ts`.
- Docs: `SYSTEM.md` §7.3 + staff-bell paragraph, [[D-013]] amendment, Current Status entry.

## Verification

typecheck clean · lint 0 errors (148 warnings, baseline) · **1457/1457 tests (126 files,
incl. all 5 staff-notification tests)** · `next build` OK.

## Deliberately untouched

Notification emission/business logic, unread semantics (`read_at`), sidebar actionable
badges, ToastStack behavior, reservation/payment/refund/QR/housekeeping logic, RBAC, the
`/account/notifications` page (direct URLs), migration ledger (no migration needed).

## Pending

- Manual browser QA (guest login): hover = tooltip only; click opens dropdown; unread-first
  preview; mark one/all read; View-all modal (tabs/sort/day filter/Load more); mobile widths
  (≤480px popover, ≤680px modal); staff bell modal regression (tabs render, day filter,
  per-device read ids).
- Optional polish: aria-live on the bell badge for screen-reader count announcements.
