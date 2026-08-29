# 02 — Missing Domain Logic

Ordered most consequential first. All references verified 2026-08-26.

## 2.1 No availability check — double-booking is possible

- **Where:** `supabase/schema.sql:21-28` — the only date constraint on `reservations` is
  `check (check_out > check_in)`. No exclusion constraint, no `daterange`, no application-level
  overlap check in `lib/data.ts` or the API route.
- **What is lacking:** Nothing compares a new reservation's dates against existing reservations for
  the same room. Two confirmed reservations for room 401 over the same nights are accepted silently.
- **Impact:** The core promise of a hotel system — one room, one guest per night — is unenforced.

## 2.2 No public booking flow

- **Where:** `app/(landing-page)/page.tsx` — the booking bar is `<form action="/login">`; the chosen
  dates and guest count are discarded and the visitor lands on a staff login page.
- **What is lacking:** Despite a defined `guest` role and a rooms browser on the landing page, there
  is no guest-facing reservation, confirmation, lookup, or self-service surface at all. The public
  site can display inventory but cannot sell it.
- **Impact:** Zero direct-revenue capability; "check availability" is decorative.

## 2.3 Room status is manual and unlinked

- **Where:** Occupancy derived from `rooms.status` (`lib/data.ts:43`); status changes only happen
  via human clicks (cyclic badge advance in the dashboard).
- **What is lacking:** Reservation check-in does not occupy a room; check-out does not mark it dirty
  or create a housekeeping task; completing a clean does not return it to `available`. There are no
  triggers or side-effect hooks anywhere.
- **Impact:** Occupancy % — the headline metric — depends on staff remembering to flip a field.

## 2.4 `payments` table is dead

- **Where:** Table at `supabase/schema.sql:48-52`; no API surface, no UI, no writes.
- **What is lacking:** Recording a payment is impossible. Invoice `paid`/`balance`
  (`schema.sql:41-47`) are edited by hand as free-text numbers, and `balance` is a plain stored
  column with no trigger or generated expression keeping it equal to `amount − paid`.
- **Impact:** Cash received by the hotel is tracked nowhere; folios drift from reality.

## 2.5 No rate or pricing logic

- **Where:** `rooms.rate numeric(12,2)` (`schema.sql:17`) is a flat nightly number;
  `reservations.total` is user-typed.
- **What is lacking:** No seasonal pricing, length-of-stay rules, taxes, service charges, or
  computed totals. The booking bar collects dates that could drive dynamic quotes but throws them away.
- **Impact:** Revenue figures are whatever a human typed.

## 2.6 No cancellation / no-show handling

- **Where:** Columns exist (`reservations.deposit`, `.group_code`, `.cancellation_reason`,
  `schema.sql:26`) and are never read or written; cancellation is just another enum value reached by
  cycling a badge (see 03-data-integrity.md).
- **What is lacking:** No cancellation workflow, deposit accounting, or group-block handling.

## 2.7 UTC date arithmetic for a Manila property

- **Where:** `lib/data.ts:42` — `new Date().toISOString().slice(0, 10)`.
- **What is lacking:** "Today", arrivals, and departures are computed in UTC. For UTC+8 this is wrong
  for 8 hours of every local day: arrivals show a day late/early depending on time of day.
- **Impact:** Front desk sees the wrong arrival/departure list every evening and morning.

## 2.8 Six schema tables have no surface

- **Where:** `guest_requests`, `reviews`, `vendors`, `purchase_orders`, `payments`, `audit_logs`
  (`supabase/schema.sql:65-89`) — created, RLS-enabled, then untouched by app code.
- **What is lacking:** Guest requests (a real front-desk workflow), review collection, procurement,
  and payments have data models but zero functionality.

## 2.9 Single property only

- **Where:** Sidebar renders a property switcher affordance with a chevron
  (`components/manager/manager-dashboard-client.tsx:46`) but there is exactly one implicit property
  and no `properties` table.
- **What is lacking:** The UI implies multi-property support that does not exist.
