# Existing-host joint-test readiness — 13 November 2026

**Local follow-up complete:** separate callback/photo authentication and durable
remote-revocation handling are implemented locally, including409 review, lost-
response replay, first-version lookup and permanent local tracking withdrawal.
Migration20261113020000 is unapplied.137-migration replay/24 existing SQL cases,
Fleet SQL26+14+17+16, focused114/5, full2522/241, typecheck/build/lint0 and real
local Edge light/dark320px/off-mode checks pass using synthetic Fleet/storage.
The four-file scoped Supabase dry-run passed; no remote migration/deployment.
No real credential or Send was generated. Fleet accepted the sharing method.
See the latest Codex session and `HAVEN_FLEET_PREPARATION.md` for manual checks.


Use the existing deployments, as requested by the user. A separate staging
website/project is not required. Integration activation remains disabled until
both teams confirm readiness and agree a synthetic-booking test window.

## Confirmed addresses and contact

- Fleet base/tracking origin: `https://fleet-transpo.vercel.app` (supplied by Fleet).
- Fleet intake: `https://fleet-transpo.vercel.app/api/integration/transport-requests`.
- Haven base: `https://haven-hotel-management-ten.vercel.app` (confirmed by user).
- Intended Haven callback:
  `https://haven-hotel-management-ten.vercel.app/api/integrations/fleet/transport-status`.
- Intended photo signing:
  `https://haven-hotel-management-ten.vercel.app/api/integrations/fleet/pickup-photo`.
- Haven technical contact: **Lead Programmer**. Role confirmed; actual recipient
  identity/contact must be verified privately before exchanging credentials.
- Local configured image-origin candidate:
  `https://vztkkugkvqjghftnlxxr.supabase.co`. This is not yet a verified hosted
  photo-signing origin; confirm production configuration and a signed test image.

## Read-only verification performed

- Fleet `/api/health`: HTTP200, `ok:true`, service `fleetops-web`.
- Fleet original-source GET without authorization: HTTP401. No credential sent.
- Fleet public tracking API with a known synthetic invalid64-hex token: HTTP404.
- Git remote HEAD/main equals
  `3cf85b5b193d2953a183fd0656678284646b1abf`. Fetched that exact public commit
  into the existing disposable review clone without checking out/changing its
  worktree. Reviewed wire/status/photo/renew/revoke implementations.
- Fleet reports migrations173–180 applied and this revision deployed. Its hosted
  health response does not expose a revision or migration ledger, so these two
  deployment claims were not independently proven from health alone.
- Haven homepage: HTTP200. Both intended Fleet integration paths: HTTP404 on
  unauthenticated GET and empty unauthenticated JSON POST probes. No valid event,
  photo link, ride creation, token renewal/revocation, credential exchange,
  deployment or configuration change was performed.
- Source-hash metadata in the older supplied schema matches5/11 referenced files
  in this public commit. Six implementations changed; the attachment remains
  preserved verbatim and must not be described as an exact deployed-source hash
  manifest. Current request/wrapped-success shapes and revocation code reviewed.

## Received revocation contract

```text
DELETE /api/integration/transport-requests/source/{externalRequestId}/tracking
Authorization: Bearer <Fleet-issued Haven credential>
Content-Type: application/json
```

```json
{"expected_request_version":4}
```

Use the original **specific leg** external ID. Allowed characters are letters,
digits, `.`, `_`, `:`, `-`, length1–255; literal `.`/`..` forbidden. Body contains
exactly the one integer field, range1–2147483647. No event ID or idempotency
header is required. Do not reuse the renewal command body here.

- HTTP200: `success:true`, `outcome:revoked|already_revoked`, complete current
  HAVEN snapshot under `data`, `tracking:null`. Clear saved public URLs.
- Lost result: repeat the **same** DELETE/version. An already committed revoke
  returns the **current** snapshot with `already_revoked` even if the original
  version is older. Do not require immutable response bytes for this operation.
- HTTP409: `success:false`, `code:REQUEST_VERSION_CONFLICT`,
  `outcome:version_conflict`, current snapshot in `data`. Review current version
  and intent before resubmitting; do not blindly advance the version.
- HTTP400: fix malformed JSON, invalid ID/body. HTTP401: check dedicated
  credential/enabled state. HTTP403: use server-to-server requests; do not send
  a disallowed browser Origin. HTTP404: check the original request identity.
- HTTP429/500: delayed retry of same request; honor `Retry-After` on429.
- Fleet says revocation persists through reassignment, renewal returns409
  `sharing_revoked`, and cancellation/completion invalidate tokens. A current-
  version revoke can record terminal-leg withdrawal. Invalidated public URLs
  return404. These lifecycle claims still need joint testing with valid records.

## Haven gaps before joint testing

1. Deploy the locally prepared Fleet routes and authorized additive migrations
   to the existing Haven project. Hosted paths currently return404.
2. Remote revocation is now implemented and locally tested; deploy it before
   claiming hosted token invalidation. Disabled/outage operations stay pending.
   Real Fleet public-token invalidation still needs joint testing.
3. Callback/photo keys are now split in local code. Provision three distinct
   credentials privately after deployment preparation; no actual keys were
   generated or exchanged in this session.
4. Privately exchange credentials, confirm actual hosted image origin, configure
   the exact approved Fleet origin, and agree a test window. Do not activate from
   this note. Run hosted joint tests before declaring readiness for real guests.

No automatic fare posting or PayMongo. The original read-only review below is
historical; the latest local implementation/testing is summarized above. None
of these local checks establishes hosted partner acceptance.

## Chosen credential-sharing method

The user delegated the channel choice. Propose **Bitwarden Send, Text**, with a
password,24-hour expiration/deletion and maximum access count1. Send the link
privately to the verified receiving Lead Programmer; communicate its password
over a separate verified channel. Each direction/purpose gets a separate Send.
Recipient verification is a human step; a link/access-count limit does not bind
the recipient's identity. Fleet has accepted this channel. Verified private recipient details are still needed.

Text Sends support encrypted sharing, password protection and lifespan/access
limits; see [Bitwarden Create a Send](https://bitwarden.com/help/create-send/)
and [Send Privacy](https://bitwarden.com/help/send-privacy/). No account, Send,
credential or secret link was created or exchanged in this session. Never paste
credential values, Send links or their passwords in repo notes or this chat.
