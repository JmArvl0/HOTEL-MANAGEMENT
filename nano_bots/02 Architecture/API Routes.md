# API Routes

All routes live under `app/api`. Auth check pattern: `getServerSession(authOptions)` → 401 JSON if no session.

## `GET /api/dashboard`
- `app/api/dashboard/route.ts`
- Returns `{ data: DashboardData, mode }` where `mode` is `"supabase"` or `"demo"`.
- `DashboardData`: metrics (occupancy, arrivals, departures, revenue, openTasks, availableRooms), occupancyTrend, roomMix, recentReservations.

## `/api/resources/[resource]` (generic CRUD)
- Dynamic segment constrained to the 8 [[../03 Reference/Data Model|Resource]] values.
- Backed by `lib/data.ts` helpers (`list`, `create`, `update`) which transparently use Supabase or the demo store.

## `/api/auth/[...nextauth]`
- Standard NextAuth catch-all; options from `lib/auth.ts`.

Notes:
- Errors are swallowed into generic 500s — no internals leaked to clients.
- All DB access is server-side via the service-role key; tables have RLS enabled so the client can never query them directly.
