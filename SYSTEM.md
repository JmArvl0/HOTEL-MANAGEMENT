# SYSTEM.md — Haven Hotel Management

Complete reference to this codebase, from end to end. Covers what the system does (every surface,
role, and workflow) and how it is built (architecture, data model, Postgres functions, API, security,
tests, deployment).

- **Reference point:** branch `main` @ commit `c9a0a23` (2026-09-04).
- **Status:** replaces the 2026-08-26 review-style `SYSTEM.md`, which described an earlier ~600-line
  starter build that no longer matches the tree. Nothing in this document is inherited from that old
  file; every claim below was re-verified against source (lib modules, migration files, route
  handlers, tests, docs) on the date above.
- **Verification:** `npm run typecheck`, `npm run lint`, `npm test` (20 files / 298 cases), and
  `npm run build` are the project's quality gates and pass at this commit. See §2 and §12.
- **Source of truth for the database** is `supabase/migrations/` (28 files). The consolidated
  `supabase/schema.sql` is a fresh-install snapshot that lags the last few feature blocks — treat it
  as approximate (see §15).

> **Note on the working tree vs this commit.** At the reference commit the quality gates are green. A
> newer, *uncommitted* refactor is also present in some working trees: the operator dashboards migrate
> from ad-hoc inline dialog state to a promise-based dialog bridge (`useActionDialogs`, new file
> `components/ui/action-dialogs.tsx`). At the time of writing that refactor did not yet compile
> (a leftover dialog block in `manager-dashboard-client.tsx`). §7 describes the dashboards at the
> commit; the §16 pointers note the refactor's shape.

---

## 1. What this is

A **single-property hotel operations system** for a ~48-room boutique property (brand: **Haven
Makati**). One Next.js deployment serves four surfaces:

| Surface | Where | Auth | Purpose |
|---|---|---|---|
| Public site + room catalogue | `/` and `/booking/*` | none (guest booking needs a guest login) | Marketing, photo catalogue, and the connected guest booking flow |
| Customer self-service portal | `/my-reservations`, `/account/*` | guest | Manage reservations, submit requests, deposit/stay payments, receipts, notifications |
| Staff role portals | `/manager_dashboard` | staff roles | Front Desk, Housekeeping, Maintenance, Accounting, Manager, Admin, Owner workspaces |
| Account & auth | `/login`, `/register`, `/auth/continue`, `/recover/[token]` | varies | One login for all roles; self-service guest registration; password recovery |

It is built for **real (Supabase/Postgres) operation** and also runs in a **demo mode** with an
in-memory store when no database is configured. Production refuses demo mode.

The product idea: reservations, room inventory, housekeeping, maintenance, guest requests,
billing/folios, refunds, and manager approval/exception handling are **one connected lifecycle** —
a checkout turns a room dirty and opens a housekeeping task, a maintenance diagnosis can block a
room from sale, a verified deposit confirms a website booking, a manager-approved room change is
executed by the front desk after revalidation. Role and workflow are enforced twice: on the API
route *and* inside the database function that performs the work.

**Scale target:** one property, tens of rooms, a handful of concurrent staff, guest-facing website
booking. Not a multi-property (PMS/chain) system.

## 2. Stack & tooling

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | ^16.3.2 |
| UI | React, TypeScript, `lucide-react` icons, Recharts | 18.3.1 · ES2017 target |
| Auth | next-auth v4, CredentialsProvider, stateless JWT | ^4.24 |
| Database | Supabase / Postgres via `@supabase/supabase-js` **service-role key, server-only** | ^2.57 |
| Passwords | bcryptjs (cost 12 for registration) | ^3.0.2 |
| Validation | zod — request bodies, env, schemas | ^3.25 |
| Styling | Hand-written CSS, no framework; `Modal.css`, `haven-loader.css` + two theme CSS files | — |
| Table/chart ui | @tanstack/react-table (deprecated/imported nowhere), recharts, hand-rolled tables | — |
| Migrations | `supabase/migrations/*.sql` applied with **`supabase db push`** | — |
| Tests | vitest + fake-supabase query-builder seam (domain modules only) | ^4.1 |

**npm scripts.** `dev`, `build` (`next build`), `start`, `lint` (flat `eslint.config.mjs`), `typecheck`
(`tsc --noEmit`), `test` (`vitest run`), `test:watch`. Helper scripts live in `scripts/` (§4, §12):
`migrate.mjs`, `set-passwords.mjs`, `verify-auth.mjs`, `row-counts.mjs`.

## 3. Repo map

