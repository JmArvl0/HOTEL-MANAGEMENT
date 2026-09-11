# 2026-09-29 - Consolidated Guest Profile

## Task

Roadmap Phase 2 of the post-audit improvement plan (`/impeccable` continuous execution,
Phases 2→9): a staff-facing consolidated guest profile built from existing real data —
identity, stay history, service history, explicit preferences, role-gated financial summary.
Explicit constraints honored: no payment-proof images, no ID documents, no invented loyalty
tiers, no inferred VIP or preferences, not "another giant raw database table".

## What was delivered

No migration (pure read surface over existing tables).

1. **`getStaffGuestProfile(id, role)`** in `lib/staff-data.ts` — mirrors the
   getStaffReservation/getRoomDetail batched-Promise.all pattern (no N+1):
   - Identity: guests row (contact/nationality/address/loyalty) + ID-verification status
     from the guest's stays.
   - Stays: all reservations by `guest_id`, newest first, grouped into
     `stayCounts` {current, upcoming, completed, cancelled, noShow}.
   - Service history: guest_requests, transportation (`canViewTransportation` gate),
     reservation_room_assignments (room changes), manager_approval_requests
     (**manager/owner only** — front desk never receives the approval trail).
   - Preferences: stored guest preferences/special requests + request options across
     bookings, deduplicated — display only, never inferred.
   - Financial: invoices across the guest's stays summed centavos-exact
     (billed/paid/outstanding), gated on `canViewReservationFinancials`
     (owner/manager/front_desk/accounting — every profile-accessible role today; the gate
     is structural defense). Payment proofs and identity documents are never selected.
   - Demo-mode twin included.
2. **`GET /api/staff/guests/[id]`** — guard `canViewGuestContact` (owner/manager/front_desk),
   GET only, same shape as the rooms dossier route.
3. **UI** (`manager-dashboard-client.tsx`): `GuestProfileModal` (approval-review-modal
   pattern) with Identity | Stay history grid, Current & upcoming stays (each opens the
   reservation detail), Past stays, Preferences, Service history, Financial summary.
   Entry points: new "Profile" row action in the Guests module (ResourceView gained a
   `viewGuest` prop + guests Actions column) and a "Guest profile" footer button in
   ReservationDetailModal when the reservation has a `guest_id`.

## Verification

- `lib/guest-profile.test.ts` — 9 tests: stay grouping, financial aggregation (1500.5 /
  1100.5 / 400 across two folios), cross-guest isolation (fake-supabase applies filters),
  request-option dedup, front-desk approval-trail exclusion, unknown-guest null, route
  guard source scan, no-proof/no-ID-column scan (bounded to the profile function), gated
  invoice query scan.
- `lib/room-details.test.ts` fix: its "never queries financial or guest-contact data for a
  room" test sliced staff-data from `getRoomDetail` to EOF; now bounded to
  `getStaffGuestProfile`'s start (the new function legitimately queries guests/invoices).
- Full gates: typecheck clean, eslint clean on touched files, **887/887** tests, build green.
- Live smoke via service-role client against the remote DB: every column list in the new
  queries verified on real data (busiest guest GST-9E0FD765: 5 stays, 6 requests,
  1 approval, 5 invoices — all queries OK).
- Docs: SYSTEM.md §7.9 (profile paragraph) + §11 (staff dossiers line — also corrected the
  stale `/api/catalog` staff-route path to `/api/staff`, route count 93→96 actual).
- Pending manual verification: opening the modal as manager/front_desk/owner logins.

## Affected files

- `lib/staff-data.ts` (+`getStaffGuestProfile`, +`guestStayCounts`, imports)
- `app/api/staff/guests/[id]/route.ts` (new)
- `components/manager/manager-dashboard-client.tsx` (GuestProfile type, state, fetch,
  ResourceView viewGuest prop + guests action column, ReservationDetailModal footer button,
  GuestProfileModal)
- `lib/guest-profile.test.ts` (new), `lib/room-details.test.ts` (bounded slice)
- `SYSTEM.md`, `Current Status.md`, this note

## Unresolved / next

- Manual UI verification needs role logins (recorded in Current Status).
- Phase 3 (rate plans) next — the largest phase: room_rate_plans migration + resolver RPC,
  ~10 pricing sites recreated from LIVE bodies, nightly-rate freeze columns, propose→approve
  governance, TS mirror, UI, tests. Verify next free migration number at start.
