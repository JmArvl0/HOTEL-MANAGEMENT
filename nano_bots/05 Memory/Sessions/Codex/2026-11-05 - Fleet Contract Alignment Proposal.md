# Fleet contract alignment proposal — 2026-11-05

User supplied Fleet's coordination response reporting locally implemented APIs
with flat guest fields, round_trip_reference/lowercase leg_kind, wrapped data ACK
using HAVEN/fleet_request_id, and assignment.driver_name callbacks. These are
partner-reported local facts, not independently verified deployment evidence.

Fetched public main in the clean ignored Fleet review clone. FETCH_HEAD and
origin/main remain bf752a850eb40cd179fbea52ac0e3cc4c4d1843a. Reported round-trip/
leg/ride-acceptance additions were not found in that public integration source.
No Fleet source edits or application/hosted requests were performed.

Verified current Haven code still uses nested traveler, PMS/plain ACK and
driver.name/fleet_reference. Photo endpoint currently validates only request and
photo references, not supplied assignment_reference/photo_version. No runtime
normalizer or tighter photo binding was implemented in this documentation turn.

Delivered docs/integrations/FLEET_HAVEN_ALIGNMENT_PROPOSAL.md: four complete
proposed JSON examples (create, wrapped ACK, callback, stricter photo request),
mapping table, optional-photo removal/version and luggage/note limits, approved-
origin gate, controlled renewal/revocation proposal, and unresolved freeze gate.
Unspecified flat guest/luggage/plate/tracking spellings are explicitly proposed,
not asserted to match Fleet's unpublished implementation. Linked the proposal
from the earlier Fleet instructions so those older examples are not mistaken
for an accepted new wire contract.

Mechanically parsed all four JSON examples and verified common original source
identity, Fleet reference, assignment binding and no-photo semantics. This was a
documentation consistency check, not a runtime/integration test. No app tests,
build, migration, deployment, secret exchange or partner message was run/sent.

Next: obtain Fleet's actual latest schemas/commit or corrections/approval of the
three main examples; implement/retest Haven adapter, assignment-bound photo
signing and accepted renewal/revocation protocol. Contacts, staging host/image
origin, secure channel, actual two-system QA and sign-off remain pending. Keep
connection off and tracking allowlist blank. Fare posting and PayMongo deferred.