```
app/
  layout.tsx                     root layout: fonts, SessionProvider, global CSS
  (landing-page)/page.tsx        public landing + room catalogue (static shell + live data)
  (auth)/login, register,        auth pages; /auth/continue routes a fresh login to its role portal
        auth/continue
  (booking)/booking/search,      public guest booking flow (see §7)
        booking/details, booking/review/[token],
        booking/payment/[token], booking/confirmation/[id]
  (booking)/(customer)/          self-service portal (own layout)
        layout.tsx  my-reservations(+/[id])  account(+/payments, requests,
        notifications, receipts/[id], find-room, help, profile, settings)
  (manager)/manager_dashboard/page.tsx   ONE staff route; role-switches the portal component
  recover/[token]/page.tsx       public secure-account-recovery
  api/**                         65 route handlers (full map in §11)

components/
  ui/         Modal, FormDialog, FormField, StatusBadge, AccessibleChart, Navigation,
              Performance, DataTable (unused), action-dialogs (WIP bridge), haven-loader, index
  landing/  auth/  booking/  customer/  account/     per-surface components
  manager/    manager-dashboard-client  (operational workspace for 6 staff roles)
  admin/      admin-dashboard-client      (governance)
  owner/      owner-dashboard-client      (executive/exceptions)
  catalog/    room-catalog-panel, transport-services-panel
  providers.tsx  theme-toggle.tsx

lib/          domain layer, pure and unit-tested (see §5)
  types.ts permissions.ts auth.ts customer-auth.ts env.ts data.ts staff-data.ts
  booking.ts customer.ts accounting.ts admin.ts manager.ts hotel-policy.ts
  admin-route.ts owner-route.ts manager-route.ts housekeeping-route.ts financial-route.ts
  fake-supabase.ts demo-store.ts theme.ts format.ts room-images.ts request-options.ts

supabase/
  migrations/   28 files, 2026-08-26 … 2026-09-04 (authoritative schema + ~129 definer functions)
  schema.sql    consolidated fresh-install snapshot (lags migrations — see §15)

scripts/        migrate.mjs  set-passwords.mjs  verify-auth.mjs  row-counts.mjs
docs/           FRONT_DESK_OPERATIONS.md  MANAGER_OPERATIONS.md  PROVISIONAL_BUSINESS_POLICIES.md
                lacking-of-the-system/   (split current-gap notes)
tests           vitest, co-located as lib/*.test.ts — 20 files / 298 cases
HAVEN-FINAL-DEPLOYMENT-REPORT.md  .vercel/project.json  design-system/haven-hotel/  research-paper/
.env.example    tracked template (real env vars are git-ignored: .env*)
```

## 4. Running & environments

**Two database modes**, decided purely by environment (`lib/env.ts`, `resolveEnv()`):

| Mode | Trigger | Behaviour |
|---|---|---|
| `supabase` | `NEXT_PUBLIC_SUPABASE_URL` **and** `SUPABASE_SERVICE_ROLE_KEY` both present | All reads/writes go to Postgres through service-role; booking, deposits, workflow, everything works |
| `demo` | either var missing | In-memory `demoStore` seed data; UI shows a "Demo data" pill; booking/registration/portal routes that need Postgres return "unavailable"; **`process.env.NODE_ENV === "production"` refuses to boot in demo mode** (throws `EnvironmentError`) |

`.env.example` categories: `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (session signing; a hard-coded
dev-only secret is used in non-production for zero-config demo runs), `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `DIRECT_URL` (used by maintenance scripts). zod validates the shape at
boot.

**Bringing up a real environment.**
1. Provision a Supabase project and `supabase link`.
2. Apply migrations: **`supabase db push`** (this is the supported path — not `npm run migrate`;
   see memory note `supabase-migration-ledger-drift`). `supabase/schema.sql` exists only as a
   fresh-install snapshot.
3. Create accounts. The base migration seeds 8 role accounts whose shared bcrypt hash is
   deliberately **locked** by a later migration (idempotent update that sets
   `active=false`); run `scripts/set-passwords.mjs` against `DIRECT_URL` to give each a real
   password and activate it.
4. Verify: `scripts/verify-auth.mjs` (sign-in probe) and `scripts/row-counts.mjs` (table census).

## 5. Architecture at a glance

Layered request flow — **client → route handler → lib domain module → Postgres `SECURITY DEFINER`
function** — with no middleware and no client-direct database reads:

```
React client component          (fetch to same-origin /api/*)
  → route handler               (Next.js app/api/*/route.ts)
      session gate               NextAuth JWT → user_accounts re-checked per request
      zod body parse
      lib/permissions           capability check (route-level)
  → lib domain module           pure logic + thin supabase access (service role)
  → Postgres SECURITY DEFINER   fn(…actor_id, …payload) — RE-CHECKS role & row-locks & audits
```

Key properties:

- **Server-only service role.** The Supabase client is created with the service-role key and is only
  ever imported from server code. The browser talks to Next route handlers, never to Postgres.
- **Definer functions do the real work.** Privileged state changes are not plain table upserts from
  the API — they are named RPCs that own the transaction, row locks, business rules, and audit
  writes. Generic `/api/resources/[resource]` CRUD exists but **cannot** mutate the protected
  workflows (its PATCH/POST refuse protected flows with 403).
- **Domain layer is testable.** `lib/*.ts` modules are mostly pure or take an injected query
  builder, so `lib/fake-supabase.ts` (an in-memory `select/eq/in/order` query-builder) lets vitest
  run the same code the route handlers call — 20 test files / 298 cases, no network.
- **Two-mode data layer.** `lib/data.ts` (`databaseMode`, `list/create/update`, `getDashboard(role)`)
  and `lib/staff-data.ts` (`listForRole`) branch on mode; demo store keeps operational rows only.
- **Role is enforced twice** (route module + RPC body) — §6/§13.
- **Dashboard numbers are computed, not literal.** `getDashboard(role)` derives role-scoped metrics
  (occupancy %, arrivals/departures, dirty/ready/out-of-service rooms, open housekeeping/maintenance
  counts, collections, balances) from the reservations/room rows; occupancy history and room-mix are
  aggregated, not canned.

## 6. Auth, roles & RBAC

**No Supabase Auth.** next-auth v4 `CredentialsProvider` authenticates against the app's
`user_accounts` table; sessions are stateless JWTs signed with `NEXTAUTH_SECRET`.

**Registration & recovery.** The public guest registers via `/api/register` →
`register_guest_account` RPC (bcrypt cost 12; guest role). Staff accounts are minted by Admin
(`admin_create_staff`) starting **inactive + `recovery_required`**; `admin_initiate_account_recovery`
mints a one-time hashed token (public `/recover/[token]` → `complete_account_recovery`, which is
unauthenticated by design — the token is the credential). An account must be `active` **and**
`recovery_required = false` to sign in.

