# 2026-10-06 - Unified Dropdown Styling and Self-Describing Filter Options

## Summary

Standardized and united dropdown/select styling across the entire system (staff accounts, guest account portal, admin, and owner command center) under a cohesive modern SaaS design. Removed external prefix labels (e.g. `Stay:`, `Sort by:`, `Role:`, `Department:`, `Duty status:`, `Work type:`, `Task status:`, `Service:`) in favor of clean, self-describing initial option labels (`All stays`, `All bookings`, `All roles`, `All departments`, `All services`, etc.) so dropdown triggers directly explain their own purpose.

## Key Changes

1. **Unified Dropdown Styling (`components/ui/haven-select.css`)**:
   - Replaced fragmented per-shell / per-role CSS overrides with a unified modern SaaS token system across `:root`, `.app-shell`, and `.customer-shell`.
   - Sleek geometry: `min-height: 40px`, `border-radius: 10px`, `font-size: 13px`, `font-weight: 550`, and clean padding matching `HavenSearchInput` and primary controls.
   - Clean popover listbox (`.haven-select-menu`): `border-radius: 10px`, subtle elevated shadow, 38px item height, smooth highlight transitions, and colored checkmarks on active items.
   - Unified native `<select>` fallback across forms (`.account-form select`, modal forms, booking bars) so all selects visually match `HavenSelect`.
   - Hidden external prefix labels at the CSS layer (`.haven-filter > span { display: none !important; }`).

2. **Self-Describing Filter Options & External Label Removal**:
   - **Customer Portal Payments & Folios (`components/customer/payments-folio-panel.tsx`)**:
     - Updated stay options default to `All stays (${count})` (was `All Stay Statuses`).
     - Updated payment options default to `All payments (${count})` (was `All Payment Statuses`).
   - **Customer Reservation History (`components/customer/reservation-history-toolbar.tsx`)**:
     - Removed `<span>Sort by</span>` prefix label.
     - Updated default option to `All bookings` (was `Recommended`).
   - **Staff Manager Dashboard (`components/manager/manager-dashboard-client.tsx`)**:
     - Removed `<span>Loyalty tier</span>` (`All loyalty tiers` is self-describing).
     - Removed `<span>Source</span>` (`All sources` is self-describing).
     - Removed `<span>Type</span>`, `<span>Department</span>`, `<span>Severity</span>` in Approvals.
   - **Staff Duty & Operations (`components/manager/staff-duty-panel.tsx`)**:
     - Removed `<span>Department</span>` and `<span>Duty status</span>` labels.
     - Updated duty options to `All duty statuses` (was `All duty states`).
   - **Housekeeping Queue (`components/manager/housekeeping-queue-panel.tsx`)**:
     - Removed `<span>Work type</span>` and `<span>Task status</span>` labels.
     - Updated task status option to `All task statuses` (was `All statuses`).
   - **Transportation Panel (`components/manager/transportation-panel.tsx`)**:
     - Removed `<span>Service</span>` label (`All services` is self-describing).
   - **Owner Command Center (`components/owner/owner-primitives.tsx`, `app/manager-dashboard-theme.css`, `app/staff-ops-theme.css`)**:
     - Removed `<span>{filter.label}</span>` from `OwnerToolbar`.
     - Replaced owner filter grid with inline-flex alignment.
   - **Admin Governance (`components/admin/admin-dashboard-client.tsx`)**:
     - Removed `<span>Role</span>`, `<span>Status</span>`, `<span>Recovery</span>`, `<span>Department</span>` in Accounts.
     - Removed `<span>Status</span>`, `<span>Type</span>`, `<span>Wing</span>` in Rooms.
     - Removed `<span>Status</span>` in Password Reset Attempts.
     - Removed `<span>Action</span>`, `<span>Entity</span>` in Audit Logs.

## Verification

- `npx vitest run`:
  - `components/ui/haven-select.test.tsx` (7/7 passed)
  - `components/customer/payments-folio-panel.test.tsx` (4/4 passed)
  - `components/admin/users-view.test.tsx` (7/7 passed)
  - `components/admin/admin-views.test.tsx` (20/20 passed)
  - `components/manager/approvals-view.test.tsx` (12/12 passed)
  - `components/manager/staff-duty-panel.test.tsx` (10/10 passed)
  - `components/owner/owner-primitives.test.tsx` (20/20 passed)
  - `components/customer/reservation-actions.test.tsx` (10/10 passed)
  - Total: 90/90 tests green.
- `npm run typecheck`: clean (0 errors).
- `npx eslint`: clean (0 errors on all touched files).
