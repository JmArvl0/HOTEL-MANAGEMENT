# Transportation Redesign Plan

## Goal

Give Front Desk a daily dispatch view that answers what leaves next, where the guest is going, and what staff can do about the selected trip.

## Review gate

The standalone prototype is the design reference for review. Implementation starts after the prototype is approved.

## Proposed layout

- **Dispatch queue.** Open on Today in Manila time. Show the next relevant leg's time, guest and booking reference, route, current status, and next action. Keep search and service type beside one set of counted filters for Today, Needs planning, Upcoming, History, and All. Preserve pagination for long lists.
- **Selected trip.** Put booking and passenger details, pickup and return legs, guest instructions, driver, vehicle, and fare in one panel. Keep the current stage visible and the next permitted action at the bottom. Use separate disclosures for internal notes and the note visible to the guest.
- **Desktop and phone.** Match the full-height panes used by Guest Management and Guest Requests. Let the queue and itinerary scroll independently. On phones, open the itinerary as a separate view. Back to queue restores the filter, search, page, and focus.
- **Today includes returns.** A nonterminal trip appears if its pickup or valid round-trip return falls on the Manila date. A trip with both legs today counts once. The queue identifies the displayed leg and the itinerary shows both. Lifecycle actions still apply to the trip.
- **Upcoming and planning.** Upcoming uses the next leg after Today for nonterminal trips. Needs planning covers requested, reviewed, and scheduled trips before driver assignment. History groups completed, cancelled, and rejected trips. The filters may overlap where the same trip is relevant to more than one view.

## Implementation sequence

### 1. Establish the queue rules

- **Modify** `components/manager/transportation-panel.tsx` and `components/manager/transportation-panel.test.tsx`.
- Write failing cases for a return due today after a prior-day pickup, both legs today, a terminal trip due today, a missing return time, and search combined with service type.
- Build one row per trip. Use the existing pickup and return fields and the Manila day key. Derive the active filter counts and rows from the same search and service-type scope. Sort Today by the displayed leg time and Upcoming by the next leg's date and time. Retain all trip records in All, including active records with earlier dates.
- Reuse `HavenSearchInput`, `HavenFilterBadges`, `HavenSelect`, `StatusBadge`, and `TablePagination`. Keep the list selection stable by trip ID when polling returns new objects. Clear an unavailable selection and show the first matching row or an empty state.

### 2. Build the itinerary and responsive layout

- **Modify** `components/manager/transportation-panel.tsx`. **Create** `components/manager/transportation-workspace.css`.
- Reuse the live response shape, including stored locations, pickup and return times, notes, and recorded lifecycle timestamps. Show incomplete legacy fields as unavailable. Preserve the distinction between a proposed fare in the assignment dialog and a stored fare on the trip.
- Match the staff light and dark themes. Use one layout for the shared panel used by `components/manager/manager-dashboard-client.tsx` and `components/owner/owner-dashboard-client.tsx`. Retain shell navigation and Manila clock. Keep loading, empty results, retry, and stale data feedback visible.
- Verify independent scrolling at wide desktop widths, and test phone navigation with an active filter and a search term. Confirm keyboard focus returns to the selected row or search field if the row has left the queue.

### 3. Connect existing actions and verify permissions

- **Reuse** `components/ui/action-dialogs.tsx`, `lib/transportation-display.ts`, and the permission predicates in `lib/permissions.ts`.
- Front Desk retains review, schedule, assign, start, complete, and authorized cancel or reject. Manager can cancel or reject only when allowed by the current status. Owner has read-only access. Production uses the signed-in role.
- Preserve `GET /api/transportation` and `POST /api/transportation/[id]/transition` with the current `expectedVersion` and action-specific details. Use the existing server validation for stay windows, required reasons, and permitted transitions. When a version conflict occurs, reload the trip and show the conflict without replaying the action.
- Calculate the assignment preview from the active vehicle catalogue as `base_fare + booking_fee` for one-way service and twice that amount for round trips. Confirm the fare before assigning. The transition remains responsible for the folio charge. A later cancellation shows the recorded fare and directs any correction to Accounting.
- In `components/manager/transportation-panel.test.tsx`, cover action visibility by role and stage, the existing assignment payload, reason validation, and retention of the selected trip after a refresh. Update the presentation assertions in `lib/transportation.test.ts` if they refer to the retired KPI layout. Keep its route, fare, and role assertions.

### 4. Verify and document

- Run `npm test -- components/manager/transportation-panel.test.tsx lib/transportation.test.ts` and confirm the role, queue, and fare regressions pass.
- Run `npm run typecheck`, ESLint on changed TS and TSX files, the full test suite, and the production build. Record any existing failures separately from the redesign.
- Check the staff page in both themes at 320, 390, 768, 1,024, 1,440, and 1,920 px. Walk through one-way assignment, a return due today, terminal history, and the Manager and Owner views. Use isolated fixtures for write checks.
- Update `DESIGN.md` and the Transportation section of `SYSTEM.md` after verifying the implemented behavior. The scope is the staff Transportation workspace. Customer booking, guest self-service, vehicle catalogue, and Accounting use their existing surfaces and contracts.