**Per-request re-validation.** `callbacks.jwt` re-reads the account row each request; a deactivated
account, or a changed `auth_version`, marks the token `disabled` and forces the role to `guest`. Route
guards (`guardAdmin`, `guardCatalog`, `guardOwner`, `guardManager`, `guardHousekeeping`,
`guardFinancial`) additionally re-query `user_accounts` and return 401 when the session no longer
matches. Every privileged RPC **re-checks the actor's role inside the function body**, reading
`user_accounts where id = p_staff_user_id and active`.

**The 8 roles:** `owner`, `admin`, `manager`, `front_desk`, `housekeeping`, `maintenance`,
`accounting`, `guest`.

**Capability map** (`lib/permissions.ts`; route level — RPC bodies re-check):

| Capability | Roles |
|---|---|
| `canManageReservation` (check-in, room change, extend, checkout) | `front_desk` |
| `canRequestManagerApproval` | `front_desk`, `housekeeping`, `maintenance`, `accounting` |
| `canReviewManagerApprovals` | `manager` |
| `canProcessRefund` | `accounting` |
| `canViewAccountingLedger` | `owner`, `accounting` |
| `canAdministerSystem` | `owner`, `admin` |
| `canManageCatalog` (room types/photos, transport) | `owner`, `admin`, `manager` |

Plus a resource matrix (`access: Record<Role, Resource[]>`) for list views. Admin/owner sit outside
the operational grid (they get their own governance screens, §7). The client dashboards carry a
*presentational* mirror of these rules to hide buttons; nothing a client can send bypasses the
server and DB checks.

**The null-safe guard rule.** Guards must be written `if actor is null or actor not in (…)` — never
bare `actor not in (…)`, because `NULL not in (…)` is `NULL` (never true), which let an unknown or
deactivated account's NULL role slip through the gate. This was retrofitted across the function set
by `20260830040000_null_safe_actor_role_guards.sql` and is written by hand in every migration after
it (project memory: `plpgsql-null-role-guard-bypass`).

## 7. Surfaces & flows — the system from start to finish

### 7.1 Public site and room catalogue

`/` (`(landing-page)/page.tsx`) is the marketing landing and room browser. Live room types come from
`room_types` (name, description, max guests, beds, size, amenities, base rate); room **photos** load
from a public Supabase Storage bucket (`room-photos`, 5 MB, jpeg/png/webp) through the single RLS
policy in the whole repo (`room_photos_public_read`). Room types are maintainable by managers
(`catalog/room-catalog-panel`), transport price list by managers too (`catalog/transport-services-panel`).

### 7.2 Guest booking flow (`/booking/*`)

A signed-in **guest** books online. Flow: **Search → Dates/Guest details → Review → Payment link →
Confirmation**, wired through search-params → a server-issued **hold token** → reservation id.

1. **Search** (`/booking/search`) — dates + guest count, zod-validated (`searchSchema`): check-in not
   in the past, check-out after check-in, 1–8 guests. Availability is computed server-side
   (`lib/booking.getAvailability` → `countAvailableUnits`): per room type, `inventory − blocking
   reservations − active holds`, excluding maintenance-blocked/out-of-service rooms and (for
   tonight) not-yet-clean rooms. Only types with `availableUnits > 0` are offered, cheapest first.
2. **Room details** — type facts + photos; per-night rate × nights = subtotal.
3. **Guest details** (`/booking/details`) — names, email, mobile, address, nationality, expected
   arrival, **structured multi-select request options** (`request_options`, up to 12), free-text
   special requests, and **optional transport lines** chosen from the live `transport_services`
   catalogue.
4. **Review** (`/booking/review/[token]`) — holds the reservation.
5. **Payment link** (`/booking/payment/[token]`) — manual deposit only (see below).
6. **Confirmation** (`/booking/confirmation/[id]`).

Server-side, `POST /api/booking/holds` validates the guest details, **re-validates each transport
line against the live active catalogue** (a tampered client cannot invent a service or undercut its
price), then calls `create_booking_hold`, which prices the stay and takes a **15-minute booking
hold** (`booking_holds`, `expires_at now() + hold_minutes`). The deposit policy (§8) fixes how much
must be paid; the guest then submits a deposit proof (`POST …/[token]/confirm` →
`submit_reservation_deposit`): payment methods are whitelisted manual transfers (**bank transfer or
GCash**), reference required, no card/gateway. The deposit is **verified by staff** (§7.4), which is
what turns the `pending` website reservation into `confirmed`; transport lines are posted to the
folio at that point. Holds expire defensively (`expire_booking_holds` is called at the top of every
inventory recount); an unpaid website `pending` past its payment deadline releases its inventory and
its hold/payment are expired.

### 7.3 Customer self-service portal (`/my-reservations`, `/account/*`)

A guest sees only their own data (every query filters `user_id`). Reservations are grouped into
**current / upcoming / past / cancelled** (`lib/customer.groupReservations`). Each reservation shows
its folio: room obligation, deposit, posted charges, payments, refunds, change requests, adjustments,
and issued documents (`lib/customer` financial query bundle).

Self-service actions and their constraints:

- **Cancel** — `customer_request_reservation_change`/cancel path computes refund basis points from the
  *booking's frozen policy snapshot* (Asia/Manila day count): full refund within the full-refund
  window, partial within the partial window, none after. Website cancels are subject to the snapshot.
