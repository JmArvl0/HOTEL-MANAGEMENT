# 2026-09-24 — Admin Governance Module Presentation

Brought the admin dashboard's weaker modules up to the presentation standard set by the
Overview, System Health, and staff module-card work — interactive, aligned, consistent.
**Visualization only** — no API, RBAC, or DB change; every module renders the same payloads
`/api/admin/data` already returns; all filtering is client-side over loaded rows.

## What shipped (all in `components/admin/admin-dashboard-client.tsx` + theme CSS)

- **Users & Staff** — added the shared `ModuleSummaryCards` strip (Accounts on record /
  Active / Suspended / Recovery required / Staff accounts). The status and recovery cards are
  clickable onto the module's *existing* selects via encoded queue values (`status:active`,
  `recovery:required`), counts derived from the same predicates (card == select == rows).
- **Room Configuration** — new `RoomsView` replaces the bare generic table: 4 cards
  (Rooms on record / Administratively inactive — clickable onto the new status filter — /
  Room types / Floors), type + wing + status selects, search, badges for administrative,
  operational, and housekeeping state (read-only display), footer count, clear-filters
  empty state.
- **Audit Logs & Security** — new shared `AuditView`: 4 cards (Events on record / Last 24
  hours / Action types / Latest event), action + entity selects, search, `en-PH` formatted
  timestamps, action badges, record ids in code styling, footer, empty state.
- **Roles & Permissions** — the plain `<p>` lists became role cards: icon chip, role name,
  one-line summary (`ROLE_META`), capability chips.
- **Hotel Policies** — the raw snake_case KV dump became grouped sections (Locale & daily
  schedule / Booking eligibility / Cancellation & refunds / Self-service & operations) with
  human labels and formatted values (`HH:MM` times, Yes/No booleans, basis points as a
  percent), a version/updated stamp, and an "Additional settings" fallback group so future
  schema columns are never hidden. The edit form is untouched.
- **Admin Reports** — the duplicate roleCounts metric cards became a real report: six
  informational cards from the overview metrics, an accounts-by-role table with share
  percentages, and a configuration summary panel.
- **CSS** — new `admin-*` block in `manager-dashboard-theme.css` (role cards, policy tiles,
  report layout, `audit-record`) with `.theme-light` mirrors and responsive breakpoints;
  new badge colors for `inactive`, `cleaning`, `inspection`, `reclean_required` in both
  themes. (`.admin-policy-grid` in `globals.css` was *not* removed — the Owner
  dashboard's policy view still uses it; only the admin view moved off it.)
- Overview and System Health were deliberately left alone (both recent, already strong).

## Tests

- New `components/admin/admin-views.test.tsx` (6 tests): RoomsView cards/filter/search/
  badges/clear, AuditView cards/filters/security framing, PolicyView grouping + formatting
  + unknown-key fallback.
- `users-view.test.tsx` extended: summary-card counts match the filter predicates and
  clicking Suspended drives the status filter (`aria-pressed`).
- Admin suite 18/18. Audit fixtures use clock-relative timestamps (the earlier fixed dates
  were in the machine's future, which broke the 24h card).

## Verification

- Full-suite / lint / typecheck / build runs recorded in Current Status for this entry.
- Manual UI check on `/manager_dashboard` (admin login, light + dark, mobile widths) left
  for the user — jsdom tests cover card→filter wiring and count parity.

## Next action

Commit alongside the other pending work in the large uncommitted tree.
