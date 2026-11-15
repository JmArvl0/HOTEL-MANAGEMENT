# Instructions for Fleet team — guest ride details and safety sharing

> Superseded wire examples: on 13 November, Fleet supplied its 6 November local schema. Use [the current Haven adapter guide](HAVEN_FLEET_PREPARATION.md) and [the supplied contract](contracts/fleet-haven-2026-11-06.schema.json). This historical draft is not the active wire. Hosting, joint QA and sign-offs remain pending.

Follow-up: Fleet reported flat guest fields, wrapped HAVEN acceptance and different
callback names. Review [alignment proposal 1](FLEET_HAVEN_ALIGNMENT_PROPOSAL.md)
before freezing the contract. The examples below describe Haven's existing
candidate; they are not the newly agreed Fleet wire contract.

Haven requirements updated 5 November 2026. This is a candidate handoff for
agreement and implementation. Haven's connection stays off until the agreed
staging applications pass joint tests. No real credentials belong in this file.

## Goal

Guests should enter their contact details once in Haven and review them for each
ride. A passenger pickup photo is optional. Guests can specify quiet ride and
other preferences, luggage and notes. Once Fleet assigns a vehicle, Haven must
show Fleet's plate number and a shareable Fleet tracking page that the guest can
send to trusted friends/family. Fleet owns vehicle assignment, GPS and tracking.

## 1. Receive and preserve the passenger's request

Extend the current v2 authenticated PMS intake without breaking stable IDs,
source scoping, duplicate replay or the existing booking fields. Haven sends
these additional fields inside `request`:

```json
{
  "traveler": {
    "guest_reference": "<opaque-traveler-id>",
    "display_name": "<actual-passenger-name>",
    "phone": "<E.164-number>",
    "email": null,
    "photo_reference": null,
    "photo_version": 0
  },
  "ride_preferences": ["QUIET_RIDE", "HELP_WITH_LUGGAGE", "COOL_CABIN"],
  "luggage": {"count": 3, "notes": "2 large cases and a stroller"},
  "passenger_notes": "Flight QA123; meet at arrival gate.",
  "journey_reference": "<haven-transport-request-id>",
  "leg": "OUTBOUND"
}
```

- Photo is optional throughout registration, profile, intake and driver dispatch.
  `photo_reference:null` / `photo_version:0` is valid. Show a name/initials fallback.
  Updated existing profiles can have a higher photo_version with a null reference
  after removal; null reference always means no usable photo.
- Optional email can be null. Preserve the actual passenger's name/contact,
  which can differ from the booking owner. Do not infer a photo from an email.
- Preferences are requests: QUIET_RIDE means minimal casual conversation;
  HELP_WITH_LUGGAGE requests loading/unloading assistance; COOL_CABIN requests
  air-conditioning. Essential safety/route communication still applies. Do not
  silently omit requests; coordinate unavailable accommodations with Front Desk.
- Luggage count is an integer from 0 through 20, notes at most 300 characters;
  passenger_notes at most 500. Preferences can be empty. Preserve booking-level
  special_requests separately from these passenger ride notes.
- Persist these fields and expose them to the assigned driver/authorized dispatch
  UI. Acknowledgment means the complete data was stored, not that a driver has
  already accepted every preference. Do not add an automatic luggage charge.
- Round trips are two linked creates, one OUTBOUND and one RETURN with distinct
  external_request_id and event_id, the same journey_reference and independently
  supplied schedules/routes. Coordinate changes/cancellation across both legs.

Return a plain JSON row with the original Fleet intake id, authenticated source,
matching source request ID and both explicit acceptance flags, only after saving
the extended request:

```json
{
  "id": "<fleet-intake-id>",
  "source_system": "PMS",
  "external_booking_id": "haven:<transport-request-uuid>:outbound",
  "pickup_profile_accepted": true,
  "ride_details_accepted": true
}
```

Use external_request_id instead of the legacy external_booking_id if preferred;
when both are returned, they must identify the same Haven request. Preserve the
same result and source identity on retry. A plain 2xx without the extension ACK
goes to coordination on Haven because the remote create may already exist.

## 2. Supply the real vehicle plate and current assignment

Send the plate from Fleet's assigned vehicle record, plus the approved driver
name and vehicle description/color/model. Do not ask the guest to enter a plate.
Give each assignment a stable assignment_reference. Distinguish SCHEDULED from
ASSIGNED, and version every reassignment/status change monotonically per leg.

## 3. Build a shareable tracking page in Fleet

