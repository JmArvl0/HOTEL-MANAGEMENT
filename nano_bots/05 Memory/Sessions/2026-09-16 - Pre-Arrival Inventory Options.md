# 2026-09-16 - Pre-Arrival Inventory Options

Guest Details "What can we prepare before you arrive?" amenities are now live
Manager-linked inventory (in-stock only); services stay independent constants.

## What changed

- Migration `20261005010000` (pushed + live-verified, zero residue):
  `guest_request_catalog.inventory_item_id` FK + `pre_arrival_requestable` (default
  false, partial unique index — independent of in-stay `active`);
  `guest_requests.inventory_item_id` FK + index; `file_booking_guest_requests`
  stamps the FK (active-row lookup preserves prior dept/label behavior).
- `lib/inventory-request-options.ts`: quantity-authoritative eligibility
  (`quantity > 0`; `status` ignored — staff-maintained, triggerless),
  `canConfigurePreArrival` (manager only), submit-time diff + safe message.
- `PATCH /api/catalog/request-types/[id]`: Manager-only gate on the two new keys
  (DB-verified role); generic catalog CRUD keeps `guardCatalog`. GET exposes columns.
- `RequestTypesPanel`: Booking column + edit-modal inventory picker + "Offer at
  booking when in stock" (unlinking clears the flag).
- Details page fetches live options server-side; `GuestDetailsForm` renders
  AMENITIES & ITEMS / SPECIAL REQUESTS subgroups, safe-state line instead of dummy
  data, no quantities in DOM. `booking.ts` zod accepts Manager custom values;
  holds route revalidates against the live set before the RPC.
- `logGuestRequestConsumption`: exact-FK consumption (1 unit/fulfillment),
  name-match fallback for legacy rows, zero-stock skip without going negative.
  No reservation logic anywhere.
- Tests: `inventory-request-options` (14), `guest-details-pre-arrival` (3),
  `pre-arrival-governance` (6); existing form/booking suites untouched and green.

## Verification

typecheck clean · lint 0 errors (71 pre-existing warnings) · **1215/1215 (109 files)** ·
build clean · `db push` (20261004010000 QR + 20261005010000) · live probe 8/8
(columns, FK reject, unique reject, offering query, zero residue).

## Pending

Manual QA A–F (Manager enable/disable, stock-out, restock, direct-API rejection,
service independence). Uncommitted tree — coordinate with parallel sessions.

## Related

[[D-015]] · `SYSTEM.md` §7.2, §7.7
