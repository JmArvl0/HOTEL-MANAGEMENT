# Shared inventory and guest-hold expiry

November 25, 2026 · Disposable local property

Seven checks exercised the real guest-hold and Front Desk booking endpoints,
the eligible-room and assignment endpoints, and the guest review page in Edge.
PostgreSQL confirmed the successful claims stayed within room capacity. The
checks covered both type-only and exact-room holds, plus requests before,
after, and across the expiry timestamp.

## Setup

The run reused the local Next.js production build verified for FD-API-002,
with Node 22.22.2, local PostgREST, and a disposable PostgreSQL clone. Six
synthetic guest accounts and six synthetic Front Desk accounts signed in
through NextAuth. The guest hold route used synthetic checkout-readiness
configuration. The Next.js fixture blocked non-loopback fetches and recorded
zero attempts. The browser also blocked non-loopback requests.

For controlled races, a fixture connection briefly held the same room-type
advisory lock used by the application. A separate PostgreSQL connection
observed both channels waiting before the fixture released it. For expiry
checks, the fixture moved only the synthetic hold's expiry timestamp to
three seconds ahead and waited for the database clock. The application
continued to evaluate the real hold status and expiry timestamp.

## Local outcomes

| Check | Observed outcome |
| --- | --- |
| Last-room race | Four guest-versus-desk races each produced one HTTP 201, one HTTP 409 and one persisted claim. Guest holds won when queued first, and desk bookings won when queued first. Both orders passed for type-only and exact-room holds. |
| Mixed burst | Six guests and six desk operators competed for four rooms. Four desk bookings committed with four invoices and eight requests received capacity conflicts. PostgreSQL observed both channels waiting on the shared lock. |
| Live hold, expiry and recovery | Staff availability was zero while the exact hold was live, and a desk booking received 409. Replaying the live guest attempt returned the original hold. When its timestamp elapsed, availability rose to one while its stored status still read active. The old attempt returned `HOLD_ATTEMPT_EXPIRED` and the desk retry created one reservation and invoice. |
| Guest recovery in Edge | The guest review showed “Your reservation hold expired”. The Search rooms link kept the original dates. Opening the review marked the hold expired. A later cleanup sweep had zero rows left to expire. |
| Fresh race after expiry | A new guest attempt and the desk request both reached the room-type lock for the reclaimed unit. One desk booking and invoice committed. The guest request received the capacity conflict. |
| Requests queued across expiry | Both requests began while the old hold was live and left the lock after expiry. Both returned 409 on that attempt. A fresh desk retry then booked the free unit. This verifies the retry case when the PostgreSQL transactions begin before the expiry timestamp. |
| Exact-room protection | With two rooms, an exact guest hold and an unassigned desk booking both succeeded. The assignment write rejected the held room and accepted the other room. The exact hold stayed active on the guest-selected room. |
| Payment isolation | The fixture added zero payment rows and converted zero guest holds. The test issued zero payment endpoint POSTs. |

The first fixture run expected an explicit expiry sweep to update the row
after opening guest review. Guest review had already expired the hold. The
confirmed run checks the stored status immediately after review and verifies
that a subsequent sweep is a no-op.

Targeted Vitest passed 67 tests across five files covering booking,
availability, staff reservations, booking error responses, and availability
UI state. The full build and typecheck are recorded in the FD-API-002
verification for the same local application bundle.

## Confirmed follow-up

**FD-API-003 · Exact guest hold appears in the staff eligible-room list (P2).**
In the two-room case, the eligible-room endpoint listed both rooms, including
the room with an active exact guest hold. Assigning that room returned
HTTP 409 with “Unable to assign room” and left the reservation unassigned.
Assigning the second room worked. The final assignment trigger protected
the hold.
[Eligible-room query](../../../supabase/migrations/20260919010000_room_assignment_exception_inventory.sql) ·
[Exact-room assignment guard](../../../supabase/migrations/20261111010000_guest_exact_rooms.sql)

### FD-API-003 local fix · 2026-11-26

The shared eligibility rule excludes live, overlapping, unconverted exact
guest holds. The assignment trigger checks again under the room-type lock.
If a guest held the room after the list loaded, the assignment endpoint
returns HTTP 409 with `ROOM_HELD_FOR_GUEST`. The reservation dialog shows
the explanation above its action buttons, where the receptionist can
reopen the room list.

The PostgreSQL regression created an exact hold after listing two rooms,
confirmed the alternate room stayed eligible, and verified that the failed
write left the reservation unassigned with zero active assignments. The
held room returned and the write succeeded after its timestamp elapsed,
while the hold row still had status `active`.
[Migration](../../../supabase/migrations/20261126010000_front_desk_exact_hold_eligibility.sql) ·
[Database regression](../../../scripts/front-desk-exact-hold-db-test.mjs)

| Local verification | Result |
| --- | --- |
| Stale selection in Edge | A guest placed the exact hold after Front Desk opened the room picker. Submitting it returned HTTP 409 and showed the message above the action buttons in light mode at 1366 × 768 and dark mode at 1280 × 720. No assignment or assignment audit was written. |
| Reopened room picker | The list dropped from nine rooms to eight, with other eligible rooms available. |
| Expiry and retry | The list returned to nine while the hold still read `active` in PostgreSQL. Assigning the original room returned HTTP 200 and wrote one active assignment and one audit entry. |
| Inventory controls | Type-only and adjacent holds left the room list intact. A synthetic `payment_submitted` exact hold hid only its room. An inactive exact hold released it. |
| Shared inventory regression | All seven mixed-channel, expiry and isolation checks passed. The fixture recorded zero payments, payment endpoint POSTs or hold conversions. |

The browser fixture shortened the hold deadline to two seconds and waited
for PostgreSQL's clock to pass it. Typecheck, the local production build
and all 2,754 Vitest tests passed. ESLint found four existing dashboard
warnings and zero errors.

[Follow-up machine-readable evidence](evidence/post-audit/front-desk-exact-hold-assignment.json) ·
[Light workspace capture](evidence/post-audit/1366x768-exact-hold-conflict-light.png) ·
[Dark workspace capture](evidence/post-audit/1280x720-exact-hold-conflict-dark.png)

