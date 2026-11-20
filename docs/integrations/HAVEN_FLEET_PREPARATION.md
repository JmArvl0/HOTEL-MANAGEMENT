# Haven Fleet preparation

Based on Fleet's [6 November schema](contracts/fleet-haven-2026-11-06.schema.json) and [complete acceptance sample](contracts/examples/acceptance.json). Haven supports an explicit production connection. The default is off.

## Current wire

- Intake: `POST /api/integration/transport-requests`. Each reviewed round-trip leg has a stable external ID and durable UUID event ID. Both share `round_trip_reference` (Haven transportation request UUID), with lowercase envelope `leg_kind:outbound|return`. The envelope contains `contract_version:2`, `source_system:HAVEN`, `external_revision:1`, `event_kind:create` and matching external request/booking IDs.
- `request` uses flat `guest_reference`, `guest_name`, E.164 `guest_phone`, optional/null `guest_email`, `guest_photo_reference` and `guest_photo_version`. No nested traveler or request journey/uppercase leg. Photo is optional. Removal preserves the increasing photo removal version.
- Both legs carry stored preferences (quiet ride, luggage help, cool cabin), luggage (0–20; notes ≤300 characters) and passenger notes (≤500). Booking instructions remain separate in `special_requests`. Pickup datetimes include `+08:00`. Preferences are requests, not guarantees.
- Acceptance is `{success:true,data:<complete HAVEN StatusSnapshot>}` with both `pickup_profile_accepted:true` and `ride_details_accepted:true`. All snapshot fields, including nulls, are required. Fleet ID aliases must agree. The ACK event ID may differ from the inbound command ID. Source identity/revision, journey and leg must match the prepared command. Reference, snapshot and inbox evidence commit atomically.
- Callback: `POST /api/integrations/fleet/transport-status`, **plain** complete HAVEN snapshot, dedicated inbound bearer credential and `Idempotency-Key:<snapshot.event_id>`. Save before replying `delivered:true`. Exact duplicates replay; changed reuse conflicts; older versions are stale. New PMS events are rejected; exact previously stored legacy evidence can replay.
- `assignment.driver_name` equals `driver.name`. Active assignments require a current assignment UUID and actual plate. Tracking must match the assignment and an explicitly approved HTTPS origin. Guest output excludes raw evidence, contacts and photo references.
- PHP-centavo fare and linked corrections remain immutable inbox evidence only. They cannot post folio charges or change local transport status.

The supplied schema is copied without modification. Its `x-source` names base commit `bf752a850eb40cd179fbea52ac0e3cc4c4d1843a` **and uncommitted implementation**. It is a local contract reference, not proof of published/hosted code. Tests independently validate persisted outgoing payloads against this JSON Schema.

## Photo signing

Fleet's server calls `POST /api/integrations/fleet/pickup-photo` with its dedicated inbound bearer credential and all four fields:

```json
{
  "external_request_id": "haven:<request-uuid>:outbound",
  "photo_reference": "<current-photo-uuid>",
  "photo_version": 1,
  "assignment_reference": "<current-assignment-uuid>"
}
```

Haven rechecks exact request/photo/version/current assignment, sharing permission and active trip/stay. Wrong/stale bindings return unavailable. Response: `{url,expires_at,photo_version}` with a private HTTPS URL valid for 60 seconds. Fleet approves the actual storage origin and authorizes its assigned driver. No caller URL/storage path is accepted. Credentials and URLs must not be logged. Withdrawal stops future signing; already issued URLs may survive until expiry.

## Explicit tracking renewal

Front Desk → Transportation → Pickup & Fleet → active leg → **Renew tracking link**. Front Desk can renew when the Fleet connection is enabled and the tracking origin is approved. Haven saves a durable command before sending.

```text
POST /api/integration/transport-requests/source/{externalRequestId}/tracking/renew
Authorization: Bearer <separate-outbound-test-credential>
Idempotency-Key: <saved-event-uuid>
```

```json
{
  "event_id": "<saved-event-uuid>",
  "expected_request_version": 2,
  "assignment_reference": "<current-assignment-uuid>"
}
```

Fleet returns `{success:true,outcome:"renewed",data:<complete snapshot>}` with the same source/assignment, a higher version and a different unexpired URL. Haven commits it atomically. No timer or background job renews tokens. Double clicks reuse the pending command. Uncertain retries retain the same ID/version/assignment even when a callback arrives first. Leases/backoff prevent parallel sends; after eight attempts coordinate manually. Invalid ACKs/changed assignments require coordination. Fleet rejects revoked/terminal rides and revokes the old token. Guests must share the replacement link again.

Fleet supplied the complete DELETE revocation contract and published revision `3cf85b5b193d2953a183fd0656678284646b1abf`. Haven's adapter is now implemented and locally verified; hosted release and real Fleet joint testing remain pending.

## Permanent tracking withdrawal

Guest sharing withdrawal atomically saves a revocation operation for each attempted leg. The pickup-profile API then attempts delivery only when the connection is enabled. With connection off or an outage, the saved withdrawal remains visible for Front Desk follow-up; a local save is not a claim that Fleet already invalidated its public URL. No-attempt prepared legs need no remote DELETE.

Front Desk → Pickup & Fleet → **Revoke shared link** → **Confirm revocation** permanently withdraws public tracking for one leg. **Retry tracking withdrawal** reuses its saved version after a failure. A429 honors `Retry-After`. A409 stores the current snapshot/version and stops sending: review the current ride with Fleet, then use **Review and revoke link** and explicitly confirm that version. A coordination note alone does not resolve the conflict.

