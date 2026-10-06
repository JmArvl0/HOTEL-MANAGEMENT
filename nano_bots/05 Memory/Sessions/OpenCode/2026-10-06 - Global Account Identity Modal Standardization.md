# Global Account Identity Modal Standardization (2026-10-06)

## 1. Problem & Scope

The account menu across user portals (Customer, Manager/Staff, Admin, Owner) previously rendered as a small inline popover anchored within the header (`.customer-account-popover` / `.profile-popover`).
This presented several usability and accessibility issues:
1. **No background dimming**: Popover floated over dense dashboard content without focus or emphasis, making it feel ephemeral and ungrounded.
2. **Clipping & Containment**: Fixed/absolute positioning inside `<header>` elements with `backdrop-filter: blur(...)` creates a new containing block in CSS, clipping dialogs and preventing full-viewport overlays.
3. **Inconsistent implementations**: Customer had its own inline popover, Staff/Manager had another, Admin and Owner each had inline popovers with manual `useEffect` pointerdown/keydown outside listeners.
4. **User Request**: Standardize the identity popover into a true modal dialog with full background dimming (`dialog-backdrop`), centered placement, luxury aesthetics, and globally rooted implementation across all account types.

## 2. Solution Architecture

### A. Canonical Component (`components/ui/haven-account-modal.tsx`)
- Standardized modal component wrapping Haven `<Modal size="sm" headerVariant="branded">`.
- Full dialog accessibility: `role="dialog"`, `aria-modal="true"`, focus trapping, Escape key dismiss, backdrop click dismiss, and return-focus management.
- Standardized hero identity card:
  - Avatar initials mark with subtle blue/gold luxury ring.
  - User full name (`<strong>`).
  - User email address (`<small>`).
  - Role pill badge (e.g., "Guest Customer", "Front desk", "System Administrator", "Owner / Super Admin").
- Action items group:
  - `My Profile` link (`profileHref`) with icon and chevron.
  - `Account security` button (`onOpenSecurity`) with icon and chevron.
  - `Settings` button (`onOpenSettings`) with icon and chevron.
  - `Notification sound` toggle (`showSoundToggle`) with active switch role (`role="switch"`) and sound state icon.
  - `Sign Out` button (`onSignOut`) with danger styling and sign-out icon.
- Backward compatibility: Contains `.customer-account-popover` and `.profile-popover` container classes and passes testing queries across all test suites.

### B. Dedicated Stylesheet (`components/ui/haven-account-modal.css`)
- Loaded globally in `app/layout.tsx`.
- Deep dimmed backdrop (`rgba(4, 10, 18, 0.65)` in dark mode, `rgba(15, 23, 42, 0.48)` in light mode) with `backdrop-filter: blur(4px)`.
- Reset rules for `.customer-account-popover` and `.profile-popover` inside `.haven-account-dialog` to disable absolute positioning and prevent layout distortion.
- TailAdmin / Finwise elevation shadow, 16px corner radii, micro-hover elevation transitions, and luxury typography.

### C. Universal Rooting Across All 4 Account Surfaces
1. **Customer Shell (`components/customer/customer-shell.tsx`)**:
   - Replaced inline header popover with `<HavenAccountModal>`. Mounted inside `AccountSecurityProvider` at the shell root (outside `<header>`) so the dimmed backdrop spans the entire viewport.
2. **Manager & Staff Dashboard (`components/manager/manager-dashboard-client.tsx`)**:
   - Replaced inline `.profile-popover` with `<HavenAccountModal>`.
   - Wired `profileBtn` focus restoration and scoped outside listener to notification popovers only.
3. **Admin Dashboard (`components/admin/admin-dashboard-client.tsx`)**:
   - Replaced inline `.profile-popover` with `<HavenAccountModal>`.
   - Removed manual outside pointerdown/keydown listeners, letting `Modal` manage focus trap and dismissal.
4. **Owner Dashboard (`components/owner/owner-dashboard-client.tsx`)**:
   - Replaced inline `.profile-popover` with `<HavenAccountModal>`.
   - Wired `roleLabel="Owner / Super Admin"` and sound toggle.

## 3. Verification & Test Evidence

- **Unit Tests Added**: `components/ui/haven-account-modal.test.tsx` (5 tests verifying dialog role, backdrop dimming, hero info, navigation links, security button, settings button, sound switch toggle, sign out action, and Escape key dismissal).
- **Existing Tests**:
  - `components/customer/customer-shell-notifications.test.tsx`: 14/14 tests passed.
  - `components/manager`, `components/admin`, `components/owner`: 28 test files, 263 tests passed.
  - Full test suite (`npm test`): 183 test files passed, 2,041 tests passed (100% green).
- **TypeScript**: `npm run typecheck` passed with 0 errors.
- **Production Build**: `npm run build` completed successfully, all 88 routes compiled cleanly with Turbopack.
