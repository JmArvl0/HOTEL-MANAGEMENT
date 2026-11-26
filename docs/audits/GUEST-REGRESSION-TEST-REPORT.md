# Guest post-audit regression report

November 24, 2026 · Build `wYaTrCTFsKEZ7GdwGy3-O` · [Implementation report](GUEST-POST-AUDIT-IMPLEMENTATION.md) · [Resolution register](GUEST-AUDIT-RESOLUTION-REGISTER.md)

## Environment and test data

Next.js 16.4.6 production build on Node 22.22.2. Playwright ran installed Microsoft Edge against loopback Next.js and PostgREST 16.5 on a disposable PostgreSQL 18.6 clone containing 161 previously replayed migrations. All people, rooms, reservations and payment references were synthetic. The browser blocked external request destinations, and the Xendit wallet and API used test responses on the test runner. Haven executed its real registration, booking, pricing, provider callback, cancellation, staff and authorization routes. No hosted database, real payment or external notification was used.

## Browser and HTTP results

**18 passed, zero failed on the final build.** The first run exposed a remaining mobile pass layout issue that the final build corrected. The runner also corrected a reserved SQL fixture alias and an ambiguous cancellation reason selector.

| ID | Scenario | Verified outcome |
| --- | --- | --- |
| R01 | Dedicated privacy | Public footer reaches `/privacy`, with a substantive privacy heading and independent guidance. |
| R02 | Assisted booking | Disabling the online channel kept Available inventory and gave the numbered room a Front Desk booking link. |
| R03 | Last room under maintenance | Search led with zero-supply recovery, displayed no bookable cards, and opened the date editor on demand. |
| R04 | Identical dates | The editor retained both dates and associated persistent feedback with check-out. |
| R05 | Mixed night prices | Two rates of ₱2,500 and ₱3,900 produced ₱6,400. Public and exact-room cards labelled the minimum. The fixture photo was marked illustrative. |
| R06 | Sign-in interruption and signup | Sign-in led at 390 px and the account option appeared once. Registration linked guest privacy and resumed the selected exact room, dates, two guests and breakfast. |
| R07 | Breakfast quote | Changing selection updated the main summary between ₱5,000 and ₱6,800. The breakfast deposit showed ₱2,040. |
| R08 | Unsaved guest details | Reload displayed the native unsaved changes dialog. Dismissing it preserved the typed address. |
| R09 | Mobile booking and payment | The hold stored ₱6,800 with a ₱2,040 deposit. Maya simulation returned to pending, callback confirmed the stay, and repeated delivery left one payment and a ₱4,760 balance. |
| R10 | Session activity | Real guest interaction reached the session route with 200 and an activity record was present in PostgreSQL. |
| R11 | Mobile shell and Express Pass | The kiosk link stayed readable and usable at 360, 390, 430, 768, 1280, 1440 and 1920 CSS px. The mobile title fit, the concierge overlay was absent during checkout, and the pass worked in light and dark phone palettes. |
| R12 | My Stay, transport and PDF | The populated dashboard offered Manage stay, transport stored an owned `REQUESTED` record, and the browser downloaded the owned confirmation PDF. |
| R13 | Breakfast amendment | The stay gave a Front Desk change action immediately. The generic date change form was absent for this breakfast stay. |
| R14 | Paid cancellation | The guest completed cancellation and the room returned to supply. The reason fit the card at 390 px. Confirmation showed cancellation, ₱2,040 collected, ₱1,020 fee, and ₱1,020 eligible refund pending. No retry checkout action appeared. |
| R15 | Hold release | My Reservations Release hold returned 204, expired the exact hold and freed the room in PostgreSQL. |
| R16 | Ownership | A second synthetic guest received the not-found view and 404 from the booking PDF. The staff reservation API denied the guest with 403. |
| R17 | Provider expiry | A separate unpaid attempt expired through the simulated provider event and offered recovery through room search. |
| R18 | Front Desk lifecycle | An authorized staff session checked in and checked out a synthetic stay using the normal APIs. The guest confirmation showed both states and PostgreSQL marked the room dirty for turnover. |

Seven browser console resource errors came from the deliberate external-image request block. The final journey captured no same-origin error response in the guest page network log. A separate controlled request verified the normal ownership denials. [Before-and-after evidence](GUEST-UI-UX-BEFORE-AFTER.md).

## Database and repository checkpoints

