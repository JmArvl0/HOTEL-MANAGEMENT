# Front Desk workstations and module assessment

The audit ran a populated Front Desk session in Microsoft Edge at normal
zoom. It sampled the Dashboard, Room Management, Bookings List and Bookings
Calendar in both themes at each requested resolution. Counts below include
only complete tiles or rows visible without scrolling. They are not counts
of the underlying data. The table and calendar each had populated rows.

| Workstation | Dashboard metrics visible L / D | Room cards visible L / D | Booking rows visible L / D | Calendar rows visible L / D |
| --- | ---: | ---: | ---: | ---: |
| 1280 × 720 | 5 / 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| 1366 × 768 | 5 / 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| 1440 × 900 | 5 / 5 | 0 / 0 | 1 / 1 | 1 / 1 |
| 1600 × 900 | 5 / 5 | 0 / 0 | 1 / 1 | 1 / 1 |
| 1920 × 1080 | 5 / 5 | 5 / 0 | 3 / 3 | 3 / 3 |
| 2560 × 1440 | 5 / 5 | 5 / 4 | 6 / 6 | 7 / 7 |

None of the 48 samples had root horizontal overflow. At 1280 px, the
calendar had a 1,010 px track inside a 935 px light or 927 px dark frame.
That scrolling stayed inside the calendar. Calendar column headers
computed to sticky. The sampled Booking List header computed to static.
Calendar width plateaued at roughly 1,390 px on the two widest monitors,
which kept the date cells from stretching indefinitely. At 1280 × 720,
the first booking row started around y=761 in light and y=789 in dark.
The first calendar room row started around y=769 and y=799 respectively.
On 1920 × 1080 the first dark-mode room cards began around y=685 but
extended beyond the viewport. Compare [compact Calendar](evidence/1280x720-dark-calendar.png),
[standard Bookings](evidence/1440x900-light-bookings.png) and
[large Room Management](evidence/2560x1440-dark-rooms.png).

## Keyboard, focus and long-shift comfort

- Ctrl+K opened the command search with focus on the input. Escape closed it.
  Normal sidebar entries followed the collapsed group controls. A receptionist
  can navigate efficiently once the relevant group is open, although the
  default collapsed groups add a discovery step. [Keyboard evidence](evidence/1366x768-keyboard-command-search.png).
- A 1366 × 768 reservation form measured 960 × 465 px and fit the viewport.
  Initial focus was the saved-guest search. Tab advanced through Enter a new
  guest, Continue and Close dialog, then wrapped to search. The staged quote
  kept the data-entry sheet and stay summary side by side. [Dialog evidence](evidence/1366x768-booking-dialog-focus.png).
- Creating a new walk-in from Bookings required six workflow clicks and
  three contact fields in the sampled path. These are action clicks from
  the open workspace and exclude text-field focus clicks. The reservation
  created successfully and opened the arrival surface. Returning guests can
  select a saved profile. [Walk-in review](evidence/shift-02-walk-in-review.png).
- A booking-reference search narrowed the table to one result. Opening and
  closing that reservation kept the filter in the current queue. This
  contextual behavior should be kept when increasing first-view density.
  [Reservation detail](evidence/1280x720-reservation-detail.png).
