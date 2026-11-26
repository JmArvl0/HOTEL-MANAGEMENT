# Predictive Analytics improvements

Implemented the read-only audit findings across the local Predictive Analytics workspace. The acceptance criteria are in [the implementation plan](../../../../docs/plans/2026-11-23-predictive-analytics-improvements.md).

- Occupancy learns signed pickup from same-lead booking snapshots and verified occupied nights. The workspace exposes current serviceable capacity and the selected night’s booked and expected counts.
- Pricing compares proposed amounts with active nightly selling rates. It uses recent confirmation and cancellation evidence, protects Manager review with a recommendation fingerprint, and retains the Owner/Admin approval workflow.
- Housekeeping preserves open work through checkout and estimates hours by task type. Inventory preserves missing movement days as gaps and keeps actual low stock visible. Maintenance excludes cancelled orders and identifies a registered asset when the evidence matches it uniquely.
- Forecast Accuracy compares 1-, 3-, and 7-day occupancy and labor estimates and three-day inventory use. Recoverable missing actuals are saved with later runs. Seasonal Outlook supports exact calendar dates and comparable weekdays. Night-audit booked occupancy remains a separate reference.
- The desktop workspace has a compact view selector, tables for exact chart values, and a paginated rate table directly below its chart. The Refresh Predictions request meets the app’s JSON request requirement.

## Verification

- The full Vitest suite passed with 2,702 tests. Analytics, dashboard, and AI tools also passed the targeted run. TypeScript, targeted ESLint, and an isolated Next.js production build using Webpack passed.
- Edge and a disposable PostgreSQL/PostgREST fixture exercised the five main views at 1024, 1366, 1920, and 2560px with the sidebar open and collapsed. A focused run verified dark mode, saved comparison filters, the January 21 example with weekday matching, an active-rate override, stale proposal rejection, and snapshot persistence for 1-, 3-, and 7-day occupancy evaluation.
- After the successful build and browser checks, separate Walk-in Booking edits introduced a missing formatter export and a dialog prop mismatch. The latest repo-wide build exits during TypeScript checking on those files. The current focused analytics suite passes all 104 tests.

Scope was the local app. Production scheduling and hotel data coverage will determine results available for defense. Current inventory records support recorded use. Days without recorded use stay unknown unless the source verifies zero.

## Inventory precision follow-up

Inventory v4 retains two decimals for three-day consumption, shortages, and reorder quantities. The regression uses 0.12 L daily and 0.20 L on hand, which gives 0.36 L expected consumption and a 0.16 L shortage. The focused analytics and UI suite passed all 105 tests. ESLint passed for the two inventory files.

The latest workspace build reaches TypeScript and stops on an `onWalkIn` prop mismatch in the concurrent Front Desk work. The full suite reported 2,693 passing tests and 11 failures across Front Desk, guest profile, and staff stylesheet checks.