Fleet creates the tracking URL and receives GPS updates from its authenticated
assigned-driver/trip workflow. Haven opens/shares that URL; Haven does not host
a GPS/map service or fabricate a tracking link.

- Use a dedicated approved HTTPS origin and an opaque, unguessable, scoped token.
  Supply the exact origin(s) so Haven can configure HAVEN_FLEET_TRACKING_ORIGINS.
  No admin/dashboard link, sequential trip URL, API key or session token.
- A friend/family member with the share link should be able to view that ride's
  approved map/status/vehicle details without a Fleet staff account. Read only:
  no booking/cancel/driver actions or access to another trip.
- Minimize public data: do not expose passenger email/phone/photo or identity
  documents. Show GPS last-updated time and an honest unavailable/stale state.
  A tracking link is not an emergency-response or SOS integration.
- Provide a finite expires_at. Revoke/rotate the old token on reassignment and
  stop/revoke tracking on cancellation/completion or explicit sharing revocation.
  Link holders must not continue following a driver's next passenger/trip.
- Fleet is responsible for revoking already-shared URLs. Hiding a link in Haven
  cannot invalidate a URL that a friend already has. Coordinate this with the
  pending source-authenticated update/cancel/revocation contract.
- Refresh/renew the token when needed, sending a higher-version current snapshot.
  Rate-limit token access and GPS writes within Fleet's existing infrastructure.

## 4. Send the full versioned callback to Haven

POST `/api/integrations/fleet/transport-status` on the agreed Haven sandbox.
Configure Fleet's callback base as `/api/integrations/fleet` because the existing
gateway appends `/transport-status`. Use the separate inbound bearer credential
and Idempotency-Key equal to event_id. Retry the same event ID and body after an
uncertain response; create a new event ID and higher request_version for a change.

```json
{
  "event_id": "<stable-fleet-event-id>",
  "source_system": "PMS",
  "external_request_id": "haven:<transport-request-uuid>:outbound",
  "external_booking_id": "haven:<transport-request-uuid>:outbound",
  "fleet_reference": "<original-fleet-intake-id>",
  "request_version": 3,
  "status": "ASSIGNED",
  "assignment_active": true,
  "assignment_reference": "<current-assignment-id>",
  "driver": {"name": "<approved-driver-name>"},
  "vehicle": {"plate_number": "<actual-plate>", "description": "<color/model>"},
  "tracking": {
    "url": "https://<approved-tracking-host>/ride/<opaque-token>",
    "expires_at": "2026-12-05T12:00:00+08:00",
    "assignment_reference": "<same-current-assignment-id>"
  },
  "occurred_at": "2026-12-05T10:00:00+08:00"
}
```

Tracking is optional: send null/omit it when unavailable, without inventing a
URL. With tracking present, Haven requires an approved HTTPS origin, plate,
positive request_version, active ASSIGNED/IN_TRANSIT state, and identical top-level
and tracking assignment_reference. Supply every current guest-facing field on
each event. A newer snapshot replaces older details; omitted tracking does not
reuse a previous assignment's link. COMPLETED/CANCELLED/REJECTED must use
assignment_active:false and tracking:null. Keep the original Fleet intake
reference stable; a trip/assignment identifier does not replace that reference.

Haven durably acknowledges `{delivered:true,...}`. Exact duplicate replays get
the stored acknowledgment; changed event-ID reuse conflicts. Old versions cannot
overwrite the current projection. Current unversioned Fleet events are saved
for review and cannot populate guest plate/tracking. No callback posts a fare or
changes Haven's local operational state machine in this preparation phase.

## 5. Joint tests and deliverables

Provide an example request/response, deployed schema details, exact sandbox intake
and tracking origin, callback configuration and synthetic assigned vehicle/trip.
Exchange direction-specific secrets through a secure channel, never a document.

Test with both teams: no-photo create; saved contact; different actual passenger;
all preference combinations; zero/multiple/oversized-luggage notes; separate
round-trip legs; create/retry without duplicates; assigned plate and public map;
guest Share/Copy on mobile/desktop; wrong-source/private-data denial; expired URL;
reassignment revokes the old public token; completed/cancelled ride stops tracking;
lost callback response; duplicate/changed/out-of-order events; GPS outage/stale
indicator; no automatic extra fare. Verify actual mobile OS sharing separately.

Retain the earlier required source-scoped read/update/cancel, durable ordered
outbox/recovery, location mapping and final fare/correction work from
`FLEET_COMPATIBILITY_REVIEW_2026-11-05.md`. These new requirements do not close
those gaps. Confirm the candidate field names together before activation.