### Guided check-in and room changes · 2026-11-26

Edge at 1366 × 768 used authenticated Front Desk and guest sessions over a
disposable PostgreSQL database. In each workflow a guest placed an overlapping
exact hold after Front Desk selected or loaded the room. PostgreSQL rejected
both stale requests with `EXACT_ROOM_UNAVAILABLE`. Refreshing the picker hid
the held room and kept the alternate. The fixture shortened each hold to two
seconds and waited for the database clock. Both pickers offered the room again
while the expired hold row still had status `active`.

| Workflow | While the hold was live | After expiry |
| --- | --- | --- |
| Guided check-in | The stale submit returned HTTP 409. The reservation stayed confirmed and unassigned, with zero check-in audit writes. The picker went from three rooms to two. | The picker returned to three. Check-in returned HTTP 200 and wrote one active assignment and one check-in audit entry. The selected room became occupied. |
| Same-type room change | The stale submit returned HTTP 409. The original room, active assignment, folio and turnover state were preserved. The replacement picker went from two rooms to one. | The picker returned to two. The move returned HTTP 200. The original assignment closed on the hotel date, the replacement started on that date, and one turnover task and one move audit were written. |

**FD-API-004 baseline · Generic stale hold feedback (P3).** The guided check-in
and room-change endpoints both returned `REQUEST_409`. The wizard showed “Unable to
complete check-in.” The room-change API returned “Unable to change rooms.”
Neither message identified the temporary guest hold. Returning to the room
step and refreshing, or reopening the replacement picker, recovered the
current inventory.

All three local scenarios and 51 targeted Vitest tests passed. The fixture
recorded zero payment requests, payment rows or hold conversions.
[Check-in and room-change evidence](evidence/post-audit/front-desk-exact-hold-checkin-and-move.json)

### FD-API-004 local fix · 2026-11-26

Guided check-in and room changes now use the same `ROOM_HELD_FOR_GUEST`
HTTP 409 response as pre-assignment. The explanation appears above the
dialog actions. Guided check-in returns to the room step and clears the
held selection. Room changes retain a **Refresh eligible rooms** action
even when the refreshed list has no replacements.

In Edge, both pickers excluded the held room while its hold was live and
offered the same room after its deadline, before cleanup changed the hold
row. Both retries returned HTTP 200. The rejected requests wrote no
assignment changes. The successful room move recorded one turnover task
and one audit entry. The fixture used an isolated database, with zero
payment endpoint requests, payment rows or hold conversions.

Five browser and database checks passed, including pre-assignment regression.
The alert was visible in guided check-in at 1366 × 768 in light mode and
room changes at 1280 × 720 in dark mode.

Typecheck, the local production build, and all 2,756 Vitest tests passed.
ESLint reported zero errors and four existing dashboard warnings.
[Follow-up evidence](evidence/post-audit/front-desk-exact-hold-feedback.json) ·
[Guided check-in capture](evidence/post-audit/1366x768-guided-check-in-hold-feedback-light.png) ·
[Room-change capture](evidence/post-audit/1280x720-room-change-hold-feedback-dark.png)

### Manager-approved room-type exceptions · 2026-11-26

The local fixture exercised a hotel-caused arrival exception for an
unserviceable reserved room. Separate Front Desk, Manager and guest sessions
used the live local APIs. Front Desk completed guided check-in in Edge at
1366 × 768. Each stage used a separate exact hold on the requested room
and waited for the database clock to pass a shortened two-second deadline.

| Stage | While the hold was live | After expiry |
| --- | --- | --- |
| Front Desk request | The held room disappeared from the target-room picker. The other room of that type remained eligible. Submitting the held room returned HTTP 409 and created zero approval rows. | The held room returned before cleanup. The same request returned HTTP 201 and created one pending approval. |
| Manager review | Approving the pending request returned HTTP 409. The version, requested room, financial snapshot and pending state stayed intact. A Front Desk attempt to approve returned HTTP 403. | The Manager retried the same request version and received HTTP 200. The approval moved to awaiting execution for the requested room. |
| Guided check-in | A hold placed after the review loaded produced a visible `ROOM_HELD_FOR_GUEST` conflict. The reservation and approval state stayed intact. Refreshing the approved picker returned zero rooms. A different room of the same type could neither replace the approved room in the picker nor pass check-in. | Refreshing returned the exact approved room before cleanup ran. Check-in returned HTTP 200, created one active assignment, marked the approval executed and preserved the original rate and folio. |

All four local checks and 50 targeted Vitest tests passed. The fixture
recorded zero payment endpoint requests, payment rows or hold conversions.
[Exception verification evidence](evidence/post-audit/front-desk-exact-hold-manager-exception.json) ·
[Live-hold alert](evidence/post-audit/1366x768-approved-exception-live-hold.png) ·
[Approved room after expiry](evidence/post-audit/1366x768-approved-exception-after-expiry.png)

### Guest-requested room-type upgrades · 2026-11-26

Front Desk requested a premium room for a synthetic arrival while the
original room type still had an eligible room. A separate Manager session
approved the exact room and the ₱420 difference on a ₱300 reservation.
Before guest acceptance, check-in returned
`ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED`.

**FD-API-005 · Front Desk acceptance blocked in migration replay (P2).**
In Edge at 1366 × 768, **Record guest acceptance** returned HTTP 409
with “Unable to record guest acceptance.” PostgREST reported PostgreSQL
`42501` on `record_room_type_change_acceptance(uuid,uuid)`. The migration
replay left `service_role` without `EXECUTE` on that function. The request
left the approval awaiting execution and wrote zero charges or payment rows.
Hosted role privileges require separate verification.

The follow-up used the underlying acceptance function from disposable database
test sessions with synthetic Front Desk actor IDs. Three calls reached the
same approval lock and all completed. A serial replay left one ₱420 upgrade
charge keyed to the approval and one acceptance audit entry. The folio total
was ₱720, with ₱420 due. The staff check-in API still required that balance
to be cleared.

