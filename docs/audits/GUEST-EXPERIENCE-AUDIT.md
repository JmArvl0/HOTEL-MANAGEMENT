# Haven guest experience and full-stack audit

November 24, 2026 · Philippine time · Local release candidate `0O2Kq_X717eIC9pLezf1h`

## Executive summary

Haven’s public site feels like a hotel and supports an understandable path from dates to a specific room. In Edge at 390 × 844, a newly registered synthetic guest kept their room, stay dates, two-person party and breakfast choice, then completed an actual reservation through a simulated wallet. The populated My Stay account showed the booking, allowed a profile edit and service request, displayed transportation, and exposed the booking PDF and breakfast pass. The guest cancelled the reservation through the normal UI, and PostgreSQL confirmed that the room became available again.

**Release verdict.** Suitable for controlled guest demonstrations. **Hold public direct-booking launch.** The candidate accepts only test-mode wallet configuration. The cancellation page confuses a cancelled paid stay with an expired payment, the session activity and hold-release endpoints reject normal browser requests, the mobile Express Pass is hard to use, and the privacy URL redirects to booking terms. Mixed nightly-rate copy and post-cancellation payment labels also need correction before guests rely on them.

This review used the existing shared working tree, a fresh local production bundle, actual site and portal pages, PostgREST and disposable PostgreSQL with all 161 migrations. The wallet and external service boundaries used local fixtures. No application code or hosted records were changed. The release decision covers the tested local candidate and its observed gaps. [QA results and coverage](GUEST-QA-TEST-RESULTS.md).

## Reports

Follow implementation and current acceptance in the [guest post-audit resolution register](GUEST-AUDIT-RESOLUTION-REGISTER.md).

| Report | Contents |
| --- | --- |
| [Guest UI/UX audit](GUEST-UI-UX-AUDIT.md) | Page-level findings, evidence, root causes, accessibility and responsive acceptance. |
| [Guest QA test results](GUEST-QA-TEST-RESULTS.md) | Case outcomes, database coverage, HTTP and console evidence, repository checks and outstanding acceptance. |
| [Guest backend and business logic audit](GUEST-BACKEND-LOGIC-AUDIT.md) | Request and record trace, session behavior, payment gate, data ownership, privacy and scale. |
| [Guest feature gap analysis](GUEST-FEATURE-GAP-ANALYSIS.md) | Module-by-module assessment, missing and redundant features, and subsystem ownership. |
| [Guest improvement roadmap](GUEST-IMPROVEMENT-ROADMAP.md) | Seven implementation phases, quick wins and release exit criteria. |

## Real guest feedback

I could tell where the hotel was and how to look for a room from the first screen. Seeing the actual stay dates and selected room at sign-in gave me confidence that creating an account would preserve my choice. Once I paid the simulated deposit, the dashboard gave me a clear balance and a useful way to manage the stay. The booking policy and cancellation preview helped me understand what the hotel would do.

I hesitated when the room card’s nightly rate did not multiply to the quoted total, then again when the breakfast choice and the stay card showed different totals. On my phone, I had to scroll past the selected-stay summary to reach the sign-in form. The confirmation was reassuring until I reached the squeezed Express Pass. After cancelling, reopening the same confirmation told me the checkout had expired and encouraged another payment. I would want a straightforward explanation of my original deposit, the amount the hotel kept and what I should expect back.

## Guest journey and persona coverage

| Stage or persona | What was exercised | Friction, outcome and boundary |
| --- | --- | --- |
| First visit, browsing and non-technical guest | Signed-out home, room search, gallery, policy, recovery entry and kiosk entry. | Clear photo, location and action. Privacy leads to booking policy. Room finder works at narrow widths. |
| Solo, couple and last-minute | Same-day one-person and tomorrow two-person availability. | The test fixture returned a one-night quote for both searches. Room-type selection exposes numbered choices. |
| Budget-conscious and long-stay | Compare ordinary, mixed and 90-night quotes, and reject a 366-night stay. | Correct mixed subtotal with misleading nightly copy. Billing labels become easier to follow when prices and inclusions agree across screens. |
| Family | Reviewed guest-count capacity, over-capacity handling and the public children/extra-bed FAQ. | A nine-person search was rejected. A real adult/child party and occupancy lifecycle remain to be exercised. The current date search uses total guests. |
| New guest and time-sensitive business traveler | Browser signup from room selection, weak/mismatched input, preserved stay and breakfast, and no-account entry. | Creating an account requires name, mobile, email and password. Booking then asks for address and planned arrival or an explicit unknown-arrival choice. The interruption is legible, but its mobile summary delays the form. |
| Mobile guest | Stayed in the 390 px viewport for signup, booking details, wallet return, confirmation and cancellation. | Phone booking completed. The inline quote, confirmation headings, floating action and Express Pass deserve targeted fixes. |
| Guest needing transport | Added pickup and approved Fleet sharing during the browser booking. Opened the persisted portal ride record. | The request was filed after payment. The partner fare and dispatch still awaited confirmation. |
| Pre-arrival guest | Observed payment pending and partial payment after settlement. Opened My Stay, breakfast pass, booking PDF and a new service request on the confirmed stay. | Useful stay summary and actions. The Express Pass visual needs reflow before guests rely on a phone for arrival. |
| Guest changing plans | Submitted a breakfast-stay date change and saw the policy rejection, then cancelled through the preview and final confirmation. | Room claim was released. The original confirmation and its monetary labels were misleading after cancellation. |
| Returning guest | Signed in a separate existing synthetic account, saw empty My Stay, changed dates and party size through the mobile search form, and signed out. | A second paid stay and longer notification history remain to be exercised. |
| Check-in, in-house and checkout | Existing PostgreSQL scenarios exercised role-scoped readiness, checked-in and checkout transitions with synthetic guests. | Complete the cross-role browser handoff with authorized Front Desk, real device and issued folio in release acceptance. |

