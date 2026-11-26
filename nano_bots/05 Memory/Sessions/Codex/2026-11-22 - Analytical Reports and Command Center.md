# Analytical Reports and Command Center

## Implemented locally

- Manager and Owner open Hotel Command Center from Overview and both report views from Reports. The Command Center shows live room readiness, arrival and departure queues, department workload, collections and balances, stock, approvals, and occupancy forecast alerts. Failed sources show an unavailable state independently.
- Analytical Report queries a selected closed period and the preceding equal period. Booking and room type cohorts support room type and source filters. Property-wide measures include labeled operational room accrual, cash collections and refunds, service timing, repeat maintenance, and Forecast Evaluation. CSV and print are available from the download menu.
- Closed night audits provide dated property inventory and room accrual. Missing closes suppress historical ratios, and room type occupancy and RevPAR require dated inventory by type. Owner can open immutable Front Desk submissions with Manager review still gated.
- Existing schema and local worktree only. No migration file or production deployment was made for Phase 2.

## Verified

- TypeScript and the local production build passed.
- Targeted ESLint finished with zero errors and 14 existing warnings. The focused forecast and reporting tests passed 95 assertions. Existing manager shell regression suites passed 145 assertions in a separate run.
- Authenticated Edge QA against a disposable local PostgreSQL database passed for Manager, Owner, and Front Desk access restrictions. Verified the Manager arrivals shortcut, Owner snapshot access, CSV, and the range-matched forecast drill-down. A seeded two-night report returned 50% booked occupancy, ₱3,000 ADR, and ₱1,500 RevPAR. Checked dashboard and report widths of 320, 390, 768, and 1440 pixels.
- A second Edge run verified keyboard theme switching and dark mode at 390 and 1024 pixels. Printed the analytical report with expanded daily figures to A4.
- The first full run flagged two source assertions for the replaced Owner views and the new Owner history read. After updating those contracts, the focused run passed all 36 tests and the final full Vitest run passed all 2,689 tests across 271 files.
