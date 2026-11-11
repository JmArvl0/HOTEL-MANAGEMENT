# Housekeeping load fix

11 November 2026, Asia/Singapore. The configured database rejected the task
read because `housekeeping_tasks.service_outcome` was absent. Its core task
fields were readable. The optional `reservation_service_conditions` table
was also absent.

The shared staff read retries with the core task fields only for the exact
missing service columns. A missing service-condition relation disables those
controls. Other database errors continue to surface. Upgraded databases keep
their active DND data and service instructions.

The corrected application read loaded six tasks from the configured database
using read-only queries. All 2,424 tests, the production build, typecheck,
and touched-file ESLint passed.

The local Chrome run loaded the queue, started and completed a turnover task,
and passed inspection. PostgreSQL recorded the task transitions and released
the room as available and clean. The page also loaded at 390 px.
