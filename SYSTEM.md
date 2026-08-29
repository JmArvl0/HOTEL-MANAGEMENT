# SYSTEM.md — Haven Hotel Management

Reference description of this codebase, written for an AI reviewer who has **not** read the source.
Everything below was verified against the working tree (branch `main`, 2026-08-26). File:line
references are exact. Your task brief is at the bottom (§13).

---

## 1. What this is

A single-property hotel operations app. One Next.js deployment serves three surfaces:

| Surface | Route | Auth | Purpose |
|---|---|---|---|
| Public marketing site | `/` | none | Hero, room browser, "check availability" CTA |
| Sign-in | `/login` | none | One door for all 8 roles |
| Staff dashboard | `/manager_dashboard` | required | Overview + 8 CRUD modules + reports |

Routes are organised by module/use case using Next.js route groups: `(landing-page)`, `(auth)`,
`(manager)`. Route groups do not affect URLs.

It is a **starter / demo-grade** build: it runs with zero configuration against in-memory seed
data, and switches to Supabase/Postgres when two env vars are present. It has never been deployed
to production. Phase 0 (2026-08-26) added the first tests — 12 cases covering environment
validation only; every other module is still untested.

Scale it was written for: one property, ~48 rooms, a handful of concurrent staff users.

## 2. Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | ^16.3.2 |
| UI | React + lucide-react + Recharts | 18.3.1 |
| Auth | next-auth CredentialsProvider, JWT sessions | ^4.24.15 |
| DB | Supabase (`@supabase/supabase-js`, service-role key) | ^2.57.4 |
| Passwords | bcryptjs | ^3.0.2 |
| Validation | zod — used by `lib/env.ts`; **not yet used for request validation** | ^3.25.76 |
| Styling | Two hand-written minified CSS files, no framework | — |
| Migration | `scripts/migrate.mjs` + `pg` (dev dep) | — |
| Tests | vitest (dev dep) | ^4.1.11 |

Commands, all four verified green on 2026-08-26: `npm run typecheck` (`tsc --noEmit`),
`npm run lint` (`eslint .` over `eslint.config.mjs` — flat config, since `next lint` was removed in
Next 16), `npm test` (`vitest run`), `npm run build`. `tsconfig.json` targets **ES2017**.

## 3. Repo map

```
app/
  layout.tsx                        14 L   fonts, SessionProvider, imports both CSS files
  globals.css                    22.5 KB   landing + dashboard light theme (minified, 7 physical lines)
  manager-dashboard-theme.css    13.1 KB   dark theme overrides, scoped under .app-shell
  (landing-page)/
    page.tsx                        38 L   public landing; fully static, no data access
  (auth)/
    login/page.tsx                   8 L   server component; passes env.demoUsersEnabled down
  (manager)/
    manager_dashboard/page.tsx      10 L   server session check → redirect or render client
  api/auth/[...nextauth]/route.ts     5 L   NextAuth handler
  api/manager_dashboard/route.ts     11 L   GET aggregated metrics
  api/resources/[resource]/route.ts  42 L   GET / POST / PATCH for all 8 resources
components/
  manager/
    manager-dashboard-client.tsx   20.9 KB ENTIRE dashboard: nav, 8 tables, modal, charts, theme toggle
  auth/login-form.tsx              17 L    client sign-in form (empty fields; demo note is gated)
  providers.tsx                       3 L
lib/
  types.ts                           15 L   Role, Resource, RecordItem, DashboardData
  env.ts                            110 L   zod-validated startup env; resolveEnv() + env singleton
  env.test.ts                        79 L   12 cases: demo zero-config, mode switch, production gates
  supabase.ts                        13 L   the single service-role client (null in demo mode)
  data.ts                            45 L   list/create/update + getDashboard; demo-vs-supabase switch
  auth.ts                            74 L   authOptions; demo fixtures gated behind env.demoUsersEnabled
  permissions.ts                     14 L   role → resource[] matrix
  demo-store.ts                      63 L   seed data + in-memory global store + makeId
eslint.config.mjs                          flat config (core-web-vitals + typescript)
vitest.config.mts                          node environment, `@` alias
supabase/schema.sql               118 L   15 tables, 6 indexes, RLS on, seeds first owner
scripts/migrate.mjs                      applies schema.sql over DIRECT_URL from .env.local
nano_bots/                               Obsidian vault of project notes (Overview, Roadmap, Data Model, …)
```

