# Haven breakfast pass handoff

The Haven-side implementation is in the repository. It requires the hotel
breakfast migration and offer setup before guests can use it. Restaurant/POS
connection and acceptance are pending. This is a separate workflow from
[restaurant charge-to-room](RESTAURANT_CHARGE_TO_ROOM.md).

## What the restaurant receives

Haven owns the confirmed booking, the covered meals for each service date and
the number used. The guest opens the Breakfast Pass in My Reservations or
shows the downloaded PNG. The QR contains an opaque `HBF1.` pass code for one
date. One pass can cover multiple diners arriving separately. Restaurant owns
its scanner UI, extra orders, taxes on its own sales and POS tender. Covered
breakfast is already included in the Haven booking and has no new POS charge.

For hotel rollout, apply the breakfast migration through the normal reviewed
Supabase deployment, then enable `HAVEN_BREAKFAST_ENABLED` in the application
environment. In Room Types, publish an approved offer on a test room type.
Verify one checkout with a synthetic guest and check the PNG in My Reservations.
The restaurant endpoint has its own enable flag. Set it after sandbox acceptance.

Local checks passed for manual and gateway conversion, date eligibility, partial
service, simultaneous redemption and timeout replay. The signed-in Edge guest
flow also passed against a disposable local database: breakfast selection,
synthetic deposit submission, My Reservations and real dated PNG downloads.
Downloaded QR images decode at desktop and phone widths. Storage was a local
substitute and Accounting verification used the real SQL RPC. See
[browser QA](../qa/breakfast-guest-browser-2026-11-13.md) for limits.
Hosted rollout and the restaurant sandbox round trip are pending.

## Haven endpoint

`POST /api/integrations/restaurant/breakfast/v1` accepts JSON over HTTPS.
Haven supports one configured outlet for this version. Use the dedicated
bearer token on the POS server. The token and outlet are configured on Haven
as `HAVEN_RESTAURANT_BREAKFAST_TOKEN` and `HAVEN_RESTAURANT_BREAKFAST_OUTLET`.
`HAVEN_RESTAURANT_BREAKFAST_ENABLED=true` enables the endpoint after onboarding.
Use separate environment credentials. Deliver the sandbox URL and credentials
out of band. Do not put a bearer token or live guest QR in tickets or logs.

1. Send `{"action":"verify","passCode":"<scanned-code>"}`. A `200` with
   `status: "valid"` returns `serviceDate`, `roomNumber` (nullable),
   `allowance`, `used` and `remaining`. This call does not record a meal.
2. Staff chooses how many meals were served. Send
   `{"action":"redeem","passCode":"<same-code>","quantity":1,"requestId":"<UUID>"}`.
   A `200` with `status: "recorded"` returns `redemptionId`, `serviceDate`,
   `allowance`, `used`, `remaining` and `replayed`. The response describes the
   result of that action. Verify again for the current remaining allowance.
3. On a timeout, connection failure or `503`, retry the same request ID and
   payload. An accepted replay returns the original result even if the window
   later closes. A changed payload with the same accepted ID returns
   `409 conflict`. Generate a new UUID only for a new service action.

| HTTP | Body status | POS handling |
| --- | --- | --- |
| 400, 404 | `invalid` | Ask for the breakfast pass or correct the request. |
| 401 | `unauthorized` | Check outlet credentials with the Haven integration owner. |
| 409 | `outside_service`, `ineligible`, `used`, `insufficient`, `conflict` | Display the reason. Verify again before another service action. |
| 503 | `unavailable` | Do not assume approval or a successful redemption. Retry or ask Haven Front Desk to reconcile. |

Haven applies the stored hotel-local service window. The POS must not infer
eligibility from the PNG, local time, room number or a prior scan. Before
enabling the connection, test an invalid check-in QR, future and cancelled
passes, one of two meals, full use, simultaneous scans, and a replay after a
simulated timeout. Haven Front Desk can verify or record through Breakfast
service using the pass code or PNG while the restaurant connection is pending.

## Message for the restaurant team

> Hi Restaurant/POS team, Haven has added a separate, date-specific breakfast
> pass to its booking workflow. Guests can show the pass on their phone or
> bring the saved PNG. Please connect your sandbox POS to the breakfast v1
> endpoint above. Verify the QR first, then let staff confirm the number of
> guests served. Haven maintains the remaining allowance, and covered breakfast
> should not create a POS charge. Please share your sandbox owner and outlet ID
> so we can exchange credentials securely and run the acceptance cases together.

Draft saved for handoff. Update environment and test status before sending.