The fixture seeded two offline ledger entries for the original stay and the
upgrade difference, then recomputed the balance. No payment endpoint or
provider was called. In Edge, a live hold blocked stale submission with
`ROOM_HELD_FOR_GUEST` and kept the approval awaiting execution. Refreshing
after expiry offered only the exact approved room, before cleanup ran.
Check-in returned HTTP 200 with one active assignment and one upgrade charge.
The reservation finalized at ₱720, the folio stayed settled, and the approval
was marked executed.

In this baseline run, the standard acceptance route failed. The underlying
acceptance, post-expiry check-in and payment-isolation checks passed.
All 76 targeted Vitest tests passed.
[Machine-readable evidence](evidence/post-audit/front-desk-guest-upgrade-exact-hold.json) ·
[Acceptance failure](evidence/post-audit/1366x768-guest-upgrade-acceptance-permission.png) ·
[Approved room after expiry](evidence/post-audit/1366x768-guest-upgrade-after-expiry.png)

### FD-API-005 local fix · 2026-11-26

The additive migration grants `EXECUTE` on the acceptance RPC to
`service_role`. The local fixture verified that `anon` and `authenticated`
still lacked execute access and that a signed-in guest received HTTP 403
from the staff route.
[Migration](../../../supabase/migrations/20261126020000_grant_room_type_change_acceptance.sql)

Front Desk clicked **Record guest acceptance** in Edge at 1366 × 768. The
click and three overlapping signed-in requests all reached the approval
lock and returned HTTP 200. A later replay from the same Edge session also
returned HTTP 200. The folio had exactly one ₱420 upgrade charge and one
acceptance audit entry. The total was ₱720 and the remaining balance was ₱420.

The real check-in API blocked the unpaid upgrade. After offline synthetic
settlement, a live exact guest hold blocked the stale room choice and kept
the approval awaiting execution. Refreshing after expiry offered the exact
approved room. Check-in returned HTTP 200, executed the approval, and left
the folio with one upgrade charge. The fixture used two synthetic ledger
entries and recorded zero payment endpoint requests or hold conversions.

All three local checks and 2,756 Vitest tests passed. Typecheck and the
local production build passed.

[Fix verification evidence](evidence/post-audit/front-desk-guest-upgrade-acceptance-fixed.json) ·
[Acceptance recorded in Edge](evidence/post-audit/1366x768-guest-upgrade-acceptance-fixed.png) ·
[Approved room after expiry](evidence/post-audit/1366x768-guest-upgrade-after-expiry-fixed.png)

### Manager-approved mid-stay room upgrades · 2026-11-26

A synthetic in-house guest requested a different room type. The Manager
approved the ₱560 difference. This is a move during an active stay, so
guest acceptance records consent and the approved move is expected to post
the charge to the folio once.

| Stage | Local result |
| --- | --- |
| Guest acceptance | The authenticated Front Desk endpoint returned HTTP 200. A replay preserved the same acceptance and one audit entry. Acceptance posted zero upgrade charges and kept the original room. The standard Approvals dialog in Edge at 1366 × 768 only offered execution. |
| Live exact hold | The shared eligibility endpoint excluded the held room. Submitting its room number in Edge returned HTTP 409. PostgreSQL reported `EXACT_ROOM_UNAVAILABLE`. The original assignment, approval, and folio stayed intact. |
| Execution after expiry and retry | The eligible list offered the room again after the two-second fixture deadline, before cleanup. The approved move and a retry both returned HTTP 409 with database reason `ROOM_TYPE_EXCEPTION_ROOM_CHANGED`. The approval remained awaiting execution. Both attempts left zero upgrade charges, zero move audits and zero turnover tasks. |

**FD-API-006 baseline · Initial check-in validator blocked in-house upgrades (P2).**
`validate_room_type_exception_check_in` ran when a checked-in reservation's
room type changed and looked for an arrival `room_type_exception` approval.
The in-house move had a `room_upgrade` approval, so validation failed and
rolled back the move even after guest acceptance and hold expiry.
[Check-in validator](../../../supabase/migrations/20260919010000_room_assignment_exception_inventory.sql)

**FD-UX-005 baseline · Mid-stay acceptance action missing (P2).** The Front Desk
approval dialog offered **Execute as Front Desk** for the approved move.
The guest acceptance action was available through the staff endpoint.
Edge showed no acceptance button on the mid-stay approval.

Two local checks passed and the post-expiry execution check failed. All
73 targeted Vitest tests passed. The fixture used one offline ledger entry
for the original stay and issued zero payment endpoint requests.
[Local evidence](evidence/post-audit/front-desk-midstay-upgrade-exact-hold.json) ·
[Approval actions in Edge](evidence/post-audit/1366x768-midstay-upgrade-approval-actions.png) ·
[Post-expiry attempt in Edge](evidence/post-audit/1366x768-midstay-upgrade-after-expiry-blocked.png)

### FD-API-006 and FD-UX-005 local fix · 2026-11-26

The validator uses the approval and authorized assignment for an in-house
`room_upgrade`. The exact-room rule for a `room_type_exception` still applies
at initial check-in. Front Desk can record guest acceptance directly in the
approved request dialog. The acceptance action is available for guest-paid
mid-stay upgrades with a positive difference.
[Migration](../../../supabase/migrations/20261126030000_validate_midstay_room_upgrade.sql)

| Check | Local result |
| --- | --- |
| Approval and consent | PostgreSQL rejected a direct type change without an approval and the staff API rejected execution before acceptance. In Edge, **Record guest acceptance** returned HTTP 200 and exposed **Execute as Front Desk**. Reopening showed the stored acceptance. Replaying acceptance left one audit entry and zero upgrade charges. |
| Live hold | Edge showed the guest-hold conflict in the approval dialog. The active room, folio and approval remained intact after HTTP 409. The held room stayed out of the eligible list. |
| After expiry | The room returned while the expired hold row still read `active`. The move returned HTTP 200, ended the prior assignment, created one active replacement assignment, and recorded one turnover task. The folio contained one ₱560 upgrade charge and a ₱960 total in this fixture. |
| Execution retry | The same execution request returned `APPROVAL_NOT_EXECUTABLE` after the committed move. The folio retained one upgrade charge and the approval retained one execution audit. |
| Arrival regression | The existing guest-requested check-in exception still recorded one acceptance charge, blocked a live exact hold, and executed only for the approved room after expiry. |

