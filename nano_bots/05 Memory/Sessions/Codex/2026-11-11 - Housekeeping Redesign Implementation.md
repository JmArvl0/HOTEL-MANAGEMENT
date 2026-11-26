# Housekeeping Redesign Implementation

Applied the approved design to the shared staff module for Housekeeping,
Manager, and Front Desk. Counted stages and role-specific quick filters
share one priority-ordered queue. The selected task shows recorded room
condition, inventory status, Manila arrival details, notes, and activity.
The shared staff header carries the date and time.

The existing guarded routes handle claims, cleaning, inspections, service
instructions, and Manager prioritization. Room details open the affected
room's Maintenance tab from a hold. The legacy service schema fallback
continues to control availability of optional service actions.

Chrome and an isolated PostgreSQL database with 129 replayed migrations
verified a Manager priority change, the Front Desk arrivals filter and
read-only maintenance history, and Housekeeping's claim through inspection
on a 390 px layout. Database readback confirmed the room was clean and
available after inspection. The phone queue restored search and row focus.

The final production build, typecheck, and all 2,417 Vitest tests passed.
Touched-file ESLint reported zero errors and five existing warnings in the
dashboard and room detail files.