## Master findings

Priorities run from P0 critical to P3 low. Confirmed findings can be reproduced in the tested scope. The potential issue is a source-backed scalability concern that still needs a representative load run.

| ID | Page / module | Finding | Category | Severity | Priority | Effort | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [GUEST-001](GUEST-BACKEND-LOGIC-AUDIT.md#guest-001--live-payment-is-unavailable) | Wallet / release | The candidate is test-mode only and cannot collect production payments | Functional / release | Critical | P0 | Large | Confirmed mode constraint |
| [GUEST-002](GUEST-UI-UX-AUDIT.md#guest-002) | Exact room | An available room displays an unavailable action without a direct assisted route | UX | High | P1 | Small | Confirmed in disabled checkout |
| [GUEST-003](GUEST-UI-UX-AUDIT.md#guest-003) | Privacy and registration | Privacy opens booking policy and signup lacks a privacy destination | Privacy / missing feature | High | P1 | Medium | Confirmed |
| [GUEST-004](GUEST-UI-UX-AUDIT.md#guest-004) | Catalogue and exact rooms | The minimum nightly rate is labelled like a uniform rate | Pricing UX | High | P1 | Small | Confirmed |
| [GUEST-005](GUEST-UI-UX-AUDIT.md#guest-005) | Guest details | Breakfast selection creates two visible stay totals | Pricing UX | Medium | P2 | Medium | Confirmed |
| [GUEST-006](GUEST-UI-UX-AUDIT.md#guest-006) | Stay summary and confirmation | Raw dates replace readable date formatting mid-journey | UX writing | Low | P3 | Small | Confirmed |
| [GUEST-007](GUEST-BACKEND-LOGIC-AUDIT.md#guest-007--bodyless-guest-actions-receive-http-415) | Signed-in guest shell and held rooms | HTTP 415 blocks idle-session activity and deliberate hold release | Functional | High | P1 | Small | Confirmed HTTP and held-room state |
| [GUEST-008](GUEST-UI-UX-AUDIT.md#guest-008) | Guest details | Refresh before the first hold clears entered address | UX / resilience | Medium | P2 | Medium | Confirmed |
| [GUEST-009](GUEST-UI-UX-AUDIT.md#guest-009) | Room photos | Unconfigured media look specific to the room and remote failure can render a broken image | Configurability / UX | Medium | P2 | Medium | Confirmed with empty media and isolated network |
| [GUEST-010](GUEST-UI-UX-AUDIT.md#guest-010) | Availability | Date feedback is transient and invalid search drops the date context | Validation / accessibility | Medium | P2 | Small | Confirmed |
| [GUEST-011](GUEST-UI-UX-AUDIT.md#guest-011) | Booking sign-in | Mobile form is pushed down and account creation is duplicated | UX / polish | Low | P3 | Small | Confirmed |
| [GUEST-012](GUEST-BACKEND-LOGIC-AUDIT.md#guest-012--guest-history-reads-scale-with-the-whole-account) | My Stay and history | Guest history aggregations may grow beyond useful page bounds | Performance | Medium | P2 | Medium | Potential, source review |
| [GUEST-013](GUEST-UI-UX-AUDIT.md#guest-013) | Confirmation | Cancelling a verified booking is displayed as checkout expiry | Business logic / UX | High | P1 | Small | Confirmed |
| [GUEST-014](GUEST-UI-UX-AUDIT.md#guest-014) | Digital Express Pass | Mobile confirmation squeezes the kiosk action into near-vertical text | Responsive / accessibility | High | P1 | Medium | Confirmed at 390 px |
| [GUEST-015](GUEST-UI-UX-AUDIT.md#guest-015) | Mobile guest shell | Header breaks the title and a floating help control masks booking values | Responsive UX | Medium | P2 | Medium | Confirmed at 390 px |
| [GUEST-016](GUEST-UI-UX-AUDIT.md#guest-016) | Post-cancellation finance | Amount paid shows the net applied amount instead of original collection | Pricing UX | High | P1 | Medium | Confirmed by database and UI |
| [GUEST-017](GUEST-UI-UX-AUDIT.md#guest-017) | Booking amendments | A known breakfast restriction is disclosed only after submission | UX / policy | Medium | P2 | Small | Confirmed |
| [GUEST-018](GUEST-UI-UX-AUDIT.md#guest-018) | Availability | Zero sellable rooms shows a priced list before any recovery options | UX | Medium | P2 | Small | Confirmed with maintenance |
| [GUEST-019](GUEST-UI-UX-AUDIT.md#guest-019) | Cancelled reservation details | A sentence-length reason outgrows its single-line status pill | Responsive polish | Low | P3 | Small | Confirmed at 390 px |

## Guest experience scorecard

Scores are judgments of the observed local guest experience. Untested dimensions are N/A. Security is limited to the inspected and exercised boundaries.

| Area | Score | Reason and what would improve it |
| --- | --- | --- |
| First impression | 8/10 | Clear hotel identity, location, photography and dates. A real privacy destination would improve confidence. |
| Visual design | 7/10 | Distinctive landing and ordered room cards. Compact portal layouts need more care on phones. |
| Navigation | 8/10 | Public anchors, stay shortcuts and stable booking links. Improve the assisted-checkout handoff. |
| Room browsing | 7/10 | Useful facts and keyboard-operable room details. Mark media provenance and explain mixed rates. |
| Availability search | 7/10 | Real inventory and useful date range checks. Keep rejected inputs and visible recovery. |
| Registration | 8/10 | Clear validation and successful booking restoration. Move form controls higher on phones and add privacy information. |
| Booking experience | 8/10 | The full mobile flow worked with breakfast and transportation. Improve the draft boundary and displayed stay quote. |
| Pricing transparency | 6/10 | The final folio reconciles. Mixed nightly labels, competing totals and cancelled-payment copy reduce trust. |
| Payment experience | 6/10 | Simulated deposit flow, wallet return and verified state are understandable. Live payment acceptance is N/A. |
| Guest dashboard | 8/10 | Current stay, deposit and next actions were immediately useful. Improve header spacing and history scaling. |
| Booking management | 6/10 | Actual cancellation and inventory release worked. Amendment help and the cancellation result need improvement. |
| Mobile experience | 6/10 | The 390 px checkout completed. The header, floating overlay and Express Pass layout are material gaps. |
| Accessibility | 6/10 | Room dialog focus and registration errors worked. Pass reflow and durable validation need attention. Assistive-technology acceptance remains open. |
| Error handling | 6/10 | Useful constrained messages for several errors, with late restriction feedback and failed activity renewal. |
| Performance | N/A | Local normal and throttled landing samples were collected. Larger-data and production timing baselines remain open. |
| Backend reliability | 8/10 | Migrated PostgreSQL, coherent payment/folio records and concurrency tests. Provider and staff browser acceptance remains. |
| Business logic | 7/10 | Frozen totals, room exclusivity and cancellation release held. The guest-facing terminal state and accounting summaries need correction. |
| Security | 7/10 | Own/other reservation and staff boundaries tested, plus relevant SQL guards. Full session, recovery and provider security acceptance remains. |
| Guest satisfaction | 7/10 | Booking was achievable and familiar. Price ambiguity and a misleading result after cancellation would make me seek help. |

## Release acceptance

The browser and HTTP matrix returned **35 passes and 16 failures across 51 executed cases**. Local PostgreSQL verification passed **88 checks**, and the full Vitest suite passed **2,746 tests**. Some browser failures share a root cause and appear under one finding. [QA case matrix](GUEST-QA-TEST-RESULTS.md).

Clear GUEST-001, GUEST-003, GUEST-007 and the cancellation and mobile-pass blockers before exposing public direct booking. Retest the exact deployed app/schema pairing with real property policy and approved provider or assisted workflow. Perform a paired staff/guest lifecycle after the desk, Finance and Fleet environments are ready. See [the phased roadmap](GUEST-IMPROVEMENT-ROADMAP.md) and [explicit test coverage](GUEST-QA-TEST-RESULTS.md#untested-or-blocked-acceptance-groups).
