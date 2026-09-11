# Guest Reminders (Roadmap Phase 4)

**Date:** 2026-09-30
**Scope:** Post-audit roadmap Phase 4 — guest communication automation (pre-arrival + pre-departure reminders, booking-confirmed email enrichment).

## What was built

- **Migration `20260930010000_guest_reminders.sql`** (pushed + live-verified):
  - `notifications.type` check constraint swapped to include `pre_arrival_reminder` and
    `pre_departure_reminder`.
  - New `guest_reminder_deliveries` table: `reservation_id` (text, FK → reservations),
    `kind` (`pre_arrival` | `pre_departure`), `status` (`sent` | `failed`, default `sent`),
    `error`, `sent_at`. **Unique index `(reservation_id, kind)`** — this is the entire
    idempotency mechanism. RLS on, no policies, service-role only.
- **`lib/guest-reminders.ts`** — `runGuestReminders(tomorrow = hotelDateWithin(1))`:
  - Pre-arrival: `status = confirmed` and `check_in = tomorrow`. Email/notification body:
    confirmation number, room type, stay + guest count, check-in time (reservation's frozen
    policy snapshot → current policy → 14:00), approved early check-in when present,
    scheduled transportation (SCHEDULED/ASSIGNED).
  - Pre-departure: `status = checked_in` and `check_out = tomorrow`. Body: confirmation,
    room + number, checkout by time, outstanding folio balance **only when > 0**, scheduled
    transportation.
  - **Idempotency = INSERT-claim**: each send inserts into `guest_reminder_deliveries`
    first; a 23505 duplicate-key means "already sent" → skip. Cron retries, redeploys, and
    manual re-runs can never double-send.
  - **Email is secondary**: in-app notification (`recordNotification`, never-throw) always
    lands when `user_id` exists; the Resend email is best-effort and a failure only marks
    the delivery row `failed`. Nothing can affect hotel operations.
- **`app/api/guest-reminders/route.ts`** — `GET`/`POST`, guarded exactly like
  `/api/analytics/generate`: `Authorization: Bearer $CRON_SECRET` **or** an active
  manager/owner/admin session. 503 without DB; 500 on unexpected failure.
- **`vercel.json`** — second daily cron: `/api/guest-reminders` at `5 1 * * *`
  (01:05 UTC ≈ 09:05 Manila). Hobby plan = daily crons only, which the ~24h-before
  semantics fit.
- **Confirmed-email enrichment** — the deposit-verified reservation-confirmation email
  (`app/api/front-desk/deposits/[id]/verify/route.ts`) now includes the guest count and a
  payment-state line ("PHP X remaining, payable at check-in" / "Fully paid"), computed from
  the frozen reservation total/deposit. No new tax math (Phase 1 totals reused as-is).

## Decisions / notes

- INSERT-claim beats a "check then insert": the unique index makes the race impossible
  without any advisory locking — simplest correct mechanism.
- A delivery row is written even when email fails (status `failed`) — a failed email still
  consumed the one send. That's deliberate: the guest got the in-app notification, and
  endlessly retrying a failing provider is worse than one honest failure row. If this needs
  revisiting, the fix is a `status` filter on the claim insert, not a new table.
- Reminders go only to reservations with a portal `user_id` for the in-app copy, but the
  email goes to `guest_email` whenever present (website bookings have both; walk-ins may
  have neither → no reminder, correctly).
- Transportation line renders only SCHEDULED/ASSIGNED requests; cancelled rides never show.

## Verification

- `npx supabase db push` clean; live checks: new check constraint, table + unique index
  present, grants service-role only (public/anon/authenticated revoked).
- `npx vitest run lib/guest-reminders.test.ts` — 7/7 (predicates; one send per target with
  summary; second run → all skipped, no new claims/notifications; missing `user_id` → send
  without in-app notification; route-guard source scan; vercel.json cron contract;
  migration source scan).
- Full gates: `npm run typecheck` ✓, `npm run lint` 0 errors (71 pre-existing warnings),
  `npm test` **912/912**, `npm run build` ✓.
- Not run live: an actual reminder pass would insert real delivery rows into production —
  left to the first genuine cron firing (or an authorized Manager hitting the route on a
  day with matching reservations).

## Test-mock lessons (for future suites)

- The `vi.mock("@/lib/supabase")` factory captures `fake.db` **once at first import**:
  tests must mutate the db object in place (`delete` keys + `Object.assign`), never
  reassign.
- `Object.assign(builder, {insert: ...})` mutates the shared builder — capture
  `builder.insert.bind(builder)` before overriding or the override recurses into itself.

## Affected files

- `supabase/migrations/20260930010000_guest_reminders.sql` (new)
- `lib/guest-reminders.ts` (new), `lib/guest-reminders.test.ts` (new)
- `app/api/guest-reminders/route.ts` (new)
- `lib/notifications.ts` (type union + 2 reminder types)
- `app/api/front-desk/deposits/[id]/verify/route.ts` (email enrichment)
- `vercel.json` (cron), `SYSTEM.md` (§7.3, §9, §11, §14), `Current Status.md`

## Unresolved / next

- Phase 5 — deposit-verification SLA **visibility** (aging chips + threshold from
  `hotel_operational_policies`; no auto-approve/reject).
- Manual UI verification pending for Phases 2–4 (needs role logins).
- First real cron firing will confirm the production path end-to-end.
