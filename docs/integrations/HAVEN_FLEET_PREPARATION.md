# Haven Fleet preparation

Updated locally 13 November 2026 from Fleet's attached [6 November schema](contracts/fleet-haven-2026-11-06.schema.json) and [complete acceptance sample](contracts/examples/acceptance.json). Connection stays **off**, tracking origins blank, hosted rollout on hold. PayMongo and automatic fare posting remain deferred. Earlier proposal documents are historical examples.

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

Front Desk → Transportation → Pickup & Fleet → active leg → **Renew tracking link**. Guest/Manager/Owner cannot execute it. It is unavailable without staging and an approved tracking origin. Haven saves a durable command before sending:

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

## Release prerequisites

These four migrations remain local and unapplied to hosting in this session: `20261105010000`, `20261105020000`, `20261113010000`, `20261113020000`. Live ledger checked read-only before numbering:118 applied, latest `20261111050000`. Official Supabase scoped dry-run lists exactly these four files; no migration was applied. An authorized release must use `supabase db push`, never `npm run migrate`.

Keep `.env.local` unchanged. Defaults are `HAVEN_FLEET_MODE=off`, blank contract/create URL/directional keys/tracking origins. Approved staging selects `HAVEN_FLEET_CONTRACT=fleet-haven-2026-11-06`, an exact HTTPS intake, distinct securely exchanged test credentials and Fleet's actual approved tracking origin. No production mode exists.

The internal `staging` setting means controlled joint testing on the existing deployments; no second hosted project is required. Three distinct server-only keys, each at least32 characters, are now mandatory:

| Haven variable | Issuer / purpose |
|---|---|
| `HAVEN_FLEET_OUTBOUND_KEY` | Fleet-issued credential for Haven→Fleet API calls |
| `HAVEN_FLEET_CALLBACK_KEY` | Haven-issued credential for Fleet status callbacks |
| `HAVEN_FLEET_PHOTO_KEY` | Separate Haven-issued credential for pickup-photo signing |

The old shared `HAVEN_FLEET_INBOUND_KEY` is ignored. Swapping callback/photo keys fails authorization. Fleet has accepted Bitwarden Send Text: separate password-protected Send per credential,24-hour expiry/deletion,max access1, private verified-recipient delivery and password via a separate verified channel. No actual Send/key has been generated or exchanged here.

The existing Fleet/Haven HTTPS addresses and Fleet revision/revocation contract are supplied. Revocation and separate callback/photo authentication are locally implemented and tested. Still required: Haven route/migration deployment (last hosted probes404), verified hosted image origin, actual secure credential exchange, agreed test window, joint browser/device tests and authorized Front Desk/Fleet/Accounting sign-off. See [hosted readiness](FLEET_HOSTED_READINESS_2026-11-13.md). Automatic fare posting requires a separate approved accounting adapter/schema.

## Manual checks on the existing hosted test deployments

1. Guest → Transportation → Passenger details. Confirm account name/phone/email prefill. Leave photo empty; save preferences, luggage/notes and permission. Reopen and check values. Repeat with an optional photo.
2. Front Desk reviews the request, opens Pickup & Fleet and prepares it. With connection off, sends/renewals stay unavailable and no request leaves Haven.
3. In approved staging, send both legs. Verify one booking per external ID, contacts/preferences/luggage/notes, route and time. Retry an uncertain delivery: no duplicate booking.
4. Assign a real Fleet driver/vehicle. Guest refresh shows current driver/plate. Track opens Fleet's page; Share passes the same URL through the device share sheet or clipboard fallback. Public tracking needs no staff login. Check actual GPS timestamps/expiry with Fleet.
5. Explicitly renew. Verify guest gets the new URL, the old public URL stops working at Fleet, and nothing renews automatically. Test callback-first/lost-response retries, reassignment and revoked/terminal rides. Old callbacks must not restore previous assignments.
6. Signing succeeds only for the current request/photo/version/assignment. Wrong leg, stale refs, replacement/removal or withdrawal fail. Confirm approved image origin and lifetime ≤120 seconds.
7. Turn guest sharing off and confirm both attempted legs show queued/confirmed withdrawal. Retry a deliberately lost DELETE response using the original version. Change the Fleet version before an initial revoke; verify409 requires explicit review/confirmation. Confirm revoked URLs remain unusable through reassignment/re-consent and cannot renew. Exercise Fleet cancellation/completion and confirm public URLs return404. Also test Front Desk's one-leg revoke, photo-signing denial after consent withdrawal, and permission denial for Guest/Manager direct staff actions.
8. Send fare/correction evidence. Accounting confirms no automatic transport charge appears in the folio. Record joint results and sign-off.

Local automated/browser results are in the Codex session note. Synthetic Fleet/storage and emulated mobile QA do not replace real partner, physical device or OS share-sheet acceptance.
