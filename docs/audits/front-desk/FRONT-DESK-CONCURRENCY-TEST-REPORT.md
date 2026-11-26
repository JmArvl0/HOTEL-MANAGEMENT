# Front Desk concurrency and write performance

November 24, 2026 · Local synthetic property

All ten workload and reconciliation checks passed. The timed bursts returned
213 successful responses and 123 expected business conflicts across 336
requests. The largest bursts issued 48 simultaneous requests from 12 signed-in
Front Desk accounts. Each accepted result reconciled with PostgreSQL. The
fixture recorded zero overlapping active assignments, duplicate effects,
overcollections, missing folio links or unexpected HTTP failures.

## Fixture and method

The production-mode Next.js 16.4.6 build ran on Node 22.22.2, with local PostgREST
16.5 and PostgreSQL 18.6. The database was cloned from the local ledger through
`20261124020000`, and the candidate extension replay migration
`20261124030000` was applied to that clone. The workload began with 150 rooms
and 1,276 synthetic reservations. Five stays used regular Front Desk booking,
identity verification, synthetic tender, assignment and check-in for folio
setup. Booking saturation, assignment competition and active folios used
separate room cohorts. Transactions used synthetic offline bank-transfer
references. All services and browser requests used loopback.

Two setup runs were excluded from the timing table. One reused rooms now
occupied by the folio setup, and the other tried to check in five guests
against already saturated background inventory. The final run used five
dedicated folio rooms within the same 150-room fixture.

The measured bursts issued requests together through real Front Desk sessions.
Request timings include the session, application, database and response
decoding. Percentiles use nearest rank and exclude sign-in and fixture
setup. The runner sampled `pg_stat_activity` approximately every 15 ms during
bursts. It observed advisory, transaction ID and tuple waits, with up to nine
database sessions waiting on locks in a sample. The workload is a set of
finite bursts. Staging still needs a sustained run with production-like
infrastructure and a workload agreed by the property.

## Timed outcomes

| Workload | Requests | 2xx / 409 | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Same-type capacity, three 24-request waves | 72 | 24 / 48 | 310 | 1,055 |
| Identical booking attempt | 12 | 12 / 0 | 144 | 146 |
| Contested assignment, three eight-request waves | 24 | 12 / 12 | 102 | 209 |
| Distinct charges against one folio | 12 | 12 / 0 | 150 | 222 |
| Identical folio charge attempt | 12 | 12 / 0 | 133 | 134 |
| Identical synthetic payment attempt | 12 | 12 / 0 | 146 | 173 |
| Payments competing for one balance | 12 | 4 / 8 | 193 | 196 |
| One reference submitted against two folios | 12 | 1 / 11 | 141 | 142 |
| Mixed 24 · bookings | 24 | 24 / 0 | 255 | 265 |
| Mixed 24 · assignments | 24 | 12 / 12 | 252 | 264 |
| Mixed 24 · charges | 12 | 12 / 0 | 250 | 265 |
| Mixed 24 · payments | 12 | 12 / 0 | 255 | 265 |
| Mixed 48 · bookings | 32 | 16 / 16 | 458 | 564 |
| Mixed 48 · assignments | 32 | 16 / 16 | 458 | 565 |
| Mixed 48 · charges | 16 | 16 / 0 | 458 | 565 |
| Mixed 48 · payments | 16 | 16 / 0 | 457 | 564 |

The first same-type capacity wave took 1,059 ms to complete. The next two
took 334 ms and 281 ms. The mixed 24-request waves finished in 253–267 ms.
The mixed 48-request waves finished in 461–568 ms. Treat these as measured
loopback observations. Peak concurrency at the HTTP client and rows observed
waiting in PostgreSQL describe different parts of the workload.

## Reconciliation

- Each 24-attempt booking saturation wave committed eight reservations,
  eight unique confirmations and eight invoices for the eight-room cohort.
  Each remaining attempt returned the capacity conflict. A separate 12-way
  retry replayed one reservation and invoice, and the request lookup returned
  the same reservation.
- Each assignment wave produced one active assignment per contested room and
  matched its reservation pointer and stay dates. The rejected stays in the
  cohort stayed unassigned. The final overlap query returned zero.
