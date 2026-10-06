# 2026-10-06 — Account Dropdown Popover and Profile Modal View

## Context & Objectives
- **Problem:** An earlier session changed the header account button trigger into a full-screen modal view (`HavenAccountModal`). The user clarified that the account pop-up itself must open as a native dropdown anchored directly beneath the header trigger button (`Carl Garcia` / `CG`). The full modal viewing with dimmed backdrop was only intended for when the "My Profile" item (`<a class="haven-account-row-item" href="/account/profile">...</a>`) is pressed.
- **Requirements:**
  1. Restore the account trigger button in the header so it opens a luxury dropdown popover directly beneath the button.
  2. The dropdown popover remains undimmed and anchored.
  3. When "My Profile" inside the dropdown is pressed, close the dropdown and open the dedicated `CustomerProfileModal` with full dimmed backdrop, luxury typography, and UI/UX Pro Max aesthetics.
  4. Restore Staff/Manager, Admin, and Owner account menus to native dropdown popovers.

## Changes Made
1. **Dropdown Anchoring in Customer Shell ([`components/customer/customer-shell.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/customer/customer-shell.tsx))**:
   - Removed `.customer-popover-gap` from around `.customer-account-popover` to anchor the dropdown tightly beneath the header account button.
   - Preserved exact luxury item structure requested:
     - Header info (`{user.name}`, `{user.email}`)
     - `<a class="haven-account-row-item" href="/account/profile">` for "My Profile" (intercepts click to open profile modal)
     - `<button class="haven-account-row-item">` for "Account security"
     - `<button class="haven-account-row-item haven-account-row-danger">` for "Sign Out"
2. **Dedicated Profile Modal Component ([`components/account/customer-profile-modal.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/account/customer-profile-modal.tsx))**:
   - Wraps Haven `<Modal size="md" headerVariant="branded" portal={true}>`.
   - `portal={true}` guarantees rendering at `document.body` so the dimmed backdrop (`dialog-backdrop`) spans the entire viewport and cannot be clipped by sticky headers or CSS filters.
   - Monogram avatar, verified guest chip, legal name, email notice.
   - Live editable fields: Full name, Mobile number, Nationality, Home/Billing address.
   - Live submission to `PATCH /api/account/profile`.
   - Direct button in footer to switch to "Account Security".
3. **Dedicated Styles ([`components/account/customer-profile-modal.css`](file:///c:/Projects/HOTEL-MANAGEMENT/components/account/customer-profile-modal.css))**:
   - Impeccable taste & luxury TailAdmin tokens, 20px modal radius, dark/light theme harmony, responsive grid, focus rings.
4. **Restored Staff, Admin, and Owner Dropdowns**:
   - [`components/manager/manager-dashboard-client.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/manager/manager-dashboard-client.tsx)
   - [`components/admin/admin-dashboard-client.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/admin/admin-dashboard-client.tsx)
   - [`components/owner/owner-dashboard-client.tsx`](file:///c:/Projects/HOTEL-MANAGEMENT/components/owner/owner-dashboard-client.tsx)
   - Restored inline `.profile-popover` inside `.profile-menu-wrap` with outside-click handlers and Settings modal trigger.

## Verification
- `npm run typecheck`: 0 errors.
- `vitest`: 184 test files, 2,048 tests passed (100% green).
- `npm run build`: all 88 routes compiled successfully.
