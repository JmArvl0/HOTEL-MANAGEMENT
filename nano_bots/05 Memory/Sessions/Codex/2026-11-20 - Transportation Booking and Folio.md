# Transportation booking and folio

## Existing implementation discovered

- Exact-room booking already carried optional pickup, drop-off, and round-trip preferences through a temporary hold into the reservation. Verified payment triggered the local request filer with a deterministic key. Existing Xendit checkout supported deposit and full-stay payment.
- The guest portal already supported requests and early cancellation. Front Desk operated a versioned queue connected to a vehicle-type catalog. Hotel assignment posted a flat fare through the existing folio.
- Fleet already had consent, per-leg references, an idempotent dispatch outbox, authenticated and ordered callback evidence, guest-safe assignment and tracking, and fare revisions in PHP centavos. The existing partner adapter remains the integration point.

## Problems found

Confirmation inferred submission from saved preferences. It could show success when the confirmed reservation had no request. Guest links did not choose the originating stay. Payment copy did not explain when the future fare would reach the folio. The assignment RPC could apply a local rate to a Fleet-dispatched ride and used balance arithmetic that ignored folio credit. Cancelling a stay did not close its uncommitted rides.

## Booking and guest account

- Guest Details defaults to **No thanks**. Choosing **Arrange transportation** reveals route, date, time, party size, and optional notes. Departure and return dates default to checkout. The fields disable when the guest opts out, so an unfinished ride can be skipped. Flight, terminal and luggage fit in ride notes. Passenger details retains its structured luggage fields.
- Review and payment explain when the fare will appear on the folio. Confirmation reads the saved request, shows its route and progress, and offers the scoped form if the request was never filed. Reopening confirmation only reads the record.
- Reservation details link to the exact stay in Transportation. Guests can add or cancel eligible rides, view local or per-leg partner progress, and see posted transportation alongside other charges in the Folio tab. The folio marks reversed and partially reversed entries.

## Database, Fleet and validation

- Before numbering the new migration, a read-only hosted query found 153 migrations through `20261120020000`. The additive `20261120030000` migration uses the existing transportation, Fleet and folio tables.
- A hotel-operated fare is confirmed at assignment with a vehicle large enough for the party. The selected catalog fare is checked again in PostgreSQL.
- An attempted Fleet dispatch makes the local flat-rate assignment unavailable. Front Desk confirms the agreed fare in **Pickup & Fleet** once each leg has an applicable current PHP fare revision. The write locks the reservation, request and leg revisions, preserves the original charge idempotency key, and recomputes the existing folio from settled payments and credit. Zero fares create no charge. Later Fleet corrections stay visible for Accounting review.
- Ride updates use the existing authenticated callbacks and stored projections. Booking confirmation performs no Fleet dispatch. Staff can see assignment information in Pickup & Fleet when the partner has provided it.
- Ownership, role, active stay, date window, distinct endpoints, passenger count, same-day return order, and duplicate guards apply. Cancelling an uncommitted ride leaves the stay confirmed. Cancelling a stay closes its uncommitted local rides. Front Desk coordinates later-stage or dispatched rides, and Accounting handles posted fare reversals.

## Verification

- Existing suite on Node 22.22.2 passed 2,662 tests across 268 files with a 20-second test timeout. The first run used outdated UI assertions and hit two source-scanning timeouts. The affected assertions now follow the opt-in controls.
- Typecheck and the isolated production build passed. Scoped ESLint reported zero errors and five existing warnings in the staff workspace. The design detector found the existing gateway accent border.
- Replayed the full migration directory in disposable PostgreSQL. The backend regression harness reported zero failures. The 18 Xendit and 19 Fleet SQL cases passed, including no ride and all three ride types, expired holds, failed and retried payment, isolated filing failure, local assignment and completion, posted-charge idempotency, concurrent staff confirmation, changing Fleet fare revisions and cancellation boundaries.
- Authenticated Edge checks against local PostgreSQL and the production build covered 1440, 390 and 320px. Verified keyboard opt-in, round-trip review, confirmation reload, full stay payment copy, the confirmed ride charge in Folio, reservation-scoped drop-off, ride-only cancellation, and the filing failure recovery link. The 320px test confirmed that date and time controls stack and fit. Screenshots are in the ignored `.tmp/transportation-folio-qa` directory.

