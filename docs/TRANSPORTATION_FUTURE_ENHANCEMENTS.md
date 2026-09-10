# Transportation Service — Future Enhancements (NOT IMPLEMENTED)

The Transportation Service shipped as a **standalone, staff-managed workflow**: plain
validated-text locations, no external APIs, and a flat vehicle-type fare charged to the
guest folio at assignment (see the "Fare pricing / folio" row below). Everything else
below is explicitly **FUTURE** — none of it is a dependency of, or referenced by, the
current module.

| Enhancement | What it would add | Additive path |
|---|---|---|
| TomTom geocoding | Resolve pickup/dropoff text into coordinates for validation and map display | `transportation_requests` already carries nullable `pickup_latitude/pickup_longitude/dropoff_latitude/dropoff_longitude` columns (numeric(9,6)) that this version never populates or reads — a later migration can backfill them without schema surgery |
| TomTom routing / ETA | Live distance, duration and arrival estimates for scheduled trips | Same coordinate columns plus the staff panel's existing "When" column; ETA is a display-only field. With distance data, `per_km`/`per_minute` could extend the flat fare posted at ASSIGN (today only `base_fare + booking_fee` is charged, ×2 legs for round trips — see `20260910010000_transportation_folio_charge.sql`) |
| Fare pricing / folio | ~~Charge trips to the guest folio~~ **Implemented** (`20260910010000`): the vehicle type's flat fare (`base_fare + booking_fee`, ×2 legs for ROUND_TRIP) posts to the guest invoice as a `transportation` folio charge at ASSIGN; the guest settles it with the remaining balance. Distance-based pricing would need the TomTom routing row above | The historical `transport_lines` jsonb machinery on reservations is untouched and still works; `per_km`/`per_minute` remain unused until distance data exists |
| Live GPS tracking | Real-time vehicle position during IN_PROGRESS trips | Requires a driver-facing app and a position stream — deliberately out of scope until then |
| External fleet / dispatch integration (Grab, operators) | Dispatch to third-party fleets | Would sit behind the same `staff_transition_transportation_request` state machine as another assignment source; no API surface exists today |
| Fleet/driver directory | Managed driver and vehicle records instead of free-text driver name + vehicle type | `driver_name` is free text (≤120 chars) and `vehicle_type_id` already references `transport_vehicle_types`; a `drivers` table would be a purely additive join target |

## Stability guarantees for future work

- **Statuses and ids are stable**: the `REQUESTED → REVIEWED → SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED` (+ `CANCELLED`/`REJECTED`) state machine lives in `staff_transition_transportation_request` (supabase/migrations/20260905010000_transportation_requests.sql) and is the single enforcement point; the TypeScript map in `lib/transportation-display.ts` mirrors it for UI and tests only.
- **Rows are never deleted** — cancellation keeps history, so coordinate backfills and analytics can rely on the full record.
- **All reads/writes go through the app server** (RLS enabled, service-role only), so adding external integrations later means adding server-side callers, not widening client access.
