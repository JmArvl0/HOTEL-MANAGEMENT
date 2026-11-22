# Haven Capstone Defense Implementation Plan

**Planning baseline** · 22 November 2026 · Local commit `e2514b8`

**First implementation milestone** · Forecast Evaluation for occupancy, housekeeping labor hours, and inventory consumption.

The defense release should let the panel trace three title claims through the system: historical data produces a measurable forecast, QR opens the correct guarded hotel workflow, and Gemini explains authorized hotel data. The implementation also gives management a property-wide operating view, offers period-based analytical reports, and closes the minimum-age enforcement gap through a coordinated release.

## Panel feedback and delivery priorities

The photograph records manuscript feedback and a module checklist. The mark beside Room Management appears to be a check. The title markings around Gemini, QR-based operations, and Predictive Analytics need adviser confirmation before anyone changes the wording. The implementation priorities come from the user's written brief. Each panel item below has a corresponding acceptance check.

| # | Panel note | Planned response and defense evidence |
| --- | --- | --- |
| 1 | Revise the document and follow the BCP capstone format | Obtain the current official template and adviser-approved title. Reformat the full manuscript, then reconcile its objectives, scope, methodology, diagrams, results, and screenshots with the release. |
| 2 | Room Management | Show room availability and status, an authorized room action, and the effect of housekeeping inspection or an active maintenance block on readiness. |
| 3 | Reservation | Walk through booking, sandbox payment confirmation, the Front Desk arrival queue, and check-in/out. Demonstrate a valid amendment or cancellation if the panel asks for an exception. |
| 4 | Guest Management | Show the primary guest, named occupants, and role-restricted ID and age verification. Verify a legacy reservation and an underage or unverified primary guest. |
| 5 | QR Guest Services | Scan a room placard as a guest with an active stay and submit a service request. Also scan a reservation Express Pass as Front Desk and show that ordinary arrival checks still apply. |
| 6 | Housekeeping | Demonstrate checkout → turnover task → inspection when policy requires it → ready room. Show backlog and the measurable workload forecast. |
| 7 | Billing | Trace a posted charge, settled payment, balance, and an eligible receipt or folio document. Tie report totals to authoritative financial records. |
| 8 | Gemini AI Assistant | Show a read-only operational explanation with its underlying figures and a working fallback when the provider is unavailable. |
| 9 | Predictive Analytics and historical data | Show historical coverage, a held-out forecast compared with actuals and a baseline, date and horizon, error measures, and data quality. |
| 10 | Dashboard and current state of the whole system | Show an authorized Manager or Owner opening Hotel Command Center and using a metric to reach its source queue. |
| 11 | Operational and Analytical Reports | Demonstrate the submitted daily snapshot and a separate date-range Analytical Report with occupancy, ADR, RevPAR, and forecast performance. |
| 12 | User Management | Demonstrate authorized account and role lifecycle, an audit entry, and refusal of a restricted action through both UI and API. |

Keep the defense scope on existing hotel workflows. OTA and channel management, corporate or group booking, and expansion of SCM, Workforce, restaurant, or F&B stay deferred. Review any already-committed changes in those areas only for release compatibility and demo impact.

## Delivery order

| Phase | Work | Exit evidence |
| --- | --- | --- |
| 0 | Pin a clean baseline, inventory deployment differences, and request the BCP template through the team. | Baseline SHA, migration ledger, dataset coverage inventory, and list of adviser decisions. |
| 1 | Repair Forecast Evaluation and begin collecting prospective evidence. | One reproducible evaluation dataset and screen for all three numeric targets, with baseline and coverage. |
| 2 | Deliver Analytical Reports and Hotel Command Center in the existing role shells. | Correct source totals, role-aware navigation, and desktop/mobile acceptance. |
| 3 | Finish guest-age enforcement and polish the panel's end-to-end workflows. | Age policy works across ordinary and QR arrival, with billing, housekeeping, permissions, and Gemini fallback demonstrated. |
| 4 | Add CI, freeze a release candidate, and run the full release QA. | Green checks on the candidate SHA, verified staging rehearsal, and recorded scenario outcomes. |
| 5 | Verify the deployed defense build and complete the manuscript and demo pack. | Matching GitHub and Vercel commit, verified Supabase ledger and policy state, fresh test report, and adviser-approved format/title. |

