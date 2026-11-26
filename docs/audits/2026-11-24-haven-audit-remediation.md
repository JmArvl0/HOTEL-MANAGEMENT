# Haven Hotel audit remediation

Status as of November 24, 2026. The Hotel changes are in the local release candidate. The hosted migration ledger was reviewed read-only. Finance and the other subsystem teams are still preparing their environments.

## Audit findings

| Finding | Local result | Acceptance still due |
|---|---|---|
| A01 and A08 · Dependencies | Next.js 16.4.6, Sharp 0.35.5, source-map-js 1.2.4, Nodemailer 10.6.1 and Zod 4.6.7 resolve with zero reported production advisories. A clean npm 10 install passed. The existing credential sign-in and SMTP test route worked on the built app. | Verify the intended hosted app and mail provider. Plan separate compatibility testing for the React 18 deprecation reported by Next.js. |
| A02 · Payments | The local Xendit sandbox suite verified duplicate and out-of-order delivery, amount and reference checks, expiry, late settlements, and concurrent booking/payment claims. | Run the approved provider rehearsal for settlement, reconciliation and refunds before taking live payments. |
| A03 · Close Day | The Owner can assign a primary and backup Manager in **Operations → Operating day & close**. An audited PostgreSQL permission governs activation and close. The close still checks arrivals, departures, drawer reconciliation, settled ledger data and frozen rates before changing the business date. | The Hotel Owner selects the actual Managers. Existing Accounting operators cover drawer reconciliation, payout, and other remaining financial actions until Finance accepts the handoff. |
| A04 · Folio state | Manager bookings preserve unknown folio balances and show actual zero balances as settled. The paginated Front Office queue applies the same distinction. | Recheck representative older migrated stays during the hosted rehearsal. |
| A05 · Staff reads | Front Office booking search and pagination run in PostgreSQL. The default date window, full history, closed outcomes, daily counts and overdue work remain available. Staff Overview reads scoped rows and Accounting requests sections independently. | Measure property-size loads and expand server-side pagination for long Accounting transaction and document histories. |
| A06 · Integration | The closed-day JSON and draft Finance acknowledgment can be reconciled offline. Isolated tests covered existing Workforce, Fleet, breakfast, inventory/receiving and Facilities boundaries. | Finance approves journal mapping, payout acknowledgment and correction workflows. HR, Fleet, Restaurant, SCM and Facilities approve each test environment, record mapping and acceptance before activation. |
| A07 · Release | CI now runs a disposable migration replay, Hotel SQL workflow tests, a production dependency audit and signed-in browser smoke. The local built app also ran through actual PostgREST and a disposable PostgreSQL clone. | Run the hosted Preview with the same app and schema, then obtain rollout approval. |
| A09 · Room Rack | Room cards render the saved room-type palette in both themes. At mobile width, the action labels remain visible and the header fits its content. | Include normal staff touch and physical camera use during the operations walkthrough. |
| A10 · Public location | The landing and Stay Guide handle invalid published location data. Location validation tests and the production build passed. | Confirm the intended hosted location data and configuration. |

## Release evidence

- The full Vitest checkpoint passed 2,746 tests across 276 files. The final mobile revisions passed 36 targeted tests. Repository lint reported zero errors and 74 existing warnings. TypeScript and production build `AmyoKbfzLndzGTQ_cgHvR` passed. Sharp decoded a sample WebP and encoded it as PNG.
- The hosted ledger has 155 migrations through `20261120040000`. The local candidate adds six matching migration files beginning with `20261121010000` and ending with `20261124020000`. The read-only comparison found zero unexpected versions or migration name differences.
- The database replay exercised eight-role RBAC, booking and guest controls, concurrent Close Day and revocation, Xendit sandbox, Workforce, Fleet, breakfast, receiving, and Facilities room safety. The real PostgREST run searched 1,300 historical bookings and returned page 125. The 12 local requests had a 29 ms median in the final fixture run.
- Signed-in Edge verified the Front Desk and Manager Close Day boundary, Owner access, Room Rack palette contrast in two themes, and the guest’s owned booking PDF. The built email settings route authenticated to a loopback TLS server and delivered one synthetic test message.

Before retiring the remaining Accounting access, Finance and the Hotel must reconcile a representative closed day, a refund and a correction. After sign-off, the Hotel can deactivate the existing login through account governance while retaining the user ID on historical records.
