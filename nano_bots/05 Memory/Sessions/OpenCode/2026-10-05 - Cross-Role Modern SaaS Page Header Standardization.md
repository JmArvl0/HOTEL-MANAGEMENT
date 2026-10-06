# Cross-Role Modern SaaS Page Header Standardization (2026-10-05)

## Objective
Standardize the page title bar across every role and module in the system (Staff, Manager, Front Desk, Housekeeping, Maintenance, Accounting, Admin, Owner, and Guest) to the thin, high-efficiency modern SaaS toolbar format established in the guest/customer account (`section.customer-page-title`).

## Problem
While `section.customer-page-title` in `app/customer-portal.css` was modernized into a compact, thin toolbar (12px padding, clamp(17px, 1.8vw, 21px) title, amber pill eyebrow, 34px buttons, zero decorative circle overlays), legacy styles across other modules still imposed:
1. `min-height: 112px` and `min-height: 108px` in `manager-dashboard-theme.css` and `staff-ops-theme.css`.
2. Oversized decorative circles (`::after` 250px x 180px with legacy color rings).
3. Oversized 30px headings (`#fcd34d` yellow in dark mode, bulky typography).
4. Inconsistent button heights (38px pill buttons vs 34px compact SaaS buttons).
5. Unstandardized title container padding (22px-24px padding vs 12px 20px).
6. Cascade overrides in `app/guest-booking.css` imposing 52px serif font display.

## Changes Made

### 1. `app/staff-ops-theme.css`
- **Section 5 & Dark Base Rules**: Standardized `.app-shell .page-title h1`, `p`, `.eyebrow`, and `.page-header` to the modern SaaS toolbar tokens.
- **Section 16 (Light Mode)**: Overhauled `.theme-light .app-shell .workspace-body .page-title`, `.page-title`, and `.page-header` with clean finwise white gradient (`linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)`), `#d1d5db` border, `#111827` title, `#5b6472` subtitle, amber pill eyebrow, and 34px buttons.
- **Section 18 (Dark Mode Mirrors)**: Standardized `.app-shell .workspace-body .page-title`, `.page-title`, `.page-header`, `.admin-overview-title`, and `.admin-workspace` with dark SaaS toolbar (`linear-gradient(135deg, #161d27 0%, #111827 100%)`), `#2a3442` border, `#ffffff` title, `#93a0b4` subtitle, amber pill eyebrow, and 34px buttons.
- **Section 23 (Responsive)**: Standardized mobile `@media (max-width: 720px)` padding to `12px 14px; margin-bottom: 14px;`.
- **Preserved Invariant**: Maintained `.page-title:has(.new-reservation-menu)` `overflow: visible; z-index: 100` so popover menus are never clipped.

### 2. `app/manager-dashboard-theme.css`
- Updated base `.app-shell .page-title` (line 8) and light mode `.theme-light .app-shell .page-title` (line 19) to match the standard SaaS toolbar scale.
- Overhauled `.app-shell .predictive-insights .insights-title` (lines 945–955 and 1066–1068) into the compact 12px 20px SaaS bar, removing legacy 250px circle and 30px title.
- Overhauled `.app-shell .haven-ai-hero` (lines 1157–1167 and 1253) into the compact SaaS bar, removing legacy coastal rgba circle.
- Overhauled `.app-shell .admin-overview-title` (lines 1724–1737) into the compact SaaS bar.
- Overhauled `.app-shell .admin-workspace > .page-title` (lines 1759–1768) into the compact SaaS bar, removing vertical accent bar.
- Overhauled `.app-shell .workspace-body .page-title` (lines 1885–1915) into the compact SaaS bar, replacing 112px height, 22px padding, and 250px circle with standard 12px 20px layout.

### 3. `app/customer-portal.css`
- Aliased `.customer-page-title` alongside `.customer-shell .customer-page-title` (and `.theme-light .customer-page-title`) so standalone `section.customer-page-title` elements across any customer module automatically render the standardized styling.

### 4. `app/guest-booking.css`
- Replaced legacy rule on line 26 (`clamp(34px, 4vw, 52px)` font display, 28px bottom margin) with the standard compact toolbar metrics.

## Verification
- `npm run typecheck`: Passed with 0 errors.
- `npm run build`: Compiled all 88 routes cleanly with Next.js Turbopack.
- `npx vitest run`: Passed on core suites:
  - `app/fleetops-surfaces.test.ts` (13/13 passing)
  - `lib/front-desk-operations.test.ts` (26/26 passing)
  - `components/ui/page-header.test.tsx` (2/2 passing)
  - `components/customer/payments-folio-panel.test.tsx` (4/4 passing)
  - `components/admin/system-health-view.test.tsx` (43/43 passing)
  - `components/customer/customer-shell-notifications.test.tsx` (14/14 passing)
  - `components/account/account-security-dialog.test.tsx` (6/6 passing)
  - `lib/client-fetch-resilience.test.ts` (3/3 passing)
