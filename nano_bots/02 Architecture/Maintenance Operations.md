# Maintenance Operations

Maintenance owns technical diagnosis, repair execution, serviceability decisions, parts/external-service tracking, resolution, and closure. It does not own reservation assignment, room occupancy, Housekeeping cleanliness, financial records, or RBAC configuration.

## Authoritative lifecycle

`open → assigned → in_progress → waiting_parts | deferred → in_progress → resolved → completed`

An `open`, `assigned`, `deferred`, or `waiting_parts` order can be cancelled with a required reason. Every assignment and lifecycle action writes append-only operational history and an audit record.

## Severity and serviceability

Severity (`low`, `normal`, `high`, `critical`) describes urgency. Technical serviceability (`serviceable`, `blocked`, `out_of_service`) independently decides whether a room can be assigned. A reported issue starts as `serviceable` pending Maintenance diagnosis; Front Desk and Housekeeping reporters cannot technically block a room.

A room is assignment-ready only when it is available, Housekeeping-clean, conflict-free, and has no active Maintenance order diagnosed as `blocked` or `out_of_service`. An occupied room remains occupied while Maintenance works; Maintenance never changes the reservation or active room assignment.

## Cross-department flow

- Housekeeping and Front Desk can report issues, but Maintenance owns the resulting work order.
- A Maintenance-routed Guest Request creates one linked work order; source and idempotency constraints prevent retry duplicates.
- Resolving a linked repair completes its Guest Request.
- Resolution restores technical serviceability. If cleanup is required, Maintenance creates one linked Housekeeping task: stayover cleaning for an occupied room or maintenance cleanup for a vacant room.
- Repair resolution does not by itself declare a dirty room ready. Housekeeping completion/inspection remains authoritative for cleanliness.
- Manager can reprioritize/escalate an active order but cannot perform diagnosis or repair completion.

## Protected server workflows

- `POST /api/maintenance/orders` — report a work order.
- `POST /api/maintenance/orders/[id]/assign`
- `POST /api/maintenance/orders/[id]/start`
- `POST /api/maintenance/orders/[id]/diagnose`
- `POST /api/maintenance/orders/[id]/progress`
- `POST /api/maintenance/orders/[id]/defer`
- `POST /api/maintenance/orders/[id]/resolve`
- `POST /api/maintenance/orders/[id]/close`
- `POST /api/maintenance/orders/[id]/cancel`

The generic resource route is read-only for Maintenance work orders. Each mutation is authorized in the API and again in a service-role-only PostgreSQL RPC.