Three mid-stay checks and three arrival regression checks passed. The
acceptance action was verified in light mode at 1366 × 768 and the hold
alert in dark mode at 1280 × 720. The fixtures used offline ledger entries
and issued zero payment endpoint requests.

Typecheck, the local production build, and all 2,757 Vitest tests passed.
ESLint reported zero errors and four existing dashboard warnings.
[Machine-readable evidence](evidence/post-audit/front-desk-midstay-upgrade-fixed.json) ·
[Acceptance action](evidence/post-audit/1366x768-midstay-upgrade-acceptance-action.png) ·
[Live hold alert](evidence/post-audit/1280x720-midstay-upgrade-live-hold-dark.png) ·
[Executed approval](evidence/post-audit/1366x768-midstay-upgrade-executed-after-expiry.png)

### Hotel-caused mid-stay room upgrades · 2026-11-26

A Manager approved a hotel-caused move for a synthetic guest already in
house. The approved target type had a ₱560 price difference. Edge showed
**Hotel absorbs the difference** and exposed execution in the Front Desk
approval dialog. The acceptance endpoint returned `ACCEPTANCE_NOT_REQUIRED`.

| Check | Local result |
| --- | --- |
| Live exact hold | The held room was excluded from eligible inventory. Attempting the move in Edge returned HTTP 409 with the hold-specific message. The original room assignment, approval and folio were preserved. |
| Hold expiry and move | The fixture shortened the hold to two seconds and waited for PostgreSQL's clock. The room returned while the hold row still read `active`. The approved move returned HTTP 200, created one active replacement assignment, and wrote one turnover task and one execution audit. |
| Rate, folio and retry | Four nightly rates stayed at ₱100, with ₱400 agreed lodging. The existing ₱75 transport charge, ₱475 folio total, ₱400 already paid and ₱75 balance all stayed the same. PostgreSQL matched the full invoice, charge and payment rows before and after the move. A retry returned `APPROVAL_NOT_EXECUTABLE` and kept the same ledger, with zero guest upgrade charges. |

All three checks and 74 targeted Vitest tests passed. Edge used 1366 × 768
for the approval and move and 1280 × 720 in dark mode for the hold message.
The fixture contained one offline ledger entry and issued zero payment
endpoint requests.
[Hotel-caused upgrade evidence](evidence/post-audit/front-desk-hotel-caused-midstay-upgrade.json) ·
[Approved hotel-paid move](evidence/post-audit/1366x768-hotel-upgrade-approved.png) ·
[Live hold alert](evidence/post-audit/1280x720-hotel-upgrade-live-hold-dark.png) ·
[Executed approval after expiry](evidence/post-audit/1366x768-hotel-upgrade-executed-after-expiry.png)

### Manager-approved mid-stay downgrades · 2026-11-26

The synthetic guest was already checked in. A Manager approved a move to
a lower-priced type quoted at ₱240 for the stay, a ₱160 difference from
the agreed ₱400 lodging. The approval dialog in Edge displayed the
no-automatic-refund note and offered **Execute as Front Desk**.

| Check | Local result |
| --- | --- |
| Live exact hold | The room disappeared from eligible inventory. Edge returned HTTP 409 with `ROOM_HELD_FOR_GUEST`. PostgreSQL preserved the original room, approval and ledger. |
| Expiry and move | The fixture shortened the hold to two seconds and waited for PostgreSQL's clock. The room returned before cleanup updated the hold row. Edge submitted the move successfully with HTTP 200. PostgreSQL recorded one active replacement assignment, one execution audit, and one turnover task. |
| Folio, refund and retry | All four nightly rates stayed at ₱100. Agreed lodging stayed at ₱400, and the original ₱75 transport line, ₱475 folio total, ₱400 paid and ₱75 balance stayed intact. PostgreSQL matched the full invoice, charge and payment rows. The committed approval refused a retry with `APPROVAL_NOT_EXECUTABLE` and left zero refund requests, refund payments, financial adjustments, credit balance or new charges. |

All three checks and 73 targeted Vitest tests passed. Edge used 1366 × 768
for the approval and move and 1280 × 720 in dark mode for the live hold
message. The fixture used one offline ledger entry and issued zero payment
or refund endpoint requests.
[Downgrade evidence](evidence/post-audit/front-desk-manager-midstay-downgrade.json) ·
[Approval note](evidence/post-audit/1366x768-midstay-downgrade-refund-note.png) ·
[Live hold alert](evidence/post-audit/1280x720-midstay-downgrade-live-hold-dark.png) ·
[Executed approval](evidence/post-audit/1366x768-midstay-downgrade-executed-after-expiry.png)

### Manager-approved stay extensions with a room move · 2026-11-26

A future reservation in the guest’s current room prevented a two-night
extension. A Manager approved the extension at ₱200 with a same-type
room move. Front Desk opened the approval in Edge at 1366 × 768 and entered
the replacement room in the **Same-type room move required** dialog.

| Check | Local result |
| --- | --- |
| Live exact hold | A guest held the replacement room for the first added night. Edge showed the guest-hold message and execution returned HTTP 409 with `ROOM_HELD_FOR_GUEST`. The original assignment, checkout date, approval and folio stayed intact. |
| Expiry and move | The fixture shortened the hold to two seconds and waited for the PostgreSQL deadline. With the hold row still marked active, Edge executed the approval with HTTP 200. The guest moved to the same-type room and gained two nights. PostgreSQL recorded one active assignment and one turnover task. The future reservation in the original room stayed intact. |
| Folio and retry | The extension posted one ₱200 charge, bringing the folio from ₱275 to ₱475 and preserving the ₱75 transport line. Retrying the approval returned HTTP 409 with `APPROVAL_NOT_EXECUTABLE`. Retrying the extension using the same key returned the original receipt with HTTP 200. Both retries left one extension charge. |

