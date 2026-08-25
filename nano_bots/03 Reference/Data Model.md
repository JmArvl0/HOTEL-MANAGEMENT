# Data Model

Source: `supabase/schema.sql` (PostgreSQL), mirrored by `lib/types.ts`.

## Core resources exposed by the API
| Table | PK format | Status enum | Notes |
|---|---|---|---|
| reservations | `RSV-*` | pending, confirmed, checked_in, checked_out, cancelled | FK guest_id→guests, room_id→rooms; check_out > check_in |
| rooms | `RM-*` | available, reserved, occupied, dirty, maintenance | housekeeping status separate; unique number, qr_code |
| guests | `GST-*` | — | loyalty tier/points, stays, preferences |
| housekeeping_tasks | `HKT-*` | pending, in_progress, completed | assignee, priority, due |
| maintenance_orders | `MWO-*` | open, in_progress, resolved | cost tracking |
| invoices | `INV-*` | unpaid, deposit, partial, paid | currency default PHP, balance = amount − paid |
| inventory | `ITM-*` | healthy, low, out | reorder_point, vendor FK |
| staff | `STF-*` | off_duty, on_duty, on_leave | optional FK to app_users |

## Supporting tables (not yet exposed as resources)
- `app_users` — auth users with role + bcrypt password_hash
- `payments` — linked to invoices (cascade delete)
- `guest_requests`, `reviews`, `vendors`, `purchase_orders`, `audit_logs`

## Indexes
reservations(check_in, check_out), reservations(status), rooms(status), housekeeping(status), maintenance(status), invoices(status)

## RLS
Enabled on every table. The app only touches the DB server-side via the service-role key.

## TS shapes (`lib/types.ts`)
- `RecordItem` — `{ id: string; [key]: string|number|boolean|null|undefined }` (generic row)
- `DashboardData` — metrics, occupancyTrend, roomMix, recentReservations

Note: demo-mode IDs come from `makeId()` in `lib/demo-store.ts`, not the SQL defaults.
