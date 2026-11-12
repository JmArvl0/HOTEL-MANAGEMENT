# Booking flow proposal — 2026-11-07

User identified repeated room selection after landing and requested a proposed
UI/flow before implementation. Created a separate clickable prototype at8771:
room → dates/availability panel → same-panel sign-in/create → guest details →
review → deposit preview. Room/dates/guests remain selected; signed-in bypass and
unavailable-room alternatives are included. No backend calls or real accounts,
holds, reservations, emails, payments or DB writes.

User then requested a modern check-in/check-out UI. Added a custom single-calendar
date-range picker, highlighted stay, night count, Apply/Cancel, past-date disabling
and keyboard support. Actual browser verified 20–23Jan2027 →3nights →₱19,200 sample
Deluxe estimate → same sign-in summary. Mobile390/320 has no page/calendar overflow;
day buttons44px high at390. Create-account walkthrough reached guest details,
review and the explicit deposit boundary; signed-in skip and unavailable alternatives
retained dates. Syntax checks pass. Complete verification/recovery and backend QA
are not claimed. Existing brand/type small-text detector warnings were retained.

Prototype: `.tmp/booking-flow-proposal/`, README + screenshots there. Server8771
(session61484) remains running; browser tab marked as deliverable. Actual hotel
application booking flow is unchanged. Implementation still awaits user review.

## User correction — exact rooms within a type

User rejected the drawer-first interpretation: landing chooses a room TYPE, then
opens its own page where guests choose among individual rooms. Explicitly confirmed
exact room-number reservation. Revised root8771 to v2: Choose this type → dedicated
type page (Deluxe sample201/202/203) → Book Room202 → full account page → details/
review preserving202, type, dates and guests. Modern calendar stays on type page.
No booking drawer in v2. Earlier proposal retained at index-v1.html.

Actual browser verifies that exact-room path and type filtering.390px type page and
calendar do not overflow. Syntax checks pass. Sample rooms/positions/photos only;
no actual room assignment or DB writes. Source still uses type-capacity booking and
Front Desk assignment, so production exact-room allocation changes remain unmade.
Current evidence: README-v2.md and v2-* screenshots in prototype folder.

Follow-up: user wants every room visible, with unavailable rooms gray and last.
Updated v2 prototype sorting/styling; browser verified202/203 available first,
gray201 last with disabled booking, all3 retained. Sample unavailable state is
enabled by default for review. Screenshot v2-unavailable-last.jpg; syntax passes.
Actual application remains unchanged by this proposal revision.

## Mobile country-code and flag refinement

User requested automatic dialing code from country selection, then flags and a
modern picker. Prototype now has defaultPH+63, flag assets, searchable country/code
options, selected check, keyboard navigation/Escape and shared create-account /
guest-details input. PH09… / +63… formats normalize and Review retains the combined
number. Eight sample countries; full international validation and SMS are outside
this preview. Contact fields are memory-only. Actual registration source untouched.

Browser verified Singapore pointer selection (+65), keyboard selection, search /
empty state / Escape, PH length error, and demo create → details → Review with
+639170000000 and Room202. SVG flags loaded and390/768px page/picker fit;1440px
desktop visual inspected. Syntax checks passed for phone-field.js / v2.js / server.
Screenshots v2-phone-flags-desktop.jpg and v2-phone-flags-mobile.jpg. Public
flag-icons SVGs carry the MIT license in assets/flags/LICENSE; codes checked with
ITU. Restarted loopback8771 server for SVG MIME (session56297). Production app
checks were not rerun for these ignored static-prototype-only changes.
