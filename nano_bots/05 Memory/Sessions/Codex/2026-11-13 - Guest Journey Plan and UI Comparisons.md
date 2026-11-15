# Guest Journey Plan and UI Comparisons

Date: 2026-11-13. Planning/prototype only; no application implementation.

## Delivered

- `docs/plans/2026-11-13-guest-journey-improvements.md`: source-backed baseline,
  five guest priorities, phased targets/data ownership/acceptance checks,
  responsive specification and application verification gates.
- Five interactive Current/Proposed comparisons: price/review, account/OTP,
  physical-room choice, changes/cancellation, and arrival essentials.
- The Current previews are schematic source reconstructions, not browser
  screenshots. Sample dates, room facts, amounts and policy outcomes are fixtures.
  The comparison fragment lives in the thread's authorized visualization folder:
  `C:/Users/Mark Rowell/.codex/visualizations/2026/11/13/01a1d498-2ae6-7840-adc8-083dea20424f/haven-guest-current-proposed.html`.

## Verified findings

Shared stay summaries, deposit calculation, public browsing, auth callback
continuity, room facts/effective amenities, cancellation previews and active
change status already exist. Plan focuses on consistency/discoverability.
OTP currently omits the booking-context panel, registration's sign-in link omits
the booking presentation flag, and shared summary tax copy hardcodes zero.
Arrival information is distributed across existing tabs and the folio strip.

No commercial breakfast entitlement can be inferred solely from global dining
settings or amenity text. Preserve snapshot truth and actual folio balances.
"Choose a room for me" and structured commercial inclusion fields remain
optional future product changes; neither is implemented or approved here.

## Verification and limits

- Executed jsdom smoke checks: five visible screen pairs, local disclosure
  controls, selection/status changes, saved-screen restoration, unique IDs,
  script parsing and absence of network calls all passed.
- Impeccable detector on the HTML fragment returned `[]` (exit 0).
- No real-browser screenshot/responsive inspection completed. Earlier browser
  navigation timed out and Windows Computer Use stopped on URL-confidence policy;
  no attempt was made to bypass that restriction. No visual accuracy or physical
  device QA is claimed.
- No application typecheck, lint, Vitest or build run for this documentation and
  isolated preview deliverable. Those checks remain future implementation gates.
- Existing unrelated working-tree changes preserved. No database mutation,
  migration, deployment, account creation, payment or Git commit performed.

Next: review the plan and Current/Proposed comparisons; implement approved core
phases in small checkpoints, re-reading the current targets first.

## Breakfast offer follow-up (2026-11-13)

User added breakfast choice to the requested plan/proposal. Extended the plan
with Phase A1: Room only / Room with breakfast, explicit covered guests and
hotel-local serving dates, included-package no-double-charge behavior, governed
published prices, atomic hold/booking/folio snapshots, change/refund terms and
staff meal entitlements. Existing global dining information is descriptive, not
a transactional package catalogue; seasonal room-rate plans are not meal offers.
Automatic room assignment remains optional; breakfast is now explicit new scope.

Added a sixth Current/Proposed screen to the same preview. Current is a schematic
of published dining information. Proposed radios update the breakfast charge,
total, deposit and remaining balance in both breakfast and price/review screens.
The sample is 2 guests, 2 mornings, ₱450 each: breakfast ₱1,800; combined ₱6,800;
30% deposit ₱2,040; remaining ₱4,760. Room only remains ₱5,000. Sample prices,
child treatment and serving/refund rules are proposed, not adopted hotel policy.

Executed extended jsdom smoke checks for six screen pairs, opting in/out,
amount consistency, saved meal choice across screen changes/state restoration,
existing controls, unique IDs, script syntax and no network calls: passed.
Detector returned `[]`, exit 0. Browser layout/physical-device QA remains
unverified. No production UI, financial code, migration, database data, hotel
policy, commit or deployment changed.