Run an early CI check branch after baseline setup so feature changes can use the gate. Start the manuscript template review and forecast data collection early. Final screenshots and reported accuracy come from the frozen candidate and its verified evaluation data.

## Phase 0 · Baseline and historical data

- Use a clean checkout of the intended candidate base. The planning checkout reported `main` 14 commits ahead of its local `origin/main` tracking ref and existing authentication/design edits. During implementation, fetch the remote, list the actual differences, and decide which reviewed commits belong in the candidate.
- In the chosen non-production environment, record the applied migration ledger and inspect day-level coverage of reservation lifecycle events, room capacity and availability history, task timestamps, inventory movements, and persisted forecast runs. Record the source and dates for real, reconstructed, and synthetic data. Start prospective capture early for inputs that cannot be reconstructed reliably.
- Confirm with the hotel policy owner the age reference date, rollout effective dates, and handling for existing reservations. Confirm with the adviser whether the title uses “QR Guest Services,” broader “QR-based operations,” or another approved wording, and whether the manuscript requires a specific evaluation dataset or observation period.
- Before code edits, read the installed Next.js guides for Route Handlers, Server and Client Components, and data fetching in `node_modules/next/dist/docs/`. Use the existing server-side access and migration conventions throughout.

## Phase 1 · Forecast Evaluation