- **Change request** — date/room/guests/special-requests. Self-executes when the change is far enough
  ahead (> `selfServiceModificationDays` by the hotel's local day) and inventory permits; otherwise it
  files a **manager approval**. A reservation carrying priced **transport** cannot be self-modified
  (`TRANSPORT_REQUIRES_STAFF`) because a silent recompute would drop the charge.
- **Payments** — submit a stay-payment proof; the hotel verifies it.
- **Guest requests** — structured request types routed to a department (see §7.7).
- **Notifications, receipts** (`/account/receipts/[id]`), profile/password/settings, and a public
  find-room view.

### 7.4 Reservation lifecycle (authoritative narrative)

The one connected spine everything else hangs off. Reservation statuses:
`pending → confirmed → checked_in → checked_out`, plus terminal `cancelled` and `no_show`.

```
website guest books ──hold 15 min──> deposit submitted ──staff verify──> confirmed
                                                                          │
walk-in / phone (front desk create) ─────────────────────────────────────> confirmed
                                                                          │  (identity verified, zero balance,
                                                                          │   check-in window, early-check-in rule)
checked_in ──charges/payments on folio──> checkout (balance cleared) ────> checked_out
                                                                          │  room → dirty; turnover task auto-created
pending/confirmed ── cancel ──────────> cancelled            (refund queue if deposit eligible)
pending/confirmed ── no-show ─────────> no_show              (only after local no-show cutoff)
```

Staff operations (each a named RPC with row locks + audit, §10):

- **Front Desk create** (walk-in/phone), **assign room** (pre-arrival; eligibility = clean,
  serviceable, no overlap, respects the room-type/upgrade rules), **check-in** (identity verified,
  zero balance, check-in window vs `checkInTime`, `earlyCheckInAllowed`, honouring a manager-approved
  early check-in; records the active room assignment), **change room** (cross-type = upgrade needing
  owner/admin/manager), **extend stay** (posts an `extension` folio charge, pushes check-out; blocked
  if the room is taken), **update guest** (phone/arrival/notes), **checkout** (folio must balance —
  `FOLIO_BALANCE_REQUIRED`; closes assignment, room dirty, creates a typed `checkout_cleaning`
  housekeeping task), **verify identity**, **verify deposit / record payment**, **post folio charge**,
  **verify / reject** a customer-submitted payment.
- **Deposit verify** re-checks the rounded amount, inventory is still free, marks the reservation
  confirmed, posts transport lines as folio charges (deterministic idempotency keys), and appends
  audit rows.
- **Housekeeping owns the dirty→ready leg** (§7.5); **Maintenance owns serviceability** (§7.6).

### 7.5 Housekeeping workflow

Task types: `checkout_cleaning`, `stayover_cleaning`, `inspection`, `maintenance_cleanup`,
`guest_request`, legacy free-text. Statuses: `pending → assigned → in_progress → (inspection) →
completed`, with `deferred` and `cancelled`; rooms carry `housekeeping ∈ {dirty, cleaning, clean,
inspection, reclean_required}`.

Assign → start (advisory lock on the room; task-type/room-state compatibility) → **complete** (next
room state from the policy's `housekeepingInspectionRequired` and whether an open work order blocks
the room; completes a linked guest request; emits a `housekeeping_room_ready` audit event only when
the room truly becomes available) → **inspect** (pass → clean/available; fail → `reclean_required`
**plus a child reclean task**). Only `stayover_cleaning`/`guest_request` can be deferred (DND etc.).
Housekeeping can report a maintenance issue from a task (opens a work order; the cleaner never blocks
the room). One exclusive in-progress task per room is a DB invariant. Tasks auto-created by triggers:
turnover on checkout, cleanup after a resolved maintenance order, a request from a routed housekeeping
guest request, and deferred creation when a pending task's reservation gets its room.

### 7.6 Maintenance workflow

Work orders: `open → assigned → in_progress → resolved → completed`, plus `waiting_parts`,
`deferred`, `cancelled`. A **serviceability model** decides room blocking: diagnosis sets
`serviceability_impact ∈ {serviceable, blocked, out_of_service}` — a blocked room flips to
`maintenance` and is invisible to availability until `maintenance_restore_room_state` un-blocks it
(only when nothing else blocks it). Technicians self-assign; roles are re-checked. Resolution
requires a diagnosis, and if `cleanup_required` it creates the housekeeping cleanup task. Room-level
departments are coordinated, not owned, by maintenance (escalation is a Manager action, §7.8).

### 7.7 Guest requests (structured)

Chosen at checkout (`request_options`) and auto-filed when a website reservation confirms
(`file_booking_guest_requests`, idempotent per option), or submitted live by a guest
(`customer_submit_guest_requests`, up to 12 picks). A single router `guest_request_route(type)`
maps every type to a department — front desk, housekeeping, maintenance, … — and auto-creates the
matching housekeeping task / maintenance order. Requests carry priority/severity and can be
escalated to a Manager. Live staff routing from the Front Desk uses the same lane.

### 7.8 Manager approvals & exceptions

The escalation engine over the operational workflow. Anything the policy would refuse — room
upgrade, reservation modification, early check-in, late checkout, guest compensation, refund
exception, checkout exception, guest escalation — can be filed as a **manager approval request**
(`request_manager_approval`, front desk/housekeeping/maintenance/accounting; manager excluded).
Each request records severity, the proposed `requested_action`, and the *normal policy result* it
would overrule. Optimistic versioning (`version` + partial-unique "one pending per entity").

**Review** (`review_manager_approval`, owner/admin/manager; self-approval forbidden) re-feasibility-
checks each approve *at review time*: the upgrade needs a same-type-away + target room free, a
modification re-counts inventory under the advisory lock, late checkout checks the assignment
conflict, compensation ≤ folio, refund exception ≤ settled deposit. **Execution is separated from
approval**: the front desk (`front_desk_execute_manager_approval`) executes the approved operational
exception, accounting executes the financial one (`accounting_execute_manager_financial_approval`,
guest compensation as a credit). High/critical exceptions can be **escalated to Owner**
(`escalate_manager_approval_to_owner`), after which only an Owner re-read as `owner` can review them
(`review_owner_exception` → delegates to `review_manager_approval` then stamps the owner review).

### 7.9 Role portals (`/manager_dashboard` — one route, role-switched)

A single route renders the right client by role: `owner` → OwnerDashboardClient, `admin` →
AdminDashboardClient, everything else (manager, front_desk, housekeeping, maintenance, accounting)
→ ManagerDashboardClient. The operational client is one screen whose **navigation is gated per role**
(client-side mirror of permissions) across these workspaces:

| Role | Sections offered |
|---|---|
| Manager | Overview (risk command centre), reservations, rooms, guests, guest requests, **Room Types & Photos**, **Transport Services**, housekeeping, maintenance, **Approvals & Escalations**, Reports |
| Front Desk | Overview (arrivals/departures/in-house/rooms ready), reservations, rooms, guests, guest requests, housekeeping, billing, Deposit verification, **Transactions · Guest folios · Cash & shifts · Financial documents**, Approvals |
| Housekeeping | Overview, rooms, guest requests, housekeeping tasks, inventory, Approvals |
| Maintenance | Overview, rooms, guest requests, maintenance orders, inventory, Approvals |
| Accounting | Overview, reservations, billing, Deposit verification, **Refunds**, inventory, **Transactions · Folios · Cash & shifts · Reconciliation · Documents**, Reports, Approvals |

The **accounting workspace is ledger-readonly**: every action posts to an accounting route that calls
a definer RPC — corrections are reversals/adjustments, settled payments are never edited. Cash-shift
expected cash is derived from recorded payments; counted differences are stored as a variance, never
used to rewrite a guest payment. Reconciliations compare recorded vs external-statement totals and
only record variance. Documents (receipts `RCP-`, folio statements `FOL-`) are generated server-side
snapshots.

Admin and Owner get dedicated governance screens (§7.10).

### 7.10 Admin governance & Owner executive

- **Admin** (`AdminDashboardClient`, `/api/admin/*`): staff account lifecycle
  (`admin_create_staff`, status changes, role changes, metadata), **secure account recovery** tokens,
  room/room-type/policy editing. Everything is version-checked (`ACCOUNT_STALE`,
  `ROOM_CONFIGURATION_STALE`, `ROOM_TYPE_STALE`, `POLICY_STALE`); protected roles (owner/admin),
  self-lifecycle changes, and the last active Owner are guarded; timezone changes are **Owner-only**;
  a room with an active/upcoming assignment cannot be deactivated.
- **Owner** (`OwnerDashboardClient`, `/api/owner/data`, `/api/owner/exceptions/[id]/review`):
  executive data and the top-tier exception review above Manager authority.

## 8. Business policies & configuration

**Central policy table** `hotel_operational_policies` — a single `default` row, versioned, editable
by Admin/Manager (timezone by Owner only, validated against `pg_timezone_names`). **Every booking
freezes a `operational_policy_snapshot`** (BEFORE-INSERT trigger) so a later policy edit cannot
retroactively change a booking's terms; reads use `coalesce(snapshot, live)`.

Provisional defaults (`docs/PROVISIONAL_BUSINESS_POLICIES.md`, `lib/hotel-policy.ts`):

| Policy | Default |
|---|---|
| Hotel timezone / business day | `Asia/Manila` (hotel day is policy data, never the server session's) |
| Check-in / check-out | 15:00 / 12:00; early check-in allowed only per rule or manager approval |
| No-show cutoff | 23:59 local on check-in day |
| Deposit (website) | 30% of total (`reservation_deposit_policies`, `percentage_basis_points = 3000`); hold 15 min; "At hotel / check-in" balance wording |
| Cancellation refunds | full within 14 days, 50% (5000 bp) 7–14 days, 0 after — computed on the hotel-local day |
| Self-service modification | allowed > 3 days before check-in; else manager approval |
| Identity | valid ID required at check-in (guest cannot self-check-in) |
| Minimum booking age | 18 (data source for the actual age check is a gap — §15) |
| Email verification | required: **off** |

Percentages are **integer basis points 0–10000** in the DB; deposit/refund math is computed in
integer centavos in TS (`lib/booking.ts`) and `round(…,2)` pesos in SQL. Money is stored as
`numeric(12,2)` PHP throughout. The `reservation_deposit_policies` row mirrors the operational
pattern for money: read at hold creation, frozen into `deposit_policy_snapshot`.

## 9. Data model

28 migrations (`20260826125341_initial_hotel_schema.sql` … `20260904030000_transport_booking.sql`)
build ~40 tables. Grouped by domain (see the migration-walkthrough note in §16 for per-file detail):

| Domain | Tables | Notes |
|---|---|---|
| Identity & auth | `user_accounts`, `account_recovery_tokens`, `guests`, `staff` | `user_accounts` = app auth (role enum, `active`, `auth_version`, `recovery_required`); `guests` links guest users ↔ stay profiles; `staff` mirrors staff accounts |
| Rooms | `rooms`, `room_types`, `reservation_room_assignments` | Room statuses + housekeeping state + `administratively_active`; `room_types` = sellable catalogue (rate, amenities, **`photo_urls`**); assignments ledger with a **GiST exclusion** (one active assignment per room per date-range) |
| Reservations | `reservations`, `booking_holds`, `reservation_change_requests` | `reservations` = the spine (statuses, money snapshot, policy snapshots, `request_options`, `transport_lines`, source website/front desk, payment mirror); holds = 15-min carts keyed by `token uuid` |
| Housekeeping | `housekeeping_tasks`, `housekeeping_task_assignments` | Typed tasks + history; one in-progress task per room invariant |
| Maintenance | `maintenance_orders`, `maintenance_order_events`, `maintenance_order_assignments` | Work orders + serviceability model + append-only event log |
| Guest requests | `guest_requests` | Structured multi-type requests, department-routed, priority/severity/escalation |
| Money | `invoices`, `folio_charges`, `payments`, `financial_adjustments`, `refund_requests`, `refund_attempts`, `cash_shifts`, `payment_reconciliations`, `financial_documents`, `transport_services` | Folio truth is **derived** (`sync_invoice_financials` recomputes paid/balance/credit/status from payments and mirrors onto `reservations.payment_status`); settled payments immutable; documents = generated snapshots |
| Manager/owner | `manager_approval_requests`, `manager_notes` | Exception engine with `version`, `execution_status`, `authority_level` manager/owner |
| Retail/back-office | `inventory`, `vendors`, `purchase_orders`, `reviews` | From the initial schema (inventory live in the grid; vendors/POs/reviews are schema-level, not yet surfaced) |
| Audit | `audit_logs` | Append-only event trail (`protect_audit_history`), `before_data`/`after_data` jsonb |

**RLS.** Enabled on every table; **zero policies on public tables** — the app reaches them only from
its server with the service-role key, and every mutating path is a definer RPC. The sole RLS policy
in the repo is `room_photos_public_read` on `storage.objects` so `<img>` tags can load room photos.

**IDs.** Human-visible entities use DB-generated text prefixes + 8 hex (`GST-`, `RM-`, `RSV-`,
`HKT-`, `MWO-`, `INV-`, `ITM-`, `STF-`); later tables are `uuid`; `booking_holds` keyed by `token`;
`audit_logs` is a bigint identity. Human numbers are generated in function bodies: confirmations
`HVN-YYMMDD-XXXXXX`, receipts `RCP-`, folio documents `FOL-`. Idempotency keys are caller-supplied
uuids behind partial unique indexes (some derived, e.g. `md5(reservation_id||'|'||option)::uuid` for
auto-filed requests/transport lines).

**Indexes/invariants worth knowing:** GiST exclusion on active assignments; partial unique indexes
for one-pending manager approval per entity, one open cash shift per staff, one active maintenance
assignment, one in-progress housekeeping task per room; confirmation/idempotency lookups.

## 10. Postgres functions by workflow

129 `create or replace function public.…` occurrences across the 28 migrations (many are redefinitions
of an earlier name as columns/rules evolve — distinct RPCs are far fewer). All are **SECURITY
DEFINER** (plus `set search_path = public`), **EXECUTE-granted to `service_role` only**, re-check the
actor role with the null-safe `actor is null or` guard, row-lock everything they mutate
(`for update` before validation), use `pg_advisory_xact_lock` around availability/room-state counts,
and write `audit_logs` rows. Grouped by workflow (per-migration detail in §16's pointer):

| Workflow | Functions (purpose) |
|---|---|
| Booking & availability | `create_booking_hold` (price + hold; `ROOM_TYPE_UNAVAILABLE`), `submit_reservation_deposit` (pending res + invoice + pending deposit; idempotent by token), `verify_reservation_deposit` (staff confirm + transport posting), `expire_booking_holds`, `front_desk_create_reservation`, `file_booking_guest_requests` (+ trigger) |
| Front desk | `front_desk_assign_room`, `front_desk_check_in`, `front_desk_change_room`, `front_desk_extend_stay`, `front_desk_checkout`, `front_desk_update_guest`, `verify_guest_identity`, `record_staff_payment`, `post_folio_charge`, `customer_submit_stay_payment`/`verify_customer_stay_payment` |
| Housekeeping | `housekeeping_assign_task`, `housekeeping_start_task`, `housekeeping_complete_task`, `housekeeping_inspect_task`, `housekeeping_defer_task`, `housekeeping_report_maintenance`, task-creation triggers, assignment backfill |
| Maintenance | `maintenance_create_work_order`, `maintenance_assign_work_order`, `maintenance_start_work_order`, `maintenance_record_diagnosis`, `maintenance_defer_work_order`, `maintenance_add_progress`, `maintenance_resolve_work_order`, `maintenance_close_work_order`, `maintenance_cancel_work_order`, `maintenance_room_is_blocked`, `maintenance_restore_room_state` |
| Cancellation/refunds | `cancel_reservation` (snapshot-timezone refund basis points; opens `refund_requests`), `process_refund` (idempotent `purpose='refund'` payment; refund attempts; `REFUND_EXCEEDS_RECEIVED`), `accounting_fail_refund`, `reverse_reservation_transport` (+ cancel trigger) |
| No-show | `mark_reservation_no_show` (local-time cutoff gate) |
| Accounting | `sync_invoice_financials` (single folio recompute; internal-only, revoked even from service_role), `accounting_reject_deposit`, `accounting_reverse_charge`, `accounting_record_adjustment`, `accounting_open/close_cash_shift`, `accounting_reconcile_cash_shift`, `accounting_reconcile_payments`, `accounting_generate_document`; immutability triggers `protect_settled_payment`, `protect_audit_history` |
| Manager & Owner | `request_manager_approval`, `review_manager_approval` (feasibility re-check + version), `front_desk_execute_manager_approval`, `accounting_execute_manager_financial_approval`, `manager_prioritize_housekeeping`, `manager_escalate_maintenance`, `escalate_manager_approval_to_owner`, `review_owner_exception`, `protect_owner_exception_review`, `sync_manager_financial_execution` |
| Customer | `register_guest_account`, `customer_submit_guest_request(s)`, `customer_request_reservation_change`, recovery RPCs (`admin_initiate_account_recovery`, `complete_account_recovery`), policy snapshot triggers |
| Governance/catalogue | `admin_create_staff`, `admin_change_account_status`, `admin_change_user_role`, `admin_update_user_metadata`, `admin_update_room_metadata`, `admin_update_room_type` (incl. `photo_urls`), `admin_update_operational_policy`, `upsert_transport_service`, `current_operational_policy_snapshot`, `hotel_today` |
| Guest-request routing | `guest_request_route` (single department-routing table), request/task-creation triggers, `link_housekeeping_tasks_to_assigned_room` |

Known quirks the code comments carry: `resolve_maintenance_order` is deliberately a raising stub
after the maintenance rework (callers use `maintenance_resolve_work_order`), and one hardening
migration's comments reference a `room_is_sellable(...)` helper that exists only in the deployed
database, not in the migration files — see §15.

## 11. API reference

65 route handlers under `app/api`. The **`resources`** CRUD below is the only generic surface; every
other handler is a named, role-guarded workflow endpoint that ultimately calls a definer RPC.

**Generic resource CRUD** — `GET/PATCH/POST /api/resources/[resource]`
(resource ∈ reservations, rooms, guests, guest_requests, housekeeping_tasks, maintenance_orders,
invoices, payments, refunds, inventory, staff): GET is role-scoped (`listForRole`; a guest sees only
their own rows). POST/PATCH apply only to *administrative* resources — **protected workflow rows are
refused with 403**; housekeeping task completion on PATCH routes through
`complete_housekeeping_task`. The single generic route exists so the staff grid can create/advance
rows (e.g. walk-in reservation draft) without duplicating per-resource handlers, while every
real state change happens in the named endpoints below.

**Booking & guest.** `POST /booking/holds` (guest details + transport re-validation → hold token);
`POST /booking/holds/[token]/confirm` (deposit submission); `POST /register`; `POST /recover/[token]`;
`/api/auth/[...nextauth]` (NextAuth handler).

**Customer self-service** (`/api/account`): `PATCH profile`, `PATCH password`,
`POST requests`, `POST reservations/[id]/cancel`, `POST reservations/[id]/change-request`,
`POST reservations/[id]/payments` (submit stay-payment proof).

**Front desk** (`/api/front-desk`): `POST reservations`, `POST check-in`,
`GET reservations/[id]/eligible-rooms`, `POST reservations/[id]/assign`, `…/change-room`,
`…/charge`, `…/checkout`, `…/extend`, `PATCH …/guest`, `POST …/identity`, `POST …/payment`,
`POST …/requests`, `POST deposits/[id]/verify`.

**Housekeeping** (`/api/housekeeping/tasks/[id]/`): `POST assign, start, complete, inspect, defer,
maintenance`.

**Maintenance** (`/api/maintenance`): `POST orders`, `POST orders/[id]/[action]`
(action ∈ assign, start, diagnose, defer, progress, resolve, close, cancel).

**Manager** (`/api/manager`): `GET/POST approvals`, `POST approvals/[id]/review | execute |
financial-execute | escalate-owner`, `POST housekeeping/[id]/prioritize`,
`POST maintenance/[id]/escalate`.

**Accounting** (`/api/accounting`): `GET ledger`; `POST payments/[id]/verify | reject`;
`POST refunds/[id]/process | fail`; `POST cash-shifts` / `PATCH cash-shifts/[id]`;
`POST reconciliations`; `POST adjustments`; `POST charges/[id]/reverse`; `POST documents`.

**Admin** (`/api/admin`): `POST users`, `POST users/[id]/action`, `PATCH policy`,
`PATCH rooms/[id]`, `GET data`.

**Owner** (`/api/owner`): `GET data`, `POST exceptions/[id]/review`.

**Catalog** (`/api/catalog`): `GET/PATCH room-types[/id]`, `POST photos`,
`GET/PATCH/POST transport-services[/id]`; **staff** `GET/PATCH reservations/[id]` (reservation
detail + closeReservation); **dashboard** `GET /api/manager_dashboard`.

Error conventions: RPC failures are mapped to friendly messages and status codes in the route-module
guards (`admin-route.ts` etc. — `PROTECTED_ROLE_FORBIDDEN`→403, `*_STALE`/version→409, etc.); raw
database error text is never echoed to the client.

## 12. Testing & verification

**Command gates** (all four pass at the reference commit): `npm run typecheck` (`tsc --noEmit`),
`npm run lint`, `npm test` (vitest), `npm run build`.

**Suite:** 20 test files / 298 cases. Domain modules carry co-located `*.test.ts`:
`accounting`, `admin-governance`, `availability`, `booking`, `connected-workflows`,
`customer-ownership`, `customer-workflows`, `customer`, `deposit`, `env`,
`front-desk-operations`, `hotel-policy`, `housekeeping-workflow`, `maintenance-operations`,
`manager-operations`, `owner-governance`, `registration`, `staff-reservations`,
`system-integration`, `theme`. The seam that makes this possible: `lib/fake-supabase.ts` is an
in-memory query-builder implementing the subset of the supabase client the domain code uses, so the
route-handler logic runs headlessly.

**Helper scripts** (§4): `verify-auth.mjs` (login probe against a configured environment),
`row-counts.mjs` (table census), `set-passwords.mjs` (activate + set real passwords on a fresh DB),
`migrate.mjs` (legacy; **not** the supported migration path).

## 13. Security model

- **Server-only service role.** No `NEXT_PUBLIC`-exposed service key, no client-direct Supabase
  reads; the browser only reaches Next route handlers.
- **Deny by default.** RLS is on with zero public-table policies; EXECUTE on definer functions is
  revoked from `public`/`anon`/`authenticated` and granted to `service_role` only. Three migrations
  harden this, including `alter default privileges` (Supabase's defaults re-granted named-role
  EXECUTE on new functions — a PUBLIC revoke alone would miss it; memory:
  `supabase-anon-execute-grant-hole`). RLS policy caveat: the one `storage.objects` policy is the
  only data exposure, and it is intentional (public room photos).
- **Two-layer RBAC.** Route guard checks the JWT + a fresh `user_accounts` read; every definer RPC
  re-reads the actor's role with the null-safe `actor is null or` guard and refuses a deactivated
  account (`… and active`) even mid-session.
- **Stateless JWT re-validation** each request (`auth_version`/inactive → disabled).
- **Passwords** bcrypt (cost 12 at registration); seeded hashes neutralised in a migration; recovery
  tokens stored hashed, expiry + single-use, unauthenticated by design.
- **Immutability:** settled payments and the audit log are write-protected at the DB layer; money
  corrections are reversals/adjustments; financial documents are generated snapshots.
- **Audit trail:** every privileged mutation appends to `audit_logs` (before/after jsonb).
- **Boot-time env validation**; demo mode is refused in production.
- **Client is untrusted:** transport lines re-validated against the live catalogue, request bodies
  zod-parsed, RPC error text never echoed raw, friendly-path redirects only (`safeInternalPath`).

## 14. Deployment & environments

Deployed to **Vercel** (project `haven-hotel-management`, see `HAVEN-FINAL-DEPLOYMENT-REPORT.md`
and `.vercel/project.json`; SSO-protected; Hobby-plan commit-attribution nuance noted in that report).
A fresh environment needs: Vercel env vars (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIRECT_URL`), `supabase db push` for the
schema, then `set-passwords.mjs` on the empty database to create/activate the staff accounts. There
is no CI pipeline config in the repo at this commit.

## 15. Current gaps & deferred configuration

Honest inventory of what is **not** wired up yet (not prescriptions). Full split notes:
`docs/lacking-of-the-system/`.

- **Payments/refunds are manual, not gateway-backed.** Deposits and stay payments are staff-verified
  proof-of-transfer; refunds are recorded attempts with a transaction reference. No real card/gateway
  or actual money movement. `payments.status` has no `paid`→gateway-confirmed automatic path.
- **No email/SMS provider** (and `emailVerificationRequired` is off); notification delivery and the
  guest email content for the payment link / confirmation are not provisioned. Booking expiry relies
  on in-session hold logic, not external reminders.
- **Minimum-age (18) has no data source** — the hotel cannot yet verify a guest's date of birth
  against government ID through the app.
- **schema.sql lags migrations** (memory: `schema-sql-lags-behind-migrations`): the fresh-install
  snapshot is missing the last feature blocks (photos, structured requests, transport). Use
  `supabase/migrations/` as truth.
- **One deployed helper is remote-only**: hardening-migration comments name `room_is_sellable(...)`,
  which is defined in neither `supabase/migrations` nor `schema.sql` — some live function bodies
  therefore exist only in the deployed database (memory: `db-function-drift-live-definitions`). Read
  the live body via `DIRECT_URL` before recreating any existing RPC.
- **Uncommitted UI refactor** (§ header): the dashboards' dialog layer is mid-migration to a
  promise-based bridge; finish deleting the legacy inline dialog state before committing.
- Demo-mode portals, `DataTable.tsx`, and inventory/vendors/purchase-orders/reviews surfaces are
  partially scaffolded rather than fully surfaced.
- No CI config; no production observability; guest-facing behaviour depends on the provisional
  policies in §8 until real ones are configured.

## 16. Further reading

- `docs/PROVISIONAL_BUSINESS_POLICIES.md`, `docs/FRONT_DESK_OPERATIONS.md`,
  `docs/MANAGER_OPERATIONS.md` — current operational specs the workflows implement.
- `docs/lacking-of-the-system/` — the full split gap list.
- `HAVEN-FINAL-DEPLOYMENT-REPORT.md` — deployment detail, env wiring, SSO/Vercel notes.
- `research-paper/` — an earlier snapshot of the design (07 chapters; older than the current tree).
- `nano_bots/` — a notes vault.
- `design-system/haven-hotel/` — the UI kit used by the dashboards.
- Migration-by-migration walkthrough with exact per-file function counts and shared conventions:
  the fresh notes captured for this document (id scheme, basis points, timezone policy data, hold
  expiry, advisory locks + GiST backstop) mirror the migration set; for code-level reference, start
  at `20260826125341_initial_hotel_schema.sql` and read the migrations in filename order.
- Project memory (this session's persistent notes) records the drift/tooling facts this doc relies
  on: `supabase db push` over `npm run migrate`, `schema.sql` lag, the null-role guard rule, the
  anon-EXECUTE grant hole, and live-vs-migration definer drift.
