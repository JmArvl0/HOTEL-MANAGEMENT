# Front Desk regression and workstation comparison

The browser exercise used installed Microsoft Edge and the production-mode
local Next.js build. PostgreSQL 18.6 and PostgREST 16.5 ran on loopback. The
fixture cloned the checked local ledger, then applied the extension migration to
the disposable clone. Real role sign-ins used synthetic accounts. SMS, email,
gateway and Fleet credentials were absent. Browser requests outside loopback
were blocked.

<!-- verified-evidence:start -->
## Verified results

| Layer | Outcome |
| --- | --- |
| Build and typecheck | Next.js 16.4.6 production build with Webpack and standalone TypeScript passed under Node 22.22.2. |
| Lint | Touched-source lint passed with zero errors and five existing warnings. |
| Automated tests | 2,753 Vitest tests passed across 276 files. The targeted checks cover queue actions, contrast-related layout states, extension recovery and safe payment feedback. |
| Browser and authenticated HTTP | 113 passed, zero failed in the combined shift, module, boundary and workstation run. The run captured 153 HTTP requests and zero JavaScript page errors on the primary desktop page. |
| PostgreSQL | The final extension migration and two-session regression passed. A committed key returns the original balance after later changes. Cross-stay, cross-actor, wrong-payload, legacy-key and unprivileged direct use were rejected. |
| External integration | Fleet used a local seeded review. Real dispatch, gateway payment and Finance settlement were outside the test fixture. |

The [machine-readable results](evidence/post-audit/front-desk-post-audit-results.json)
record each browser, HTTP and rendering check, role outcomes and the 48
workstation samples.

## Desktop fit

Values count complete visible List rows, Calendar room controls or automatic
room cards at the initial scroll position. Each cell is light / dark before →
light / dark after. The desktop matrix recorded zero page-level horizontal
overflow. The calendar retains its own scroll area.

| Desktop resolution | Booking List | Calendar | Room Management |
| --- | ---: | ---: | ---: |
| 1280 × 720 | 0 / 0 → 2 / 2 | 0 / 0 → 2 / 2 | 0 / 0 → 3 / 3 |
| 1366 × 768 | 0 / 0 → 3 / 3 | 0 / 0 → 2 / 2 | 0 / 0 → 3 / 3 |
| 1440 × 900 | 1 / 1 → 5 / 5 | 1 / 1 → 4 / 4 | 0 / 0 → 3 / 3 |
| 1600 × 900 | 1 / 1 → 5 / 5 | 1 / 1 → 4 / 4 | 0 / 0 → 4 / 4 |
| 1920 × 1080 | 3 / 3 → 7 / 7 | 3 / 3 → 6 / 6 | 5 / 0 → 5 / 5 |
| 2560 × 1440 | 6 / 6 → 10 / 10 | 7 / 7 → 10 / 10 | 5 / 4 → 10 / 10 |

The Workspace group improved from 1.83:1 to 17.75:1 in light
mode and from 1.67:1 to 15.79:1 in dark mode. All four
desk group labels met the 4.5:1 normal-text contrast target in each theme.
Keyboard focus remained visible. Command search accepted Ctrl+K, the booking
modal wrapped Tab focus, and Escape returned to the booking workspace.
[WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## Local workload measurement

The expanded fixture contained 150 rooms and 1,284
reservations. Search found all 1,240 matching
synthetic reservations while returning 10 rows per page. The room-rack
response preserved all 150 rooms. Percentiles use the nearest-rank samples.

| Measurement | Samples | p50 ms | p95 ms |
| --- | ---: | ---: | ---: |
| PostgreSQL booking history with result returned to the local client | 20 | 19.6 | 26.7 |
| Authenticated HTTP history search and page | 15 | 56.8 | 73.9 |
| Authenticated HTTP room-rack snapshot | 12 | 49.3 | 57.6 |
| Edge click to first populated arrivals row | 7 | 347.6 | 371.0 |
| Edge List-to-Calendar switch and first room control | 7 | 188.1 | 201.8 |

These are loopback observations from a single fixture, including browser
automation overhead for the UI timings. The standard shift separately tested
competing room assignments and repeated synthetic collections. A representative
hosted load and target still require property acceptance.

The [concurrent write follow-up](FRONT-DESK-CONCURRENCY-TEST-REPORT.md)
records simultaneous booking, assignment and folio outcomes on the local
fixture and the remaining staging and property decisions.
<!-- verified-evidence:end -->

## Workflow comparison

| Workflow | Baseline | Candidate |
| --- | --- | --- |
| Open a daily queue from the headline | Headline was static. The corresponding action was lower on the dashboard. | One click or Enter from the headline. Search receives focus and the departure list includes a stay ending that day. |
| Find a booking and review the record | Search and details worked, with operational content below the fold on shorter screens. | Search, one record-open action and Escape retain the query. The first rows are visible before scrolling. |
| Create a walk-in | Six action clicks and three contact fields. | Six action clicks and three contact fields. The same path produced a confirmed booking for arrival. |
| Recover a stay extension | Replayed POST returned HTTP 409 after the original transaction committed. | The test forwarded a real POST and withheld its HTTP response from the browser. One retry from the open form recovered the committed result. The folio still had one extension charge. |
| Reconcile an electronic reference | The duplicate was blocked with a generic response. | The same duplicate is blocked with a message to check the current folio or ask Accounting. The entered reference and remaining balance persist. |
| Receive three new desk alerts | Three alerts occupied a 560 px wide center stack. | The bell count increases and opens the list. New booking, Calendar and Today remain actionable in either theme. |
| Review and execute an exception | The audit verified the Manager reviewed a reservation amendment. | The candidate also exercised Manager approval and Front Desk execution of a stay extension. A second execution was rejected and the folio contained one charge. |

Elapsed workflow measurements include browser automation and capture overhead.
The comparison reports exact clicks, visible content and saved outcomes where
available.

## Before and after screenshots

| Screen | Before | After |
| --- | --- | --- |
| 1280 × 720 Booking List · dark | [Before](evidence/1280x720-dark-bookings.png) | [After](evidence/post-audit/1280x720-dark-bookings.png) |
| 1280 × 720 Calendar · light | [Before](evidence/1280x720-light-calendar.png) | [After](evidence/post-audit/1280x720-light-calendar.png) |
| 1280 × 720 Room Management · light | [Before](evidence/1280x720-light-rooms.png) | [After](evidence/post-audit/1280x720-light-rooms.png) |
| 1280 × 720 Dashboard · light | [Before](evidence/1280x720-light-dashboard.png) | [After](evidence/post-audit/1280x720-light-dashboard.png) |
| 1280 × 720 Alert burst · dark | [Before](evidence/1280x720-notifications-calendar.png) | [After](evidence/post-audit/1280x720-dark-notifications-calendar.png) |

## Coverage limits

The local shift tests role-scoped HTTP and database state across reservations,
Accounting, Housekeeping, Maintenance, Manager, Guest and a seeded ride review.
The separate [SQL regression](../../../scripts/front-desk-extension-replay-db-test.mjs)
runs against the repository's fixed loopback fixture. It opens two PostgreSQL
connections for concurrent key use and checks direct database grants.

Additional supported browser engines, hosted concurrency, device-assisted
identity checks, Finance handoff and Fleet dispatch require staging or
external verification. Checkout policy and device procedures need property
acceptance. Mobile coverage is a smoke check of the responsive public site,
booking search and signed-in guest account.
