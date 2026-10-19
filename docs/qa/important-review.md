# `!important` review — HUI-005 (report-only, 2026-10-18)

Verified counts and classification from the shipped sheets. No CSS was changed.
Numbers are `!important` occurrences; a "wall" is a rule where ≥3 properties
declare `!important`.

## File summary

| File | Total | Wall blocks | Largest walls |
|---|---|---|---|
| `app/staff-theme.css` | 299 | 36 | notification/bell internals: 8 rules / 119 declarations; chart/recharts: 4 / 16; `.app-shell .app-header .theme-toggle`: 1 / 14 |
| `app/globals.css` | 68 | 5 | notification/bell internals: 4 rules / 59 declarations |
| `components/ui/haven-account-modal.css` | 99 | 12 | scoped modal/row repaints vs base modal CSS: row items 15, account-dialog body 9, `.modal-content` 7/4, `.modal-title` 4 |

## Structural diagnosis (why the walls exist)

1. **Two bell walls fight each other.** `globals.css` walls the
   `.haven-notification-bell` / `.icon-button` internals (59), and
   `staff-theme.css` re-walls the same selectors at `.app-shell` scope (119).
   `staff-theme.css` loads last, so inside staff shells its wall wins and the
   globals wall is effectively overridden there (it remains active for
   customer surfaces that don't run staff-theme). Both walls exist because
   `HavenNotificationBell` ships one markup/CSS surface used by both portals.
   Removing either wall changes whichever portal loses the cascade — NOT
   verifiable without browser QA.
2. **Account-modal walls are load-order defense.** The modal is a
   self-contained palette but `staff-theme.css` claims generic
   `.app-shell .modal-content` / `.modal-title` repaints that load *after*
   the modal sheet, so the modal walls itself to keep its scope. Root cause
   is the generic selectors in `staff-theme.css`, not the modal — fixing the
   root means scoping those staff-theme rules narrower (diffs every staff
   modal; needs visual QA per dashboard).
3. **Chart walls** target Recharts internals (third-party class names with no
   stable specificity contract) — conventional and mostly unavoidable.
4. **Stray single-`!important` resets** (`.btn-danger`, `.badge`,
   `.mobile-close`, `.danger-action`…) are local overrides; cheap to review
   individually but each is a possible fix for a real cascade fight — leave
   unless a visual regression is provable.

## Recommendation

Do **not** mass-remove. Sequence for a future session, gated on browser QA:

1. Extract bell/internals into the component layer
   (`components/ui/haven-notifications.tsx` + one CSS), then delete both walls.
2. Narrow `staff-theme.css` `.app-shell .modal-*` repaint scope so
   `haven-account-modal.css` can drop its walls.
3. Re-audit after both; expected reduction ≈ 190 of 466 occurrences.
