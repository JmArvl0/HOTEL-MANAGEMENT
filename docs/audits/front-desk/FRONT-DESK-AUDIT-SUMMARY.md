# Front Desk audit summary

## Executive summary

The local application supported a connected receptionist shift, from booking
and room assignment through arrival, in-house service, checkout, Housekeeping
turnover and Manager acknowledgement of the daily report. The tested controls
protected room inventory and folio totals. There was one confirmed high-priority
workflow failure. A stay-extension retry told Front Desk the date was invalid
after the first request had already changed the checkout and posted its charge.

The most consequential workstation friction was the location of the work.
At 1280 × 720 and 1366 × 768, Bookings List and Calendar showed zero complete
data rows on first view. Multi-room screens spent the first viewport on
navigation, summaries and controls. Large monitors retained a readable maximum
width, and the booking form used a useful side-by-side summary. The improvement
target is useful information above the fold with adequate readability.

## Receptionist perspective

The shift is easiest when the stay is already in context. The same reservation
supports assignment, charges, requests and checkout. The walk-in form starts
with guest search, quotes the room before saving and shows enough data to review
the new booking. When a guest has an unresolved balance or the room is dirty,
the system stops the unsafe action.

The shift feels slower when work starts from an aggregate. A departure card
showed six balance items on a day with zero departures because the six belonged
to arrivals. At smaller workstations, scanning the next record also takes a
scroll. During a burst of notices, the message stack shares the same area as
the current booking controls. The most helpful change is to show the exact task,
its owner and the next authorized action while retaining the work already open.

## Evidence-based scorecard

Scores apply to the tested local flows. N/A indicates an area whose primary
result depends on external or physical acceptance.

| Area | Score | Evidence and what would improve it |
| --- | ---: | --- |
| Dashboard usefulness | 6 | Morning counters reconciled, but the balance hint and queue drill-down need correction. |
| Navigation | 8 | Grouped sidebar and command search worked. Improve direct context transfer between queue, room and folio. |
| Reservation management | 8 | List, Calendar and staged booking are usable. Show working records earlier at short desktop heights. |
| Walk-in experience | 8 | A six-action walk-in created the stay with an authoritative quote. Keep faster ways to select a saved guest. |
| Room management | 6 | Dirty-room and overlapping-assignment gates passed. The room rack takes too much vertical space before its first complete cards. |
| Guest management | 7 | The guest list and booking search were present in a populated session. Profile merge and full identity review remain unsampled here. |
| Arrival readiness | 8 | Identity, room and balance blockers were proven. Present them together on the operator surface. |
| Check-in efficiency | 7 | The guarded path progressed after settlement. Streamline the route between identity, balance and room selection. |
| In-house guest operations | 7 | Incidental and routed request worked. Preserve context across the related operations. |
| Room moves and extensions | 6 | Move preserved the folio. Extension replay gave a false failure after committing. |
| Checkout efficiency | 8 | A balance block and settled checkout worked. Keep the route from payment back to checkout short. |
| Billing and folios | 7 | Local ledger checks and role scope passed. Duplicate-reference feedback needs a specific recovery message. |
| Guest requests | 7 | Front Desk filed an approved departmental request. Full guest-batch approval and fulfillment were outside the sample. |
| Transportation | N/A | Local access and validation were sampled. Partner delivery and fare acceptance govern readiness. |
| Departmental coordination | 8 | Checkout, cleaning, inspection and maintenance report affected the expected records under their respective roles. |
| Manager approvals | 7 | A Front Desk request moved through Manager review. Post-approval execution needs its own completion evidence. |
| Daily reports | 8 | Submitted and acknowledged snapshot persisted. Keep concurrent preview changes actionable. |
| Visual design | 7 | Themes share a recognizable workstation design. Compress stacked headings and metrics where they hide working data. |
| Overall usability | 7 | Core transactions are understandable with a reservation in context. Reduce repeat navigation and scrolling. |
| Desktop responsiveness | 7 | All six sizes and both themes rendered without page-level horizontal overflow. Small-height data density needs work. |
| Accessibility | 6 | Command input focus, tab wrap and Escape worked. Sidebar group labels were below the small-text contrast target in both themes. Screen-reader checks remain open. |
| Backend reliability | 7 | Core transactions and concurrency stayed consistent. Extension retry needs correction. |
| Business logic | 8 | Gates for identity, balance, room and cutoffs worked in the sample. Keep visible summaries aligned with the actual queue. |
| Data integrity | 8 | One assignment, one idempotent tender, one incidental and one extension charge were evidenced. Validate hosted rollout and heavier concurrency. |
| RBAC and security | 8 | Sampled unauthorized calls were denied. Broader endpoint and hosted checks remain open. |
| Production readiness | 6 | The local shift is suitable for a controlled demonstration. Close the known failure and acceptance dependencies before an unrestricted rollout. |

## Readiness decision

The tested workflow is a credible local release candidate for a controlled
pilot. Resolve extension replay and repeat the workstation checks after the
density changes. Validate the hosted schema, property policies, authorized
approvals, payment reconciliation, physical QR/scanner behavior and Fleet
delivery before the relevant features are signed off. No critical issue was
observed in the sampled role, cash and inventory cases. The audit did not
establish unrestricted rollout readiness.

See the [findings](FRONT-DESK-QA-FINDINGS.md), [workstation review](FRONT-DESK-UI-UX-AUDIT.md)
and [test evidence](FRONT-DESK-TEST-RESULTS.md) for the underlying observations.
