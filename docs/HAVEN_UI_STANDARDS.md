# HAVEN UI interaction standard

This is the implementation contract for shared customer and internal controls. It standardizes behavior without changing hotel workflow, authority, status semantics, or stored data.

## One interaction system, two presentation contexts

- `customer`: calmer spacing, softer surfaces, 40–44px controls, consumer-facing language.
- `internal`: compact spacing, 36–40px controls, faster operational scanning.
- Behavior, focus treatment, keyboard operation, selected-state semantics, and accessible names remain the same.

## Data toolbar

Use `HavenDataToolbar` with this DOM and visual order: search → quick filters → advanced filters → result count → results. The order does not change on mobile.

- Search uses `HavenSearchInput`, updates automatically after the 350ms default debounce, has no Apply button, and exposes an immediate clear control. Locally loaded data stays local; server-backed search keeps its existing route and receives only the debounced value.
- Quick filters use `HavenFilterBadges`. `All` is first and is the default unless a workflow is intentionally scoped to a queue. Badge selection applies immediately and `All` resets that filter group.
- Advanced filters use `HavenSelect` and apply immediately. Show `Clear filters` only when a non-default filter is active.
- Search covers user-meaningful, authorized fields only. Empty results use `HavenEmptyState`; never leave an unexplained blank table or panel.

## Actions and state

- `HavenButton` variants are `primary`, `secondary`, `neutral`, and `danger`; use `density="customer"` only on customer-facing surfaces. Legacy `.btn-accent` and `.btn-soft` remain compatible during migration.
- `StatusBadge` is informational and non-interactive. Semantic tones are success, informational, warning, error, and neutral. Room-type badges remain governed by `RoomTypeBadge` and are not remapped.
- Use `Modal` for standard dialogs and rich detail modals. It owns the backdrop, Escape handling, focus trap, focus restoration, viewport-safe body scrolling, and optional branded header. Keep photo lightboxes separate.

## Data, feedback, and responsive behavior

- Use `TablePagination` for internal lists. Tables scroll inside `.table-scroll`; the page itself must not acquire horizontal overflow. Customer history should prefer cards when that is easier to scan.
- Use `formatHotelDateTime` for normal customer/staff timestamps in the configured hotel-time presentation. Exact technical timestamps may remain secondary on audit surfaces.
- Use `HavenLoader` or existing skeletons for loading, safe contextual copy for failures, and `HavenEmptyState` for empty/search-empty states.
- Preserve notification meanings: sidebar badge = unresolved workload; header bell = persistent aggregate history/unread; centered transient stack = new-event alert. Never combine the three.
- At narrow widths the order remains search → quick filters → advanced filters → results. Customer touch targets are approximately 44px; internal controls remain compact but keyboard accessible.

## Existing primitives reused

| Concern | Canonical implementation |
|---|---|
| Dropdown | `components/ui/haven-select.tsx` |
| Modal | `components/ui/Modal.tsx` |
| Pagination | `components/ui/table-pagination.tsx` |
| Notifications | `components/ui/toast-stack.tsx` plus role shells |
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
