# Project Memory

Durable, reviewed knowledge for Haven Hotel Management. Links, not copies —
`SYSTEM.md` and source code stay authoritative.

## What it is

Single-property (~48 rooms, Haven Makati) hotel operations on Next.js 16 +
Supabase/Postgres, with an in-memory demo mode when no DB is configured
(production refuses demo). One deployment serves public booking, guest
self-service, staff portals, and auth. See `SYSTEM.md` §1.

## Architecture that constrains everything

- Request flow: client → route handler → `lib/` domain module → Postgres
  `SECURITY DEFINER` function. No middleware, no client-direct DB reads
  (`SYSTEM.md` §5).
- Service-role key is server-only; browser talks to `/api/*` routes only.
- Privileged state changes are named RPCs (transaction + locks + audit),
  never raw upserts. Generic resource CRUD cannot touch protected workflows.
- Migrations in `supabase/migrations/` are the DB authority, applied with
  `supabase db push` only. `schema.sql` lags; `migrate.mjs` desyncs the ledger.
- 8 roles: owner, admin, manager, front_desk, housekeeping, maintenance,
  accounting, guest. Role enforced twice (route + RPC body). Key splits:
  Accounting alone verifies deposits/money; Manager approves exceptions;
  Front Desk operates stays. Guards must be null-safe
  (`actor is null or actor not in (…)`), never bare `not in`.

## Conventions

- zod validates route bodies and env (`lib/env.ts`); blank env counts absent.
- Pair rule: Supabase URL + service key together or both blank (demo).
  Build phase (`NEXT_PHASE`) skips pairing; runtime never does.
- UI: shared primitives in `components/ui/` + `docs/HAVEN_UI_STANDARDS.md`;
  customer `customer` density vs staff `internal` density. `DESIGN.md` is the
  visual authority; reference images in `reference/` are look-only (never
  their sample data).
- Tests: vitest co-located; test real behavior. No headless browser runner.

## Security invariants

- No Supabase Auth; NextAuth credentials against `user_accounts`; stateless
  JWT re-validated per request. No secrets in memory docs, examples, or
  reports — placeholders only. RLS on with zero public policies (one public
  storage read for room photos).