All three scenario checks and 43 targeted Vitest tests passed. The isolated
fixture used one synthetic ledger entry and issued zero payment or refund
requests. The disposable database was removed and the local server was stopped.
[Extension evidence](evidence/post-audit/front-desk-approved-extension-exact-hold.json) ·
[Same-type room prompt](evidence/post-audit/1366x768-approved-extension-room-conflict.png) ·
[Live hold alert](evidence/post-audit/1366x768-approved-extension-live-hold.png) ·
[Executed approval](evidence/post-audit/1366x768-approved-extension-executed-after-expiry.png)

### Same-room stay extensions · 2026-11-26

Front Desk opened **Extend stay** from the in-house guest’s booking in Edge
at 1366 × 768. The guest requested two extra nights in their current room.
A separate guest had an exact hold on that room for the first added night.

| Check | Local result |
| --- | --- |
| Live exact hold | The assignment guard rejected the extension with `EXACT_ROOM_UNAVAILABLE`. The original checkout, room assignment and full folio stayed intact. The preview and error feedback reproduced FD-API-007. |
| Expiry | The fixture shortened the hold to two seconds and waited for its PostgreSQL deadline. The extension committed with HTTP 200 while the hold row was still marked active. The same assignment gained two nights, with one ₱200 extension charge and a final folio of ₱475. The existing ₱75 transport line and payment records stayed intact. |
| Retry | The browser fixture withheld the first successful response to simulate a lost confirmation. Front Desk clicked **Extend stay** again with the same details. Edge reused the request key, received the original result with HTTP 200 and showed success. PostgreSQL retained one extension charge, one receipt and one audit entry. |

The three workflow and isolation checks and 27 targeted Vitest tests passed.
The fixture issued zero payment or refund requests. The disposable database
was removed and the local server was stopped.
[Extension evidence](evidence/post-audit/front-desk-same-room-extension-exact-hold.json) ·
[Live hold feedback](evidence/post-audit/1366x768-same-room-extension-live-hold.png) ·
[Simulated lost confirmation](evidence/post-audit/1366x768-same-room-extension-recover.png) ·
[Retry confirmation](evidence/post-audit/1366x768-same-room-extension-confirmed.png)

#### FD-API-007 · Same-room extension hold feedback

**Original reproduction, P2.** In Front Desk **Bookings**, open an in-house stay with a
live exact hold on its current room for the first night after checkout.
Open **Extend stay**, request a checkout two days later and submit. Edge
shows **Room available** while the hold is active, then shows “Could not
confirm the extension. Retry with the same details.” The API returns HTTP
503 with `outcome: unknown` despite a confirmed rollback. The preview RPC
checks assignments and reservations but omits live exact holds. The submit
route leaves the assignment guard’s hold rejection unmapped.

Expected behavior is for the quote to identify the hold and for submission
to return a hold-specific conflict, including when a hold appears after the
quote. The dialog should let Front Desk retry the same dates after expiry.

**Verified fixed locally.** [Migration 20261126040000](../../../supabase/migrations/20261126040000_front_desk_extension_hold_preview.sql)
checks the assigned room for exact holds during the added nights. A separate
guest-hold status leaves the Manager exception available for the existing
reservation-conflict workflow. Local PostgreSQL tests verified the preview
permissions and excluded holds on other rooms and on the requested checkout
date.

| Check | Fixed result in Edge |
| --- | --- |
| Hold appears after preview | The available quote was followed by a new exact hold. **Extend stay** returned HTTP 409 with `ROOM_HELD_FOR_GUEST` and a specific explanation. Checkout, assignment and folio stayed intact. |
| Refresh while held | **Refresh availability** showed **Guest hold** while retaining the date and reason. Refresh sent only a preview request. The alert and refresh action were visible at 1366 × 768 in light mode and 1280 × 720 in dark mode. The alert measured 5.53:1 and 7.80:1 contrast. |
| Expiry and replay | The fixture shortened the hold to two seconds and waited for the database deadline. Refresh showed **Room available** while the hold row was still marked active. The next submit added two nights to the same assignment. After a simulated lost confirmation, the browser reused the key, recovered the receipt and kept one ₱200 extension charge. |

The local production build, typecheck, scoped ESLint, all 2,760 Vitest tests
and the three Edge and PostgreSQL scenario checks passed. The fixture issued
zero payment or refund requests. The disposable databases were removed.
[Fixed evidence](evidence/post-audit/front-desk-same-room-extension-hold-fix.json) ·
[Conflict after preview](evidence/post-audit/1366x768-same-room-extension-conflict-fixed.png) ·
[Held preview in dark mode](evidence/post-audit/1280x720-same-room-extension-held-preview-dark.png) ·
[Recovered confirmation](evidence/post-audit/1366x768-same-room-extension-complete-fixed.png)

### Manager-approved same-room extensions after the original conflict clears · 2026-11-26

The original room had a confirmed later booking on the added nights. The
direct extension was rejected, and a Manager approved the two-night extension
request. Front Desk reassigned the later booking through the normal assignment
API. Its dates and confirmed status were preserved. The live quote cleared the
reservation conflict while the approval retained its original snapshot.

| Check | Local result |
| --- | --- |
| Hold on the existing room | After the later booking was reassigned, a guest placed an exact hold for the first added night. **Execute as Front Desk** submitted without a replacement room. Edge showed `ROOM_HELD_FOR_GUEST` with HTTP 409. PostgreSQL preserved the approval, checkout date, assignment and complete folio. |
| Expiry and execution | The fixture shortened the hold to two seconds and waited for the PostgreSQL deadline. The hold row was still marked active when the same approval succeeded with HTTP 200. The guest added two nights to the original room and assignment. No turnover task was created. |
| Folio and retry | The extension added one ₱200 charge and preserved the ₱75 transport line. The folio total was ₱475. Repeating the approval request returned `APPROVAL_NOT_EXECUTABLE`, and retrying the extension with the approval key returned the existing receipt. PostgreSQL retained one extension charge, one receipt and one approval execution audit. |

All three scenario checks and 46 targeted Vitest tests passed. Edge used
1366 × 768. The fixture issued zero payment or refund requests. The disposable
database was removed and the loopback server was stopped.
[Scenario evidence](evidence/post-audit/front-desk-approved-in-place-extension-exact-hold.json) ·
[Approval awaiting execution](evidence/post-audit/1366x768-approved-in-place-extension-awaiting.png) ·
[Live hold alert](evidence/post-audit/1366x768-approved-in-place-extension-live-hold.png) ·
[Executed approval](evidence/post-audit/1366x768-approved-in-place-extension-executed.png)