- Twelve distinct incidentals posted once each. An additional 12-way charge
  retry posted one charge. A 12-way synthetic payment retry recorded one
  payment and one receipt and left the expected ₱90 folio balance.
- Twelve ₱25 payments competed for a ₱100 balance. Four settled exactly ₱100,
  eight received the balance conflict and credit stayed ₱0. In a separate
  cross-folio reference race, one attempt created a payment and receipt and
  the remaining eleven received `DUPLICATE_PAYMENT_REFERENCE`.
- Five mixed waves added 40 bookings, 28 room assignments, 28 charges, and
  28 payments with their receipts. PostgreSQL matched the folio totals after
  each wave. The final run persisted 150 booking results including the setup
  bookings, bringing the fixture to 1,426 synthetic reservations.

## Confirmed follow-up

**FD-API-002 · Generic sold-out message (P3).** The original 64 timed capacity rejects
returned HTTP 409 with `ROOM_TYPE_UNAVAILABLE` and displayed generic recovery
copy. An independent Edge run at 1366 × 768 opened a valid booking review,
then let eight other reception accounts take the remaining rooms. Submitting
the reviewed booking correctly returned the operator to availability and
added zero reservation rows. The on-screen alert did not explain that the
room type had sold out. The route's original message was missing from the
shared public error catalog, so the formatter replaced it with a fallback.
[Reservation route](../../../app/api/front-desk/reservations/route.ts) ·
[Public error catalog](../../../lib/error-messages.ts) ·
[Original Edge evidence](evidence/post-audit/1366x768-capacity-conflict.png)

**Verified fixed locally.** The route now uses the approved availability
message. In Edge, eight other synthetic bookings took the remaining rooms
while the form was on Review. Creating the reviewed booking returned HTTP
409 and showed the room-type explanation. The form returned to Stay and
room, fetched availability for the same dates, removed the sold-out choice,
and showed alternatives. PostgreSQL showed zero reservations, invoices or
successful request results for the rejected attempt.
[Updated Edge screenshot](evidence/post-audit/1366x768-capacity-message-fixed.png) ·
[Verification results](evidence/post-audit/fd-api-002-results.json)

## Staging and property acceptance

| Owner | Remaining verification or approval |
| --- | --- |
| Release and database team | Check the staged migration ledger, including the extension replay migration. Repeat the timed workloads against staged Next.js, PostgREST and PostgreSQL. Measure end-to-end p95 and p99, lock and pool waits, request timeouts, and slow or stuck transactions across a sustained peak window. Compare HTTP outcomes with reservations, assignments, folios and receipts. |
| Property Front Desk and Revenue | Confirm realistic desk count, booking bursts, stay mix, room blocks and property-specific readiness rules. Agree on response-time and recovery targets. Exercise manual retry, different arrival dates, and a quote that sells out between review and submission. |
| Booking and integration owners | Repeat the [locally verified shared-inventory races](FRONT-DESK-SHARED-INVENTORY-TEST-REPORT.md) against staged infrastructure, including hold expiry, exact-room contention and network interruption. Provider processing and Fleet remain separate integration acceptance. |
| Property and Finance | Approve accepted tender methods, drawer and settlement responsibilities, receipt reconciliation, and escalation of duplicate references. Run those checks with approved synthetic or sandbox records. Physical ID hardware and property pilot sign-off remain open. |

The [machine-readable evidence](evidence/post-audit/front-desk-concurrency.json)
contains the per-burst elapsed durations, HTTP status and code
counts, lock samples, database checks, and the separate browser finding. The
earlier [read and workstation regression](FRONT-DESK-POST-AUDIT-REGRESSION.md)
records read-side timings and the desktop matrix.

## Build and automated checks

| Check | Result |
| --- | --- |
| `npm run build -- --webpack` | Passed on Node 22.22.2 with local settings and an isolated output directory. |
| `npm run typecheck -- --incremental false` | Passed. |
| `npm run lint` | Passed with zero errors and 74 existing warnings. |
| Targeted Vitest · Front Desk operations, extensions, accounting, room rack and public errors | All 152 tests passed across five files. |