Extend `lib/analytics/runner.ts`, `lib/analytics/data.ts`, the forecast helpers, and `components/manager/predictive-insights-panel.tsx`. HAVEN already persists model runs and predictions and displays basic performance metrics. The current evaluator selects the newest prediction per target, uses currently active rooms for historical occupancy, evaluates housekeeping task count, and uses recent source pulls for historical scoring. Inventory evaluation derives a calendar range from UTC timestamp prefixes with both endpoints included. Those choices make the score sensitive to lead time, history coverage, and operating-day boundaries. Reuse the existing prediction storage and atomic generation path. Add a migration only where durable evaluation evidence or snapshot fields are required. [System architecture](../../SYSTEM.md#713-innovation-layer--predictive-analytics-gemini-ai-assistance-qr-operations)

### Define the outcome before grading it

| Forecast | Actual and unit | Proposed baseline |
| --- | --- | --- |
| Occupancy | Actual occupied or sold room-nights on a closed hotel date, divided by the applicable historical available room-nights. Select and document one target consistent with the forecast and its source coverage. Score percent forecasts in percentage points for MAE. | Mean observed occupancy over the seven fully closed hotel dates available at issuance. |
| Housekeeping workload | Sum of valid start-to-completion durations for the forecast's task scope, grouped by completion hotel day and expressed in hours. Label this measured task time. Audit timestamp coverage, overlaps, and task types, and retain task-count error as a companion metric. | Mean measured housekeeping hours over the seven fully closed hotel dates available at issuance. |
| Inventory usage | Consumption movements for one item over the exact three-day window forecast at issuance. Persist its Manila window start and exclusive end, and sum in the item's recorded unit. | Mean daily consumption over the seven fully closed source dates before issuance, multiplied by three. |
| Recurring maintenance | Repeated work orders per room or asset and category, with period and count. Treat this as an observed pattern and prioritize investigation when repeats are recorded. | Show the previous comparable period and the repeat-count rule. |

Reconcile sample days to source records. Historical capacity must be dated or supported by preserved snapshots. Mark an outcome unavailable where historical room capacity, actual stay evidence, task coverage, or inventory coverage cannot support the calculation. Record zero for days confirmed complete with zero activity. Read the requested evaluation window explicitly and page or aggregate at the database layer so scan limits and model training windows cannot silently truncate the sample.

### Generate and evaluate reproducible pairs

1. Persist a completed run ID, model version, generated timestamp, target date or window, lead time, prediction, unit, model input count, data-quality grade and reason, and the corresponding baseline and its version. Key snapshots by scope and target. Keep fail/retry handling idempotent and audit exclusions. Resolve actuals after the relevant hotel date or window closes and record their source cutoff so exports can be reproduced after data corrections.
2. Propose one-day-ahead occupancy and housekeeping as the headline comparison and the three-day horizon for inventory. Before inspecting test results, record the holdout period, Manila issuance cutoff, minimum coverage for reporting a score, and which model and baseline versions are being compared. Select one eligible run per target and scope with a deterministic tie-break. Show other horizons or model versions separately. Exclude booked-only occupancy, predictions without complete actuals, failed runs, and records with unsupported units or insufficient baseline inputs from the corresponding comparisons. Keep the exclusion reason visible.
3. Use stored prospective forecasts as primary evidence. Add rolling-origin backtests only where as-of-cutoff inputs can be reconstructed from reliable historical records. At every origin, build the baseline and model with information available at that time. Report backtested, prospective, and synthetic results as separate evaluation cohorts. Show synthetic fixtures as calculation and workflow verification. [Hyndman and Athanasopoulos on time-series cross-validation](https://otexts.com/fpp3/toolbox.html#time-series-cross-validation)
4. Report MAE as the average absolute error in native units. Calculate MAPE only for nonzero actuals, show its denominator and excluded zero count, and display “Unavailable” when the eligible sample is empty. Include actual zeroes in MAE. Compare model and baseline on identical matched rows, and show both MAEs and the difference. Report inventory MAE per item or compatible unit group. Publish historical input observations and scored pairs as separate counts, with a versioned rule for data quality per model. Keep a visible “Limited” or “Insufficient history” state when coverage is thin. [Hyndman and Athanasopoulos on point forecast accuracy](https://otexts.com/fpp3/toolbox.html#evaluating-point-forecast-accuracy)
5. Present an **Evaluation** view under Predictive Insights. One metric selector, date range and lead-time filter drive the actual/prediction/baseline chart, MAE/MAPE and sample summary, evidence table, and CSV export. Each row carries target date or window, generated time, actual, model prediction, baseline, error, input count, and data quality. Show the selected model version, dataset type, and excluded rows. Analytical Reports links into this same filtered view.

**Acceptance.** A reviewer can recreate the reported score using the export and a documented formula. Test duplicate runs, ineligible cutoffs, model-version changes, real zero and missing actuals, changing capacity, cross-midnight timestamps, inventory window boundaries, mixed inventory units, missing baseline coverage, and reads that exceed the prior row limit. Show a numerical result only where the sample supports it. The manuscript states sample size and limitations and reports honestly when the baseline performs better.

## Phase 2A · Operational and Analytical Reports

Give Manager and Owner an **Analytical Report** entry inside their existing Reports navigation. For Manager, put **Operational Report** and **Analytical Report** at the same level so the daily review and the period analysis are easy to find. Front Desk keeps its daily report workflow. Owner access is read-only and follows existing permissions. Accounting keeps its scoped financial reporting. Preserve `buildDailyReport`, immutable submission, return/resubmit, and review. Replace the current Manager and Owner seven-day performance summaries with the same server-derived analytical reporting logic where their permissions overlap. [Daily report contract](../../SYSTEM.md#712-daily-front-desk-operations-report)

Add a bounded, authorized server-side report query with Manila day boundaries and explicit metric definitions. Use a default of the last 30 closed hotel days, plus 7-day and custom ranges. Compare with the preceding equal-length range where coverage supports it. Use date-range and relevant room type/source filters, with the same scope in charts, drill-downs, aggregate CSV, and the existing print flow. Validate the join grain before aggregation to prevent duplicated charges or room-nights. Return real zeroes, denominators, record counts, and unavailable status explicitly.

| Report section | Measures and definition |
| --- | --- |
| Occupancy and room performance | Hotel occupancy = sold room-nights ÷ historical available room-nights × 100. By room type, show sold and available room-nights, room revenue, occupancy, ADR, and RevPAR using dated room-type and capacity records where available. Use sums across the period before calculating ratios. |
| Revenue and collections | Use dated room-only revenue from authoritative folio or nightly charge records for rates, with signed corrections and the agreed tax basis. ADR = room revenue ÷ sold room-nights. RevPAR = room revenue ÷ available room-nights. Show settled collections and refunds as separate cash events. Suppress ratios with a zero denominator or unverifiable inputs. |
| Booking patterns | Show booking-source mix and median booking lead time from creation to scheduled arrival for a declared booking cohort. Show average actual length of completed stays in nights. Use distinct reservation IDs and documented denominators for cancellations by booking cohort and no-shows by scheduled arrival cohort. Keep unknown source as its own category. |
| Service performance | Show checkout-to-ready turnaround where linked events support it, with inspection readiness included where required. Show first recorded response and completion time for guest requests, with eligible counts and open/overdue workload alongside. Where response is inferred from a workflow event, name the exact event in the report. |
| Reliability and predictions | Show recurring maintenance categories and affected rooms or assets, plus forecast error and coverage summaries linked to Forecast Evaluation. |

Bookable historical capacity and recognition of room revenue are gating inputs. Reuse existing records where they support the definitions. Where needed, begin dated capture and publish coverage. Reconcile the hotel's accounting treatment and metric conventions before labeling results ADR or RevPAR. [CoStar STR benchmark glossary](https://www.costar.com/products/str-benchmark/resources/glossary)

**Acceptance.** Hand-calculate known fixtures for both first and last period dates, room closures and type changes, an advance deposit, refund, cancelled stay, no-show, and a request without a recorded response. Verify every visible total and exported figure matches its declared scope. Check that report submissions retain their saved figures even when source events change later.

## Phase 2B · Hotel Command Center

Use the Manager and Owner overview entry points behind `app/(manager)/manager_dashboard/page.tsx`. Reuse existing room-rack, reservation, housekeeping, maintenance, guest-request, transport, accounting, inventory, approvals, and analytics readers. Assemble a bounded server-side projection with role allowlists, a single operating-day context, and a freshness timestamp per independent source. Counts and links follow existing permissions, including finance and Owner approval boundaries. Keep the overview read-only and route actions to their owning workflows.

| On the overview | What the user can verify or open |
| --- | --- |
| Current hotel snapshot | Live occupancy with occupied and serviceable counts, today's arrivals/departures with remaining counts, and rooms ready, dirty, or blocked for maintenance. Each goes to a matching filtered queue or room rack. |
| Operating-day board | Arrivals and departures ordered by expected time, with room readiness beside each actionable entry where permitted. Add housekeeping backlog, open maintenance, pending guest requests, and today's transport trips as compact queue summaries. |
| Needs attention | Pending approvals, overdue service, low-stock items, and forecast alerts with their target date, freshness, and data-quality label. Order by severity and urgency using the existing status vocabulary. |
| Financial snapshot | Today's settled collections and current outstanding folio balance with clearly labeled scope. Link to permitted financial detail. |

**Acceptance.** Counts reconcile with the filtered source queues. Confirm that a room can be dirty and maintenance-blocked without inventing a mutually exclusive total. Use the established room readiness predicate. A failed source produces a localized unavailable or stale state with retry while healthy sections remain usable. Test empty and busy days, both roles, prohibited deep links, and current-vs-booked occupancy labels.

### Premium staff UI and UX direction

Apply Impeccable's **Operate** mode to the staff surfaces. Use UI/UX Pro Max's data-dense patterns for scan order and chart accessibility, and Design Taste Frontend's framed-sheet composition for the new views. Adapt it to the current Haven shell and tokens. A cool-paper frame, white work surface, subtle rules, existing Haven identity and Inter tabular figures give the screen its finish. Use selected-state underlines, restrained teal on the main data series where supported, and existing status tones for operational meaning. Carry the same hierarchy into the existing dark theme. [Haven staff design system](../../DESIGN.md#16-organization-executive-dashboard-theme--staff-pages-2026-09-20-d-025)

- **Command Center first viewport.** Compact title, hotel day and last refresh, one divided strip for occupancy, arrivals, departures and readiness, the operating-day board as the main view, and a short “Needs attention” rail. Use a filtered link from each actionable row. Promote urgent items above the board on phones and show secondary details inside the destination.
- **Reports first viewport.** One report title, clearly named report tabs, one period/filter row, the top three or four decision metrics, and one primary trend. Put metric definitions and coverage at the point of use. Use quieter subordinate tables and section navigation for the remaining measures.
- **Evaluation first viewport.** Show the comparison chart and its sample summary. Actual uses a solid line, prediction a dash, and baseline a dotted line. Use direct labels and a keyboard-accessible table. Preserve gaps for missing values. Add uncertainty bands only if HAVEN calculates and validates an interval with a stated coverage level.
- **Shared interaction rules.** Reuse Haven controls, accessible charts, focused dialogs, and status badges. Keep visible keyboard focus, 4.5:1 contrast for normal text, at least 44px touch targets, readable values, and reduced-motion behavior. Put errors near the affected field or panel. Preserve filters on deep links and restore focus and scroll on return. Keep data tables operable on small screens through responsive rows or a labeled local scroll area.
- **Visual acceptance.** Capture real and sparse data states in light and dark at 320/390px, 768px, 1024px, and 1440px. Review the first viewport, mobile priority order, text clipping, and chart readability. Test keyboard navigation, 200% zoom, live status announcements, loading, empty, unavailable, stale, and denied states. Run Impeccable's detector on the implemented UI and inspect rendered screens before delivery.

## Phase 3 · Age enforcement and panel workflow polish

1. Reuse the existing occupant register and verification routes, including `20261103170000_reservation_occupant_register.sql` and its compatibility work. The release proposal uses the local check-in-date policy. Front Desk checks official ID, records verified DOB or exact age tied to that hotel date, and the shared server/database arrival guard enforces the configured minimum, currently documented as 18. If the hotel requires proof before online confirmation, confirm the verification process and timing separately before making that claim in the manuscript. [Occupant policy and local release state](../../SYSTEM.md#7161-unreleased-occupant-guest-control-and-housekeeping-extensions-2026-11-03)
2. Verify common enforcement for manual arrival, QR, walk-in, direct API attempts, and main-guest or date changes. Clear or revalidate stale evidence according to the policy. Display plain-language reasons and recovery for missing evidence, underage primary guest, or evidence for a different arrival date. Redact DOB and age evidence from analytics, Gemini, printed reports, and roles without access. Keep activation auditable and use the existing separate effective-date controls.
3. Rehearse the six operational flows the panel named: rooms, reservations, guests, QR guest services, housekeeping, and billing. Fix only observed issues in status wording, navigation, task handoffs, accessibility, and recoverable errors. Apply the same pass to account and role management and to the advisory Gemini UI. Keep deterministic forecasts, source reports, and normal operations available if Gemini is offline or rate-limited.

**Acceptance.** Exercise age 17, exactly 18 on the applicable date, missing or invalid evidence, a date or primary-guest change, a minor companion, legacy reservations, and unauthorized attempts. Test one valid guest QR and one valid Front Desk scan plus expired/revoked and unauthorized scans. Show that denied actions do not change reservations, folios, or rooms. Test user deactivation and role changes with existing sessions and audit history.

## Phases 4–5 · CI, release freeze, and defense QA

### GitHub Actions and candidate gate

- Add `.github/workflows/ci.yml` for `push` and `pull_request`, using the locked npm dependencies and repo-pinned Node `22.22.2`. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, then `npm run build`. Verify generated Next types on a clean checkout and use a supported generation step if required. Fix any broken gates at source. Use non-production configuration for build verification and make the passing workflow a required check for the defended branch where repository settings permit it.
- Run targeted Vitest and ESLint on each change, plus PostgreSQL migration/RPC coverage for shared rules. Reuse `playwright.config.ts` and the existing access tests. Reconcile the e2e auth setup script with the tracked `tests/specs/auth-setup.spec.ts`, then add missing browser workflows. Run against a freshly migrated isolated Supabase database with synthetic fixtures and the production build. Keep separate roles/fixtures for stateful scenarios, preserve sanitized failure traces, and label provider stubs and actual sandbox calls in the evidence. [Repo commands](../../package.json) · [Playwright setup](../../tests/README.md)
- Freeze a clean candidate, record the full SHA, and freeze report definitions, demo fixtures, and migration manifest with it. Compare the exact `supabase migration list --linked` ledger and `supabase db push --dry-run` output for staging and the intended release database. Rehearse an upgrade and rollback/forward-recovery plan, then apply reviewed additive migrations with `supabase db push` to the intended environment as part of the authorized release. Verify both backward compatibility during rollout and operating-policy activation. Record the prior Vercel deployment reference for recovery.
- Verify the approved GitHub release HEAD or protected release ref and the Vercel deployment source commit equal the frozen candidate SHA. Verify the Supabase environment and applied migration versions match the candidate manifest, with no unexpected drift or pending candidate migrations. Check application health, forecast cron and manual refresh, payment sandbox/webhook delivery, and enabled age policy in the deployed environment. Repeat the gate and update evidence if the candidate changes.

### Fresh release evidence

Create one dated release QA report tied to the frozen SHA. Include commands, environment, migration versions, browser/device, dataset, expected and actual result, pass/fail/blocked status, and redacted evidence links. Publish the report alongside the release evidence so attaching results does not change the tested SHA. Record the historical `SYSTEM-TEST-REPORT.md` run as prior evidence only. The fresh gate covers the following lanes. [Prior system test report](../../SYSTEM-TEST-REPORT.md)

| Lane | Required release verification |
| --- | --- |
| Code and schema | Typecheck, full ESLint, targeted and full Vitest, production build, candidate migrations replay and upgrade, then server-side RPC and authorization checks. |
| Guest booking and Front Desk | Playwright booking with sandbox payment through confirmed reservation, Front Desk manual and QR-assisted check-in/out, primary age checks, room assignment, and checkout handoff. Test guest room QR request on an active stay. Verify camera on a physical phone, plus camera-denied and manual entry recovery. |
| Housekeeping and billing | Verify task lifecycle and inspection/readiness, a posted folio charge and settled payment, balance/refund handling, and receipt or folio document eligibility. Reconcile reported totals. |
| Forecasting and reports | Run generation, confirm persisted snapshot and fair baseline comparison, independently recalculate errors, and verify live Command Center queues, immutable Operational Report, and filtered Analytical Report and export. |
| Gemini and access | Verify permitted Gemini use, unconfigured or unavailable mode, and stable deterministic forecasts. Check role permissions across all eight access types, including direct API and object access, finance and age privacy, and user lifecycle. |
| Release rehearsal | Execute the approved demo script on the deployed candidate with the demo accounts and browser/device the panel will see. Link evidence to each panel row above. Require passing defense-critical checks and record any remaining limitations explicitly. |

### Manuscript and panel walkthrough

Obtain the official BCP template and manuscript before revising. Once the adviser confirms title and format, align the cover and front matter, objectives, module names, diagrams, historical-data methodology, forecast results, deployment details, and test evidence. Use screenshots from the frozen build with identifying guest data redacted. Describe predictive analytics as HAVEN's deterministic models and Gemini as the advisory layer. Name the verification point for the minimum age and the measured limitations of the forecast dataset.

Rehearse in this order: open Command Center, take a booking through QR-assisted arrival and age verification, submit a guest QR request, show checkout and housekeeping, reconcile the folio, open both report views, and finish with Forecast Evaluation and the Gemini explanation or fallback. For the forecast question, show the recorded horizon, dates, number of matched observations, model MAE/MAPE and baseline error from the same cohort. Keep the evaluation CSV and a saved report accessible during the defense.

The release is ready for the panel when that walkthrough works on the verified deployed version, each checklist item has evidence, and the manuscript uses the adviser-confirmed BCP format.
