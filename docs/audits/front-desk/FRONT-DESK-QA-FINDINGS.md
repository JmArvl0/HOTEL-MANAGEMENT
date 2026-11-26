# Front Desk findings register

The table and reproductions document the original audit. See the
[implementation register](FRONT-DESK-IMPLEMENTATION-REGISTER.md) for each
finding's disposition on the release candidate.

| ID | Module | Finding | Category | Priority | Operational impact | Effort | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FD-LOGIC-001 | In-house / Extend stay | Exact replay returns an invalid-date conflict after the first extension commits | Business logic | P1 | Staff cannot distinguish a successful first write from rejection after a lost response | Medium | Confirmed |
| FD-UX-001 | Bookings, Calendar, Room Management | Working rows and room tiles start below the fold on smaller desktop workstations | Density and hierarchy | P2 | Extra scrolling before inspecting an arrival or room | Medium | Confirmed |
| FD-LOGIC-002 | Dashboard | Departure card includes arrival balances without identifying the broader scope | Information accuracy | P2 | Misroutes balance triage when the counter is busy | Small | Confirmed |
| FD-API-001 | Reservation folio | Duplicate synthetic tender reference returns a generic collection error | Validation feedback | P2 | A cashier may start a new entry or lose time locating the existing payment | Small | Confirmed |
| FD-UX-002 | Dashboard | Headline arrival and departure counts lack their own queue links | Navigation efficiency | P2 | Staff must locate the corresponding queue below or enter Bookings | Small | Confirmed |
| FD-UX-003 | Shared Front Desk workspace | Central notification stack competes with booking controls | Visual attention and action access | P2 | Concurrent updates cover operational content during a shift | Medium | Confirmed visually |
| FD-UI-001 | Sidebar | Small group-button labels have low contrast in both themes | Accessibility | P2 | Receptionists with low vision may struggle to identify how to open an operational group | Small | Confirmed |
| FD-DOC-001 | Reports and cashiering | Role and RPC descriptions have drifted from the current checkout | Documentation | P3 | Training and acceptance steps may point to the wrong surface | Small | Confirmed |
| FD-PERF-001 | Board and queue | No representative peak-property workload has established response-time limits | Performance | P2 | Large-property and high-concurrency behavior is unquantified | Medium | Potential risk |

## FD-LOGIC-001 · Extension replay