- The sampled major headings ranged from 15.79:1 to 17.74:1 on their
  rendered backgrounds. The 11 px Workspace sidebar group label measured
  1.83:1 in light mode and 1.67:1 in dark mode, below the 4.5:1 criterion
  for normal-size text. Status text, colors and background remain separate
  signals. Verify every badge, hover and focus state on release hardware
  and with assistive technology. [WCAG 2.2 contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- The top date can truncate at 1280 px. Preserve a visible short hotel-date
  label for calendar work. Keep the session, cashier and search controls
  accessible without giving them the width needed by the operational table.
- The centered toast stack can sit over the booking content while alerts
  arrive. Use a persistent short alert summary, purposeful severity and
  a destination the operator can open when ready. Preserve reduced-motion
  behavior and keep important controls clear while alerts are present.

## Module assessment

The sidebar inventory was expanded group by group. Shared UI uses the
existing HAVEN theme and components. Contextual surfaces are included
because reception can reach them without a separate menu item.

| Module or surface | Actual purpose and sampled workflow | Assessment and recommendation |
| --- | --- | --- |
| Dashboard | Read arrival, departure, occupied, ready-room and cash counters. Morning UI values reconciled with the fixture counts. | Moderate enhancement. Label the scope of balance hints and make counts open their named queue. Use the attention lane for in-flight work. |
| Room Management | View current occupancy, housekeeping and serviceability. Scan the room tiles and open a contextual room dossier. | Moderate enhancement. Put the active rack above the long overview and retain the current filters during a dossier or reservation action. Prefer compact cards for multi-room scanning, with contextual detail on demand. |
| Bookings List | Search and filter stay records. Read identity, stay, folio and next action on each row. | Moderate enhancement. Promote actual records above redundant summaries, preserve queue and scroll position and keep essential labels visible during scroll. |
| Bookings Calendar | Review date-window assignments with room identity and dates. Switch view in the Bookings surface. | Moderate enhancement. Preserve the sticky date header and scope filters. Give the grid the major part of the first viewport and keep a reservation side panel beside it where space permits. |
| New booking and walk-in | Search or enter a guest, choose dates and available room type, review source and rate. Walk-in through the real form and Phone through the authenticated API succeeded. | Good. Preserve server pricing and source-specific rules. Offer later refinement for faster returning-guest selection and context transfer from the rack. |
| Arrivals and check-in | Readiness modal routes staff through identity, money and room gates. | Minor polish. Keep the business gates. Bring the highest-risk blocker and the authorized next action into one compact area. Physical QR scan remains a separate acceptance task. |
| In-house service and stay changes | Reservation detail links room changes, extension, charges, contacts and requests. | Workflow recovery needs attention. Fix the extension replay before improving screen density. Present date, new charge and latest balance together. |
| Departures and settlement | Settle the case folio, check out and dispatch room turnover. | Minor polish. Show unresolved balance and a direct route back into checkout after settling it. Keep payments and checkout authorization separate. |
| Guest Management and guest profile | Find CRM records and use contextual contact, history and rebooking controls. | Minor polish. Prioritize unique names or contact identifiers in search results. Keep edit and sensitive supervisor-only actions subject to their existing roles. Profile merge and rare-policy conflicts were outside runtime coverage. |
| Guest Requests | Review intake and route operational requests. Housekeeping remains responsible for departmental work. | Minor polish. Keep queue states and owner clear. Surface pending requests by stay and department. The guest self-service batch approval lifecycle was not fully replayed in this audit. |
| Transportation and Pickup & Fleet | Review requests and coordinate stage changes. Route contact and consent to Fleet only through the approved integration. | External integration acceptance pending. Keep request consent, handoff outcome, fare and guest-facing status adjacent. |
| Hotel Operations | View day conditions and follow-up work. The dashboard links related operational panels. | Good. Distinguish the business day, report, cashier and reception handover. Keep official Close Day role gates. |
| Approvals & Escalations | File operational exceptions and observe Manager review or follow-up. | Minor polish. Keep requested, reviewed and executed as visibly distinct states. Link back to the source stay with current context. |
| Housekeeping | View the department queue and room-readiness blockers. Specialist completion and inspection remain departmental. | Good. Make the reason for non-ready explicit and encourage a contextual handoff rather than navigating across several lists. |
| Maintenance coordination | Submit a room issue from the operations flow. Maintenance owns technical work and its list. | Good. Show current serviceability and the linked work order in the room context. No separate reception-wide maintenance editor is needed. |
| Cash & Shifts | Inspect current drawer, opening float, transactions, handover and shift history. | Minor polish. Keep identity of the open drawer near eligible collection. Improve duplicate-reference feedback without weakening the financial checks. |
| Contextual folios and documents | Inspect the stay's bill and use authorized posting and document actions from reservation detail. | Minor polish. Show a stay comparison or payment reference in context. Preserve standalone ledgers and reconciliation for Accounting. |
| Daily Operations Report | Preview the active date, submit a snapshot and see stored history. Manager review is separate. | Good. Keep explicit version conflict and date. Improve the return to the refreshed preview after a concurrent change. |
| Operational Handover | Link a note to a reservation and assign the receiving role or operator. | Minor polish. Keep unresolved notes, owner and due date visible in a compact queue. |
| Lost & Found | Review department records and scoped custody history. | Good. Keep role-scoped claimant information and the current custody controls. Physical handling and release workflow still require a documented property rehearsal. |
| Notifications | Bell and transient alerts expose operational events and open the relevant area. | Moderate improvement. Place the burst so it cannot cover working actions. Show changed status without forcing the operator to restart the current task. |
| Breakfast service | The Dashboard link opened the Breakfast service screen as Front Desk. | Configuration-dependent. Keep local eligibility and service date visible. Actual redemption, scanner, service counter and restaurant partner acceptance remain separate. |

## Recommended desktop layout

Use a compact operational bar for room, date, guest and status controls at
the top of the viewport. Keep one row of essential indicators wherever they
add direct action, then give the list or rack the remaining height. At 1440 px
and wider, a bounded side panel can show the selected stay, its eligibility,
folio and next actions while preserving the working queue. At 1280 and
1366 px, let the same panel use a modal or drawer only when the task needs its
full form height. Retain balanced reading widths on high-resolution screens.
Keep money-changing actions and terminal state changes explicit and easy to
review by keyboard. This priority applies only to the Front Desk workspace.