Total application source: **~600 lines of TS/TSX** written in a deliberately dense, one-statement-per-line
style (a 61-line file can be 21 KB). No CI, no `middleware.ts`, no error boundaries; tests cover
`lib/env.ts` only.

## 4. Runtime architecture

**Read path (dashboard):**
`ManagerDashboardClient` (client component) → `fetch('/api/manager_dashboard')` or `fetch('/api/resources/:resource')`
→ route handler calls `getServerSession` → `canAccess(role, resource)` → `lib/data.ts` → Supabase or
`demoStore`. Every section switch triggers a fresh fetch; nothing is cached or server-rendered
(`components/manager/manager-dashboard-client.tsx:34`).

**Write path:** `POST`/`PATCH` with a JSON body → same authorize check → `create()`/`update()` →
raw body forwarded to `supabase.insert()` / `.update()`.

**Public path:** `app/(landing-page)/page.tsx` is now fully static — hardcoded marketing copy and
three hardcoded room-type prices, no `list("rooms")`, no `force-dynamic`. The booking bar is still
`<form action="/login">`, so dates and guest count are discarded (gap #10).

**Startup path:** every server module imports `lib/env.ts`, which parses the environment through zod
and **throws at import time** if the configuration is insecure — so a misconfigured production
server fails to boot rather than degrading. It resolves `databaseMode` (`supabase` when both
Supabase vars are set, else `demo`) and `demoUsersEnabled` (never true in production). Production
gates are skipped when `NEXT_PHASE=phase-production-build`, because `next build` forces
`NODE_ENV=production` and deploy-time secrets are not needed to compile.

**Auth path:** `authorize()` in `lib/auth.ts` checks `app_users` in Supabase with `bcrypt.compare`
**first**, then falls back to the plaintext demo fixtures only when `env.demoUsersEnabled` — so a
real database account can never be shadowed by a fixture, and the fixtures do not exist in
production. Role rides in the JWT (`callbacks.jwt`) and is copied onto `session.user.role`.

## 5. Data model

Source of truth: `supabase/schema.sql`. TypeScript models rows as an untyped bag:

```ts
interface RecordItem { id: string; [key: string]: string|number|boolean|null|undefined }
```

There are **no per-entity TypeScript types**. Column names exist only as string literals inside
`config` in `components/manager/manager-dashboard-client.tsx:15-24`.

### Exposed as API resources (8)

| Table | PK | Status enum | Notes |
|---|---|---|---|
| `reservations` | `RSV-*` | pending, confirmed, checked_in, checked_out, cancelled | FK guest_id, room_id; `check (check_out > check_in)` |
| `rooms` | `RM-*` | available, reserved, occupied, dirty, maintenance | separate `housekeeping` text col; unique `number`, `qr_code`; `amenities jsonb` |
| `guests` | `GST-*` | — | loyalty tier/points, stays, preferences |
| `housekeeping_tasks` | `HKT-*` | pending, in_progress, completed | `due` is **text** ("11:30 AM"), not a timestamp |
| `maintenance_orders` | `MWO-*` | open, in_progress, resolved | cost |
| `invoices` | `INV-*` | unpaid, deposit, partial, paid | `currency char(3)` default PHP; `balance` is a **plain stored column** |
| `inventory` | `ITM-*` | healthy, low, out | reorder_point, vendor FK |
| `staff` | `STF-*` | off_duty, on_duty, on_leave | optional FK to `app_users` |

### Present in schema, no API surface, no UI, zero writes (7)

`app_users` (auth only), `payments`, `guest_requests`, `reviews`, `vendors`, `purchase_orders`,
`audit_logs`.

### Indexes
`reservations(check_in, check_out)`, `reservations(status)`, `rooms(status)`,
`housekeeping_tasks(status)`, `maintenance_orders(status)`, `invoices(status)`.

### RLS
Enabled on all 15 tables (`schema.sql:99-113`) with **no policies defined** — i.e. deny-all to the
anon key. Correct given that all access is server-side via the service-role key, but it means no
client-direct reads are possible without adding policies.

## 6. Auth & RBAC

**Roles (8):** `owner`, `admin`, `manager`, `front_desk`, `housekeeping`, `maintenance`,
`accounting`, `guest`.

**Access matrix** (`lib/permissions.ts:3-12`) — resource-level only, no row scoping, no verb
distinction (read and write share one grant):

| Role | Resources |
|---|---|
| owner / admin / manager | all 8 |
| front_desk | reservations, rooms, guests, housekeeping_tasks, invoices |
| housekeeping | rooms, housekeeping_tasks, inventory |
| maintenance | rooms, maintenance_orders, inventory |
| accounting | reservations, guests, invoices, inventory |
| guest | reservations, invoices |

A second, **duplicated** matrix exists client-side for nav visibility
(`components/manager/manager-dashboard-client.tsx:28`) and can drift from the server one.

`NEXTAUTH_SECRET` falls back to `DEV_ONLY_AUTH_SECRET` outside production. In production it is
required, must differ from that placeholder, and must be at least 32 characters — enforced in
`lib/env.ts` before the process can serve a request.

## 7. API contract

```
GET    /api/manager_dashboard         → { data: DashboardData, mode: "demo"|"supabase" }
GET    /api/resources/:resource       → { data: RecordItem[] }        // all rows, unbounded
POST   /api/resources/:resource       → { data: RecordItem }  201     // body inserted as-is
PATCH  /api/resources/:resource       → { data: RecordItem }          // body: { id, ...fields }
```

No `DELETE`, no single-record `GET /:id`, no pagination, no filtering, no sorting params, no
`If-Match`/version header. Errors are collapsed to four generic strings; the underlying
Supabase/Postgres error is swallowed by bare `catch` blocks and never logged
(`app/api/resources/[resource]/route.ts:22,30,41`).

## 8. Dashboard UI

One 21 KB client component. A `config` object drives all 8 modules declaratively (columns, create-form
fields, status enum per resource) — that part is genuinely reusable. Behaviour:

- **Search** — `JSON.stringify(item).includes(query)` over already-loaded rows, client-side
  (`manager-dashboard-client.tsx:41`). Matches column *names* as well as values.
- **Status change** — clicking a status badge advances to the *next* enum value, cyclically:
  `cancelled → pending`, `checked_out → cancelled` (`manager-dashboard-client.tsx:43`). No state machine,
  no side effects (checking in does not occupy the room; checking out creates no housekeeping task).
- **Create** — modal built from `config[resource].fields`; all fields `required`; every field is a
  plain text/number/date/email input. No selects for enums, no validation beyond `required`.
- **Export** — `window.print()` plus a print stylesheet. No CSV, no PDF.
- **Theme** — dark by default, light toggle persisted in `localStorage`.
- **Error handling** — `load()` checks `res.ok` with **no else branch**: a 401/403/500 leaves the
  previous state on screen and no message (`manager-dashboard-client.tsx:34`).

### Values displayed to the user that are not real

| Shown as | Actual source |
|---|---|
| 7-day occupancy trend (Overview + Reports charts) | 6 literals `62,68,71,67,79,86` + 1 live value — `lib/data.ts:48` |
| "Average occupancy — trailing seven days" | mean of that literal array — `manager-dashboard-client.tsx:60` |
| "↗ 8.2%" occupancy trend badge | literal — `manager-dashboard-client.tsx:54` |
| "Operational readiness 92%" | literal — `manager-dashboard-client.tsx:60` |
| "1 urgent work order · Room 305 · Air-conditioning" | literal — `manager-dashboard-client.tsx:54` |
| Housekeeping sidebar count badge "3" | literal — `manager-dashboard-client.tsx:46` |
| "48 rooms · Main property" | literal; the seed has 8 rooms — `manager-dashboard-client.tsx:46` |
| Landing-page room cards | literal prices — `app/(landing-page)/page.tsx` (the page is fully static) |

## 9. Data modes

`lib/env.ts` decides: `databaseMode = url && serviceRoleKey ? "supabase" : "demo"`, re-exported as
`databaseMode` from `lib/data.ts`. Setting only one of the two variables is a boot error rather than
a silent downgrade to demo.

**Demo mode** stores everything in a `globalThis.__hotelStore` object seeded from `lib/demo-store.ts`.
Writes mutate the array in place; `list()` returns the **live array reference**, not a copy
(`lib/data.ts:9`). State is per-process, so it resets on restart and diverges across serverless
instances. IDs come from `makeId()` — a 4-digit `Math.random()`, collision-prone
(`demo-store.ts:60-63`), and it emits `INVTRY-` for inventory where the schema emits `ITM-`
(`schema.sql:54`).

Demo mode is **refused** in production: a `NODE_ENV=production` server with no Supabase
configuration throws `EnvironmentError` on startup instead of serving in-memory data.

### Environment variables

`.env.example` is the canonical list. Summary: `NEXTAUTH_URL` and `NEXTAUTH_SECRET` (both required in
production); `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (set both or neither, required
in production); `DIRECT_URL` (used only by `scripts/migrate.mjs`). The service-role key is read only by `lib/supabase.ts`, which is never
imported from a client component, so it does not reach the browser bundle.

## 10. Verified working

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0 (2026-08-26).
- All 8 resources list, create, and advance status in demo mode.
- Role-based nav filtering and server-side `canAccess` both function.
- Supabase path is wired end-to-end (schema, migration script, service-role client, bcrypt login).
- Startup environment validation: demo mode boots with an empty environment; production refuses to
  boot on demo data, or a missing/placeholder/short `NEXTAUTH_SECRET`.
- Dark/light theme, responsive breakpoints at 1000 px and 680 px, print stylesheet.

## 11. Known gaps

Facts, not prescriptions. Grouped by kind, most consequential first. Items closed by Phase 0 are
marked **RESOLVED** rather than deleted, so existing references to the numbering still line up.

### Security

1. **RESOLVED — demo accounts no longer exist at all.** `lib/auth.ts` authenticates solely against
   the Supabase `user_accounts` table with `bcrypt.compare`, and returns `null` when Supabase is
   unconfigured. There is no plaintext fixture map and no `HAVEN_DEMO_USERS` switch; demo mode
   serves operational *data* only, never logins. `/login` does not prefill credentials.
2. **No input validation anywhere.** `await request.json()` goes straight into
   `supabase.insert()` / `.update()` (`route.ts:29,38-40`). zod is installed and unused. Mass
   assignment is open: any authorised role can set `id`, `created_at`, `balance`, `paid`, or any
   column not covered by a DB `check`. A `guest` can `POST /api/resources/invoices` with
   `paid: 999999`.
3. **No row-level scoping.** `guest` has `reservations` + `invoices` access, and `GET` returns
   *every* row — so any guest account reads every other guest's stay and folio
   (`permissions.ts:11`, `data.ts:12`). Same shape for `staff` records under manager roles.
4. **Read and write share one permission.** `canAccess` cannot express read-only; `housekeeping` can
   PATCH any room's rate, `front_desk` can rewrite any invoice.
5. **No login rate limiting or lockout.** `bcrypt.compare` runs per attempt — a credential-stuffing
   and CPU-exhaustion vector at the same time.
6. **`audit_logs` exists and is never written.** No record of who changed what.
7. **RESOLVED — no operational data on the public page.** The landing page is static now; it queries
   nothing. (It was reverted independently of Phase 0, not fixed by it.)
8. **RESOLVED (Phase 0) — environment is validated at boot.** `lib/env.ts` throws at import time on
   missing or insecure configuration instead of failing later at runtime.

### Missing domain logic

9. **No availability check — double-booking is possible.** Nothing compares a new reservation's
   dates against existing ones for the same room. The only constraint is `check_out > check_in`.
   No Postgres exclusion constraint, no `daterange`, no application-level check.
10. **No public booking flow.** The landing-page booking bar is `<form action="/login">`
    (`app/(landing-page)/page.tsx:24`) — dates and guest count are discarded and the visitor is dropped at a staff
    login. There is no guest-facing reservation, confirmation, or self-service surface at all,
    despite `guest` being a defined role.
11. **Room status is manual and unlinked.** Reservation check-in does not occupy a room; check-out
    does not mark it dirty or create a housekeeping task; completing a clean does not return it to
    available. Occupancy % is derived from a field a human has to remember to change
    (`data.ts:43`).
12. **`payments` table is dead.** Recording a payment is impossible; invoice `paid`/`balance` are
    edited by hand as free-text numbers, and `balance` is a plain column with no trigger or
    generated expression keeping it equal to `amount − paid` (`schema.sql:45`).
13. **No rate or pricing logic.** `rooms.rate` is a flat nightly number. No seasons, no length-of-stay
    pricing, no taxes, no service charge; reservation `total` is typed in by the user.
14. **No cancellation/no-show handling, no deposits workflow, no group blocks** — the columns
    (`deposit`, `group_code`, `cancellation_reason`) exist and are never read or written.
15. **UTC date arithmetic for a Manila property.** "Today", arrivals, and departures use
    `new Date().toISOString().slice(0,10)` (`data.ts:42`) — wrong for 8 hours of every local day.
16. **Six schema tables unused**: `guest_requests`, `reviews`, `vendors`, `purchase_orders`,
    `payments`, `audit_logs`. The Roadmap note lists this as known.
17. **Single property only**, though the sidebar renders a property switcher affordance with a chevron
    (`manager-dashboard-client.tsx:46`).

### Data integrity & correctness

18. **Status cycling is not a state machine** — `cancelled` wraps to `pending`, `checked_out`
    advances to `cancelled` (`manager-dashboard-client.tsx:43`).
19. **Last-write-wins on concurrent edits.** No version column, no `If-Match`, no optimistic
    concurrency; two front-desk users editing one reservation silently clobber each other.
20. **Denormalised names never reconciled.** `reservations.guest_name`, `invoices.guest_name`,
    `*.room_number`, `housekeeping_tasks.assignee` are free text alongside the real FKs. Renaming a
    guest updates nothing.
21. **`housekeeping_tasks.due` is text** — unsortable, unqueryable, no overdue detection possible.
22. **Demo/schema ID prefix mismatch** (`INVTRY-` vs `ITM-`).
23. **`list()` hands out a mutable reference to the demo store** (`data.ts:11`).

### Performance

24. **No pagination or limits anywhere.** `select("*")` per resource; `getDashboard()` pulls all
    reservations, rooms, tasks, and invoices on every dashboard load (`data.ts:41`).
25. **Aggregation happens in JS, not SQL** — occupancy, revenue, and status counts are `filter`/
    `reduce` over full table dumps.
26. **Search loads everything then filters client-side** (`manager-dashboard-client.tsx:41`).
27. **Nothing is server-rendered or cached.** The dashboard is a client component that refetches on
    every section switch. (The landing page is static now.)
28. **RESOLVED (Phase 0) — `tsconfig.json` targets `ES2017`**, Next's own default, instead of `es5`.

### UX & accessibility

29. **Silent failures.** No error toast, retry, or empty-vs-error distinction (`manager-dashboard-client.tsx:34`).
    No error boundary, no `error.tsx`, no `not-found.tsx`.
30. **Modal is not accessible** — no `role="dialog"`, no `aria-modal`, no focus trap, no Escape
    handler (`manager-dashboard-client.tsx:58`). Toast has no `aria-live`. Nav items are `<button>` without
    `aria-current`; no skip link; enum fields are free-text inputs rather than selects.
31. **RESOLVED (Phase 0) — login copy fixed.** The submit button reads "Sign in" / "Signing in…"
    (`components/auth/login-form.tsx`).
32. **Mojibake in shipped UI strings.** `manager-dashboard-client.tsx` contains UTF-8 read as Latin-1:
    `todayâ€™s`, `Hereâ€™s whatâ€™s happening`, `48 rooms Â·`, `â†— 8.2%`, `â€”`. These render
    literally. `manager-dashboard-theme.css` also carries a BOM.
33. **No pagination/sorting UI**, no bulk actions, no record detail view, no edit form (only status
    advance and create), no delete.
34. **Currency is hardcoded PHP** in the formatter (`manager-dashboard-client.tsx:26`) while
    `invoices.currency` is per-row.

### Engineering hygiene

35. **Almost no tests, no CI.** `npm run lint` / `typecheck` / `test` / `build` exist and pass, but
    nothing runs them automatically, and `lib/env.ts` is the only module with coverage. Two
    `react-hooks/set-state-in-effect` findings in the dashboard client are downgraded to warnings in
    `eslint.config.mjs` so the gate stays green; the dashboard decomposition should remove them.
36. **The whole dashboard is one 21 KB client component** with two responsibilities per line; no
    per-route code splitting, no server components below `/manager_dashboard`.
37. **Permission logic duplicated** server (`permissions.ts`) and client (`manager-dashboard-client.tsx:28`).
38. **No `middleware.ts`** — every route re-derives its own session check.
39. **No structured logging or observability.** `catch {}` blocks discard the cause.
40. **`.env.local` is present in the working tree** (gitignored). It holds 11 keys, of which the app
    reads 3; `.env.example` now documents every variable that is actually used, including
    `DIRECT_URL` for `scripts/migrate.mjs`. One line in it is a bare connection string with no `KEY=`
    prefix — junk that `scripts/migrate.mjs`'s parser skips.
41. **The module reorganisation is still uncommitted** as of 2026-08-26 (route groups
    `(landing-page)`/`(auth)`/`(manager)`, `manager_dashboard` naming, `components/manager/`), along
    with all Phase 0 work. `components/rooms-browser.tsx` was deleted while untracked and is
    therefore unrecoverable; nothing imports it. The git **index** also holds a staged rename of
    `app/page.tsx` → root-level `(landing-page)/page.tsx`, a path that does not exist in the
    worktree, so committing without re-staging would record a deletion of the landing page.

## 12. Constraints for any proposal

- **Keep demo mode.** Zero-config startup against seed data is a deliberate feature (used for
  presentations). Any change must work in both modes or explicitly state which mode it drops.
- Stay on Next.js App Router + TypeScript + Supabase/Postgres. Do not propose a rewrite in another
  framework or a different database.
- Prefer Postgres-native guarantees (constraints, generated columns, triggers, exclusion
  constraints) over application code where both are available.
- The dense one-line code style is the author's; readability changes are fair to propose but should
  be named as such, not smuggled in.
- Target remains a single small property; multi-tenant SaaS is a possible direction, not an
  assumption.
- No new heavyweight dependency without justifying what it replaces. `zod` is already installed.

## 13. Your task

Produce an improvement plan for this system. Do not restate §11 back as a plan — the gap list is
input, not output.

Specifically:

1. **Pick a thesis.** State in one sentence what this system should become, and what you are
   therefore deliberately *not* fixing. Different reviewers should reach different theses; the useful
   axes are: *make the demo shippable to one real hotel* / *harden what exists and stop there* /
   *build the missing revenue surface (public booking)* / *turn it into a multi-property product* /
   *treat it as a teaching codebase and optimise for clarity*. Name yours.
2. **Sequence the work** into phases with a rough ordering rationale — what unblocks what, and what
   is a hard prerequisite for anything else being safe to ship.
3. **Say what breaks if you're wrong.** For each phase, the failure mode you're accepting.
4. **Be concrete at the boundaries**: name the files you would touch, the schema changes (as DDL),
   the API shape changes, and any dependency you would add or remove.
5. **Flag disagreements with this document.** If a gap in §11 is mischaracterised, or if something
   listed as a gap is actually correct for the intended scope, say so.
6. **Estimate effort per phase** in relative terms (hours / days / weeks) and call out anything you
   believe is a trap — a change that looks small and is not.

Keep the plan tight enough that a single developer can read it and start. Prose over ceremony; no
Gantt charts.