| Check | Scope |
| --- | --- |
| Booking and wallet data | Real PostgreSQL verified room claim, frozen breakfast and deposit values, one settlement after duplicate callback, paid cancellation and three separate accounting figures, hold release and Front Desk turnover. |
| Exact inventory and provider regression | Existing local SQL suites cover room races, atomic claim and release, expiry, booking attempt and settlement replay, partial/full payment and transportation records. |
| Breakfast and occupant regression | Existing local SQL suites cover frozen meal amounts, date entitlements, current arrival/identity checks, age enforcement and checkout effects. |
| SQL rerun | **54 checks passed.** Exact-room claims (9), Xendit and transport (18), breakfast (6), occupant and guest controls (21). Each suite used its own disposable clone. The exact-room runner reused the already-applied mutex migration. |
| Production build | Passed with Next.js TypeScript compilation. React 18 deprecation remains an existing upstream warning. |
| Standalone TypeScript | `npm run typecheck -- --incremental false` passed after restoring generated files to their original versions. |
| Full Vitest | **2,749 passed across 276 files.** The first concurrent run reported a runner error in the QR containment scan. All 30 QR tests passed separately, and the full rerun passed with a 30-second per-test limit. |
| Scoped ESLint | Zero errors and four warnings in the reviewed scope. The warnings cover existing React effect patterns and the QR image element. |

## Remaining acceptance

- Approved live wallet, actual payment failure and payout/reconciliation with Finance, and operational Fleet delivery.
- Approved privacy controller, retention, privacy contact and property content before onboarding real guests.
- Full guest-history volume and party-size fixture matrix, Firefox/WebKit and physical devices, assistive tools, and scan/retry on the real kiosk. Timing in this pass establishes no production SLA.
- Session idle/absolute deadline rehearsal, OTP and account recovery, and a paired browser handoff that issues the final folio and verifies the document in guest history. The authorized Front Desk API transitions and guest confirmation states above passed locally.

## Guest audit follow-up

The follow-up used a disposable PostgreSQL clone, a loopback PostgREST instance
with a 1,000-row response cap, production-mode Next.js builds, and Microsoft
Edge through Playwright. Hosted credentials were blanked. The wallet and bank
transfer references were synthetic, and the payout test only recorded a
transaction in the disposable Haven ledger.

### Guest history at scale

The signed-in benchmark compared the previous audit build with the follow-up
build. Both received the same 12-stay fixture and the same 1,240-stay fixture.
Each stay had an invoice, a recorded synthetic payment and a guest request.
A second guest supplied records to check ownership. Each table entry uses
five full HTTP responses after one warm-up per route. The response sizes are
uncompressed UTF-8 HTML, including the initial React payload.

| Guest screen | Median at 12 stays, before → after | Median at 1,240 stays, before → after | HTML at 1,240 stays, before → after |
| --- | ---: | ---: | ---: |
| My Stay | 153 → 127 ms | 246 → 254 ms | 49 KB → 49 KB |
| My Reservations | 96 → 90 ms | 113 → 176 ms | 79 KB → 79 KB |
| Payments & Folio | 104 → 85 ms | 1,634 → 242 ms | 2.63 MB → 54 KB |
| Guest requests | 79 → 72 ms | 916 → 156 ms | 3.42 MB → 64 KB |

The baseline omitted the oldest 240 stays from Reservations, Payments & Folio
and Requests. The follow-up reached all 1,240, including the oldest reservation,
a payment associated through its invoice with no direct reservation ID, and
the oldest request batch. A second guest's stay remained inaccessible.
The filtered folio view showed ₱123,900 across 1,239 past, settled stays.
Edge verified the last-page counts, the oldest request disclosure, folio
search, clearing filters and the 390 px folio layout.

My Stay received 12 KB of REST data at both fixture sizes, down from 2.48 MB
at 1,240 stays. It displayed a newly verified payment on an old stay and
preserved the activity entry for a future stay with no invoice. The longest
REST request URI across the four screens fell from 15.5 KB to 521 bytes.

My Reservations and the folio totals still read complete histories to apply
filters and compute totals. My Reservations took 63 ms longer locally when it
included the 240 previously omitted records. A hosted load and concurrency
test remains open. [Phone folios](evidence/2026-11-24-guest-audit-followup/scaled-folios-mobile.png) · [Desktop request history](evidence/2026-11-24-guest-audit-followup/scaled-requests-desktop.png).

### Browser and ledger checks

The final guest journey passed **22 browser and HTTP checks**. It repeated
R01–R18 and added the four checks below.

