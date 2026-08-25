# Project Overview

**Haven Hotel Management** — a role-based hotel operations dashboard.

## What it does
- Dashboard with occupancy %, arrivals/departures, revenue, open tasks, room mix chart, recent reservations
- CRUD over 8 resources: reservations, rooms, guests, housekeeping_tasks, maintenance_orders, invoices, inventory, staff
- Role-based access control for 8 roles: owner, admin, manager, front_desk, housekeeping, maintenance, accounting, guest

## Tech stack
| Layer | Choice |
|---|---|
| Framework | Next.js ^16.3.2 (App Router) |
| UI | React 18, lucide-react icons, Recharts charts |
| Auth | next-auth v4 (credentials provider, JWT sessions) |
| Data | Supabase (service-role key, server-side only) |
| Validation | zod |
| Passwords | bcryptjs |

## Data modes (`lib/data.ts`)
`databaseMode` is `"supabase"` when `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, otherwise falls back to the in-memory `demoStore` (`lib/demo-store.ts`). All reads/writes go through the shared `list/create/update` helpers so both modes behave identically.

## Pages
- `/login` — sign-in (custom page configured in authOptions)
- `/` — landing
- `/dashboard` — main authenticated dashboard

Related: [[../03 Reference/Data Model|Data Model]], [[Auth & Permissions]]
