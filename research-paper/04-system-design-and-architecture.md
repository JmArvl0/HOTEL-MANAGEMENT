# 4. System Design & Architecture

## 4.1 Architectural pattern

Haven follows a **layered monolith** deployed as a single Next.js application:

1. **Presentation layer** — three route-group surfaces (public, auth, manager).
2. **API layer** — RESTful route handlers; every request re-validates the session.
3. **Domain/authorisation layer** — permission matrix (`lib/permissions.ts`) mapping
   role → allowed resources.
4. **Data access layer** — `lib/data.ts` abstracting demo store vs Supabase.
5. **Persistence layer** — PostgreSQL with RLS deny-all and service-role-only access.

## 4.2 Route map

| Surface | Route | Auth | Implementation |
|---|---|---|---|
| Marketing site | `/` | none | `app/(landing-page)/page.tsx` (server component, `force-dynamic`, live room list) |
| Sign-in | `/login` | none | `app/(auth)/login/page.tsx` (client form → NextAuth `signIn("credentials")`) |
| Operations | `/manager_dashboard` | required | server session check → redirect or render `ManagerDashboardClient` |
| Metrics API | `GET /api/manager_dashboard` | JWT | aggregated metrics + active mode |
| Resource API | `GET/POST/PATCH /api/resources/:resource` | JWT + RBAC | list / create / status update |

## 4.3 Authentication & RBAC design

Eight roles with a resource-level access matrix (`lib/permissions.ts:3-12`; read and
write currently share one grant):

| Role | Resources |
|---|---|
| owner / admin / manager | all 8 |
| front_desk | reservations, rooms, guests, housekeeping_tasks, invoices |
| housekeeping | rooms, housekeeping_tasks, inventory |
| maintenance | rooms, maintenance_orders, inventory |
| accounting | reservations, guests, invoices, inventory |
| guest | reservations, invoices |

Enforcement is **server-side at the route handler** (`canAccess(role, resource)`); the
client additionally filters navigation visibility by role. Roles travel inside the JWT
and are attached to `session.user.role`.

## 4.4 Data model

15 tables in `supabase/schema.sql`. Eight are exposed as API resources:

| Table | PK prefix | Status enum | Notable columns/constraints |
|---|---|---|---|
| reservations | `RSV-` | pending, confirmed, checked_in, checked_out, cancelled | FK guest_id, room_id; `check (check_out > check_in)` |
| rooms | `RM-` | available, reserved, occupied, dirty, maintenance | unique `number`, unique `qr_code`, `amenities jsonb` |
| guests | `GST-` | — | loyalty tier/points, stays, preferences |
| housekeeping_tasks | `HKT-` | pending, in_progress, completed | scheduled `due` time |
| maintenance_orders | `MWO-` | open, in_progress, resolved | cost |
| invoices | `INV-` | unpaid, deposit, partial, paid | `currency char(3)` default PHP, balance |
| inventory | `ITM-` | healthy, low, out | reorder_point, vendor FK |
| staff | `STF-` | off_duty, on_duty, on_leave | optional FK to app_users |

Seven supporting tables have no API surface yet: `app_users` (auth only), `payments`,
`guest_requests`, `reviews`, `vendors`, `purchase_orders`, `audit_logs`.

Indexes exist on high-filter columns: `reservations(check_in, check_out, status)`,
`rooms(status)`, `housekeeping_tasks(status)`, `maintenance_orders(status)`,
`invoices(status)`.

Row-Level Security is enabled on all 15 tables with no policies defined — deny-all to
non-service-role clients. This is deliberate: all reads/writes flow through the server.

## 4.5 API contract

```
GET    /api/manager_dashboard      → { data: DashboardData, mode: "demo"|"supabase" }
GET    /api/resources/:resource    → { data: RecordItem[] }          // authorised rows
POST   /api/resources/:resource    → { data: RecordItem }  201       // create
PATCH  /api/resources/:resource    → { data: RecordItem }            // { id, ...fields }
Errors → 400 invalid resource · 401 unauthenticated · 403 forbidden · 500 failure
```

## 4.6 Dashboard metrics pipeline

`getDashboard()` (`lib/data.ts:40-52`) fetches reservations, rooms, tasks, and invoices
in parallel and computes in JavaScript: occupancy %, arrivals/departures today, revenue
collected (Σ invoice payments), open task count, available rooms, room-status mix, and
recent reservations. Seven-day trend history is partially literal (documented limitation).

## 4.7 Security posture summary

- Server-side session validation on every API request; no client-trusted identity.
- Service-role database key never reaches the browser.
- RLS deny-all prevents anonymous direct database access.
- Known hardening backlog (validation, rate limiting, row scoping, audit logging) is
  catalogued in SYSTEM.md §11 and Chapter 6.
