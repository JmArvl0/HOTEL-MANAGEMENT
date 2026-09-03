# Data Model

Source: `supabase/schema.sql` (PostgreSQL), mirrored by `lib/types.ts`.

## Core resources exposed by the API
| Table | PK format | Status enum | Notes |
|---|---|---|---|
| reservations | `RSV-*` | pending, confirmed, checked_in, checked_out, cancelled | FK guest_id→guests, room_id→rooms; check_out > check_in |
| rooms | `RM-*` | available, reserved, occupied, dirty, maintenance | housekeeping status separate; unique number, qr_code |
| guests | `GST-*` | — | loyalty tier/points, stays, preferences |
| housekeeping_tasks | `HKT-*` | pending, assigned, in_progress, deferred, completed, cancelled | room-care ownership, checklist, inspection, source links |
| maintenance_orders | `MWO-*` | open, assigned, in_progress, waiting_parts, deferred, resolved, completed, cancelled | diagnosis, severity, technical serviceability, parts, assignment, source links |
| invoices | `INV-*` | unpaid, deposit, partial, paid | currency default PHP, balance = amount − paid |
| inventory | `ITM-*` | healthy, low, out | reorder_point, vendor FK |
| staff | `STF-*` | off_duty, on_duty, on_leave | optional FK to app_users |

## Supporting tables
- `user_accounts` — authentication users with role + bcrypt password_hash
- `maintenance_order_events`, `maintenance_order_assignments` — append-only work-order lifecycle and assignment history
- `payments` — linked to invoices and reservations
- `guest_requests`, `reviews`, `vendors`, `purchase_orders`, `audit_logs`

## Indexes
reservations(check_in, check_out), reservations(status), rooms(status), housekeeping(status), maintenance(status), invoices(status)

## RLS
Enabled on every table. The app only touches the DB server-side via the service-role key.

## TS shapes (`lib/types.ts`)
- `RecordItem` — `{ id: string; [key]: string|number|boolean|null|undefined }` (generic row)
- `DashboardData` — metrics, occupancyTrend, roomMix, recentReservations

Note: demo-mode IDs come from `makeId()` in `lib/demo-store.ts`, not the SQL defaults.