## Remaining limitations

The new fare migration and app changes are local. Live Fleet, payments and dispatch credentials were outside this verification. The current checkout has no guaranteed prepayment offer for new rides. Late Fleet fares and corrections on a closed folio require Accounting. Partner cancellation is a staff coordination step.

## Files changed

| File | Change |
|---|---|
| `app/(booking)/booking/review/[token]/page.tsx` | Pending fare and optional edit link. |
| `app/(booking)/booking/payment/[token]/page.tsx` | Explains later folio posting. |
| `app/(booking)/booking/confirmation/[id]/page.tsx` | Reads and displays the saved request, scoped links, and failure recovery. |
| `app/(booking)/(customer)/account/transportation/page.tsx` | Verifies and opens the selected stay. |
| `app/(booking)/(customer)/my-reservations/[id]/page.tsx` | Loads the stay-specific rides and eligibility. |
| `app/api/booking/holds/route.ts` | Rejects a hotel endpoint entered as the external stop. |
| `app/api/account/transportation/route.ts` | Handles location and retry conflicts with guest wording. |
| `app/api/account/transportation/[id]/cancel/route.ts` | Explains staff-assisted cancellation. |
| `app/api/transportation/route.ts` | Identifies staff queue entries already attempted through Fleet. |
| `app/api/transportation/[id]/transition/route.ts` | Accepts the reviewed local fare and maps assignment conflicts. |
| `app/api/transportation/[id]/fleet/route.ts` | Exposes staff assignment and fare evidence and accepts confirmation from Front Desk. |
| `app/guest-booking.css` | Styles the opt-in and wraps long routes. |
| `components/booking/guest-details-form.tsx` | Opt-in and progressive ride details. |
| `components/booking/guest-details-form.test.tsx` | Verifies skip behavior and independent ride and arrival times. |
| `components/customer/error-recovery.test.tsx` | Exercises transportation retry with the updated reservation form. |
| `components/customer/fleet-ride-safety.tsx` | Uses guest-facing assignment labels and shows available details. |
| `components/customer/reservation-detail-view.tsx` | Reservation-scoped access, ride progress, fares and charge reversal labels. |
| `components/customer/transport-pickup-profile.tsx` | Staff fare review, confirmation and current assignment details. |
| `components/customer/transportation-request-form.tsx` | Preserves stay selection, defaults passengers and opens from the scoped link. |
| `components/customer/transportation-request-list.tsx` | Displays fare and per-leg updates and handles cancellation recovery. |
| `components/manager/transportation-panel.tsx` | Checks vehicle capacity and reviewed rate and displays posted fare. |
| `lib/transportation-display.ts` | Shared booking preference type, labels and scoped link. |
| `lib/transportation.ts` | Scopes server reads and projects guest-visible data from current legs. |
| `lib/transportation.test.ts` | Updates the optional control contract. |
| `scripts/fleet-wire-db-test.mjs` | Covers fare evidence, authority, exact posting and dispatch cancellation limits. |
| `scripts/xendit-sandbox-db-test.mjs` | Covers optional transport, payment and filing failure, local fare and cancellation. |
| `supabase/migrations/20261120030000_confirmed_transportation_folio_fares.sql` | Adds posting, cancellation and route guards to existing records. |
| `SYSTEM.md` | Records the verified booking and folio contract. |
| `nano_bots/05 Memory/AI Session Handoff.md` | Records the current implementation state. |
| This session record | Implementation inventory and verification. |