#### FD-UX-006 · Room-list guidance on an in-place approval

**Original reproduction, P3.** In **Approvals & Escalations**, execute a Manager-approved
extension in place after the original reservation conflict clears, with a live
exact hold on an added night. The alert tells staff to reopen the room list and
choose another room. The approval dialog offers **Execute as Front Desk** and
has no room list. The shared hold response assumes a room selection. The
in-place message should explain that staff can retry the same approval after
the hold clears or expires.

**Verified fixed locally.** The approval dialog now says “A guest is holding
this room for one or more added nights. Select Execute as Front Desk again
after the hold expires.” Edge displayed the message beside the action at
1366 × 768 in light mode and 1280 × 720 in dark mode.

- The first execution returned `ROOM_HELD_FOR_GUEST` and preserved the approval,
  checkout, assignment and folio. Clicking **Execute as Front Desk** again
  after expiry added two nights in the original room.
- Repeating the completed approval returned `APPROVAL_NOT_EXECUTABLE`.
  Receipt recovery returned the existing result. The folio kept one ₱200
  extension charge.
- In a separate replacement-room scenario, the room-selection guidance still
  appeared for the held replacement. The move succeeded after expiry, with one
  extension charge after retry.

The local build, typecheck, and 46 targeted Vitest tests passed. Scoped ESLint
reported no errors and four warnings outside the changed handler. The full suite
passed 2,759 tests. The breakfast pass QR image test reported
`Error: Test timed out in 20000ms.` during the concurrent build and passed on
the focused rerun. Both Edge fixtures issued zero payment or refund requests.
[Verification evidence](evidence/post-audit/front-desk-approved-in-place-extension-guidance-fix.json) ·
[Hold guidance in light mode](evidence/post-audit/1366x768-approved-in-place-extension-retry-guidance.png) ·
[Hold guidance in dark mode](evidence/post-audit/1280x720-approved-in-place-extension-retry-guidance-dark.png) ·
[Executed after expiry](evidence/post-audit/1366x768-approved-in-place-extension-retry-executed.png)

### Manager-approved reservation changes with a room move · 2026-11-26

Front Desk filed a pre-arrival change to shift a confirmed two-night stay
one day later. A later booking overlapped the new dates in the original
room, so the Manager-approved change required a same-type replacement.
Both nights stayed at ₱100, giving a zero lodging difference.

| Check | Local result |
| --- | --- |
| Live exact hold | Edge opened **Choose a replacement room**. Front Desk entered the room held for one amended night. The API returned HTTP 409 with `MODIFICATION_ROOM_UNAVAILABLE`. A spare room of the same type remained available. The approval, original reservation, assignments and full folio stayed intact. |
| Expiry and move | The fixture shortened the hold to two seconds and waited for its PostgreSQL deadline. Before cleanup updated the hold, the same replacement succeeded with HTTP 200. The original assignment was marked reassigned, one active replacement covered the new dates, and the later booking stayed intact. |
| Folio and retry | PostgreSQL compared the full invoice, charge and payment rows after execution and retry. The total stayed ₱245, including the ₱45 ancillary charge, with ₱60 recorded as paid and ₱185 due. No charge, refund or adjustment was added. Repeating the execution returned `APPROVAL_NOT_EXECUTABLE` and left one execution audit. |

The three Front Desk scenario checks and 37 targeted Vitest tests passed.
Edge used 1366 × 768. The fixture issued zero payment or refund requests.
Both disposable databases were removed and the loopback server was stopped.
[Reservation amendment evidence](evidence/post-audit/front-desk-approved-amendment-exact-hold.json) ·
[Blocked replacement](evidence/post-audit/1366x768-approved-amendment-live-hold.png) ·
[Executed after expiry](evidence/post-audit/1366x768-approved-amendment-executed-after-expiry.png)

#### FD-API-008 · Guest-originated amendment missing from Front Desk approvals

**Original reproduction, P2.** Submit the same date change through the guest’s reservation
and have a Manager approve it. The request reaches `awaiting_execution` and
appears in the Manager list. Front Desk’s approvals endpoint excludes it, and
Edge shows no matching request under **All requests**. The list query limits
Front Desk to their own requester ID. The approved guest request is blocked
at the queue handoff. The applicable Front Desk approvals queue needs a scoped
way to surface these ready-to-execute amendments.
[Guest queue evidence](evidence/post-audit/1366x768-guest-amendment-missing-from-front-desk.png)

#### FD-API-009 · Generic conflict for a held amendment replacement

**Original reproduction, P3.** Execute a Front Desk-originated approved date change and
enter a replacement of the correct type with a live exact hold on an amended
night. The amendment validator reports `MODIFICATION_ROOM_UNAVAILABLE` for
both an exact hold and other room restrictions. Edge shows the generic
availability message in a toast behind the open review dialog. The conflict
should identify the hold and give staff a clear retry action in the dialog.

#### FD-API-008 and FD-API-009 local fix

Front Desk’s default **All requests** queue shows approved guest changes
awaiting Front Desk execution. Edge confirmed that **My requests** shows the
signed-in staff member’s work. The API checks verified that pending and completed
guest changes stay outside the execution queue and that a different staff
member’s request remains scoped to its requester.

[Migration 20261126050000](../../../supabase/migrations/20261126050000_amendment_replacement_hold.sql)
checks a selected replacement under the room-type inventory lock. Edge opened
the replacement prompt before a second guest held the last available room.
The submit returned HTTP 409 with `ROOM_HELD_FOR_GUEST`. The review dialog
explained the hold and how to try again, with the message visible at 1366 × 768
in light mode and 1280 × 720 in dark mode. A wrong-room submission kept the
ordinary availability conflict.

After the fixture shortened the hold to two seconds and the database deadline
passed, Front Desk selected the same room. Edge confirmed the new dates and the
approval and guest request both reached execution. Replaying the approval
returned `APPROVAL_NOT_EXECUTABLE`. The full invoice, charges and payment rows
matched the pre-test folio total of ₱245, including the ₱45 ancillary charge,
₱60 already recorded and ₱185 due. No new charge, adjustment or refund was added.

