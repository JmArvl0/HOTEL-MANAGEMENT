# 2026-09-16 - Expected Arrival: Native Time Input

Guest Details: the **Expected arrival** field no longer opens a custom radial clock popover
(desktop) or a three-column wheel sheet (touch). It is now a plain native
`<input type="time">` — the same control as **Need a ride? → Pickup time**.

Presentation-only swap. Expected arrival keeps its meaning ("the guest's estimated arrival
time at the hotel"), stays required, keeps its canonical `HH:MM` stored value, and stays
completely independent of Pickup time. No booking, early-check-in, transportation or
reservation logic moved.

## What changed

- `components/booking/guest-details-form.tsx` — the only behavioural edit. Dropped the
  `ExpectedArrivalPicker` import and the `arrival` React state; the field is now
  `<label htmlFor="expected-arrival">` + `<input id="expected-arrival" name="expectedArrival"
  type="time" defaultValue={initialArrival}/>`, uncontrolled like every other field. The
  required-value guard moved below `new FormData(...)` and reads `field("expectedArrival")`.
  Message and `.booking-error` presentation byte-identical.
- **Deleted** `components/booking/expected-arrival-picker.tsx` and its test — repo-wide grep
  proved exactly one caller, so nothing else regressed.
- `lib/arrival-time-options.ts` — trimmed to `formatArrival` only; `ARRIVAL_TIME_OPTIONS`,
  `parseArrival`, `arrivalValue`, `arrivalParts`, `arrivalFromParts` were reachable only from
  the deleted picker and its test.
- `app/guest-booking.css` — deleted the whole `.arrival-*` block (trigger, popover, clock
  face/ticks/hands/numbers, segments, periods, wheels, readout) except `.arrival-note`, and
  the dead `,.booking-form-grid .arrival-field>span` selector fragment. The field now inherits
  the shared `.booking-form-grid input` rule, so parity with Pickup time is by construction.
- Tests: `components/booking/guest-details-form.test.tsx` (new, 12 cases) covers rendering +
  explicit label association, no clock/wheel in the DOM, same primitive as Pickup time,
  two-way independence of the times, per-key payload (`expectedArrival` vs
  `transportationPreferences.pickupTime`), prefill round-trip, unchanged required-error,
  keyboard commit, and source contracts for early check-in / transportation / deleted picker
  / dead CSS. `lib/booking.test.ts` dropped the picker-math cases and now pins
  `formatArrival`'s 12-hour rendering directly.

## Key finding

The native time input's value is already canonical 24-hour `"HH:MM"`, exactly what
`guestDetailsSchema` requires (`lib/booking.ts` `timePattern`). The picker was only converting
formats to feed the same hidden input — so **no API, schema, or DB change was needed**.

## Verification

typecheck clean · lint 0 errors (71 pre-existing warnings, none in changed files) ·
targeted 69/69 · **full suite 1187/1187 (106 files)** · build clean · Impeccable detector
clean (no findings).

## Pending

Manual browser QA Flows A–D (compact field level with Nationality, independent 3:00 PM /
1:30 PM values, Review page round-trip, mobile OS picker with no overflow). No browser tool
was available in-session, so the mobile/no-overflow claim rests on the CSS source contract.

Observed but deliberately out of scope: the time input computes to ≈42px at ≤680px against
ui-ux-pro-max's 44×44 touch rule (`app/guest-booking.css` already carries
`@media(max-width:680px){.booking-form-grid select{min-height:44px}}` for selects only).
Fixing it means touching a shared input rule and changing Pickup time's look. Follow-up if
wanted: extend that media rule to `.booking-form-grid input[type="time"]`.

## Related

`SYSTEM.md` §7.2 guest-details field list, §1435 component coverage ·
`DESIGN.md` §11 "Out of scope by design" · `lib/booking.ts` `guestDetailsSchema` ·
[[2026-09-16 - Availability Consistency]]
