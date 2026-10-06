# Session: Global Notification Button and Icon Format Standardization

**Date:** 2026-10-05
**Agent:** OpenCode (Antigravity)
**Status:** Complete

## Objective
Fix the notification button and icon alignment, placement, and format across all accounts in HAVEN (Customer portal, Manager dashboard, Staff ops, Admin, Owner). Make the notification button and icon format rooted, shared globally, and standardized across the entire system.

## Root Cause Analysis
1. **Missing Root Geometry:** `.haven-notification-bell` in `components/customer/notification-history.css` previously only had `position: relative;`. It lacked any sizing, flexbox/grid layout, line-height reset, or optical alignment.
2. **Conflicting Sizing Across Shells:**
   - In `app/guest-booking.css`: `.customer-content-header .customer-header-link` was hardcoded to `width: 32px; height: 32px;` with `display: grid; place-items: center; border-radius: 8px;`.
   - In `app/manager-dashboard-theme.css`: `.app-shell .icon-button` was hardcoded to `width: 31px; height: 31px;` with `border-radius: 50%;`.
   - Both were out-of-scale with the 38px height of the adjacent global SaaS search button (`.saas-header-search-btn`) and account identity pill, creating an uneven vertical rhythm.
3. **Severe Collision with `.icon-button i`:** In `app/globals.css`, `.icon-button i` was styled as a 7px × 7px accent dot (`position: absolute; right: 3px; top: 2px; width: 7px; height: 7px; border-radius: 50%;`). Because `HeaderNotificationBell` renders with `className="icon-button"`, its badge `<i className="haven-notification-badge nav-badge">` was crushed into a tiny 7px dot overlapping the top-right corner of the bell SVG icon itself, making the icon look crooked/broken.
4. **Subpixel Alignment & Optical Offset:** An 18px SVG inside a 31px or 32px container with 1px borders resulted in fractional padding ((31 - 2 - 18) / 2 = 5.5px), causing subpixel blur and asymmetrical placement. Furthermore, SVG elements without `display: block; margin: auto;` or `line-height: 0` inherit text baseline offsets.

## Changes Made
1. **Global Root Standard (`app/globals.css` & `components/customer/notification-history.css`):**
   - **Button Dimensions & Shape:** Standardized `.haven-notification-bell` to `38px` × `38px` (`min-width: 38px; min-height: 38px; flex: 0 0 38px;`), `border-radius: 10px;` (matches the modern SaaS 10px squircle format of `.saas-header-search-btn` and theme toggle), `display: inline-flex; align-items: center; justify-content: center; line-height: 0; box-sizing: border-box; overflow: visible;`.
   - **Absolute Optical Icon Centering & Micro-Interaction:** Styled `.haven-notification-bell .haven-bell-icon`, `.haven-notification-bell svg.lucide-bell`, and `.haven-notification-bell svg` with `position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: 18px !important; height: 18px !important; margin: 0 !important; padding: 0 !important; pointer-events: none !important; transform-origin: 50% 15% !important; transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.18s ease !important;`. Added a subtle 14-degree bell chime rotation on hover (`transform: translate(-50%, -50%) rotate(14deg) !important;`). Absolute centering completely decouples the bell icon from flex sibling flow or badge presence (0, 3, or 99+), guaranteeing mathematical dead-center alignment at (19px, 19px) inside the 38px box.
   - **Standardized Badge Geometry:** Rooted `.haven-notification-badge`, `.customer-bell-badge`, and `.haven-notification-bell .nav-badge` to `position: absolute !important; top: -4px !important; right: -4px !important; z-index: 4 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 18px !important; height: 18px !important; padding: 0 4px !important; border-radius: 999px !important; background: #ef4444 !important; color: #ffffff !important; font-size: 9.5px !important; font-weight: 800 !important; line-height: 1 !important; letter-spacing: 0.02em !important; font-variant-numeric: tabular-nums !important; border: 2px solid var(--cp-panel, #161d27) !important; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.45) !important;`.
   - **Fixed `.icon-button i` Collision:** Excluded notification badges via `.icon-button i:not(.haven-notification-badge):not(.nav-badge):not(.customer-bell-badge)`.
   - **Light Theme Support:** Unified crisp `#ffffff` background, `#d1d5db` border, `#5b6472` icon ink, `#ef4444` badge with `#ffffff` border cutout.
2. **Harmonized Shell Stylesheets:**
   - `app/guest-booking.css`: Updated `.customer-content-header .customer-header-link` and `.customer-header-theme` to 38px × 38px with 10px radius and inline-flex centering.
   - `app/customer-portal.css`: Synchronized customer header actions and link controls to 38px × 38px with 10px radius.
   - `app/manager-dashboard-theme.css`: Standardized `.app-shell .notification-center .icon-button`, `.haven-notification-bell`, and `.theme-toggle` to 38px × 38px with 10px radius, enforced absolute centering on `.haven-bell-icon` / SVG, and unified badge placement.
   - `app/staff-ops-theme.css`: Aligned `.theme-light .app-shell .notification-center .nav-badge` font-size to the 9.5px root standard.
3. **Component Refinement (`components/ui/haven-notifications.tsx`):**
   - Added `className="haven-bell-icon"` to `<Bell size={18} />`.
   - Stripped JSX whitespace between the SVG and badge element.

## Verification
- **Typecheck:** `npm run typecheck` passed (0 errors).
- **Notification Suites:** `npx vitest run components/manager/notification-bell.test.tsx components/customer/customer-shell-notifications.test.tsx components/ui/haven-notifications-style.test.ts app/fleetops-surfaces.test.ts` (42/42 tests passed).
- **Production Build:** `npm run build` compiled all 88 routes cleanly with 0 errors.
