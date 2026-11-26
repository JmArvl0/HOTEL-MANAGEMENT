# Predictive Analytics improvement plan

## 1. Fix the inputs that drive decisions

| View | Implementation | Acceptance check |
| --- | --- | --- |
| Occupancy | Learn net pickup from saved booking counts paired with verified occupied nights at the same lead time. Use Manila hotel dates. Surface booked rooms, expected occupied rooms, currently sellable capacity, and overbooking separately. | A booking after Manila midnight does not enter the prior day. A verified zero is valid evidence. A cancellation can reduce the estimate. Zero capacity and overbooking surface explicitly. |
| Demand & Rate | Resolve the active selling rate for each room type and stay date. Measure the suggestion against that rate, use recorded booking-state changes for pace, and reject proposals if the reviewed recommendation has changed. Preserve the review and approval trail. | An active ₱6,500 rate with a ₱5,750 suggestion shows a decrease. A recent cancellation of an older booking affects pace. A stale proposal requires a fresh review. |
| Housekeeping | Separate today's open queue from scheduled work. Deduplicate expected turnovers against real tasks and group measured durations by task type. | When a guest checks out, the pending room clean remains visible and counts once. Missing durations show as unavailable. |
| Inventory | Use eligible closed days with evidence of consumption or confirmed zero. Keep unknown days visible as gaps and show both observed below-par stock and projected shortages. | A newly tracked item with seven 10-unit consumption days projects 30 units over three days. Missing records never display as zero usage. |
| Maintenance | Exclude cancelled orders, compare equal-length windows, and associate incidents with registered equipment only when the evidence uniquely identifies it. | Cancelled orders cannot trigger a flag. Three recent issues versus two in the preceding 30 days show an increase. Ambiguous asset matches remain room-level. |

## 2. Make forecast evidence defensible

- Preserve the original saved forecast, generation time, model version, target date, lead time, and baseline. Grade occupancy and housekeeping at 1, 3, and 7 days and inventory over its three-day window.
- Show how many rows can score the model and how many have a fair baseline comparison. Explain exclusions and keep the two methods on the same rows for head-to-head results. Display snapshot freshness and distinguish unrecorded outcomes from genuine zeros.
- Keep same-calendar-date seasonal comparisons available and offer a nearest matching weekday in the reference year. Show exact reference dates, source, and completed-day coverage. Use verified evidence for occupied-room actuals. Label any older night-audit booked-room reference as booked occupancy and keep its definition visible.
- Keep rate decisions advisory. Make reviewed and approved values traceable and show recorded same-room-type nightly rates where there is evidence, without attributing revenue changes to the recommendation.

## 3. Improve the desktop workflow

- Keep Haven's current light and dark tokens. Place the actionable rate table directly below its chart. Make the seven views reachable from the page when the desktop sidebar is crowded.
- Keep the selected date, room, or item and relevant units visible. Provide exact chart values in readable tables and preserve existing keyboard controls.
- Verify at laptop and monitor widths with the sidebar open and closed. Exercise cold start, missing snapshot, stale proposal, and populated forecast states.

## 4. Verify and release

- Run analytics regression tests, typecheck, lint on changed code, the full unit suite, and a production build. Record browser checks separately from automated checks.
- Verify one deployment's scheduled snapshot generation and accumulated observation counts before citing real accuracy in the defense. Compare figures by metric, horizon, and model version.
