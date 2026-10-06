# 2026-10-06 — Global Root Modal Architecture and Backdrop Viewport Fix

## Goal
Standardize modal viewing across the entire application globally so all modals follow strict modal requirements:
1. Full-viewport backdrop dimming spanning 100vw and 100vh that uniformly covers the header (`.customer-content-header`, `.app-header`), sidebar/navbar (`.customer-sidebar`, `.sidebar`), and content area without getting trapped inside inner containers or stacking contexts.
2. Complete page scroll locking (`overflow: hidden` on both `body` and `html`, with reference-counted stacking support and `.haven-modal-open` CSS locks) while modal body content remains scrollable.
3. Accessible focus trapping inside the modal (`Tab` and `Shift+Tab` cycle strictly within focusable elements in the modal; Escape key and backdrop clicks dismiss).
4. All modals, confirmation dialogs, prompt dialogs, form dialogs, select dialogs, and command palettes rendered at document root (`document.body`) via portal by default.

## Root Cause Analysis
- `components/ui/Modal.tsx` historically defaulted to `portal = false`.
- Callers across customer and manager workspaces (`ReservationActions`, `ExtendStayDialog`, `FrontDeskArrivalDialog`, `RoomDetailModal`, `WalkInDialog`, `RoomRosterPanel`, `RoomCatalogPanel`, `GuestRequestForm`, `TransportationRequestForm`, `FormDialog`, `ConfirmDialog`, `PromptDialog`, `SelectDialog`, etc.) mounted inline inside `.customer-content` or `.workspace-body`.
- Because `.customer-content-header` and `.app-header` have `position: sticky; z-index: 20;` with backdrop-filter or separate stacking contexts, and sidebars have `z-index: 30`, fixed-position backdrops rendered inside content containers were trapped in the container's stacking context. Consequently, the backdrop only dimmed the content area, leaving the top navbar/header and sidebars un-dimmed, fully visible, and interactive.
- In addition, scrolling was only locked via single uncounted assignments to `document.body.style.overflow`, causing stacked modals or fast toggles to prematurely unlock scrolling.

## Changes Made
1. **Global Root Portaling by Default**:
   - Updated `components/ui/Modal.tsx`:
     - Changed `portal = true` as the default in `ModalProps` and `Modal`.
     - Changed `portal = true` as the default in `ConfirmDialogProps` and `ConfirmDialog`.
     - Changed `portal = true` as the default in `PromptDialogProps` and `PromptDialog`.
     - Added `portal?: boolean` (defaulting to `true`) and `headerVariant?: "branded" | "plain"` in `SelectDialogProps` and `SelectDialog`.
     - Portaled content into `document.body` wrapped in `<div className={`haven-modal-portal ${detectedShell}`.trim()}>`.
     - Added dynamic shell context detection (`.customer-shell`, `.app-shell`) with `hostRef` inspection so dashboard and guest themes continue cascading.
2. **Scroll Locking System**:
   - Implemented reference-counted scroll locking (`activeModalCount`, `lockBodyScroll`, `unlockBodyScroll`) in `components/ui/Modal.tsx`.
   - Locks both `document.body.style.overflow = "hidden"` and `document.documentElement.style.overflow = "hidden"`, and toggles `haven-modal-open` class on both elements.
   - Preserves scroll lock when stacked dialogs open/close (e.g. ConfirmDialog over Modal).
   - Exported `resetModalScrollLockForTesting()` for clean test teardowns.
   - Updated `components/ui/command-palette.tsx` with `createPortal(..., document.body)` and body/html scroll locking.
3. **Modal & Backdrop Styling (`components/ui/Modal.css`)**:
   - Added `.haven-modal-portal { display: contents; }` to preserve CSS inheritance without layout bounding boxes.
   - Added `html.haven-modal-open, body.haven-modal-open, html:has(.dialog-backdrop), body:has(.dialog-backdrop) { overflow: hidden !important; }`.
   - Styled `.dialog-backdrop`: `position: fixed; inset: 0; width: 100vw; height: 100vh; background: rgba(4, 10, 18, 0.65); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: var(--z-index-modal-backdrop, 1000); touch-action: none; overscroll-behavior: contain;`.
   - Styled `.theme-light .dialog-backdrop`: `background: rgba(15, 23, 42, 0.5);`.
   - Styled `.dialog`: `position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: var(--z-index-modal, 1001); pointer-events: auto; overscroll-behavior: contain;`.
   - Added click dismissal on both backdrop and dialog padding, with `e.stopPropagation()` on `.modal-content`.
4. **FormDialog Propagation (`components/ui/FormDialog.tsx`)**:
   - Added `portal = true` defaults and explicit forwarding to `FormDialog`, `MultiStepFormDialog`, `RoomSelectDialog`, and `ChecklistDialog`.
5. **Testing & Verification**:
   - Created `components/ui/Modal.global.test.tsx` verifying:
     - Document root portaling by default.
     - Dual body & html scroll locking and restoration.
     - Reference-counted scroll locking across stacked modals.
     - Keyboard focus trapping with Tab and Shift+Tab wrap-around.
     - Backdrop and Escape dismiss.
     - Scoped shell class cascading to portal wrapper.
   - Updated `components/account/account-security-dialog.test.tsx` to handle root portaled backdrop queries.

## Verification
- `npm run typecheck`: Passed with 0 errors.
- `vitest` targeted suite (68 tests across 9 files): All passed.
- Full `npm test`: 186 test files passed, 2,068 tests passed, 0 failures.
- `npm run build`: Production Next.js build completed successfully across all 88 routes.