- **Module and severity** In-house reservation, Extend stay. Major workflow recovery defect, P1.
- **Preconditions and reproduction** Use a checked-in reservation with a conflict-free assigned room. Preview a later checkout, submit it with an idempotency key, then repeat the identical request.
- **Expected and actual** A replay should return the committed outcome. The first POST succeeded and the reservation and active room assignment moved to the new date. The repeat returned HTTP 409 and “The new checkout must be later than the current checkout.” PostgreSQL still held exactly one extension charge.
- **Impact** Staff can think an extension was refused when the room and folio have already changed. A guest may receive the wrong checkout date or an unnecessary follow-up. This case produced no duplicate charge.
- **Cause and evidence** The current function locks the stay and compares the requested date to the already-updated date before checking the existing charge key. SHIFT-09 reproduced the ordering in the browser-authenticated HTTP and SQL fixture. [HTTP handler](../../../app/api/front-desk/reservations/%5Bid%5D/extend/route.ts) · [Active migration](../../../supabase/migrations/20260929010000_room_rate_plans.sql#L303).
- **Solution and acceptance** Authorize and bind the caller, stay and request payload, then reconcile a known idempotency record before validating a new extension. Exact replay returns the saved date and amount. Changed payload with the same key receives a distinct conflict. Concurrent requests leave one effect per key. Medium effort.

## FD-UX-001 · Work below the fold

- **Module and severity** Bookings List and Calendar, Room Management. Recurrent workstation friction, P2.
- **Preconditions and reproduction** At normal zoom, open the populated workspaces at 1280 × 720 or 1366 × 768 with the sidebar expanded and the main workspace scrolled to the top.
- **Expected and actual** A receptionist should see a workable sample of the active queue or rack before scrolling. At both smaller sizes, neither Booking List nor Calendar showed a complete row on first view. Room Management also showed no complete room card in the recorded initial view. These views contained real rendered synthetic rows.
- **Impact** Staff pay a scroll cost when alternating between reservations and rooms. The problem is layout hierarchy. No record or server-side constraint changed.
- **Cause and evidence** Portal header, local navigation, page hero, KPI blocks and filter/date controls stack ahead of the operational data. Calendar scroll is confined to its own frame. [Workstation measurements](FRONT-DESK-UI-UX-AUDIT.md) · [1280 Calendar](evidence/1280x720-dark-calendar.png) · [1366 captures and test evidence](FRONT-DESK-TEST-RESULTS.md).
- **Solution and acceptance** Use a compact Front Desk header/filter treatment that preserves accessible text and field sizing. Show at least two complete booking or calendar rows at 720 px height with normal density, or provide a compact operator mode that does. Keep the room and date references visible during intentional calendar scrolling. Recheck both themes and all six sizes. Medium effort.

## FD-LOGIC-002 · Balance placement implies the wrong queue

- **Module and severity** Front Desk dashboard, Departures today card. Misleading queue context, P2.
- **Preconditions and reproduction** Open the Dashboard with six unpaid due arrivals and zero expected departures.
- **Expected and actual** A departure hint should describe the departure queue or identify a cross-queue count. The card displayed “Departures today 0” and “6 balances need attention.”
- **Impact** The receptionist can look in Departures for balances that belong to arrivals. The ledger itself retained the correct balances.
- **Cause and evidence** `balancesAttention` intentionally sums balances for active arrivals and active departures. The UI places that aggregate under Departures. SHIFT-01 reconciled the displayed figures with the synthetic shift. [Metric source](../../../lib/data.ts#L203) · [Morning dashboard](evidence/shift-01-morning-dashboard.png).
- **Solution and acceptance** Show departure balances specifically under Departures, or display a separate “Arrival and departure balances” queue. With six unpaid arrivals and zero departures, the departure hint shows zero or an explicitly separate label. Small effort.

## FD-API-001 · Duplicate electronic reference feedback

- **Module and severity** Reservation payment entry. Recoverable operational ambiguity, P2.
- **Preconditions and reproduction** On the disposable property, record a synthetic bank-transfer tender. Post a valid incidental to create a remaining balance. Try a distinct collection operation using the previously recorded reference.
- **Expected and actual** The rejection should identify the duplicate and guide lookup of the original transaction. The financial guard rejected the duplicate with HTTP 409 and kept the remaining balance at ₱75. The message said only “Unable to record payment.”
- **Impact** Financial protection worked. A cashier still needs to determine why a valid-looking entry failed. A guest may be asked to repeat a reference or wait while staff reconcile it.
- **Cause and evidence** The payment uniqueness check raised SQLSTATE 23505. The route maps common balance and role errors but falls back to a generic error for duplicate references. SHIFT-07 recorded the actual response and unchanged balance. [Collection route](../../../app/api/front-desk/reservations/%5Bid%5D/payment/route.ts).
- **Solution and acceptance** Map the duplicate-reference error to a stable public code and display the next authorized action. Preserve tender input and ledger uniqueness. Exact request retries still replay the prior result. Small effort.

## FD-UX-002 · Headline counters do not open their queues

- **Module and severity** Dashboard arrival/departure KPIs. Navigation friction, P2.
- **Preconditions and reproduction** Open a populated shift. Inspect and tab through the headline arrival and departure cards.
- **Expected and actual** Frequently used counters can open the exact records they summarize. The cards are articles without a headline queue action. Operational navigation exists below and in Bookings.
- **Impact** The receptionist has to locate another entry point when following a queue-sized alert. No data or permission issue was observed.
- **Cause and evidence** The Front Desk KPI renderer uses static cards. Its corresponding queue and modal handlers already exist. [Dashboard implementation](../../../components/manager/manager-dashboard-client.tsx#L550) · [Dashboard evidence](evidence/1280x720-light-dashboard.png).
- **Solution and acceptance** Provide a keyboard-visible action for the arrival and departure counts. Activate it to open the matching filter and confirm the displayed count and list use the same status and date scope. Small effort.

## FD-UX-003 · Notification stack over the working area

- **Module and severity** Shared staff toast region in the Front Desk workspace. Visual and interaction friction, P2.
- **Preconditions and reproduction** At 1280 × 720, generate new arrival assignment and balance alerts through normal synthetic booking activity. Switch to Bookings Calendar while alerts are present.
- **Expected and actual** Alerts should be visible while preserving access to the queue and primary action. The centered stack occupied the page heading, header-action and KPI bands during the observed burst.
- **Impact** A receptionist handling concurrent events can lose sight of the current action. The notifications themselves carried actionable detail.
- **Cause and evidence** The fixed top-center region is 560 px wide at this viewport and individual cards receive pointer events. Three real operator alerts occupied about 257 vertical pixels. [Toast styling](../../../app/staff-theme.css#L180) · [Alert burst over Calendar](evidence/1280x720-notifications-calendar.png).
- **Solution and acceptance** Prefer a stable alert rail or a compact nonblocking burst indicator that links to the notification list. Keep acknowledgement and urgent visibility. A burst of three alerts leaves core booking actions unobstructed at 1280 × 720 in both themes. Medium effort.

## FD-UI-001 · Low-contrast sidebar group buttons

- **Module and severity** Sidebar group buttons, both themes. Accessibility, P2.
- **Preconditions and reproduction** Open the desktop Front Desk sidebar at normal zoom. Read the 11 px Workspace group label in its resting state. Repeat in dark mode.
- **Expected and actual** The label identifies a live control and should reach 4.5:1 for normal-size text. The browser-computed and composited colors gave 1.83:1 in light mode and 1.67:1 in dark mode. [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- **Impact** Faint group labels make it harder to discover the right section during long shifts or in poor display conditions. Table and booking data are unaffected.
- **Cause and evidence** The sidebar's theme-specific muted group styles and effective opacity reduce contrast in the resting state. The standalone measurement and screenshots record the effect. [Sidebar styles](../../../app/staff-theme.css#L165) · [Computed colors](evidence/front-desk-results.json) · [Light sidebar](evidence/1280x720-light-bookings.png) · [Dark sidebar](evidence/1280x720-notifications-calendar.png).
- **Solution and acceptance** Reuse the existing accessible navigation text tokens and keep the group hierarchy through size and weight. Check a minimum 4.5:1 from computed colors for each resting group label in both themes. Confirm hover, focus and expanded state remain distinguishable. Small effort.

## FD-DOC-001 · Training and support drift

- **Module and severity** Staff finance and reports. Documentation, P3.
- **Preconditions and reproduction** Compare the named Payment History module and report submission implementation with the Front Desk guide.
- **Expected and actual** The guide should identify which surface and role perform each operation. The checked-out role configuration reserves the standalone Payment History ledger for Accounting. Front Desk financial visibility comes through reservation detail and Cash & Shifts. The report submission route calls `submit_front_desk_daily_snapshot`; the System narrative names `submit_front_desk_report`.
- **Impact** A new receptionist or tester can look for the wrong menu or trace the wrong RPC. The tested route still enforces the expected authorization.
- **Evidence and cause** The narrative predates current navigation and the snapshot wrapper. [Role configuration](../../../config/role-navigation.ts) · [Report route](../../../app/api/front-desk/reports/route.ts) · [System narrative](../../../SYSTEM.md#L1984).
- **Solution and acceptance** Update training and dependency references once the release boundary is known. A receptionist can follow the documented path without entering Accounting, and the named wrapper matches the current source. Small effort.

## FD-PERF-001 · Peak load coverage

- **Module, scope and evidence** The local matrix used 30 physical rooms and 36 baseline stays, then added shift transactions. Bookings already uses a scoped paged RPC. The audit used one fixture property and a loopback database.
- **Operational risk and expected result** A larger property and concurrent Front Desk writers may change UI and API timing. Hosted latency, browser hardware and write traffic need a measured acceptance target.
- **Validation and acceptance** Run a synthetic peak-property dataset and concurrent assignment, payment and report operations. Measure p50/p95 separately for UI rendering, API calls and database execution. Verify focus, gates and totals under that load. The limited local sample does not establish a browser or hosted performance SLA. Medium effort.
