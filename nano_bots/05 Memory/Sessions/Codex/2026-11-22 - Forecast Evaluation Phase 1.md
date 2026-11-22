# Forecast Evaluation Phase 1

**22 November 2026 · Local implementation**

- Manager → Predictive Insights → Forecast Evaluation compares saved actuals, forecasts, and a seven-closed-day baseline. The browser filters by forecast, date range, and inventory item. Records carry issuance time, model version, historical observations, data quality, and exclusions. CSV includes IDs and error inputs.
- The existing generation RPC saves issuance-time baseline values and closed-day evidence in its existing JSON fields. Occupancy uses recorded presence at Manila midnight and the target date's captured active room capacity. Housekeeping hours use completed timed cleaning and guest-request tasks. Inventory uses three full days and stays within an item's unit.
- One-day-ahead occupancy and housekeeping and three-day inventory are the implemented horizons. The first saved run per date and comparison cohort is used. Seven matched rows are required for summary scores. Legacy runs cannot establish this baseline and actual provenance. Production evidence will accumulate prospectively after release.

## Verification

- Node 22.22.2 typecheck and production build passed. Scoped ESLint had zero errors and two existing warnings. Targeted Vitest passed 72/72 across nine files. The first full run had a QR source-scan timeout. The QR suite passed 30/30 in isolation and the full retry passed 2,678/2,678 across 269 files with six thread workers and a 30-second test timeout.
- Replayed all 156 existing migrations in disposable PostgreSQL. No new migration is needed. The local cron route wrote all three evaluation evidence records, served matched comparisons, and returned 429 during its existing cooldown. Signed-out and Front Desk access checks returned 401 and 403 respectively.
- The final production build, 72 targeted tests, and authenticated Edge QA passed after moving the forecast tabs ahead of the outlook cards. Edge verified the Evaluation tab was in view without scrolling, switched all three metrics, filtered target dates, opened the evidence table, and downloaded CSV. At 1440, 768, 390, and 320px the export control measured at least 44px high and the document had no horizontal overflow. The captures use synthetic forecast history in `.tmp/forecast-evaluation-qa/`.

See `SYSTEM.md` §7.13 and [[05 Memory/AI Session Handoff]].
