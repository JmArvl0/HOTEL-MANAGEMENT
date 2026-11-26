# Front Desk improvement roadmap

Keep the verified guardrails and property policy ownership. Implement in
small changes whose acceptance criteria can be replayed on the current
Front Desk role and related department roles.

| Phase | Work and priority | Dependencies and risk | Acceptance |
| --- | --- | --- | --- |
| 1 · Release gates | Resolve extension replay (P1). Confirm approved property rules, supported desktop browsers and the release schema. | Reservation and folio RPCs. High consequence if replay is scoped incorrectly. No P0 defect was observed in the local sample. | Identical retry returns the prior result and exactly one charge. New mismatched payload conflicts without changing the stay. The deployed build and schema agree in an approved test environment. |
| 2 · Backend and business logic | Make duplicate electronic-reference errors actionable (P2). Keep cashier and reporting scopes explicit. Extend concurrency and settlement coverage. | Existing ledger uniqueness and audit logs. Medium risk around changing business versus presentation semantics. | Same-reference attempts leave the ledger unchanged and show the specific conflict. Verify concurrent assignments, tender replay, settled checkout and stale report preview rejection. |
| 3 · Operational workflow | Add scoped arrival, departure and balance drill-down (P2). Clarify inspected versus merely completed rooms. Preserve reservation, room and folio context during handoffs. | Dashboard metric definitions, Bookings filters and department permissions. Medium interaction risk. | Every count opens the exact records it describes. Normal check-in and checkout resume on the same queue with the operator's focus intact. |
| 4 · Workstation UI/UX | Compact the portal and workspace headers, reduce stacking, reposition notifications and prioritize the Bookings List, Calendar and room rack (P2). | Existing staff theme, calendar scroll, modal and sidebar components. Avoid changes to shared guest layouts. | At 1280 × 720 and 1366 × 768 show usable working rows on first view. Two full rows is the proposed minimum. Verify all six desktop resolutions in both themes and confirm a three-alert burst leaves booking controls accessible. |
| 5 · Carefully scoped enhancements | Consider a contextual reservation drawer, pinned routine actions and lightweight received-work cues (P2/P3). | Depends on counter workflow and staff interviews. Optional stock, Finance and vendor-specific interfaces stay in their existing modules. | Operators complete common actions with fewer transitions while the same role, quote, payment and room gates still apply. |
| 6 · Visual polish and training | Tighten date labels, align readable status text, and correct Front Desk navigation and reporting references (P3). | Preserve design tokens and existing reduced-motion behavior. Coordinate copies with deployment documentation. | No truncated critical label at the target workstations. Keyboard focus and semantic status are visible in both themes. Documentation points to the correct role and endpoint. |
| 7 · Regression and release | Replay the shift, verify actual property hardware, and run peak desk load in an approved environment. | Front Desk, Manager, Accounting, Housekeeping, Maintenance, property leadership and integration owners. | Record screenshot results, keyboard and assistive-tool checks, peak response times and the relevant settlement, Fleet and reporting acceptance. |

## Quick wins

- Correct the departure balance label or calculate a departure-only number.
- Give actionable dashboard cards accessible links to their scoped queues.
- Bring the sidebar group labels to readable contrast in both themes.
- Surface the duplicate-reference rejection with a search or follow-up action.
- Update the training path for reservation-scoped payments and the daily
  snapshot report.

Use the [register](FRONT-DESK-QA-FINDINGS.md) for exact reproduction and
the [workstation matrix](FRONT-DESK-UI-UX-AUDIT.md) as the visual baseline.
