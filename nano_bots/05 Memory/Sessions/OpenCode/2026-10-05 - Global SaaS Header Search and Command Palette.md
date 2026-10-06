# Global SaaS Header Search and Command Palette Standardization

**Date:** 2026-10-05  
**Context:** Standardization of the SaaS header search bar (`.saas-header-search-btn`) across all accounts in HAVEN (Customer, Staff/Manager, Admin, Owner) with high-efficiency world-class SaaS craftsmanship.

## Goals & Objectives
1. Modernize `.saas-header-search-btn` to be substantially more noticeable, prominent, and wider (250px–280px desktop width), mirroring modern high-performance SaaS command bars (e.g. Linear, Raycast, GitHub).
2. Establish this styling as standard across the system via root/shared CSS (`components/ui/command-palette.css` globally loaded in `app/layout.tsx`).
3. Ensure every account surface in the hotel management system renders the search button in its header (`.header-actions` / `.customer-header-actions`) and wires it up to the interactive `CommandPalette` (`Cmd+K` / `Ctrl+K`):
   - **Customer/Guest:** `components/customer/customer-shell.tsx`
   - **Staff / Manager / Operations:** `components/manager/manager-dashboard-client.tsx`
   - **System Administrator:** `components/admin/admin-dashboard-client.tsx`
   - **Owner / Super Admin:** `components/owner/owner-dashboard-client.tsx`
4. Maintain full compliance with all architectural guardrails (no "Demo data" in Admin/Owner, no "Supabase live", zero legacy coastal teal colors, strict FleetOps neutrals `#111827` and `#d1d5db`).

## Implementation Details

### 1. Modern SaaS Search Button (`components/ui/command-palette.css`)
- **Dimensions & Presence:**
  - Expanded width from narrow compact button to `width: 250px; max-width: 280px; min-width: 200px; height: 38px;`.
  - Added subtle `padding: 0 10px 0 13px;` and refined `border-radius: 9px;`.
  - Internal layout: `display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;`.
- **Typography & Label:**
  - `span`: `flex: 1; text-align: left; font-size: 13px; font-weight: 500; letter-spacing: -0.01em;`.
- **Shortcut Badge (`.saas-kbd`):**
  - Right-pinned shortcut indicator: `height: 20px; min-width: 26px; padding: 0 5px; border-radius: 5px; font-size: 10px; font-weight: 700;`.
- **Theming & Color Contrasts:**
  - **Dark Theme:**
    - Background: `rgba(22, 29, 39, 0.75)` with subtle backdrop blur.
    - Border: `1px solid #2a3442`.
    - Text: `#94a3b8` (Search...) and `#64748b` (icon).
    - Shortcut badge: `background: #1e293b; border: 1px solid #334155; color: #cbd5e1;`.
    - Hover: `border-color: #3b82f6; background: #172130; color: #f1f5f9; box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35), 0 2px 8px rgba(0, 0, 0, 0.3);`.
  - **Light Theme (`.theme-light`):**
    - Background: `linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)`.
    - Border: `1px solid #d1d5db`.
    - Text: `#64748b` (Search...) and `#94a3b8` (icon).
    - Shortcut badge: `background: #f3f4f6; border: 1px solid #e5e7eb; color: #475569;`.
    - Hover: `border-color: #111827; background: #ffffff; color: #0f172a; box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.12), 0 3px 8px rgba(17, 24, 39, 0.08);`.
- **Responsiveness:**
  - Breakpoint `@media (max-width: 1024px)`: Width adapts to `200px`.
  - Breakpoint `@media (max-width: 768px)`: Automatically collapses to a neat square 38px icon button with `span` and `kbd` hidden, ensuring headers never wrap or overflow on mobile viewports.

### 2. Global Accessibility & Root Integration (`app/layout.tsx`, `app/customer-portal.css`)
- Added `import "@/components/ui/command-palette.css";` to root `app/layout.tsx` so all current and future layouts inherit this styling standard.
- Updated `app/customer-portal.css` to align `.customer-shell .saas-header-search-btn` with the standard dimensions, radius, and hover states.

### 3. Account-Wide Wiring
- **Admin Dashboard (`components/admin/admin-dashboard-client.tsx`):**
  - Integrated `cmdOpen` state and `Cmd+K` / `Ctrl+K` keyboard event listener.
  - Built `adminCommandItems` mapping all administrative sections (Overview, Users, Roles, Rooms, Policies, Security, System Health, etc.) and direct quick actions (Create Staff, Settings, Sign Out).
  - Placed `.saas-header-search-btn` into `.header-actions`.
  - Rendered `<CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} items={adminCommandItems} />`.
- **Owner Dashboard (`components/owner/owner-dashboard-client.tsx`):**
  - Integrated `cmdOpen` state and `Cmd+K` / `Ctrl+K` keyboard event listener.
  - Built `ownerCommandItems` mapping all executive sections (Executive Overview, Operations, Financial, Departments, Admins, Roles, Policy, Payments, Exceptions, etc.) and key actions (Create Admin, Review Exceptions, Settings, Sign Out).
  - Placed `.saas-header-search-btn` into `.header-actions`.
  - Rendered `<CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} items={ownerCommandItems} />`.

### 4. Dialog Modal Enhancements (`.saas-cmd-dialog`, `.saas-cmd-search-wrap`, `.saas-cmd-footer`)
- **Expanded Dimensions:** Increased modal max-width from `580px` to `680px` (`max-width: 680px; border-radius: 18px;`) with deep multi-layer elevation box-shadows.
- **Breathable Search Wrap:**
  - Expanded padding from `14px 18px` to `18px 24px` (+44% vertical breathing room).
  - Increased search icon size from `18px` to `20px` with active focus illumination.
  - Increased input font-size from `15px` to `16px` with `1.5` line height.
  - Enlarged ESC badge to `padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 7px;`.
- **Luxurious Footer:**
  - Expanded padding from `10px 18px` to `14px 24px` (+40% vertical padding).
  - Increased key shortcut spacing to `gap: 18px; font-size: 12px;`.
  - Padded shortcut `<kbd>` badges to `2.5px 7px; font-size: 10.5px; font-weight: 700;`.
- **List & Item Ergonomics:**
  - Increased list max-height from `380px` to `420px; padding: 12px 16px;`.
  - Added tactile 34px icon box (`.saas-cmd-item-icon`) with distinct border and background for that Linear/Raycast command center feel.
  - Full dark and light theme parity with FleetOps neutral tokens.
- **Mobile Adaptations:** Responsive breakpoint rules at `<=768px` ensuring comfortable full-width modal behavior without clipping.

## Verification & Status
- `npm run typecheck`: clean (0 errors).
- `npx vitest run`:
  - `components/header-status.test.ts` (3/3 passing)
  - `components/owner/owner-dashboard-layout.test.ts` (8/8 passing)
  - `app/fleetops-surfaces.test.ts` (13/13 passing)
  - `components/ui/command-palette.test.tsx` (4/4 passing)
  - `lib/qr/tokens.test.ts` (27/27 passing)
- `npm run build`: clean (all 88 static and dynamic routes compiled).
