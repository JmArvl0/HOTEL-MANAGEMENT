# Fleet–Haven contract alignment — proposal 1

> Superseded wire examples: on 13 November, Fleet supplied its 6 November local schema. Use [the current Haven adapter guide](HAVEN_FLEET_PREPARATION.md) and [the supplied contract](contracts/fleet-haven-2026-11-06.schema.json). This historical draft is not the active wire. Hosting, joint QA and sign-offs remain pending.

Prepared 5 November 2026 from Fleet's supplied coordination message and Haven's
current source. **Proposed, not frozen or implemented.** Neither team may treat
this document as production/partner approval. Keep integration inactive and
tracking origins blank until an approved real origin is supplied.

The fetched public Fleet main/FETCH_HEAD remains
`bf752a850eb40cd179fbea52ac0e3cc4c4d1843a`. The new flat guest fields, response
wrapper and callback changes reported by Fleet are not in that reviewed public
integration source. Ask Fleet for its exact schema/examples or updated commit.
The spellings below are proposals where their message did not specify them.

## Alignment direction

Use one agreed Fleet-facing wire contract. Haven can map it into its existing
private canonical model, keeping request identities, durable events, local
transport ownership and Billing unchanged. Do not support arbitrary mixed
aliases or accept conflicting identities to make a test pass.

| Concern | Proposed shared wire | Current Haven runtime |
|---|---|---|
| Passenger | Flat `guest_reference`, `guest_name`, `guest_phone`, `guest_email`, `guest_photo_reference`, `guest_photo_version` inside v2 `request` | Nested `request.traveler`; mapping still needed |
| Journey | `round_trip_reference`, lowercase `leg_kind: outbound/return` | `journey_reference`, uppercase `leg`; mapping still needed |
| Source label | External `source_system: HAVEN` | Internal canonical PMS; authenticated service identity must be mapped independently of body labels |
| ACK | `data` wrapper, `fleet_request_id`, both stored flags, original external request ID | Plain PMS row; parser still needs adjustment |
| Callback | `fleet_request_id`, `assignment.driver_name`; plate and tracking as shown below | `fleet_reference`, `driver.name`; normalizer still needed |
| Photo access | Four assignment/photo-bound fields proposed below | Currently validates request/photo references only; new binding is not enforced yet |

Fleet must confirm all exact field paths, enums and ID types before these
examples become the shared contract. In particular, their message did not name
each guest field, the plate path, luggage shape or every tracking field. Examples
use a numeric Fleet ID and the existing proposed preference/luggage shapes.

## 1. Complete proposed create request

POST Fleet's agreed intake over HTTPS with its direction-specific bearer key.
Idempotency-Key equals event_id. The authenticated key determines the allowed
source; a body claiming HAVEN never grants access by itself.

```json
{
  "contract_version": 2,
  "source_system": "HAVEN",
  "external_request_id": "haven:11111111-1111-4111-8111-111111111111:outbound",
  "external_revision": 1,
  "event_id": "44444444-4444-4444-8444-444444444444",
  "event_kind": "create",
  "request": {
    "booking_reference": "HVN-SYNTHETIC-1001",
    "guest_reference": "22222222-2222-4222-8222-222222222222",
    "guest_name": "Synthetic Passenger",
    "guest_phone": "+639171234567",
    "guest_email": "passenger@example.invalid",
    "guest_photo_reference": null,
    "guest_photo_version": 0,
    "pickup_location": "Synthetic Airport Terminal",
    "dropoff_location": "Haven Hotel",
    "pickup_datetime": "2026-12-05T10:30:00+08:00",
    "passenger_count": 2,
    "load_type": "Passenger",
    "service_code": "GUEST_TRANSPORT",
    "priority": "Normal",
    "special_requests": "Booking flight reference QA123",
    "ride_preferences": ["QUIET_RIDE", "HELP_WITH_LUGGAGE"],
    "luggage": {
      "count": 3,
      "notes": "2 large cases and a stroller"
    },
    "passenger_notes": "Meet at the marked arrival gate.",
    "round_trip_reference": "11111111-1111-4111-8111-111111111111",
    "leg_kind": "outbound"
  }
}
```

Return is a separate create using `:return`, a different event_id, `leg_kind:
return`, the same round_trip_reference and its own pickup time/route. Preserve
the original external_request_id through retries and corrections. Do not create
another remote identity after a lost acknowledgment.

## 2. Complete proposed stored acceptance response

Return after the complete extended request is durably stored. Flags confirm
storage, not guaranteed preference fulfillment or driver assignment.

```json
{
  "data": {
    "source_system": "HAVEN",
    "external_request_id": "haven:11111111-1111-4111-8111-111111111111:outbound",
    "fleet_request_id": 1001,
    "pickup_profile_accepted": true,
    "ride_details_accepted": true
  }
}
```

Haven must verify the source and original external identity, unwrap data, and
store the original Fleet intake reference. A malformed/conflicting or partial
ACK requires coordination because the remote create may already exist. Neither
side should silently drop passenger requests to produce a success response.

## 3. Complete proposed assignment/status callback

POST Haven `/api/integrations/fleet/transport-status`, using the distinct inbound
bearer credential. Idempotency-Key must equal event_id. Tracking host/token below
are synthetic placeholders, not an approved origin or a live link.

