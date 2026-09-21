# HAVEN UI interaction standard

This is the implementation contract for shared customer and internal controls. It standardizes behavior without changing hotel workflow, authority, status semantics, or stored data.

## One interaction system, two presentation contexts

- `customer`: calmer spacing, softer surfaces, 40–44px controls, consumer-facing language.
- `internal`: compact spacing, 36–40px controls, faster operational scanning.
- Behavior, focus treatment, keyboard operation, selected-state semantics, and accessible names remain the same.

The pattern is shared; the palette and control density are not. Customer surfaces keep their own tokens (`--cp-*`) and Midnight Ink is not imposed on them. The public booking flow is a customer workflow, not an operations dashboard — it is reviewed against this standard for order and surface discipline, and is not converted into a filter toolbar. The landing page is out of scope and stays visually unchanged.

## Data toolbar

Use `HavenDataToolbar` with this DOM and visual order: search → quick filters → advanced filters → result count → results. The order does not change on mobile.

- Search uses `HavenSearchInput`, updates automatically after the 350ms default debounce, has no Apply button, and exposes an immediate clear control. Locally loaded data stays local; server-backed search keeps its existing route and receives only the debounced value.
- Quick filters use `HavenFilterBadges`, or a module's bespoke chip row that already matches the approved pill. Both families are the same chip visually: pill radius, subtle inactive border, unmistakable active fill, visible focus ring, no heavy shadow. `All` is first and is the default unless a workflow is intentionally scoped to a queue. Selection applies immediately and `All` resets that filter group.
- Use each module's real filters. Do not copy another module's filters in, and do not invent filters a module has no data for.
- Advanced filters use `HavenSelect` and apply immediately. Show `Clear filters` only when a non-default filter is active, placed beside the filters it resets.
- Search covers user-meaningful, authorized fields only. Empty results use `HavenEmptyState`; never leave an unexplained blank table or panel.
- Counts shown on filters are real counts from the module's own data. Never fabricate or placeholder a count.

### The toolbar wrapper is transparent

The search/filter region draws **no surface of its own** — no background, border, radius, shadow, or padding. It is a layout row, and it stays that way at every width and in both themes.

Individual controls inside it keep their own surfaces: the search input keeps its fill, border, radius, icon and clear control; chips keep theirs; `HavenSelect` keeps its own. The point is one surface per control, never a second box wrapped around the first.

The search input MUST carry one visible boundary at all times: a solid surface
distinct from the page floor plus `1px solid` border (staff light: white on
Cool Paper with the slate ops border; dark/customer: the matching theme
surface and line tokens), 12px ops radius, teal hover/focus accent, readable
placeholder. Removing the toolbar card must never remove the input's own
border — these are separate rules.

The container around the **results** (`.data-panel`, tables, room cards, KPI cards, `.table-scroll`) is a different element and keeps its container untouched.

Because this is a cascade property rather than a component property, it is guarded mechanically: `components/ui/haven-data-controls.test.tsx` walks every stylesheet under `app/` and `components/` and fails if any rule selecting a toolbar wrapper (`.haven-data-toolbar`, `.reservation-filters`, `.owner-toolbar`, `.tp-toolbar`, `.hk-toolbar`, `.sd-toolbar`, `.approval-toolbar`, `.table-tools`) declares a non-inert `background`, `border`, `box-shadow`, or `padding`. Fix the offending source rule; do not append a broader override.

## Actions and state

- `HavenButton` variants are `primary`, `secondary`, `neutral`, and `danger`; use `density="customer"` only on customer-facing surfaces. Legacy `.btn-accent` and `.btn-soft` remain compatible during migration.
- `StatusBadge` is informational and non-interactive. Semantic tones are success, informational, warning, error, and neutral. Room-type badges remain governed by `RoomTypeBadge` and are not remapped.
- Use `Modal` for standard dialogs and rich detail modals. It owns the backdrop, Escape handling, focus trap, focus restoration, viewport-safe body scrolling, and optional branded header. Keep photo lightboxes separate.

