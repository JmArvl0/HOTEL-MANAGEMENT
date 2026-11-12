# Exact-room booking implementation — 2026-11-11

Implemented the approved prototype in the application: landing type selection →
dedicated `/booking/rooms/[type]` → exact numbered room → sign-in/register/OTP →
guest details → review → existing deposit flow → confirmation. The selected room
travels in the callback URL, then in the server-owned hold and reservation.

Physical rooms, rates, descriptions, amenities and photos use the existing catalog.
All published rooms remain visible; unavailable rooms are gray, disabled and last.
Dates have an added range calendar while retaining editable date inputs. Shared
mobile field supports PH+63 by default, local/international PH normalization,
SVG flags and searchable calling codes for the eight reviewed country options.
Registration continues to save mobile to the guest profile for details autofill.

## Database

Live ledger was read before numbering. Isolated Supabase CLI dry-run/push contained
only `20261111010000_guest_exact_rooms.sql` plus already-applied history. All other
pending migrations were excluded. Push succeeded and the version was verified in
the remote ledger. No hotel reservation, account, email or payment was created for
hosted QA. The additive schema is compatible with existing type-capacity callers.

Exact holds share the existing type advisory lock and frozen pricing/policy RPC.
Manual and gateway conversion allocate the selected room transactionally. Staff
assignment writes check guest claims. Owned hold edits replace the old hold in
the same transaction. Expiry, cancellation, wrong type and ownership are covered.

## Verified

- Production release build passed in `.tmp/exact-room-build-release`; typecheck
  passed. Build-only next-env/tsconfig changes restored from pre-build snapshots.
- Full checkpoint: 2,434 tests /229 files passed. Final affected behavior suite:
  55 tests /7 files passed, including two additional calendar tests.
- All touched TS/TSX lint: zero errors; one existing unused Sparkles import warning.
- Isolated PostgreSQL clean replay and23 backend regressions passed; nine exact-room
  tests cover concurrency, manual/gateway conversion, staff conflict, owned editing,
  expiry, back-to-back dates, cancelled assignment release, wrong type and ownership.
- HTTP checks:16 assertions passed against the production app. Actual catalog had
  five Deluxe King and two Garden Twin rooms. Verified type redirect, numbered
  cards, callback roomId/type, full login/register context, mobile markup, disabled
  unavailable cards/details, flag MIME and unauthenticated hold API401.
- Impeccable detector returned no findings for the new page and components.

## Limits and review

Computer Use stopped because it could not determine the current Windows browser
URL confidently enough to enforce policy. No alternate browser-control method was
used. Rendered visual/responsive checks and authenticated live OTP/booking/upload
walkthrough remain pending; HTTP/jsdom/SQL results do not substitute for those.
The available runtime is Node24.21.0; package engines require Node22.22.2–22.x,
so supported-runtime release verification remains pending.

No application deployment, commit or push. Local production app:
http://localhost:3014 (current server session40003). Receipts/HTML and isolated CLI
workspace: `.tmp/exact-room-release/`. Flags are local flag-icons SVGs with MIT
license at `public/flags/LICENSE`. Existing generated room photography is unchanged.
