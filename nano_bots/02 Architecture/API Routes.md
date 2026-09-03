# API Routes

All routes live under `app/api`. Auth check pattern: `getServerSession(authOptions)` → 401 JSON if no session.

## `GET /api/dashboard`
- `app/api/dashboard/route.ts`
- Returns `{ data: DashboardData, mode }` where `mode` is `"supabase"` or `"demo"`.
- `DashboardData`: metrics (occupancy, arrivals, departures, revenue, openTasks, availableRooms), occupancyTrend, roomMix, recentReservations.

## `/api/resources/[resource]` (generic CRUD)
- Dynamic segment constrained to the 8 [[../03 Reference/Data Model|Resource]] values.
- Backed by role-projected staff data. Reservation, Housekeeping, Maintenance, Manager, and financial lifecycle mutations are rejected here and must use their protected workflow routes.

## `/api/auth/[...nextauth]`
- Standard NextAuth catch-all; options from `lib/auth.ts`.

Notes:
- Errors are swallowed into generic 500s — no internals leaked to clients.
- All DB access is server-side via the service-role key; tables have RLS enabled so the client can never query them directly.

## Maintenance workflows
See [[Maintenance Operations]]. Work-order actions live under `/api/maintenance/orders` and call service-role-only, role-checking PostgreSQL RPCs.

## Admin governance API

- `GET /api/admin/data?section=...` — live governance read models.
- `POST /api/admin/users` — inactive, recovery-required staff creation.
- `POST /api/admin/users/:id/action` — lifecycle, role, metadata, and recovery.
- `PATCH /api/admin/rooms/:id` — physical metadata only.
- `PATCH /api/admin/room-types/:id` — future room-type configuration.
- `PATCH /api/admin/policy` — versioned future policy.
- `POST /api/recover/:token` — one-time password setup and activation.
## Owner executive governance API

- `GET /api/owner/data?section=...` — live executive operations, financial, department, Admin, policy, exception, audit, security, and report read models.
- `POST /api/manager/approvals/:id/escalate-owner` — Manager escalation of a high/critical pending exception.
- `POST /api/owner/exceptions/:id/review` — Owner authorization or rejection; the responsible department still executes an approved action.

Owner is routed to the dedicated executive dashboard. Generic resource writes and routine Front Desk, Housekeeping, Maintenance, Accounting, and Manager mutations reject Owner.