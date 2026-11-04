# Restaurant charge-to-room contract proposal

Status: NOT IMPLEMENTED. Proposed Haven-side contract, 4 November 2026. No external
POS specification, partner identity, credentials or sandbox has been supplied.
Resolve the decisions below with the Restaurant and Finance teams before building
runtime endpoints or provisioning persistent access.

## Intended flow

Restaurant requests permission to charge a known stay. Haven returns a stable stay
reference and minimal confirmation details. Restaurant submits its sale reference;
Haven atomically validates the current stay and records one folio charge. Staff and
the guest see the result through existing folio views. A prior lookup is advisory:
checkout, room moves and concurrent submissions can happen before posting.

Proposed endpoints (these routes do not exist yet):

- `POST /api/integrations/restaurant/stays`: authenticated room/stay lookup; minimal
  match confirmation, eligibility and a stable stay reference. Never return an
  unrestricted guest list, DOB, identity evidence, restricted flags or folio history.
- `POST /api/integrations/restaurant/folio-charges`: accepts the confirmed stay
  reference, sale ID and amount. It must never infer the bill from room number alone.

Example request fields, with the stay reference obtained from the synthetic lookup:

```json
{
  "externalTransactionId": "POS-QA-0001",
  "amountMinor": 185000,
  "currency": "PHP",
  "description": "Restaurant dinner",
  "occurredAt": "2026-11-04T12:30:00+08:00"
}
```

`amountMinor` is an integer number of centavos: 185000 means PHP 1,850.00. A complete
posting request also requires the server-issued stay reference. The example is a
field illustration, not an executable call against a real guest. An authenticated
partner identity supplies the source/outlet; client labels never grant permissions.

## Required behavior

1. Machine authentication is scoped to the agreed outlet and capabilities. Staff
   sessions/service-role keys are not shared with POS; a machine never impersonates
   Front Desk. Missing, revoked or disabled partner identities fail before a lookup
   or mutation. Decide the actual authentication method with the partner.
2. Validate amount, currency, timestamp, identifier and text limits in the server
   and database. PHP is the initial proposed currency; maximum amount and tax evidence
   need agreement. Never trust a room match or browser-supplied balance as authority.
3. Lock/recheck the stable stay and existing financial authority within the posting
   transaction. Only an eligible in-house stay can receive a new charge. Checkout
   and posting must serialize so a charge cannot be added to an already closed stay.
   Use reservation linkage after moves; room-only requests cannot redirect a charge.
4. Uniquely bind partner/outlet + external transaction ID. Same ID and equivalent
   normalized payload returns the original charge/result, even after a later checkout;
   an identical retry is not a new posting. Different payload with the same identity
   returns a conflict. Concurrent duplicates result in one charge and invoice effect.
5. Use the existing folio/invoice calculation, audit and operating-day locks. Store
   source occurrence time separately from the server-owned current posting day.
   Closed-day timestamps do not authorize backdating. Retries never reprice a stay.
6. Return a stable hotel charge/reference, accepted amount/currency and posting date.
   Distinguish a new acceptance from an idempotent replay. Invalid input is 400;
   missing/invalid identity 401; scope denial 403; stale/ineligible/conflicting charge
   409; database unavailable 503. Exclude raw SQL errors and secrets from responses.
7. POS may request a cancellation/correction; Accounting retains the existing authority
   to post a linked reversal. Corrections are append-only/audited; preserve the original
   external reference and never delete settled history or grant general refund access.
8. A POS sale and a Hotel collection are separate events. Agree with Finance which
   system supplies revenue and which supplies guest receivable/settlement information.
   Do not export the same sale twice as new revenue.
9. For required outgoing acknowledgment/reversal events, insert the event alongside
   the financial change in one database transaction. A bounded worker sends retries
   with backoff, records acknowledgments and exposes actionable failures. Receivers
   deduplicate event IDs. Multiple destinations need independent delivery records;
   no event broker or unrelated adapters are required for a single partner.

## Acceptance cases for implementation

- Authorized charge appears once on staff and guest folios, with the correct balance.
- Missing/disabled identity and unauthorized outlet cannot discover guest details.
- Invalid currency, fractional centavos and out-of-range amounts are rejected.
- Concurrent duplicate submissions create one charge; changed-payload retry conflicts.
- A lookup followed by checkout cannot authorize a later new charge; exact replay
  returns the original acknowledgment without mutation.
- Room move keeps the charge on the intended stay. Unknown or ambiguous room match
  requires staff confirmation and does not expose another guest's identity.
- Failed transaction leaves neither charge nor outgoing event. Sender failure leaves
  a committed event retryable, and duplicate delivery has one receiving effect.
- Accounting correction keeps the original charge and linked reversal visible.
- A past source timestamp posts on the current open operating day; an audit close
  cannot race a financial posting into the wrong snapshot.
- Real partner sandbox completes an end-to-end round trip. A synthetic local sender
  is labeled simulation and cannot satisfy this final partner acceptance case.

## Inputs needed from partner teams

Confirm POS/outlet identity and contact, request/response schemas, authentication and
revocation, sandbox URLs, amount/tax limits, guest verification/consent at the outlet,
offline sales, closed-folio disputes, correction approval, retry/ordering behavior,
event receiver availability, reconciliation and outage support. Record agreed
decisions before enabling routes or choosing a production migration timestamp.
