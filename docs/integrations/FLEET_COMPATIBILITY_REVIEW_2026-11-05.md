# Haven and Fleet compatibility review

Reviewed 5 November 2026. Fleet source is pinned to
[`bf752a850eb40cd179fbea52ac0e3cc4c4d1843a`](https://github.com/ro-mee/fleet-transpo/tree/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a).
Haven findings use the review-time working tree. The later local implementation is
documented in [Haven Fleet preparation](HAVEN_FLEET_PREPARATION.md); the remaining
partner gaps below are still outstanding. This is a source review with
focused offline and loopback tests. Hosted behavior, deployed migration state,
credentials and a real cross-system booking were not verified.

## Existing capabilities

| Direction | Actual implementation |
|---|---|
| Haven → Fleet create | Fleet's `POST /api/integration/transport-requests` accepts a server bearer credential mapped to PMS. Version 2 carries source request ID, event ID, revision, service, passenger count, locations and pickup datetime. Exact create replay returns the existing row. Changed create data and deleted source identities conflict. |
| Fleet → Haven status | Fleet has an explicitly staging-only HTTP sender. It posts to the configured API base plus `/transport-status`, with a bearer credential and event ID as Idempotency-Key. A successful response must be JSON containing `delivered: true`. |
| Fleet dispatch | Existing request, vehicle/driver assignment, trip execution, mobile driver workspace and integration log can support the operational side. |
| Haven transport and Billing | Existing stay-linked requests, guest contact records, local versioned state machine, flat vehicle-type fares and folio correction workflows can support the Hotel side. External sending/receiving remains to be implemented. |

Fleet source references are
[create route](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/app/api/integration/transport-requests/route.js#L489),
[source authorization](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/lib/integration/source-auth.js#L9),
[v2 contract](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/lib/integration/source-contract.js),
[ingest](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/lib/integration/ingest.js#L123)
and [status sender](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/lib/integration/booking-gateway.js#L163).
Haven sources are `lib/transportation.ts`, `lib/transportation-display.ts`,
the transportation routes and `20260910010000_transportation_folio_charge.sql`.

## Gaps and owners

| Priority | Finding | Required work |
|---|---|---|
| Required | Haven has no Fleet sender, external ID mapping or service callback. Its current routes authenticate local staff or guests. | Haven creates the adapter, stores original transport request ↔ Fleet request/trip references, uses a service-authenticated receiver, and keeps a durable send/receive record. |
| Required | Fleet v2 can parse updates/cancels, but its create route returns 409 for every non-create or revision other than 1. Its detail and cancel routes use staff/session permissions. | Fleet implements source-scoped read, update and cancellation handling, including conflicts with assignment/start. Return actual current status and the cancellation outcome. |
| Required | External `SCHEDULED` represents both internal Scheduled and Assigned. Haven distinguishes these states and only shows an assigned driver after assignment. | Agree separate statuses or a reliable assignment object/flag. Include pickup schedule changes, reason and trip reference. Preserve the difference between rejection and cancellation where the Hotel needs it. |
| Required | Outbound events carry event ID/time but no per-request sequence or version. An older event can arrive after completion/cancellation. | Fleet supplies a monotonically increasing version. Haven applies each event once, detects changed replays, and ignores old versions. Both expose recovery status/catch-up by source ID. |
| Required | Fleet logs before HTTP, but operational commit and event creation are separate in several paths. A crash between them can lose an update. | Fleet records the event in the operational transaction or supplies reliable change recovery. Preserve the event ID on retry and use a delivery claim/retry policy. Haven responds positively only after durable processing. |
| Required | No fare/currency/version/correction fields exist in the outbound status schema. Haven already posts its flat fare at local assignment. | Agree the price authority and posting time. Add final fare in integer centavos, PHP, version, original reference and corrections. Reconcile any existing Haven charge with a linked delta/reversal. Route late fares after checkout to Accounting. |
| Required for user's guest detail requirement | Guest phone/email and pickup photo are absent from Fleet's inbound schema and ingest. The mobile API returns passenger name but no passenger phone. Its map already tries to read `passenger_phone` for a call action. | Extend validation, storage, assigned-driver projection and UI. Add a dedicated guest pickup photo source and authorized media delivery on Haven. |
| Required | Haven supports round trips with return location/date/time. Fleet's passenger intake has one pickup datetime and one route. | Agree either a versioned two-leg contract or two Fleet requests with leg IDs derived from one Haven request. Coordinate cancellation, completion and combined fare without doubling it. |
| Required for automated routing | Haven uses free-text locations. Fleet v2 accepts registry codes and review-only proposals. A location proposal is kept separate from trusted route coordinates. | Agree hotel/airport codes and a resolution workflow. Keep unresolved locations visibly pending dispatch review. Confirm pickup timezone and access to active location codes. |
| Before activation | Only a staging status sender is implemented. The default sender is mock. Inbound HTTP polling deliberately throws an unsupported error. | Use the existing push intake for Haven → Fleet. Supply separate sandbox endpoints/credentials, verify deployed schema, test both directions, and review the production activation step separately. |

Key evidence is
[non-create refusal](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/app/api/integration/transport-requests/route.js#L514),
[detail permission](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/app/api/integration/transport-requests/%5Bid%5D/route.js#L13),
[staff cancellation](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/app/api/integration/transport-requests/%5Bid%5D/cancel/route.js#L16),
[status collapse](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/lib/integration/status-map.js#L29),
[event shape and delivery](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/services/outbound.service.js#L37)
and [post-commit emission](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/services/transition.service.js#L326).

## Guest photo and contact

User explicitly requested guest image and contacts. Use a dedicated pickup
profile that identifies the actual passenger or lead traveler. Booking ownership
alone does not establish who is riding.

Haven currently has a contact profile with name/email/mobile and an initials
avatar. Its private ID review and recovery-selfie flows have their own purposes
and access rules. Add a guest-facing pickup/profile photo upload and an
explicit sharing control for the ride.

The proposed shared traveler record contains an opaque guest reference, display
name, normalized mobile, optional dispatch email, pickup photo reference and
photo version. Driver access should provide a fresh expiring URL and expiry,
with a refresh operation that rechecks the active assignment. Store the stable
photo reference separately from its expiring URL. Scope reads to the assigned
driver and authorized dispatcher, and terminate future access when the assignment
ends or the trip is cancelled. Agree handling of already cached copies.

The photo display should have a clear unavailable state. Confirm whether photo
absence prevents dispatch as an operational decision before enforcing that rule.
Driver sees passenger name/photo/contact, pickup details, passenger/luggage count
and applicable instructions. Haven receives only the driver/vehicle details
approved for the guest-facing view.

Fleet sources are
[inbound fields](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/lib/integration/contracts.js#L21),
[driver trip projection](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/src/app/api/mobile/driver/trips/route.js#L192)
and [mobile contact action](https://github.com/ro-mee/fleet-transpo/blob/bf752a850eb40cd179fbea52ac0e3cc4c4d1843a/mobile/app/%28app%29/%28tabs%29/map.js#L2588).
Haven sources are `app/api/account/profile/route.ts` and
`components/account/customer-profile-modal.tsx`.

## Proposed exchange

1. Haven saves one approved transport request and a durable send record. It
   sends v2 create with the Haven transport request ID as external request ID,
   the stay confirmation as booking reference, an event ID and revision 1.
2. Fleet accepts/replays the create and returns its request reference. Haven
   keeps the request as awaiting dispatch until the corresponding Fleet state
   is received. Share guest contacts/photo using the agreed extension.
3. Fleet dispatches, then sends a versioned status event to Haven's receiver.
   Haven validates the service identity, source/request links, duplicate
   payload, state and version, persists the result, then returns the agreed ACK.
4. Haven sends a cancellation/update command with the expected Fleet version.
   Fleet returns the actual disposition. Haven reflects accepted facts while
   an uncertain request is reconciled by status lookup.
5. Fleet completes the trip and sends versioned fare evidence. Haven Billing
   applies one agreed charge/correction to the original folio and records the
   reference used for reconciliation.

With Fleet's current sender, a proposed Haven receiver path can end in
`/api/integrations/fleet/transport-status`. The configured Fleet base would end
in `/api/integrations/fleet`, because its adapter appends `/transport-status`.
This receiver is proposed. It does not exist in the current Haven source.
Use separate server credentials per direction and environment.

## Acceptance required

Test the real staging applications using synthetic photos and contact records.
Verify create/retry, update, cancellation racing dispatch, assignment/start/
completion, wrong-source access, repeated and out-of-order events, photo access
and expiry/refresh, a two-leg trip, final fare/correction, checkout before fare,
and recovery when the receiver commits but the response is lost.

Fresh review checks passed 74 tests in five existing Fleet test files covering
source contracts, create replay, outbound delivery, gateway configuration and a
synthetic HTTP receiver. The receiver test failed under the network sandbox and
passed with loopback access. Tests used the available Haven Vitest/dependency
installation, not a clean Fleet lockfile install. Database operations in these
tests were mocked. They establish focused code behavior and do not certify
Fleet deployment or a Haven ↔ Fleet round trip.

Fleet was read from an ignored clone. No app implementation, migration,
deployment, partner message or real business write was performed in this review.