| ID | Scenario | Verified outcome |
| --- | --- | --- |
| R19 | Room-photo provenance and failure | The exact-room card loaded configured synthetic media and called it a room-type photo. A forced image request failure displayed Photo unavailable in both exact rooms and search. The existing fallback still carries the illustrative label. [Mobile fallback](evidence/2026-11-24-guest-audit-followup/room-photo-fallback-mobile.png) |
| R20 | Leaving with unsaved details | On a 390 px viewport, dismissing the booking Back and guest-navigation prompts preserved the address. Accepting Back discarded the pre-hold changes. The reload warning also preserved input when dismissed. Booking still advanced after a successful hold. |
| R21 | Recorded refund and exception | The guest received 403 from the Accounting action. Accounting recorded a synthetic ₱1,020 payout. A retry left one refund transaction. Guest confirmation showed ₱2,040 in original collections, the ₱1,020 assessed fee and the processed refund. A later authorized ₱200 fee-waiver payout appeared separately and reduced the folio total to ₱820. [Processed refund](evidence/2026-11-24-guest-audit-followup/processed-refund-mobile.png) |
| R22 | Terminal and older records | Current settled records showed a zero collection for unpaid cancellation, a full eligible refund with a zero cancellation fee, and the assessed fee on a no-show. A legacy cancellation without the ledger or settlement snapshot showed the collection as unavailable. |

The final Webpack production build and standalone TypeScript check passed.
The 60 targeted tests and the full 2,749-test Vitest suite across 276 files
passed. Scoped ESLint returned zero errors and one existing hook-dependency
warning in the customer shell. No migration or deployment was required.

### Decisions and external acceptance

| Owner | Decision or acceptance needed |
| --- | --- |
| Property management and privacy owner | Approve the full privacy notice, accountable controller, data-rights contact and retention periods. Verify Front Desk contact details and the hotel's accessibility and operating information before onboarding guests. |
| Property content owner | Supply and approve photos, rights, captions and room-type or unit provenance. Verify production storage delivery, crops and fallback on representative connections after approved images are available. |
| Property management, Front Desk and Finance | Choose assisted-only booking or authorize live checkout. Validate real callback delivery, declines, expiry, duplicate or delayed events, settlement and payout reconciliation in the approved test environment before enabling live payments. Compare a masked sample of legacy cancellation and refund records against Finance records. |
| QA and Front Desk | Repeat across supported Firefox, WebKit, physical devices and assistive tools. Exercise browser Back and Forward, tab termination and native warning behavior. Test Express Pass retry using the actual scanner and kiosk, and complete the paired guest and Front Desk folio handoff. |
| Operations and approved integration owners | Verify Fleet handoff and status delivery, live notification and OTP delivery, and the guest session idle and absolute expiry flows using approved test accounts and channels. |
| Hosting and QA | Load-test with production-like database and network latency, concurrent activity and a representative distribution of stay ages and child records. Use approved synthetic or redacted data. Establish the release performance target and compare results before rollout. |

### Browser Back and Forward

R23 reproduced the issue on the previous production-mode build. In local
Edge, Back out of Guest details followed by Forward cleared the typed
address. Forward out of a revisited Guest details page followed by Back
cleared it as well. Both traversals restored the address on the updated
build. The checks used a 390 px viewport for Back then Forward and a 1440 px
viewport for Forward then Back.

The same history entry also restored the unfinished phone number and its
country selection, breakfast choice, unknown arrival selection, room
preference, round-trip locations and times, notes, luggage count and Fleet
sharing choice. The restored form displayed a status message. Opening the
same booking in a fresh history entry or a separate tab started with clean
fields. Checks found neither the synthetic address nor ride text in
`history.state`, session storage or local storage. History carries a random
entry ID, and the app keeps up to five of
the most recently edited entries in document memory. Recovery requires the
same booking context and signed-in session.

Accepting the reload warning or choosing to leave through the form’s Back
button discarded the draft. Review booking wrote the synthetic address to a
disposable room hold. The regression verified the draft was cleared, and
Back from Review showed no restored draft. The run created zero wallet
sessions.

The local production build, standalone TypeScript and scoped ESLint passed.
All 50 targeted tests and 2,751 tests across 276 files passed.

The room hold remains the point where the details are saved. Reload,
cross-document navigation, tab termination and suppressed native warnings
can still lose pre-hold input. Firefox, WebKit, physical-device history
behavior and assistive-tool announcements remain to be tested. Persistent
draft recovery would need an approved data-handling design.