The wire is `DELETE .../source/{externalRequestId}/tracking` with exactly `{expected_request_version:<saved integer>}`, no event ID/Idempotency-Key or browser Origin. A lost response retries the same body; `already_revoked` may return a newer current snapshot. If the original create ACK was lost and no version is known, Haven first performs authenticated source lookup and saves that version before the first DELETE; it never guesses or silently advances a409 conflict. Response evidence and operation state commit atomically. Leases/backoff and an eight-attempt bound prevent parallel/unbounded retries.

Pending or completed withdrawal hides cached tracking and prevents renewal, including after re-consent or a higher-version assignment callback. A successful receipt requires a matching complete snapshot with `tracking:null`. Fleet is responsible for actually invalidating the public token. Local transport/stay cancellation still requires provider coordination; this adapter does not send a Fleet booking cancellation or implement general source reconciliation. Automatic fare posting remains deferred.

## Hosted production configuration

The hosted Haven database includes the Fleet migrations and `20261120030000` for confirmed fares. Set the following in Haven's production environment and redeploy.

| Haven setting | Value |
|---|---|
| `HAVEN_FLEET_MODE` | `production` |
| `HAVEN_FLEET_CONTRACT` | `fleet-haven-2026-11-06` |
| `HAVEN_FLEET_CREATE_URL` | Fleet's approved [HTTPS intake](https://fleet-transpo.vercel.app/api/integration/transport-requests) |
| `HAVEN_FLEET_TRACKING_ORIGINS` | Approved Fleet HTTPS tracking origins when the partner sends tracking URLs |

Provision three distinct server-only credentials of at least 32 characters.

| Haven variable | Issuer / purpose |
|---|---|
| `HAVEN_FLEET_OUTBOUND_KEY` | Fleet-issued credential. Its Fleet setting is `HAVEN_WEBHOOK_SECRET`. |
| `HAVEN_FLEET_CALLBACK_KEY` | Haven-issued credential for status callbacks. Fleet sets it as `HAVEN_STAGING_API_KEY`. |
| `HAVEN_FLEET_PHOTO_KEY` | Separate Haven-issued credential. Fleet sets it as `HAVEN_PICKUP_PHOTO_SIGN_TOKEN` for pickup-photo signing. |

The old shared `HAVEN_FLEET_INBOUND_KEY` is ignored. Swapping callback/photo keys fails authorization. Fleet has accepted Bitwarden Send Text: separate password-protected Send per credential,24-hour expiry/deletion,max access1, private verified-recipient delivery and password via a separate verified channel. No actual Send/key has been generated or exchanged here.

Fleet's published revision `3cf85b5` enables the Haven connector on the hosted deployment
with `HAVEN_PMS_ENABLED=true` and `HAVEN_HOSTED_TEST_ENABLED=true`. Its Haven callback sender
uses `HAVEN_STAGING_API_URL` for [Haven's HTTPS origin](https://haven-hotel-management-ten.vercel.app)
and the credential listed above. Those are the names used by Fleet's current code.
Haven itself runs with `HAVEN_FLEET_MODE=production`.

Use a designated QA reservation and a coordinated window on the existing hosted projects.
Before dispatch, check that the deployed Haven callback requires authentication. Front Desk
prepares and sends the QA pickup after Fleet is ready. Keep the QA stay open throughout posting.
Fleet completes the test trip, then an authorized Fleet operator records the final fare.
Fleet resends the resulting snapshot with the exact event ID and body. Front Desk confirms
the fare and retries the same confirmation.
The guest folio should contain one transportation line and reflect the fare exactly once.

## Manual checks on the existing hosted test deployments

1. Guest → Transportation → Passenger details. Confirm account name/phone/email prefill. Leave photo empty; save preferences, luggage/notes and permission. Reopen and check values. Repeat with an optional photo.
2. Front Desk reviews the request, opens Pickup & Fleet and prepares it. With connection off, sends/renewals stay unavailable and no request leaves Haven.
3. Send the approved test ride. For a round trip verify both legs, one Fleet request per external ID, contact preferences, route and time. Retry any uncertain delivery using the saved request.
4. Assign a real Fleet driver/vehicle. Guest refresh shows current driver/plate. Track opens Fleet's page; Share passes the same URL through the device share sheet or clipboard fallback. Public tracking needs no staff login. Check actual GPS timestamps/expiry with Fleet.
5. Explicitly renew. Verify guest gets the new URL, the old public URL stops working at Fleet, and nothing renews automatically. Test callback-first/lost-response retries, reassignment and revoked/terminal rides. Old callbacks must not restore previous assignments.
6. Signing succeeds only for the current request/photo/version/assignment. Wrong leg, stale refs, replacement/removal or withdrawal fail. Confirm approved image origin and lifetime ≤120 seconds.
7. Turn guest sharing off and confirm both attempted legs show queued/confirmed withdrawal. Retry a deliberately lost DELETE response using the original version. Change the Fleet version before an initial revoke; verify409 requires explicit review/confirmation. Confirm revoked URLs remain unusable through reassignment/re-consent and cannot renew. Exercise Fleet cancellation/completion and confirm public URLs return404. Also test Front Desk's one-leg revoke, photo-signing denial after consent withdrawal, and permission denial for Guest/Manager direct staff actions.
8. Send fare evidence and verify the folio has zero transportation charges before Front Desk confirmation. Confirm the fare, replay the callback and retry confirmation. Verify one charge and the expected balance. Record the result.

Local automated/browser results are in the Codex session note. Synthetic Fleet/storage and emulated mobile QA do not replace real partner, physical device or OS share-sheet acceptance.
