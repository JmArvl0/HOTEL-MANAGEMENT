# 2026-11-13 - Front Desk Reports Visibility Fix

## Finding

The submitted screenshot showed the committed status cards and history table,
but not the selected prototype's daily figures, activity trend, or report
preview. Those sections appeared only after clicking Generate preview, and the
trend was not implemented.

## Changes

- Front Desk now loads a live preview for the selected hotel day when the page
  opens or the report date changes.
- Added a role-gated, read-only seven-day arrival/departure series, grouped by
  Asia/Manila calendar day from reservation check-in/check-out timestamps.
- Daily headline cards now show arrivals, departures, new reservations and
  collections. Submission status cards sit in the history section.
- Zero-activity periods show an explicit message and each day's actual counts.
- Export print styling keeps the printable snapshot separate from the trend and
  submission history. Submission/review permissions and immutable snapshot
  writes remain unchanged.

## Verification

- `npm run typecheck` passed.
- ESLint on the changed TypeScript files passed with no warnings.
- `git diff --check` passed.
- Localhost Front Desk browser review confirmed the preview and seven zero-count
  days render on entry. The local data has no arrivals/departures for the
  displayed seven-day period.
- No test suite or production build was run. Responsive browser review was not
  performed.
