# Manager / Operations Manager Workflow

## Role boundary

The Manager is a cross-department operational supervisor, not a substitute for Front Desk, Housekeeping, Maintenance, Accounting, Admin, or Owner. The governing rule is: **Manager supervises and authorizes; the responsible department executes.**

Manager may view reservations, rooms, guests needed for operations, guest requests, Housekeeping tasks, Maintenance work orders, operational reports, authorized financial summaries, and the central approval queue. Manager cannot routinely check guests in or out, assign rooms, complete cleaning or repair work, verify deposits, process refunds, post charges, operate/reconcile cash shifts, edit roles, edit global policies, or access the full Accounting ledger.

## Approval lifecycle

`manager_approval_requests` preserves the request type, related entity, reservation or guest request, requesting employee, reason, requested action/value, booking-time policy snapshot/current state, severity, reviewer, decision reason, execution state, timestamps, and optimistic `version`.

The lifecycle is:

1. An authorized department creates a pending request.
2. Manager, Admin, or Owner reviews current state and the applicable reservation policy snapshot.
3. The database locks the request, checks the expected version, rejects self-approval, and revalidates the underlying business conditions.
4. Rejection ends the request without changing the underlying operation.
5. Approval authorizes an executor; it does not grant Manager that department's permissions.
6. Front Desk or Accounting locks the approved request and revalidates live state again before executing it.
7. The decision and execution are written to the existing immutable audit history.

Only one pending request of the same type is allowed for the same related entity. Only one concurrent final decision can succeed.

## Supported exceptions and executors

| Approval type | Manager review validates | Executor |
| --- | --- | --- |
| Room upgrade | Same-type alternatives, clean/ready upgrade inventory, Maintenance blocks, conflicts, price/waiver | Front Desk |
| Reservation modification | Dates, room type, booking-time policy context, live inventory and active holds | Front Desk |
| Early check-in | Confirmed stay, preassigned clean/ready room, no Maintenance block | Front Desk performs actual check-in |
| Late checkout | In-house stay and no future assignment conflict | Front Desk |
| Checkout exception | In-house stay and recorded payment arrangement; folio debt remains collectible | Front Desk |
| Guest compensation | Positive amount within current folio obligation | Accounting posts a linked service-recovery credit |
| Refund exception | Closed reservation, settled deposit, prior refunds, remaining refundable maximum, normal policy result | Accounting processes the generated refund request |
| Guest escalation | Open Guest Request, severity, department, requested resolution | Manager coordinates; assigned department completes the work |

The normal refund result and the management exception amount are separate fields. Original payments are never rewritten. Approved paid upgrades create a linked folio charge; waived upgrades preserve the waiver in the approval record.

## Protected endpoints

- `GET|POST /api/manager/approvals`
- `POST /api/manager/approvals/:id/review`
- `POST /api/manager/approvals/:id/execute` — Front Desk execution
- `POST /api/manager/approvals/:id/financial-execute` — Accounting execution
- `POST /api/manager/housekeeping/:id/prioritize`
- `POST /api/manager/maintenance/:id/escalate`

Every endpoint checks the NextAuth session and role before using the server-only Supabase client. The security-definer RPC repeats the actor-role check and never trusts a client-supplied role.

## Dashboard and policies

Manager Overview is a risk command center backed by current reservations, rooms, assignments, Housekeeping, Maintenance, Guest Requests, approvals, invoices, and settled payments. It shows occupied serviceable-room occupancy, arrivals/departures, readiness risk, pending approvals, escalations, critical Maintenance, overdue workloads, and authorized collection/deposit/refund/outstanding-balance summaries. It does not expose Accounting transaction controls.

Operational thresholds live in `hotel_operational_policies`:

- `manager_arrival_risk_minutes`
- `guest_request_overdue_minutes`
- `housekeeping_turnover_overdue_minutes`

Defaults are development policy, not hidden UI constants. Admin/Owner retain global policy configuration authority.

## Database and tests

Migration `20260829030000_manager_operations.sql` is additive and preserves operational and financial history. The consolidated `supabase/schema.sql` contains the same Manager block for new installations.

`lib/manager-operations.test.ts` covers Manager least privilege, direct API boundaries, department completion restrictions, approval concurrency, self-approval, stale-state and availability checks, execution separation, financial history preservation, central queue behavior, and real dashboard data sources.