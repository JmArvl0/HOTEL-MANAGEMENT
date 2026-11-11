# Approvals & Escalations implementation

11 November 2026, Asia/Singapore. Implemented the approved four-stage workspace
in the local staff system.

- Managers see the queue. Front Desk, Accounting, Housekeeping, and Maintenance
  see cases they filed. Owner decisions are recorded in Owner Exceptions.
- The case docket orders pending cases by severity and wait time. The selected
  case compares policy and the requested action and shows financial figures,
  recorded activity, and available actions. Both staff themes use Haven tokens.
- The existing dialogs and routes govern Manager decisions, Owner escalations,
  Front Desk execution, and Accounting credits. Refund exceptions open Refunds.
  The selected case follows the refreshed record after a successful action.
- Chrome checked six role views and five widths in both themes. The Manager
  approval and Front Desk check-in used fixtures and moved the case to History.
  The actual approval routes returned 401 without a session and 403 when Front
  Desk tried to review a case.
- The production build, typecheck, focused lint, and 81 focused tests passed.
  The full suite reported 2,417 passes and the two pre-existing purchase-order
  copy and Billing toolbar assertions.