The local build, typecheck, all 2,761 Vitest tests and three Edge scenario checks
passed. Scoped ESLint reported no errors and four existing dashboard warnings.
The fixture issued zero payment or refund requests and its database was removed.
[Verification evidence](evidence/post-audit/front-desk-approved-guest-amendment-fix.json) ·
[Approved guest change in the queue](evidence/post-audit/1366x768-approved-guest-amendment-in-front-desk.png) ·
[Inline hold alert](evidence/post-audit/1366x768-guest-amendment-hold-inline.png) ·
[Hold alert in dark mode](evidence/post-audit/1280x720-guest-amendment-hold-inline-dark.png) ·
[Execution confirmation](evidence/post-audit/1366x768-guest-amendment-executed-after-expiry.png)

### Manager-approved guest change to a higher-rate room · 2026-11-26

The guest requested a higher-rate room type in Edge for the original two
nights. The Manager approved the request from the approval dialog. The quote
changed lodging from two nights at ₱100 to two nights at ₱180, for a ₱160
difference. The fixture raised the live catalog rate to ₱220 after approval
to check that execution uses the approved quote.

| Check | Local result |
| --- | --- |
| Live exact hold | Another guest held the last available replacement for one night after Front Desk opened the room prompt. Edge showed `ROOM_HELD_FOR_GUEST` in the review dialog with HTTP 409. PostgreSQL preserved the approval, original assignment and entire ₱245 folio. |
| Expiry and move | The fixture shortened the hold to two seconds and waited for its database deadline. The same room succeeded with HTTP 200 before cleanup updated the hold row. The booking kept its dates, received one active replacement assignment and retained the approved ₱180 nightly rate. |
| Folio and retry | The approved ₱160 lodging difference raised the existing invoice to ₱405. The ₱45 ancillary charge and ₱60 synthetic deposit stayed in place. The guest portal showed ₱405 total and ₱345 due. Repeating execution returned `APPROVAL_NOT_EXECUTABLE`. The full committed invoice, charge and payment rows matched after retry, with one execution audit and zero new charges or refunds. |

The guest, Manager and Front Desk workflow ran in Edge at 1366 × 768. The
hold alert was also verified in dark mode at 1280 × 720. All three scenario
checks and 53 targeted Vitest tests passed. The fixture issued zero payment
or refund requests and the disposable database was removed.
[Higher-rate evidence](evidence/post-audit/front-desk-approved-higher-rate-amendment.json) ·
[Manager quote](evidence/post-audit/1366x768-higher-rate-amendment-quote.png) ·
[Held replacement](evidence/post-audit/1366x768-higher-rate-amendment-hold-inline.png) ·
[Guest folio after retry](evidence/post-audit/higher-rate-amendment-guest-folio.png)

### Manager-approved guest change to a lower-rate room · 2026-11-26

The guest requested a lower-rate room type for the original two nights in
Edge. The Manager approved the change from ₱100 to ₱70 per night, a ₱60
lodging reduction. The fixture then raised the catalog rate to ₱85 to verify
that Front Desk execution uses the approved price.

| Check | Local result |
| --- | --- |
| Live exact hold | A second guest held the last available replacement for one night after Front Desk opened the room prompt. Edge displayed `ROOM_HELD_FOR_GUEST` in the review dialog with HTTP 409. The original assignment, approval and ₱245 folio were preserved. |
| Expiry and move | The fixture shortened the hold to two seconds and waited for its database deadline. Front Desk selected the same room and received HTTP 200 before hold cleanup. The reservation kept its dates and approved ₱70 rate, with one active replacement assignment. |
| Folio and retry | The approved ₱60 reduction took the folio from ₱245 to ₱185. The original ₱45 ancillary charge and ₱60 synthetic deposit were preserved. The guest portal showed ₱185 total and ₱125 due. Repeat execution returned `APPROVAL_NOT_EXECUTABLE` and left the full committed folio identical, with zero additional charges, credits or refunds. |

All three scenario checks and 53 targeted Vitest tests passed. The guest,
Manager and Front Desk used Edge at 1366 × 768. The hold alert was also
checked at 1280 × 720 in dark mode. The fixture issued zero payment or refund
requests and its disposable database was removed.
[Lower-rate evidence](evidence/post-audit/front-desk-approved-lower-rate-amendment.json) ·
[Manager quote](evidence/post-audit/1366x768-lower-rate-amendment-quote.png) ·
[Held replacement](evidence/post-audit/1366x768-lower-rate-amendment-hold-inline.png) ·
[Guest folio after retry](evidence/post-audit/lower-rate-amendment-guest-folio.png)

### Manager-approved lower-rate change with a folio credit · 2026-11-26

The guest had ₱220 recorded against a ₱245 folio, with ₱25 due. In Edge,
the guest requested a lower-rate room for the same dates and the Manager
approved a ₱60 lodging reduction. The proposed total was ₱185.

| Check | Local result |
| --- | --- |
| Live exact hold | The selected replacement returned HTTP 409 with `ROOM_HELD_FOR_GUEST`. The original assignment and the full folio stayed intact, with ₱25 due and zero credit. |
| Expiry and credit | The fixture shortened the hold to two seconds and waited for the database deadline. Front Desk executed the move. The folio total became ₱185 and its ₱220 recorded payment was preserved. PostgreSQL showed ₱185 applied, zero due and ₱35 folio credit. Front Desk and the guest portal both displayed the credit. |
| Retry and refund isolation | Repeating execution returned `APPROVAL_NOT_EXECUTABLE`. PostgreSQL matched the full committed invoice, payment and charge rows. The ₱35 credit persisted with one execution audit and zero refund requests, payout attempts or refund payments. |

All three scenario checks and 50 targeted Vitest tests passed. The guest,
Manager and Front Desk used Edge at 1366 × 768. The hold alert was also
verified at 1280 × 720 in dark mode. The fixture made zero payment or refund
endpoint requests. The disposable databases were removed and the local
server was stopped.
[Credit scenario evidence](evidence/post-audit/front-desk-approved-lower-rate-credit.json) ·
[Guest folio](evidence/post-audit/lower-rate-credit-guest-folio.png) ·
[Front Desk folio](evidence/post-audit/lower-rate-credit-front-desk-folio.png)

