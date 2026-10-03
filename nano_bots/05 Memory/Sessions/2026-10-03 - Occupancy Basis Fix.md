# 2026-10-03 — Occupancy basis: the Reports chart was never the room rack (BUG-001)

## Context

An AI-run QA pass as the **Accounting** role on the hosted deployment reported one confirmed bug
(BUG-001): the Reports module's *Seven-day occupancy* chart showed **Saturday 30%** (seven-day
average 4%) while the same page's *Room status* snapshot and the Overview showed **0 occupied,
0 reserved, 10 available**. The report's allowance: *"Saturday should agree with the current state,
or the chart should clearly label a different time basis."*

It was the second option. Two different quantities were both called "occupancy", presented side by
side with nothing saying so:

| | Trend chart | Room status / Overview card |
|---|---|---|
| Source | `reservations.check_in`/`check_out` (stay dates) | `rooms.status` (the live rack) |
| Numerator | reservations whose stay **covers** the night | rooms marked `occupied` / `reserved` |
| Denominator | `serviceableRooms` (active, minus maintenance-blocked) | all rooms in `roomMix` |

Three reservations covering tonight over ten serviceable rooms is 30%; Front Desk having marked no
room `occupied` yet is 0%. **Both are true** — the defect was that nothing said which basis was
which, and the chart's title and "Daily share of rooms occupied or reserved" actively invited the
wrong comparison with the panel beneath it.

## Root cause — two real defects behind the report

1. **A departed guest was counted as occupying tonight.** `lib/data.ts:57` counted
   `["confirmed","checked_in","checked_out"]` for *every* day of the window, today included, so a
   `checked_out` stay whose `check_out` is still in the future (early departure) was reported as a
   room occupied **tonight**. The analytics engine already had the correct rule:
   `NIGHT_COVERING_STATUSES` (confirmed + checked_in) for current/future nights,
   `NIGHT_COVERING_PAST_STATUSES` (adds checked_out) for nights already past —
   `lib/analytics/types.ts:12-13`, `lib/analytics/occupancy.ts:51-59`.
2. **The night-covering rule existed in three hand-rolled copies** — `lib/data.ts:57`,
   `app/api/owner/data/route.ts:145`, and the tested `countNights` in
   `lib/analytics/occupancy.ts`. Three copies of the statuses/stay-date basis is exactly how the
   dashboard and the engine can silently disagree.

The intended outcome is not that the two numbers match — it is that **one** definition of "a
reservation covers this night" exists, and every surface says which basis it is showing. The chart's
last point is deliberately **not** forced to equal the live rack number: a booked 30% beside a rack
0% is a real signal (rooms sold for tonight, none assigned/marked yet), and
`metrics.unassignedArrivals` already carries the operational action for it.

## The fix

- **`lib/analytics/occupancy.ts`** — new `bookedOccupancyTrend(reservations, totalRooms, today, days = 7)`
  returning `{ date, day, occupancy }[]`, oldest first, ending today. It reuses `countNights` (so
  statuses, stay-date basis and the UTC date-only labelling are shared with the forecast) and passes
  `date < today` as the `past` flag — **that is the fix for defect 1**: the last point counts only
  stays actually covering tonight. The denominator is caller-supplied, documented as such.
- **`lib/data.ts`** — the local `shiftDay`, `weekday` and five-line filter are gone;
  `occupancyTrend = bookedOccupancyTrend(reservations as unknown as ReservationLike[], serviceableRooms, today)`
  (same `serviceableRooms` denominator as `metrics.occupancy`, so only the numerator basis differs).
  The row cast follows `lib/analytics/data.ts:36,64`.
- **`app/api/owner/data/route.ts`** — the Owner executive trend uses the same helper
  (`serviceableRooms.length`, keys on ISO `point.date` for its `dayLabel`), keeping its per-day
  `collected`/`refunded` sums. The now-dead local `shiftDay` was deleted.
- **`lib/types.ts:18`** — the field carries a doc comment naming the basis (shape unchanged, so no
  fixture had to change).
- **Copy on every surface that shows a booked figure next to a rack figure.** Reports:
  *Seven-day booked occupancy*, sub-copy "Rooms with a stay covering each night … not the live room
  rack. The last point is today.", KPI *Average booked occupancy*, aria-label, `<details>` summary
  and table caption/column, and the Room status panel now reads "Live room distribution from the
  room rack — updated by Front Desk actions, independent of reservation stay dates." Overview:
  *Booked occupancy this week* + "from reservation stay dates", and the paired card hint now says
  **Live room rack**. Owner Executive: *Booked occupancy — last 7 days* (heading, aria-label, chart
  title/description, series label, table column) with the paired tile renamed *Current occupancy ·
  Live room rack*.

## Tests — `lib/analytics/occupancy.test.ts`

New `describe("bookedOccupancyTrend — the dashboard/report basis")`, 5 cases, node env, no mocks:
seven oldest-first points ending today with UTC weekday labels (`Wed…Tue` for `2026-09-08`, and a
shorter window), half-open `[check_in, check_out)` per-night counting, **the defect-1 regression pin**
(a `checked_out` stay counts for the nights it covered but never for tonight), cancelled/no_show/
pending ignored on every night, and caller denominator (3 of 10 → 30; 0 rooms → 0, no `NaN`).

Copy-pinning component tests updated: `performance-reports.test.tsx` ("View booked occupancy data")
and the five `"Occupancy this week"` literals in `overview-composition.test.tsx`. No test
regex-pinned the old trend code or the Owner chart heading — verified by grepping every test that
reads `lib/data.ts` or the owner route.

## Verification

- `npm run typecheck` — clean. `npm run lint` — 0 errors, 70 pre-existing warnings (no new).
- Focused run of 10 test files / 114 tests — all passed.
- Full `npx vitest run` — 177 files / 1988 tests, **1 failing**: `lib/password-reset-audit.test.ts`
  (pre-existing CRLF assertion, [[KI-012]], unrelated).
- `npm run build` — clean.
- Not deployed: no push was requested, so the hosted deployment still shows the old labels.

## Docs updated

`SYSTEM.md` (§ "Dashboard numbers are computed, not literal" now states the booked basis and that
the live figure is the room rack, and that the Owner trend uses the same helper) ·
`nano_bots/01 Project/Roadmap.md` (the stale "replace hardcoded `occupancyTrend`" candidate moved to
Done) · `nano_bots/03 Reference/Data Model.md` · `nano_bots/02 Architecture/API Routes.md` ·
`research-paper/04-system-design-and-architecture.md` (the "seven-day trend history is partially
literal" claim was no longer true) · [[D-033]].

## Unresolved / next

- **Browser/UI confirmation pending** ([[KI-005]]): as Accounting and as Manager, open Reports and
  check that the chart reads as booked occupancy with today's point last, the Room status panel reads
  as the live rack, and the Overview card hint says Live room rack — then the Owner Executive chart.
- **The QA report's second item is untouched by design** — repeated immutable receipts / folio
  statements for the same source records. The report itself does not count it as a confirmed bug and
  says it needs product clarification, so it is recorded in [[Known Issues]] awaiting a reproduction
  (document numbers + timestamps), not "fixed" on a guess.
- Working tree at the time of writing holds this change plus the other 2026-10-03 work stream; not
  committed or pushed here.
