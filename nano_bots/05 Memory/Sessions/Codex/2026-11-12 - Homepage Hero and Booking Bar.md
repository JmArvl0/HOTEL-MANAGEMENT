# Homepage hero and booking bar — 2026-11-12

- Applied the homepage redesign in `HOTEL-MANAGEMENT`. The published hero image and copy feed the overlay header, compact stay planner and ivory wave. The header changes from transparent to frosted glass to ivory as visitors scroll.
- The booking form reuses the range calendar and submits the selected dates and guests to `/booking/search`. The same values flow into room links. Booking policy is accessible below the planner.
- Verified typecheck, targeted ESLint, all 2,447 tests, and Chromium at 1440, 1081, 768, 390 and 320 px. Browser checks covered the header states, menu, date validation and editing, and booking search HTTP 200.
- Windows permissions blocked production build output creation. The app was verified through the local development server. No deployment was made.
