# 01 — Security Gaps

Ordered most consequential first. All references verified 2026-08-26.

## 1.1 Demo accounts are live in production — RESOLVED

- **Was:** eight hardcoded accounts (`owner@haven.test` … `guest@haven.test`) sharing one plaintext
  password, checked before the database, with the login form prefilled.
- **Now:** `lib/auth.ts` authenticates only against the Supabase `user_accounts` table with
  `bcrypt.compare`, and returns `null` when Supabase is unconfigured. There is no hardcoded account
  map and no prefilled login form.
- **Residual:** the original migration
  (`supabase/migrations/20260826125341_initial_hotel_schema.sql`) seeded all eight accounts with one
  identical bcrypt hash and is already public on GitHub. Migration
  `20260829040000_lock_leaked_seed_passwords.sql` deactivates any row still holding that hash, and
  the consolidated `supabase/schema.sql` no longer commits a hash at all. The leaked hash remains in
  Git history — acceptable only once no account still uses it, which requires the live rotation
  (`npm run set-passwords -- <email>`) to have been run against the linked project.

## 1.1b Session invalidation is impossible without rotating the signing secret

- **Where:** `lib/auth.ts` — the `jwt` and `session` callbacks copy `role` from the token and
  perform no database read. `active` and `password_hash` are consulted only inside `authorize()`.
- **What is lacking:** A stateless JWT session cannot be revoked. Rotating a password or setting
  `active = false` leaves any already-issued `__Secure-haven.session-token` valid until it expires.
- **Impact:** Credential rotation alone does not evict an attacker who already signed in. The only
  levers today are rotating `NEXTAUTH_SECRET` (invalidates every session, all users) or adding a
  per-request account lookup / token-version column to the callbacks.

## 1.2 No input validation anywhere

- **Where:** `app/api/resources/[resource]/route.ts:29,38-40` — `await request.json()` is inserted
  or updated as-is. `zod` ^3.25.76 is installed (`package.json`) but never imported in any file.
- **What is lacking:** No schema validation on any write path. Mass assignment is open: an
  authorised role can set `id`, `created_at`, `balance`, `paid`, or any column not guarded by a DB
  `check` constraint. A `guest` role can `POST /api/resources/invoices` with `paid: 999999`.
- **Impact:** Corrupted financials, spoofed records, arbitrary column overwrites.

## 1.3 No row-level scoping

- **Where:** `lib/permissions.ts:11` grants `guest` access to `reservations` + `invoices`;
  `lib/data.ts:12` returns every row with no filter.
- **What is lacking:** Permission checks are resource-level only. Any guest account can read every
  other guest's reservation and folio. Same shape for staff records under manager roles.
- **Impact:** Cross-guest privacy breach the moment a guest-facing account exists.

## 1.4 Read and write share one permission

- **Where:** `lib/permissions.ts` — one grant per resource; no verb distinction.
- **What is lacking:** The matrix cannot express read-only. Consequences: `housekeeping` can PATCH
  any room's rate; `front_desk` can rewrite any invoice amount.
- **Impact:** Privilege escalation through legitimate roles.

## 1.5 No login rate limiting or lockout

- **Where:** `lib/auth.ts:35-47` — `bcrypt.compare` runs per attempt, unthrottled.
- **What is lacking:** No attempt counter, lockout, or backoff. Credential stuffing and
  CPU-exhaustion (bcrypt is deliberately slow) are both open.
- **Impact:** Brute-forceable passwords; cheap DoS via the login endpoint.

## 1.6 `audit_logs` exists and is never written

- **Where:** Table defined at `supabase/schema.sql:85-89`; zero writes anywhere in the codebase;
  RLS-enabled but has no API surface either.
- **What is lacking:** No record of who changed what. Combined with gap 2 (no validation), there is
  no forensic trail for financial fields.
- **Impact:** Undetectable tampering; no compliance story.

## 1.7 Operational data exposed on the public landing page

- **Where:** `app/(landing-page)/page.tsx` — server-side `list("rooms")` with no session; ships
  `id`, `number`, `floor`, `rate`, and live `status` (including `dirty`, `maintenance`) to anonymous
  visitors.
- **What is lacking:** No projection/allowlist of public-safe fields, no distinction between
  guest-facing data and internal operations data.
- **Impact:** Leaks occupancy patterns, room numbering, and internal state to the public internet.

## 1.8 No environment validation

- **Where:** `NEXTAUTH_SECRET` falls back to a hardcoded dev string only when
  `NODE_ENV === "development"` (`lib/auth.ts:21`); production has no fallback and no startup check.
  `scripts/migrate.mjs` parses `DIRECT_URL` from `.env.local`, which `.env.example` does not document.
- **What is lacking:** No boot-time assertion that required env vars exist. A production deploy
  missing `NEXTAUTH_SECRET` fails at first request, not at boot. Demo mode silently activates in
  production when Supabase vars are absent (`lib/data.ts:5-8`).
- **Impact:** Late, confusing failures; accidental demo-mode deployments.