## Data, feedback, and responsive behavior

- Use `TablePagination` for internal lists. Tables scroll inside `.table-scroll`; the page itself must not acquire horizontal overflow. Customer history should prefer cards when that is easier to scan.
- Use `formatHotelDateTime` for normal customer/staff timestamps in the configured hotel-time presentation. Exact technical timestamps may remain secondary on audit surfaces.
- Use `HavenLoader` or existing skeletons for loading, safe contextual copy for failures, and `HavenEmptyState` for empty/search-empty states.
- Preserve notification meanings: sidebar badge = unresolved actionable workload; header bell = persistent/current notification history with one aggregate unread count; centered transient stack = new-event alert. Never combine the three.
- At narrow widths the order remains search → quick filters → advanced filters → results. Customer touch targets are approximately 44px; internal controls remain compact but keyboard accessible.

## Existing primitives reused

| Concern | Canonical implementation |
|---|---|
| Dropdown | `components/ui/haven-select.tsx` |
| Modal | `components/ui/Modal.tsx` |
| Pagination | `components/ui/table-pagination.tsx` |
| Notification bell, popover, item, modal | `components/ui/haven-notifications.tsx` |
| Transient notifications | `components/ui/toast-stack.tsx` |
| Loading | `components/ui/haven-loader.tsx` |
| Room-type color | `components/ui/RoomTypeBadge.tsx` |

## Foundation additions and reference consumers

- `components/ui/haven-data-controls.tsx`: search, quick filters, composed toolbar, empty state.
- `components/ui/haven-button.tsx`: semantic button hierarchy.
- `components/ui/StatusBadge.tsx`: shared non-action semantic status language.
- `lib/format.ts`: hotel-time date/time formatter.
- Customer reference: My Reservations uses the shared search-first toolbar, All-first quick filters, HavenSelect sort control, and shared empty/status states.
- Internal references: Owner modules use the shared toolbar/select/empty state; Manager Reservations uses the shared search-first toolbar, All-first queue filters, and empty state.

## Audit and migration notes

The audit found several historical local search rows, status spans, empty blocks, and styled/native selects. Existing shared modal, pagination, toast, loader, and dropdown implementations were retained. Migration is intentionally incremental: adopt the canonical primitives when a module is touched, preserve its authorized fields and query architecture, and never rewrite business logic merely to standardize presentation.

Raw native selects remain appropriate for form entry where platform behavior is valuable (notably date/time and validated form fields). Broad global element selectors are prohibited; new styling is scoped to component classes and role-shell tokens.

## Notification experience

All persistent/current notification surfaces use the shared `HavenNotificationBell`,
`HavenNotificationPopover`, `HavenNotificationItem`, and `HavenNotificationModal`.
Customer rows use the spacious density; internal roles use the compact density. Presentation is
shared while content, destinations, and authorization remain role-specific.

- The bell opens on click, never on hover. Its single badge is hidden at zero, exact from 1–99,
  and displays `99+` at 100 or more. Opening it does not mark records read.
- The popover is viewport-safe at roughly 380–430px, previews at most seven records, groups unread
  first and earlier/read second, and uses normal wrapping with a two-line summary clamp.
- “View all notifications” opens the shared modal; it never navigates to a notification page.
  The modal is 680–800px on desktop, internally scrolls, and provides immediate All (first and
  default), Unread, Read, date, and newest/oldest controls.
- Clicking a record marks only that record read and opens only its authorized destination.
  “Mark all as read” updates the same source used by the bell and modal. It never changes sidebar
  workload badges.
- Customer notification rows and unread state are durable in `public.notifications`, scoped by
  `user_id`, and served by `/api/account/notifications`. Operational staff alerts are the
  role-filtered `dashboard.notifications` source already returned by
  `/api/manager_dashboard`; their read/dismissed state remains per-device because no staff
  notification table exists.
- Owner and System Administrator currently have no persistent notification feed. Their shared
  `ToastStack` remains the correct transient feedback surface; do not synthesize a bell history
  from audit, health, or governance records.
