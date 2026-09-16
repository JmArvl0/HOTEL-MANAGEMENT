# 2026-09-16 - Find a Room Availability Consistency

Badges now come from the verified-authoritative count, plus the three genuine
gaps the audit found are closed. No formula change, no business-rule change.

## Audit result (root cause)

No hardcoded, mock, or duplicated counts exist: `countAvailableUnits`
(`lib/booking.ts`) is the single decider for Find a Room, public search, and
Front Desk availability, and it matches the SQL authority predicate-for-predicate
(overlap, blocking statuses, pending-website expiry, holds incl. no double-count,
sellability incl. `maintenance_room_is_blocked`). Failure path already renders
"temporarily unavailable", never a fabricated number. Real gaps fixed below.

## What changed

- `lib/booking.ts` — `getAvailability` returns sold-out types (`availableUnits: 0`,
  available-first/cheapest-first sort) instead of hiding them; hotel day now uses
  the Owner-configurable `hotel_timezone` policy (tolerated fallback), closing the
  `hotelToday` vs `hotel_today(policy)` parity hole.
- `room-results.tsx` — `Unavailable` neutral badge + disabled action at zero units;
  browse branch now uses the shared `ChooseDatesButton` (completes the parallel
  session's asserted contract; import was already present).
- `booking/details/page.tsx` — sold-out deep links redirect back to search; the
  `create_booking_hold` RPC (advisory lock + recount) stays the final authority.
- `booking-search-form.tsx` + find-room page — stale indicator when fields drift
  from the searched stay ("check availability again"); absent elsewhere.
- `guest-booking.css` / `search.css` — quiet neutral sold-out badge (never red).
- Staff "available now" (physical readiness) vs customer date-range sellability is
  a legitimate difference — documented, not equalized.

## Verification

typecheck clean · lint 0 errors (71 warnings, baseline) · 1187/1187 (106 files:
new room-results suite, stale-indicator cases, worked-example consistency test,
hotel-day tests, TS↔SQL parity + revalidation contracts) · build 64/64 ·
detector clean. Walk-in dialog unaffected (already filters `> 0`).

## Pending

Manual QA A–D (DB-vs-badge, date-change staleness, zero-state, staff comparison);
needs live data + guest/staff logins.
