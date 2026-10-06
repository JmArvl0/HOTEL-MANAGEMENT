# 2026-10-05 - Find a Room Availability Indicator Redesign

## Summary
Redesigned and elevated the room availability indicator (`.room-availability-chip`) in the Guest Account's "Find a Room" module (`/account/find-room`) and shared room cards (`components/booking/room-results.tsx`). Previously, the availability label was an unnoticeable 9px box that sat under the `.room-photo-open` button overlay, and was flattened in `.customer-content` by a generic selector into a low-contrast dark panel that blended into the room photos.

## Changes

1. **Elevated Visual Design & Geometry (`app/guest-booking.css`)**:
   - Upgraded `.available-room-image .room-availability-chip` from a tiny 9px box to a prominent, high-contrast status pill badge:
     - `position: absolute; z-index: 3; left: 16px; top: 16px;` (elevated above `button.room-photo-open` at `z-index: 2` so it is never dimmed or covered).
     - `pointer-events: none;` so clicking the badge or any part of the photo smoothly opens the photo lightbox.
     - `display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px;`
     - Typography: `font-size: 11.5px; font-weight: 750; line-height: 1.2; letter-spacing: 0.02em;`
     - Elevation & surface: `background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(10px); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.1);`

2. **Live Status Indicator Dot (`::before`)**:
   - Added animated live pulsing status dot (`havenChipPulse` 2.4s):
     - **Available** (`:not(.is-off)`): Emerald green `#10b981` dot with glowing halo (`box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35)`).
     - **Low Availability** (`.is-low`, 1–2 units remaining): Amber `#f59e0b` dot and amber borders/text to alert the guest of urgent limited availability.
     - **Unavailable / Sold Out** (`.is-off`): Red `#ef4444` dot with red borders/text (`#dc2626` / `#fca5a5`).
     - **Browse Mode** (`.is-browse`, when no dates selected): Slate `#94a3b8` dot with clean slate typography.
   - Respects `prefers-reduced-motion` (kills animation).

3. **Portal Dark/Light Theme Integration (`.customer-content`)**:
   - Fixed regression where `.customer-content .available-room-image span` had overwritten the badge into a dark panel.
   - Scoped specifically to `.customer-content .available-room-image .room-availability-chip`:
     - Dark theme: `background: rgba(15, 20, 27, 0.92); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.5); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45), 0 0 12px rgba(16, 185, 129, 0.15);`
     - Light theme: `background: rgba(255, 255, 255, 0.96); color: #047857; border-color: rgba(16, 185, 129, 0.5); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);`

4. **Component State Logic (`components/booking/room-results.tsx`)**:
   - Added `isLow` detection (`priced && !soldOut && room.availableUnits <= 2`) and `is-browse` detection.
   - Preserved exact text format (`${room.availableUnits} available`, `Unavailable`, `Check dates`) ensuring zero regression on Vitest text queries.

5. **Root System Standardization Across Other Modules & Accounts**:
   - **Public Booking Search (`app/(booking)/booking/search/search.css`)**:
     - Upgraded `.booking-page .room-availability-chip` from the old 58px circular sticker to the exact same elevated status pill badge (`top: 16px; left: 16px; z-index: 3; pointer-events: none;`) with live pulsing dot (`::before`) and matching emerald/amber/red/slate states.
     - Repositioned `.booking-page .room-photo-count` to `top: 14px; right: 14px;` for symmetrical balance without interfering with the bottom right lightbox trigger.
   - **Manager & Staff Room Catalog (`app/globals.css` & `components/catalog/room-catalog-panel.tsx`)**:
     - Upgraded the media status badge (`.catalog-card-media .badge`) in root `app/globals.css` from an unstyled label to the exact same modern status pill design (`top: 12px; left: 12px; z-index: 3; padding: 6px 13px; border-radius: 999px; font-size: 11.5px; font-weight: 750`).
     - Added live indicator dot (`::before`) with pulsing green dot for `.badge.active` ("Published") and amber dot for `.badge.inactive` ("Unpublished").
     - Dual dark and light theme support under `.app-shell` and `.theme-light`.

## Verification
- `npm run typecheck`: clean (0 errors).
- `npx vitest run components/booking/room-results.test.tsx components/booking/room-photo-lightbox.test.tsx app/fleetops-surfaces.test.ts lib/room-catalog.test.ts`: 80/80 tests passed.
- `npx vitest run components/booking/`: 160/160 tests passed across 16 suites.
- `npm run build`: clean (88/88 routes compiled).
