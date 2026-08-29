# 03 — Data Integrity & Correctness

All references verified 2026-08-26.

## 3.0 SQL date arithmetic still runs on the session timezone, not the hotel's

- **Where:** five live function definitions, six occurrences, confirmed against the linked project
  with `pg_get_functiondef`: `create_booking_hold` (2), `submit_reservation_deposit`,
  `verify_reservation_deposit`, `review_manager_approval`, `front_desk_execute_manager_approval`.
- **What is lacking:** Postgres `current_date` follows the session `TimeZone`, which is UTC on
  Supabase. Asia/Manila is UTC+8, so from 16:00 UTC each day `current_date` is one day behind the
  hotel's own date. `cancel_reservation` (`20260828050000`) derives its day from the reservation's
  `operational_policy_snapshot` and is correct; `hotel_today(jsonb)` (`20260829050000`) factors that
  out, and `customer_request_reservation_change` now uses it. The five above still do not.
- **Impact:** During those eight hours a same-day arrival is treated as a future one when counting
  sellable rooms, so a dirty room can be sold for tonight, and a Manager approval can be executed
  against the wrong calendar day. The one case with an authorization consequence — the self-service
  modification threshold silently skipping Manager approval — is fixed.
- **Fix:** replace each `current_date` with `hotel_today(policy_snapshot)`. Deferred here because it
  touches Front Desk, Manager and public-booking RPCs outside the customer scope of this change.

## 3.1 Status "cycling" is not a state machine

- **Where:** `components/manager/manager-dashboard-client.tsx:43` — clicking a status badge advances
  to the next enum value, cyclically.
- **What is lacking:** No legal-transition model. `cancelled` wraps to `pending`; `checked_out`
  advances to `cancelled`. No side effects fire on transitions (see 02-missing-domain-logic.md §2.3).
- **Impact:** Records can enter nonsensical states with one misclick; no history of how they got there.

## 3.2 Last-write-wins on concurrent edits

- **Where:** `PATCH /api/resources/:resource` (`app/api/resources/[resource]/route.ts`) and
  `lib/data.ts:28-38`.
- **What is lacking:** No version column, no `If-Match`, no optimistic concurrency. Two front-desk
  users editing the same reservation silently clobber each other; neither is told.
- **Impact:** Silent data loss under exactly the multi-user conditions a hotel front desk produces.

## 3.3 Denormalised names are never reconciled

- **Where:** `reservations.guest_name`, `invoices.guest_name`, `*.room_number`,
  `housekeeping_tasks.assignee` — free-text duplicates alongside real FKs (`schema.sql:22,24,31,42`).
- **What is lacking:** Renaming a guest (or renumbering a room) updates nothing downstream. The
  copies drift permanently.

## 3.4 `housekeeping_tasks.due` is text

- **Where:** `schema.sql:32` — `due text` holding values like `"11:30 AM"`.
- **What is lacking:** Unsortable, unqueryable as a time; overdue detection is impossible. Should be
  `timestamptz`.

## 3.5 Demo/schema ID prefix mismatch

- **Where:** `lib/demo-store.ts:61` emits `INVTRY-` for inventory; `supabase/schema.sql:54` defines
  `ITM-`.
- **What is lacking:** IDs generated in demo mode do not match the schema's format. Any code or
  report keying on prefix shape behaves differently per mode.

## 3.6 `list()` hands out a mutable reference to the demo store

- **Where:** `lib/data.ts:11` returns `demoStore[resource]` directly.
- **What is lacking:** Any caller that sorts/mutates the returned array mutates global app state.
  Demo-mode correctness depends on every consumer being careful forever.
- **Fix shape:** return `[...rows]` at minimum.

## 3.7 Collision-prone ID generation in demo mode

- **Where:** `lib/demo-store.ts:60-63` — 4-digit `Math.random()`.
- **What is lacking:** With modest record counts, birthday-collision risk is non-trivial; a
  collision throws on insert against Supabase PKs and silently duplicates keys in-memory.
