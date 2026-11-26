# Front Desk role and access audit

The fixture sessions were separate actual logins. This matrix distinguishes
the Front Desk workspace from contextual financial and departmental actions.
HTTP checks used supported endpoints with ordinary role credentials.

| Surface | Intended Front Desk access | Observed boundary |
| --- | --- | --- |
| Staff workspace | Dashboard and assigned operational modules | Front Desk logged in and used its own sidebar and protected forms. Direct browser navigation as Guest went to `/account` without the staff sidebar. |
| Reservations | Create, edit eligible stay information, assign, check in and check out, close eligible reservations | Front Desk could create and progress a synthetic stay. Anonymous create was 401. Guest, Manager, Accounting and Housekeeping create were 403. Checkout denied those departmental roles. |
| Contextual reservation detail and folio | Read reservation, guest contacts and operational figures needed at the counter | Front Desk detail GET was 200. Guest, Housekeeping and Maintenance were 403 on the staff route. |
| Standalone invoice/payment ledgers | Accounting ledger and unrelated financial adjustments stay outside Front Desk | Generic invoices and payments returned 403 for Front Desk. Contextual authorized collection remained available. Refund processing was 403 for Front Desk. |
| Cash & Shifts | Read the cashier view and record authorized drawer activity | Front Desk cashier read was 200. Guest, Housekeeping and Manager were denied that cashier route. Front Desk opened a synthetic float and the database rejected a duplicate. |
| Reports | Front Desk generates/submits the daily report. Manager reviews | Front Desk preview was 200. Guest, Housekeeping and Manager generation were 403. Front Desk report review was 403 and Manager acknowledgement persisted. |
| Approvals | File exceptions and execute authorized operational work | Front Desk filed a modification and received 403 for the approval action. Manager approval reached awaiting execution. Accounting adjustments and exception payout remain separate. |
| Rooms and Housekeeping | View condition, route work and report maintenance. Housekeeping owns task execution | Front Desk was denied Housekeeping task start. Housekeeping assigned, started and completed the local turnover. Maintenance read the filed repair. Front Desk was denied the generic work-order list. |
| Transportation | Front Desk operates permitted rides. Manager may apply scoped supervisory actions | Front Desk view was 200. Guest, Housekeeping and Maintenance staff-route reads were 403. Manager cannot create an operational ride through the sampled POST. |
| In-house occupant register | Restricted Front Desk and supervisory operational roster | Front Desk received the in-house register data and Guest received 403. Route policy also permits Manager and Owner. |
| Lost & Found | Front Desk views and handles authorized custody. Housekeeping can record found items | Front Desk list was 200. Guest, Maintenance and Accounting lists were 403. Housekeeping list excludes claimant notes and filters visible event types. |
| Anonymous API access | No staff actions or staff data | The sampled protected routes returned 401. |

The role boundary checks did not find a successful unauthorized operation in
the sampled cases. This is evidence for the routes and roles listed, with
complete endpoint-level RBAC review, direct hosted routing and cross-site
behavior still pending. Scope HR fields, restricted incident notes, signed
proof links, guest identity-data retention and Finance documents separately
during release acceptance. [Observed test evidence](FRONT-DESK-TEST-RESULTS.md).