```json
{
  "event_id": "55555555-5555-4555-8555-555555555555",
  "source_system": "HAVEN",
  "external_request_id": "haven:11111111-1111-4111-8111-111111111111:outbound",
  "fleet_request_id": 1001,
  "request_version": 3,
  "status": "ASSIGNED",
  "assignment_active": true,
  "assignment_reference": "assignment-synthetic-1001-1",
  "assignment": {
    "driver_name": "Synthetic Driver",
    "driver_phone": "+639181234567"
  },
  "vehicle": {
    "plate_number": "QA 1234",
    "description": "White synthetic van"
  },
  "tracking": {
    "url": "https://tracking.fleet.example.invalid/ride/synthetic-public-token",
    "expires_at": "2026-12-05T12:00:00+08:00",
    "assignment_reference": "assignment-synthetic-1001-1"
  },
  "occurred_at": "2026-12-05T10:00:00+08:00"
}
```

The original Fleet intake reference remains 1001 through reassignment; assignment
reference changes. New assignment snapshots must replace old driver/vehicle/link
data. Missing tracking means null/unavailable, not reuse of the previous link.
COMPLETED/CANCELLED/REJECTED use assignment_active:false and tracking:null.
Future events increase request_version per source leg. Retry the exact event ID
and body after uncertain delivery; changed content needs a new event/version.

Until Fleet supplies its approved public origin, use tracking:null for status
tests. Haven currently rejects a callback containing an unapproved URL. Do not
configure the synthetic example host. After normalization is implemented, Haven
persists before delivered:true, replays exact duplicate ACKs, conflicts changed
event-ID reuse, and prevents older projections from replacing current ones.
The ACK confirms durable processing, not automatic fare/local-state changes.

## 4. Optional photo and limits

- New profile without photo: reference null and version 0.
- Adding/replacing/removing a photo increases photo_version. Removal has a null
  reference and the new higher version; it does not reset history to zero.
- Contact-only edits do not increment photo_version. Replacing a photo changes
  its opaque reference. Never fall back to an old photo after null/removal.
- No photo or a failed photo preview blocks neither booking nor dispatch.
- Luggage count is an integer 0–20. Luggage notes maximum 300 characters;
  passenger notes maximum 500. Empty notes and preference arrays are valid.
- Preference enums are QUIET_RIDE, HELP_WITH_LUGGAGE, COOL_CABIN; each at most once.
  No additional fare is inferred from luggage or preferences.

## 5. Photo-signing request — proposed tightening

Endpoint path remains POST `/api/integrations/fleet/pickup-photo`.
**Current Haven validates external_request_id and photo_reference. It does not
yet require/check the assignment_reference or photo_version request fields.**
For the frozen contract, propose making all four fields below required for a
photo that exists, then implementing those extra checks on Haven:

```json
{
  "external_request_id": "haven:11111111-1111-4111-8111-111111111111:outbound",
  "photo_reference": "33333333-3333-4333-8333-333333333333",
  "photo_version": 2,
  "assignment_reference": "assignment-synthetic-1001-1"
}
```

Fleet first authorizes the actual assigned driver/dispatcher. Haven additionally
must match the current versioned assignment, source request, photo reference/
version, guest permission and active stay/trip. A stale/wrong assignment or removed
photo gets a uniform unavailable response. Successful signed links last 60 seconds.
The approved private image host is still to be confirmed with Haven staging.
No requests are needed when the photo reference is null.

Existing photo links can remain usable until expiry, and cached downloaded copies
need partner handling. Do not describe future-link refusal as immediate revocation
of downloaded data. The future strict request checks must be tested before use.

## 6. Controlled public-tracking renewal — proposed semantics

- Fleet owns token issuance, renewal, GPS and server-side revocation.
- Renewal requires an authenticated, source-scoped operation for an active,
  permitted assignment; knowledge of an old public URL is not authorization.
- Keep the same assignment_reference for renewal. Issue a new opaque token and
  finite expires_at, and send a higher-version complete callback. Reassignment
  instead uses a new assignment_reference.
- Proposed default: renewal rotates/revokes the previous public token. The guest
  must reshare the new URL; do not silently extend access for old link holders.
  Fleet must explicitly confirm or propose another privacy/continuity policy.
- Retry renewal idempotently so a lost response does not issue many live tokens.
  Completion/cancel/reassignment/revocation must invalidate all old tokens and
  must not allow a renewal race to reactivate them.
- Until a real renewal operation/path and policy are agreed and implemented,
  Haven shows expired tracking as unavailable; no automatic renewal is claimed.

Fleet must supply the actual renewal API/path, authorization model, TTL policy,
request/response examples and its cancellation/reassignment race behavior.
Haven must implement source-authenticated sharing revocation before claiming it
can invalidate already-shared Fleet URLs. Hiding a URL locally is insufficient.

## 7. Freeze gate and next exchange

Fleet to provide its current commit/schema or actual complete JSON for all three
messages above, including every field path/type and enum. Confirm/remap proposed
guest/luggage/plate/tracking spellings rather than freezing guessed names.
Then implement/retest Haven normalization, strict photo binding and agreed renewal/
revocation handling against shared golden fixtures. Require both teams' approval
of a named immutable contract revision before activation.

Hosting, technical/Accounting contacts, Asia/Manila schedule, secure credential
channel, approved tracking/image origins and real two-system tests remain pending.
Keep tracking origin unconfigured. Automatic fare posting remains deferred; ask
Fleet for its exact PHP-centavo fare/correction evidence schema for Accounting
review. No preparation callback posts a folio charge. This proposal does not
change the existing Haven runtime, migrations, source identity or configuration.
