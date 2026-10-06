# 2026-10-04 - Guest Portal Table Grammar

## Intent
Enhance the full guest account portal (13 modules) with impeccable + ui-ux-pro-max + design-taste-frontend, including a table-section redesign. User locked: keep current brand, full pass, keep light/dark toggle.

## What changed (3 files)
- `app/customer-portal.css` — new §14 shared table grammar, tokens-only (`var(--cp-*)`, `color-mix`; zero hex literals so `fleetops-surfaces.test.ts` stays green). Covers the native rewards-ledger table, folio/payment/refund rows, request + transportation rows, folio figure strip, title balance, 44px touch floors, reduced-motion guard.
- `app/(booking)/(customer)/account/transportation/page.tsx` — bespoke `customer-transportation-intro` → shared `customer-page-title` + eyebrow (1-line edit, no test pins it).
- `app/guest-booking.css` — deleted the 3 now-dead intro rules.

## Design reads applied
- impeccable Operate mode: refinement, not redesign; scanability over expression.
- ui-ux-pro-max priorities: focus-visible rows, 44px floors, tabular numerals, no horizontal scroll, CLS-safe (no layout change).
- taste dials for Operate surface: VARIANCE 3 / MOTION 2 / DENSITY 5. No landing patterns.

## Verification
- `npm run typecheck` clean; eslint touched TSX clean.
- Targeted 111/111 green (fleetops surfaces + theme, customer, staff-sidebar-groups, booking-back, haven-data-controls).
- Full suite 2033/2034 — the 1 failure (`account-security-dialog` sound persistence) reproduces on the clean tree (pre-existing jsdom localStorage env issue).
- `npm run build` clean, all routes compiled. No migration, no db push.

## Pending
- Manual browser QA both themes at 1440px + 390px (KI-005).
