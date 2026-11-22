# Seasonal Occupancy

**22 November 2026 · Local implementation**

- Manager → Predictive Insights → Seasonal Outlook has a month and specific-date view. The reference year defaults to the prior year. Matching uses the same calendar month and day, including explicit handling for February 29.
- The route reads closed-night occupancy evidence from the existing daily analytics snapshots. Open dates show current bookings and, when available, estimate rooms by applying the reference occupancy to current active capacity. The estimate has a floor at current bookings. Closed dates show actuals. The full monthly figure requires complete target coverage, while daily figures remain visible during cold start and partial coverage.
- Node 22.22.2 typecheck and production build passed. Full Vitest passed 2,685 tests in 270 files. The final focused suite passed 79 tests. Scoped ESLint had zero errors and two existing warnings. Impeccable reported no findings on the new panel.
- Authenticated Edge and disposable PostgreSQL confirmed the cold-start state, January 21 exact-date match, partial and complete months, closed-date comparison, and no overflow at 1440, 768, 390, and 320px. Signed-out and Front Desk access returned 401 and 403. Captures in `.tmp/seasonal-occupancy-qa/` use synthetic history. No migration or deployment was performed.
