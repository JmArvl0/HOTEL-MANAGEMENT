# 2026-09-15 - Centered Notification Banner

Transient toasts moved from the bottom-right corner to a centered viewport directly under the
top header, centered in the main content column (never over the sidebar or header controls).

## What changed

- `components/ui/toast-stack.tsx` — new `error` tone (soft red, 8 s, `role="alert"`);
  routine tones stay `role="status"` inside the polite live region. Queue, dedupe, durations,
  pause-on-hover/focus untouched.
- `app/manager-dashboard-theme.css` — `.toast-stack` is now fixed at header height + 14 px,
  centered via `--haven-toast-offset` (232 px / 72 px collapsed / 0 px mobile drawer, so
  collapse/expand recenters with no JS math), z-index 900 (below modal 1000/1001),
  12 px radius, `havenToastIn` slide-down+fade (reduced-motion kills it), responsive down to
  `calc(100vw - 24px)`.
- Staff/Admin/Owner shells render `<ToastStack/>` inside `main.workspace` below the header.
  Admin/Owner `notify()` now pushes to the shared stack; their ad-hoc `.toast` removed.
- Bell, sidebar workload badges, 30 s poll, silent-seed anti-replay, role gating untouched.
  No new event pipeline, no schema change, no customer/public UI change.

## Verification

typecheck clean · lint 0 errors (71 pre-existing warnings) · 1110/1110 tests (99 files,
15 in toast-stack incl. 5 new: error timing, alert/status roles, 3 viewport contracts) ·
build 62/62 routes · Impeccable detector clean.

## Pending

Manual browser QA per role (Front Desk, Housekeeping, Maintenance, Accounting, Manager,
Admin/Owner): banner centered under header, auto/manual dismiss, View navigation, bell
retention, badge independence, modal-above-toast, collapsed-sidebar + mobile centering.