### Accounting payout recording for a ₱35 folio credit · 2026-11-26

Edge reproduced the approved lower-rate change and the ₱35 credit on the
confirmed booking. Accounting’s **Refunds** queue had no entry or create
action for that credit. The refund-exception route also requires a cancelled
or no-show reservation and returned `REFUND_EXCEPTION_REQUIRES_CLOSURE`.
The ordinary handoff from this active booking is unavailable. To isolate the
payout-recording step, the disposable fixture seeded one pending ₱35 refund
request linked to the credited folio.

| Check | Local result |
| --- | --- |
| Manual payout record | Accounting recorded a simulated bank transfer in Edge. The request changed to processed, one ₱35 refund payment posted, and the folio credit dropped to zero. The folio total stayed ₱185 and net payments became ₱185. The original payment and charges stayed intact. |
| Retry | Two identical requests from the Accounting Edge session returned HTTP 200 and the same result. A different reference returned `IDEMPOTENCY_CONFLICT`. PostgreSQL matched the full folio and refund snapshots before and after retry, with one refund request, payment, processed attempt and audit entry. |
| Visibility and role scope | The guest portal displayed zero credit after settlement. Front Desk could view the folio but its payout attempt returned HTTP 403. |

Six scenario checks and 36 targeted Vitest tests passed. Edge used 1366 × 768
for Accounting and the guest portal. The bank transfer was a synthetic ledger
entry. The fixture made no provider payouts and the disposable database was
removed.
[Payout and retry evidence](evidence/post-audit/front-desk-manual-credit-refund.json) ·
[Accounting payout dialog](evidence/post-audit/1366x768-credit-simulated-payout.png) ·
[Processed refund](evidence/post-audit/1366x768-credit-refund-processed.png) ·
[Guest folio after settlement](evidence/post-audit/credit-refund-guest-folio.png)

## Upgrade pricing with sample rates

Five disposable PostgreSQL scenarios used an original two-night lodging total
of ₱200. The arrival and mid-stay approval requests calculated the target total
from room-type base rates and active dated rate plans. The request RPC discarded
caller-supplied fee and waiver fields. A pending rate plan had no effect.

| Scenario | Target nightly sample rates | Folio upgrade charge after retry |
| --- | --- | --- |
| Guest-requested arrival upgrade | ₱140 + ₱140 | One charge of ₱80 |
| Guest-requested arrival upgrade with dated plan | ₱170 + ₱220 | One charge of ₱190 |
| Guest-requested mid-stay upgrade | ₱170 + ₱170 | One charge of ₱140 |
| Guest-requested mid-stay upgrade with dated plan | ₱170 + ₱220 | One charge of ₱190 |
| Hotel-caused mid-stay upgrade with dated plan | ₱170 + ₱220 | Zero charges, with the original ₱200 folio total preserved |

Changing both the sample base rate and dated plan after approval did not change
the amount posted. Acceptance posted the arrival charge. Mid-stay acceptance
recorded consent, and execution posted the charge. All amounts are synthetic.
Eighty-eight targeted Vitest tests passed. The disposable database was removed
after verification. No payments were created and no deployment was performed.

## Replacing a sample room rate in Edge

The local regression used Microsoft Edge 158 at a 1366 × 768 viewport. An Owner
saved a Premium base-rate change from ₱1,800 to ₱2,400 per night in **Room Types
& Photos**. The synthetic room type had no active dated rate plans. Its editor
also required a badge color, so the fixture used Slate.

| Workflow | Verified result |
| --- | --- |
| New Front Desk booking | The review showed ₱4,800 for two nights. The resulting confirmed booking and folio both stored ₱4,800, with ₱2,400 for each night. |
| New guest-requested upgrade | The signed-in Front Desk API created a pending quote. The Manager review in Edge showed ₱4,800 for the Premium stay, ₱2,000 as the original total, and a ₱2,800 difference. No upgrade charge was posted. |
| Previously confirmed booking | The Guest Portal still showed the original ₱3,600 total. The saved nightly rates remained ₱1,800 each, and PostgreSQL matched the reservation and folio amounts before and after the change. |

The isolated database was removed. The regression created zero payments and
made zero non-loopback server requests. No deployment was performed.

## Staging and property acceptance

- Replay mixed inventory and expiry races under hosted connection pooling
  and representative guest and desk traffic. Confirm expiry cleanup timing,
  network interruption recovery, and retry behavior for requests queued
  across expiry.
- Verify pre-assignment, guided check-in and room-change conflicts against
  the hosted migration and real connection pool during staging acceptance.
  Replay the exception request, Manager approval and guided execution there.
- Verify effective `service_role` access for guest acceptance and replay the
  standard acceptance route, mid-stay execution and retry in staging before
  releasing paid upgrades.
- Replay the downgrade and confirm the guest folio and refund records stay
  intact under the hosted database configuration.
- Replay the stay extension with a same-type room move in staging. Verify
  expiry on an added night and confirm retry returns the existing receipt
  with one folio charge under hosted connection pooling.
- Replay same-room extension rejection, expiry and lost-response recovery
  under hosted connection pooling with migration `20261126040000` in staging.
- Replay Manager-approved same-room execution after a later booking is
  reassigned. Verify a new hold and its expiry against shared hosted inventory.
- Replay the approved date change under hosted connection pooling. Verify
  guest-originated queue access and hold feedback with migration `20261126050000`.
- Replay the higher-rate guest amendment under hosted connection pooling with a
  catalog price change after approval. Confirm the approved lodging difference
  and original folio entries reconcile after an execution retry.
- Agree with the property on guest hold duration, expected peak desk and
  guest traffic, and response-time and retry targets.
- Provider settlement and Fleet integration remain separate acceptance work.

[Machine-readable evidence](evidence/post-audit/front-desk-shared-inventory.json) ·
[Earlier Front Desk performance results](FRONT-DESK-CONCURRENCY-TEST-REPORT.md)
