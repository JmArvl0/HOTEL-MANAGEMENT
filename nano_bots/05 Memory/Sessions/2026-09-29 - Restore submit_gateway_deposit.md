# 2026-09-29 — Restore `submit_gateway_deposit`

## Work completed

The guest online-deposit flow failed with a pink warning, **"Unable to start online
payment."** No payment row was ever written, so no booking entered the gateway path.

That string had three near-identical producers in
`app/api/booking/payments/gateway/route.ts`. Only one matched the screenshot exactly
(no trailing "Please use manual GCash transfer." sentence): **`:91`**, the branch where
`submit_gateway_deposit` returned an error. Only three codes were mapped above it, so a
PostgREST `PGRST202` ("Could not find the function … in the schema cache") fell through
to the generic 500.

**Root cause, confirmed by live probe, not inference.** The function existed in **no
schema**. Its definition lives in `20261016010000_express_checkin_and_gateway.sql:192–262`,
and `supabase_migrations.schema_migrations` already recorded that version as applied — so
`supabase db push` would never re-run it. The file had been edited after the version was
recorded. This is a **known, documented, four-month-old drift**: `20261021010000` names it
in a comment ("ledgers that applied an earlier revision of that file lack it") but guarded
only the grants, leaving the function itself missing. Nothing in the migrations ever drops
it, so the restore reverts no deliberate removal. Recorded as [[KI-011]].

- `supabase/migrations/20261024040000_restore_submit_gateway_deposit.sql` — **new**, 114
  lines. Idempotent in the re-assertion style of `20261021010000`: `create or replace`
  with a body verbatim from the canonical file, plus `add column if not exists` /
  `create index if not exists` re-assertions and the service-role-only grants.
- `app/api/booking/payments/gateway/route.ts` — logs the RPC failure (code + message)
  *before* mapping it, logs the provider failure, and maps the three guard codes that
  previously fell through to 500.
- `lib/gateway.ts:180` — the throw site discarded PayMongo's HTTP status and error body,
  so the route's catch could only ever record the bare code `GATEWAY_SESSION_FAILED`.
  It now carries `httpStatus` and a truncated provider detail. No consumer of that message
  existed (verified by grep), so the shape change is safe.
- `lib/paymongo.test.ts` — the restore-migration contract block (5 cases) plus a
  line-ending fix and one new invariant test.

**Nothing was wrong with the migration body.** The contract test's `toContain` failure was
a CRLF artifact: `core.autocrlf=true` checks tracked files out with CRLF while newly written
files stay LF, so the test was comparing working-tree *bytes* and the assertion was
platform-dependent — it would have passed on a Linux CI clone and failed here. Fixed at the
root by normalizing in the shared `read` helper. The restore file itself had genuinely mixed
endings (40 CRLF / 74 LF, header and body written by different tools) and was normalized to
LF; git stores LF regardless. 45 test files read migrations, but this was the only multi-line
`toContain`, which is why nothing else was red.

## Decisions

The three unmapped guard codes were mapped (`HOLD_NOT_FOUND` → 404 reusing the existing
sibling copy "Booking hold not found."; `INVALID_DEPOSIT_AMOUNT` / `INVALID_GATEWAY_PAYLOAD`
→ 400) rather than left to the generic 500. This changes guest-facing responses for cases
that were previously indistinguishable from a crash. No `D-` entry: this is error handling
within an existing route, not an architectural or business-rule decision, and no documented
system behaviour changed, so `SYSTEM.md` needs no update.

## Affected files

- `supabase/migrations/20261024040000_restore_submit_gateway_deposit.sql` — new migration.
- `app/api/booking/payments/gateway/route.ts` — logging + three code mappings.
- `lib/gateway.ts` — provider error carries HTTP status + truncated detail.
- `lib/paymongo.test.ts` — contract block, `read` normalization, guard-mapping invariant.

## Verification

Live database, after `supabase db push`:

| Check | Result |
|---|---|
| `pg_proc` row for `submit_gateway_deposit` in `public` | **1** (was 0) |
| `proacl` | `{postgres=X/postgres,service_role=X/postgres}` — no public/anon/authenticated |
| `prosecdef` / `proconfig` | `true` / `search_path=public` |
| ledger `20261024040000` | **1** |
| whitespace-normalized md5 of live `prosrc` | `b861865a08cfb9f81de13ee47ba9e8c0` — **matches** the canonical body |
| RPC through PostgREST | `HTTP 400 / P0001 / HOLD_NOT_FOUND` — resolves; no `PGRST202` |

Financial exposure checked and clear: `GET /v1/payments` returns **zero** payments ever
collected (live keys), and the database holds 0 gateway payment rows, 0
`gateway_reference_id`s and 0 holds in `payment_submitted`. The flow had never once
succeeded, so no orphaned session was ever paid — nothing to refund or reconcile.

Gates: `npm run typecheck` clean · `npx eslint` on all three touched files silent ·
`npx vitest run lib/paymongo.test.ts lib/express-checkin.test.ts` **42/42** ·
`npm test` **167 files / 1886 tests passing** (the previous session's count was 166/1873;
the delta is this work plus the pill-button test) · `npm run build` clean.

## Unresolved

- **No end-to-end guest run.** The database-side chain is proven, but the browser flow is
  not: it needs a guest login (KI-005 — no headless login path). This is the one link
  between "the RPC works" and "the guest sees the PayMongo checkout page".
- **The webhook leg is untested in this environment.** It needs a paid session and a
  publicly reachable webhook URL. The `.env.local` keys are **live** (`sk_live_`), so
  exercising real payment moves real money — swap to `sk_test_` + the test-mode webhook
  secret, verify, then swap back.
- **The gateway route has no test coverage at all.** `payments/gateway`,
  `createGCashCheckoutSource` and the error string match zero test files. The new invariant
  test guards the code mapping at the source level only; it does not exercise the handler.
  This is the standing reason a four-month outage produced no signal.
- **`route.ts:71`** — the success redirect ignores its `paid=1` param. Cosmetic, untouched.

## Next recommended action

Start a guest booking, hold a room, click to pay, and confirm the browser reaches the
PayMongo checkout page **and** a `payments` row appears with `status='pending_verification'`
and the matching `gateway_reference_id`. Then swap in `sk_test_` keys and complete one
payment end to end so the signed-webhook leg (`confirm_gateway_payment`) is exercised at
least once. Both need a human at the browser; the database half is already proven.
