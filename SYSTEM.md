# SYSTEM.md — Haven Hotel Management

Complete reference to this codebase, from end to end. Covers what the system does (every surface,
role, and workflow) and how it is built (architecture, data model, Postgres functions, API, security,
tests, deployment).

- **Reference point:** branch `main` @ commit `f49a737` **plus the current working tree**
  (audited 2026-09-09). The working tree includes the post-commit feature blocks documented here,
  including request-type governance, controlled room-assignment exceptions, durable guest
  notifications/optional email, and required payment-proof uploads.
- **Status:** every claim below was re-checked against the current route handlers, domain modules,
  components, migrations, tests, environment template, and package manifest. This describes the
  local source tree; it does not claim that every local migration is already deployed remotely.
- **Verification (2026-09-09):** `npm run typecheck`, `npm run lint`, and `npm run build` pass.
  Lint exits successfully with 72 warnings. `npm test` currently has **671 passing / 3 failing**
  cases across 54 files; the three UI assertion failures are recorded in §12.
- **Source of truth for the database** is `supabase/migrations/` (54 files). The consolidated
  `supabase/schema.sql` is a deployed-database snapshot, not the migration authority, and currently
  lags the local 20260918–20260921 migrations (see §15).

---

## 1. What this is

A **single-property hotel operations system** for a ~48-room boutique property (brand: **Haven
Makati**). One Next.js deployment serves four surfaces:

| Surface | Where | Auth | Purpose |
|---|---|---|---|
| Public site + room catalogue | `/` and `/booking/*` | none (guest booking needs a guest login) | Marketing, photo catalogue, and the connected guest booking flow |
| Customer self-service portal | `/my-reservations`, `/account/*` | guest | Manage reservations, submit request batches, request transportation, deposit/stay payments, receipts, notifications |
| Staff role portals | `/manager_dashboard` | staff roles | Front Desk, Housekeeping, Maintenance, Accounting, Manager, Admin, Owner workspaces |
| Account & auth | `/login`, `/register`, `/auth/continue`, `/recover/[token]` | varies | One login for all roles; self-service guest registration; password recovery |

It is built for **real (Supabase/Postgres) operation** and also runs in a **demo mode** with an
in-memory store when no database is configured. Production refuses demo mode.

The product idea: reservations, room inventory, housekeeping, maintenance, guest requests,
transportation, billing/folios, refunds, daily operations reporting, and manager approval/exception
handling are **one connected lifecycle** — a checkout turns a room dirty and opens a housekeeping
task, a maintenance diagnosis can block a room from sale, a verified deposit (Accounting's decision
alone) confirms a website booking, a booking's transport preference is filed as a live
transportation request the moment the reservation confirms, and the Front Desk closes each day with
an immutable operations report the Manager reviews. Role and workflow are enforced twice: on the
API route *and* inside the database function that performs the work.

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
| Styling | Hand-written CSS, no framework; `Modal.css`, `haven-loader.css` + theme CSS files | — |
| AI (innovation layer) | `@google/genai` — **server-side only**, advisory Gemini assistance (`GEMINI_API_KEY`, never `NEXT_PUBLIC_`) | ^2.21 |
| Guest email (optional) | Resend HTTP API via native `fetch`; server-side key only (`RESEND_API_KEY`) | no SDK |
| QR (innovation layer) | `qrcode` (server-side PNG data-URL rendering) · `jsqr` (browser camera scanning) | — |
| Migrations | `supabase/migrations/*.sql` applied with **`supabase db push`** | — |
| Tests | vitest domain/contract tests + jsdom component tests + rollback-safe live system script | ^4.1 |

**npm scripts.** `dev`, `build` (`next build`), `start`, `lint` (flat `eslint.config.mjs`), `typecheck`
(`tsc --noEmit`), `test` (`vitest run`), `test:watch`. Helper scripts live in `scripts/` (§4, §12):
`migrate.mjs` (legacy), `set-passwords.mjs`, `verify-auth.mjs`, `row-counts.mjs`,
`system-test.mjs` (live end-to-end, §12), and `ai-smoke.mjs` (opt-in single live Gemini probe, §12).

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
        transportation, notifications, receipts/[id], find-room, help, profile, settings)
  (manager)/manager_dashboard/page.tsx   ONE staff route; role-switches the portal component
  scan/page.tsx                  QR operations scanner (camera via jsQR + manual token entry)
  qr-placard/[roomId]/page.tsx   printable per-room QR operations placard (staff-only)
  recover/[token]/page.tsx       public secure-account-recovery
  api/**                         93 route handlers (full map in §11)

components/
  ui/         Modal, FormDialog, FormField, StatusBadge, AccessibleChart, Navigation,
              Performance, DataTable (unused), action-dialogs (promise-based dialog bridge),
              haven-loader, index
  landing/  auth/  booking/  customer/  account/     per-surface components
  manager/    manager-dashboard-client  (operational workspace for 5 staff roles),
              transportation-panel, front-desk-reports-panel, guest-requests-panel,
              room-roster-panel            (physical-room configuration)
              predictive-insights-panel    (Predictive Analytics workspace, §7.13)
              haven-ai-panel               (HAVEN AI workspace — brief + Ask HAVEN, §7.13)
  admin/      admin-dashboard-client      (governance)
  owner/      owner-dashboard-client      (executive/exceptions)
  catalog/    room-catalog-panel, transport-vehicle-types-panel
  qr/         qr-scanner (camera + manual entry, role-aware outcomes), qr-placard (print/rotate)
  providers.tsx  theme-toggle.tsx

lib/          domain layer, pure and unit-tested (see §5)
  types.ts permissions.ts auth.ts customer-auth.ts env.ts data.ts staff-data.ts
  booking.ts customer.ts accounting.ts admin.ts manager.ts hotel-policy.ts
  admin-route.ts owner-route.ts manager-route.ts housekeeping-route.ts financial-route.ts
  transportation-route.ts      transportation.ts  transportation-display.ts
  front-desk-reports.ts        request-batches.ts  request-catalog.ts
  notifications.ts             email.ts            staff-duty.ts  approval-display.ts
  analytics/  occupancy, housekeeping, inventory, maintenance, runner, data
              (Predictive Analytics engine — HAVEN's own forecasts, §7.13)
  ai/         gemini-client, guard, prompts, schemas, tools, audit, brief, explain
              (advisory Gemini layer — explains, never predicts or executes)
  qr/         tokens (opaque hashed QR tokens — issue/validate/rotate, scan audit)
  fake-supabase.ts demo-store.ts theme.ts format.ts room-images.ts request-options.ts

supabase/
  migrations/   54 files, 2026-08-26 … 2026-09-24 (authoritative schema + 178 function
                definitions, 109 distinct public function names)
  schema.sql    deployed-database dump (currently lags migrations — see §15)

scripts/        migrate.mjs  set-passwords.mjs  verify-auth.mjs  row-counts.mjs  system-test.mjs
                ai-smoke.mjs (opt-in single live Gemini probe)
docs/           FRONT_DESK_OPERATIONS.md  MANAGER_OPERATIONS.md  PROVISIONAL_BUSINESS_POLICIES.md
                TRANSPORTATION_FUTURE_ENHANCEMENTS.md  innovation-architecture.md  (§7.13 defense doc)
                lacking-of-the-system/  (split gap notes)
tests           vitest, co-located domain and component tests — 54 files / 674 cases
HAVEN-FINAL-DEPLOYMENT-REPORT.md  SYSTEM-TEST-REPORT.md  DESIGN-STATUS.md  DESIGN.md
.vercel/project.json  design-system/haven-hotel/  research-paper/
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
`SUPABASE_SERVICE_ROLE_KEY`, `DIRECT_URL` (used by maintenance and system-test scripts), and — for
the innovation layer only — `GEMINI_API_KEY` + optional `GEMINI_MODEL` (server-side Gemini access;
**never** a `NEXT_PUBLIC_` Gemini variable) and `CRON_SECRET` (Vercel cron bearer for
`/api/analytics/generate`). Optional `RESEND_API_KEY` + `RESEND_FROM` enable transactional guest
email copies; without them, durable in-app notifications continue to work. zod validates the app's
required environment at boot. Transportation deliberately uses no external mapping/routing API
(§7.11).

**Bringing up a real environment.**
1. Provision a Supabase project and `supabase link`.
2. Apply migrations: **`supabase db push`** (this is the supported path — not `npm run migrate`;
   see memory note `supabase-migration-ledger-drift`). `supabase/schema.sql` is only a
   deployed-database snapshot.
3. Create accounts. The base migration seeds 8 role accounts whose shared bcrypt hash is
   deliberately **locked** by a later migration (idempotent update that sets
   `active=false`); run `scripts/set-passwords.mjs` against `DIRECT_URL` to give each a real
   password and activate it.
4. Verify: `scripts/verify-auth.mjs` (sign-in probe) and `scripts/row-counts.mjs` (table census).
5. Optional live end-to-end: `node scripts/system-test.mjs` against the configured database
   (rollback-safe by design — §12).

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
  run the same code the route handlers call. The current suite also includes jsdom component tests;
  see the exact gate state in §12.
- **Two-mode data layer.** `lib/data.ts` (`databaseMode`, `list/create/update`, `getDashboard(role)`)
  and `lib/staff-data.ts` (`listForRole`) branch on mode; demo store keeps operational rows only.
- **Role is enforced twice** (route module + RPC body) — §6/§13.
- **Dashboard numbers are computed, not literal.** `getDashboard(role)` derives role-scoped metrics
  (occupancy %, arrivals/departures, dirty/ready/out-of-service rooms, open housekeeping/maintenance
  counts, collections, balances, manager alert policy thresholds) from the reservations/room rows;
  occupancy history and room-mix are aggregated, not canned.
- **Promise-based dialog bridge.** All three dashboards run their confirm/prompt/form dialogs
  through `components/ui/action-dialogs.tsx` (`useActionDialogs`) — no ad-hoc dialog state.

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
`guardFinancial`, `guardTransportation`) additionally re-query `user_accounts` and return 401 when
the session no longer matches. Every privileged RPC **re-checks the actor's role inside the
function body**, reading `user_accounts where id = p_staff_user_id and active`.

**The 8 roles:** `owner`, `admin`, `manager`, `front_desk`, `housekeeping`, `maintenance`,
`accounting`, `guest`.

**Capability map** (`lib/permissions.ts`; route level — RPC bodies re-check):

| Capability | Roles |
|---|---|
| `canManageReservation` (check-in, room change, extend, checkout) | `front_desk` |
| `canViewGuestContact` | `owner`, `manager`, `front_desk` |
| `canViewReservationFinancials` | `owner`, `manager`, `front_desk`, `accounting` |
| `canVerifyDeposit` (deposit + stay-payment proof review) | `accounting` **only** — front desk collects money but never blesses the proof |
| `canCollectPayment` / `canOperateCashShift` / `canIssueFinancialDocument` | `front_desk`, `accounting` |
| `canPostFolioCharge` | `front_desk` |
| `canProcessRefund` / `canAdjustFolio` / `canAcceptOverpayment` / `canReconcileFinancials` | `accounting` |
| `canViewAccountingLedger` | `owner`, `accounting` |
| `canRequestManagerApproval` | `front_desk`, `housekeeping`, `maintenance`, `accounting` |
| `canReviewManagerApprovals` | `manager` |
| `canExecuteManagerApproval` / `canExecuteManagerFinancialApproval` | `front_desk` / `accounting` |
| `canCoordinateOperations` | `manager` |
| `canPerformHousekeeping` | `housekeeping` |
| `canViewTransportation` | `front_desk`, `manager`, `owner` |
| `canOperateTransportation` (review→schedule→assign→start→complete) | `front_desk` |
| `canCancelTransportation` (cancel/reject with reason) | `front_desk`, `manager` |
| `canGenerateFrontDeskReport` (daily operations report) | `front_desk` |
| `canReviewFrontDeskReports` | `manager` |
| `canViewStaffDuty` (Staff & Duty supervision view, §7.14) | `manager` |
| `canAdministerSystem` | `owner`, `admin` |
| `canManageCatalog` (room types/photos, transfer vehicle types) | `owner`, `admin`, `manager` |
| `canSetRoomTypeRate` (set `base_rate` directly, review rate proposals) | `owner`, `admin` |
| `canProposeRoomTypeRate` (submit rate changes for approval) | `manager` |

**Room-type governance** (rate changes are propose→approve). Manager creates room types and owns
their guest-facing content — description, photos, amenities, capacity, beds, size, and the
`active` visibility flag on the public booking page — but never writes `base_rate` directly:
a Manager rate change lands in `room_rate_proposals` (one pending per room type) and applies only
when an Owner/Admin approves (`admin_review_room_type_rate_proposal`; approval writes the rate and
bumps the room-type version). **Approve = activate** (`20260927010000`): for a still-inactive
type — the shape every Manager creation takes — one approval sets the rate *and* publishes the
type (badge color included); already-active types keep rate-only approval. Server-side
invariants: Manager-created types start **inactive**
with their desired rate filed as a pending proposal; a room type cannot be activated while a rate
proposal is pending (`RATE_APPROVAL_PENDING`) or its rate is 0 (`ROOM_TYPE_RATE_REQUIRED`); and
Manager edits that change the rate are refused (`RATE_CHANGE_APPROVAL_REQUIRED`). Room types are
never hard-deleted — `rooms.type`/`reservations.room_type` reference the name loosely as text, so
deactivation is the only retirement path. Front Desk and Housekeeping have no catalog access at
all (guardCatalog + nav gating).

**Rate plans** (migration `20260929010000`) — dated per-night price overlays on `base_rate`
(weekday/weekend, seasonal, holiday/peak periods; deliberately NOT dynamic pricing). `room_rate_plans`
rows (room type, name, date range, ISO day-of-week bitmask where bit 0 = Monday … bit 6 = Sunday,
nightly rate, status) are governed exactly like rate proposals: **Manager proposes**
(`manager_propose_room_rate_plan`), **Owner/Admin approves to `active`** (`admin_review_room_rate_plan`,
approve or reject; both audited), and any catalog role can **retire** (`manager_retire_room_rate_plan`;
retiring never reprices anything already booked). One pending-or-active plan per (room type, name);
approving a plan never touches `base_rate` — plans are additive overlays on top of it. **ONE
authoritative resolver**, `room_nightly_rates(room_type, from, to)` → one row per night with the
winning rate, and every booking-price computation in Postgres goes through it (hold creation, deposit
submission, walk-in creation, extension + preview, guest change requests, approval/exception stamps).
Overlap priority is deterministic and documented: an active plan matching date + day-of-week beats
`base_rate`; among matches the **narrowest date range** wins; ties break on `decided_at` desc, then
`id` desc — never DB order. **Agreed rates freeze at booking**: `booking_holds` and `reservations`
carry `nightly_rates jsonb` (array of `{date, rate}`) written once at creation, and the hold's
`nightly_rate`/stamp `rate` fields keep a single figure only when every night prices the same (null
otherwise — UIs then show the per-night breakdown). `total` stays the frozen monetary authority, so a
later plan change can never reprice a confirmed booking, live hold, or settled folio; `submit_reservation_deposit`
re-verifies by comparing the recomputed per-night **sum** against the frozen hold subtotal
(`RATE_CHANGED` — a single-rate comparison could not detect plan changes). Legacy rows with null
`nightly_rates` fall back to `base_rate` for display only; nothing is recomputed for them. The TS
mirror `lib/rate-plans.ts` (same priority rule, centavo-exact totals) exists purely so booking
search/catalog can show honest **estimates** — it never computes a charge. UI: a Rate Plans modal in
the Room Types & Photos panel (Manager proposes/retires, Owner/Admin approves; per-plan status,
dates, days, rate, decision trail); booking review, reservation detail, the extend-stay and
arrival dialogs, and approval financials render the frozen per-night breakdown whenever rates vary.

**Room-type badge colors** (migrations `20260925010000` + `20260927010000`). Each room type carries
a semantic color key on `room_types.badge_color_key` — one of eight curated HAVEN palette keys
(`sage`, `gold`, `ocean`, `plum`, `terracotta`, `slate`, `sand`, `lavender`; unknown/legacy values
fall back to a neutral badge client-side) — rendered by the shared `RoomTypeBadge` component
wherever staff see a room-type pill: the Rooms & Availability card grid, the check-in Select Room
dialog, and the physical-room roster. The key never changes with room status; room status and
housekeeping colors live on entirely separate rules. Physical rooms inherit the color from their
type (`rooms.type` name → key) — there is no per-room color.

**Color governance** (`20260927010000`). A color is **reserved** by any type in the reservation
scope: active types *and* inactive types with a pending rate proposal (a proposal is a type on its
way live). All four claim paths — `admin_create_room_type`, `admin_update_room_type`,
`admin_propose_room_type_rate`, and approval — take the same per-color transaction advisory lock
(`pg_advisory_xact_lock(hashtext('rt-badge:' || key))`) before an existence check, so concurrent
claims serialize; the `20260925010000` partial unique index `room_types_badge_color_active` remains
the race-proof backstop for the active scope. Unknown keys raise `INVALID_ROOM_TYPE_COLOR`;
conflicts raise `ROOM_TYPE_COLOR_TAKEN`. Rejection frees the color automatically — the scope is
derived from live rows, nothing is stored on the proposal. **Approve = activate** (2026-09-24
ruling): approving a rate proposal on a still-inactive type sets the rate *and* publishes the type
with its badge in one decision (rate must be > 0 at that point; the color is revalidated first as
stale-form protection). **Active-type recolors are Owner/Admin-only**: a Manager's edit form shows
the color read-only (`BADGE_COLOR_CHANGE_APPROVAL_REQUIRED` server-side); Managers choose freely
at creation and on still-inactive types. Creation requires a color (API zod enum, no null); the
swatch selector in Room Types & Photos disables reserved colors with the holding type named —
never hidden — and previews through the same shared badge component. The key rides the normal
audited, version-checked RPC paths and `rooms` listings / the eligible-rooms endpoint join the key
by type name (`badge_color_key` / `badgeColorKey`).

**Physical-room governance** (`canManageCatalog`, so Owner/Admin/Manager). A physical room is the
unit, not the product: number, floor, wing, administrative designation, room type, and the
`administratively_active` inventory switch. Nothing else is configurable, and none of it duplicates
room-type marketing content. Two RPCs own the whole surface, both audited under
`entity_type='room'` with a required reason and both reached through Manager's
`/api/catalog/rooms*` and Governance's `/api/admin/rooms/[id]` routes:

- `admin_create_room` — number must be free (`ROOM_NUMBER_TAKEN`, backed by `rooms_number_key` for
  the race), type must exist (`ROOM_TYPE_NOT_FOUND`). `rate` is copied from `room_types.base_rate`
  to satisfy the NOT NULL; no per-room rate is ever exposed, since pricing lives on the type behind
  the approval flow. `status`/`housekeeping` come from the column defaults (`available`/`clean`).
- `admin_update_room_metadata` — `for update` lock, optimistic concurrency on
  `configuration_version` (`ROOM_CONFIGURATION_STALE`), and two refusals: retyping a room that
  carries a forward commitment (`ROOM_HAS_FUTURE_COMMITMENT` — an active assignment or a
  pending/confirmed/checked_in reservation, because `front_desk_assign_room` and
  `front_desk_check_in` would then raise `ROOM_TYPE_MISMATCH` at the counter), and deactivating one
  that has a live stay (`ROOM_HAS_ACTIVE_ASSIGNMENT`). Deactivation stamps `deactivated_at` +
  `deactivation_reason`; reactivation clears both.

**Room lifecycle.** Administrative state and operational state are orthogonal and neither can write
the other:

```
create ──▶ administratively_active = true ──deactivate(reason)──▶ false ──reactivate(reason)──▶ true
                                     ⟂  orthogonal  ⟂
available ⇄ reserved ⇄ occupied ⇄ dirty · maintenance   (workflow-owned)
```

Room numbers are permanent — they are denormalized into `reservations.room_number`,
`housekeeping_tasks.room_number`, and `maintenance_orders.room_number`, so renumbering would rewrite
history; retire and re-create instead. Rooms are never hard-deleted
(`reservation_room_assignments.room_id` is ON DELETE RESTRICT).
`administratively_active = false` **is** the archive state and is not a maintenance substitute — a
room can be administratively active while operationally in maintenance, and the roster states both
facts side by side. `status`/`housekeeping` remain written only by the Front Desk, Housekeeping,
Maintenance, and cancellation RPCs (§7.4–§7.6); the configuration surface adds zero writes to them
and the Manager roster renders them read-only.

Plus a resource matrix (`access: Record<Role, Resource[]>`) for list views. Admin/owner sit outside
the operational grid (they get their own governance screens, §7.10). The client dashboards carry a
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
policy in the whole repo (`room_photos_public_read`). A second bucket, **`payment-proofs`, is
private** (no policies at all — service-role-only access; see §7.2 for the deposit-proof flow). Room types are created and maintained by
managers (`catalog/room-catalog-panel`: name on create only — immutable afterwards — description,
photos, amenities, capacity, beds, size, visibility, badge color), with rate changes propose→approve per the
governance rules in §6, as is the **transfer vehicle-type catalogue**
(`catalog/transport-vehicle-types-panel`: seats, base fare, per-km/per-minute rates, booking fee —
the fare model behind §7.11).

### 7.2 Guest booking flow (`/booking/*`)

A signed-in **guest** books online. Flow: **Search → Dates/Guest details → Review → Payment link →
Confirmation**, wired through search-params → a server-issued **hold token** → reservation id.

1. **Search** (`/booking/search`) — dates + guest count, zod-validated (`searchSchema`): check-in not
   in the past, check-out after check-in, 1–8 guests. Availability is computed server-side
   (`lib/booking.getAvailability` → `countAvailableUnits`): per room type, `inventory − blocking
   reservations − active holds`, counting only administratively active rooms and excluding
   maintenance-blocked/out-of-service rooms and (for tonight) not-yet-clean ones. Only types with
   `availableUnits > 0` are offered, cheapest first. **The SQL gates apply the same four
   predicates**: every inventory count in Postgres goes through `room_is_sellable(room_id,
   check_in, policy)` — `create_booking_hold`, `customer_request_reservation_change`,
   `front_desk_create_reservation`, `front_desk_execute_manager_approval`,
   `review_manager_approval`, `submit_reservation_deposit`, `verify_reservation_deposit`. Before
   `20260916010000` those seven counted only `status <> 'maintenance'`, ignoring
   `administratively_active` and `maintenance_room_is_blocked` — an oversell path that disagreed
   with the TypeScript count. Sites with no policy in scope pass `null`, which the helper resolves
   via `hotel_today` from `hotel_operational_policies`, so the same-day boundary is hotel-local
   rather than UTC `current_date`.

   **Intent-aware room discovery (2026-09-10):** the landing page's three room-discovery CTAs all
   land on `/booking/search`, whose mode is *derived from the URL* by `lib/booking.parseSearchIntent`
   (there is no `mode` param, so back/forward/refresh keep the intent): **Check availability**
   (hero form GET submit, `checkIn`/`checkOut`/`guests`) → *availability mode* — live per-type
   inventory, summary chip counts room **types and physical units**; **View all rooms** →
   *browse mode* — `lib/booking.getRoomCatalog()` (same `room_types` table, `active = true`, same
   photo chain; no second catalog), base rates only, "Check dates for availability" — never a
   fabricated count; **Featured Stay card** (`?roomType=<name>`; room-type *name* is the stable
   identifier used across reservations/booking) → *focused room mode* — the type is sorted first,
   ringed + text-chipped ("Selected from homepage") and scrolled into view
   (`components/booking/room-focus.tsx`, reduced-motion aware), never auto-selected. Dates chosen
   in the landing hero ride along on featured links via the client intent context
   (`components/landing/booking-intent.tsx`). Invalid dates/guests fall back to browse with the
   zod issue as a notice; unknown/unpublished `roomType` is dropped with a notice. Signed-in
   guests are redirected to `/account/find-room` with all params (including `roomType`)
   forwarded, and that page derives modes identically.
2. **Room details** — type facts + photos; per-night rate × nights = subtotal (rates from the
   rate-plan resolver §6 — per-night when a weekend/seasonal plan varies them).
3. **Guest details** (`/booking/details`) — names, email, mobile, address, nationality, expected
   arrival, **structured multi-select request options** (`request_options`, up to 12), free-text
   special requests, and an **optional transportation preference** (service type, locations, dates,
   times, passengers — see §7.11). The Review page's back link, breadcrumb, and "Edit details"
   action link here with `hold=<token>`; the page then prefills the form from that hold (same
   room/dates/guests, active and unexpired) so entered guest info, expected arrival, preparations,
   and the transportation request survive the round-trip. Resubmitting creates a **new** hold —
   the old one expires on its own timer. Flow pages share a compact back link
   (`components/booking/booking-page-frame.tsx` + `BackButton`) that pushes deterministically to
   the previous breadcrumb step (never `router.back()`), labelled "Back to <step>".
4. **Review** (`/booking/review/[token]`) — holds the reservation.
5. **Payment link** (`/booking/payment/[token]`) — manual deposit only (see below).
6. **Confirmation** (`/booking/confirmation/[id]`).

Server-side, `POST /api/booking/holds` validates the guest details and the transportation
preference (strict, service-type-conditional: the client never supplies the hotel side of the
route — the filer fills it from `hotel_operational_policies`), then calls `create_booking_hold`,
which prices the stay — per-night through `room_nightly_rates` (§6 rate plans), freezing the agreed
nightly breakdown and total onto the hold — and takes a **15-minute booking hold** (`booking_holds`,
`expires_at now() + hold_minutes`). The deposit policy (§8) fixes how much must be paid; the guest
then submits a deposit proof (`POST …/[token]/confirm` → `submit_reservation_deposit`): payment
methods are whitelisted manual transfers (**bank transfer or GCash**), and BOTH a transaction
reference AND a payment-proof screenshot (JPEG/PNG/WebP, ≤5 MB) are required — the RPC rejects a
manual submission without proof (`PROOF_REQUIRED`). No card/gateway. The proof workflow: the guest
first stages the image (`POST …/[token]/proof` → private `payment-proofs` Supabase Storage bucket,
path `pending/<token>/<uuid>.<ext>`; magic-byte-sniffed, never trusting the filename extension or
browser MIME), then confirms with the staged path. The confirm route re-downloads the object,
re-sniffs and re-measures it server-side before the RPC, and removes the staged upload if the
submission fails (no orphaned objects; an idempotent replay keeps the original). The payment row
stores the storage **path** (plus original name, MIME, size, uploaded-at) — never a URL; proof
images are served only through 60-second signed URLs minted server-side by
`GET /api/booking/payments/[id]/proof`, viewable by **the paying guest and Accounting only**
(Front Desk/Manager can list payments but never see the proof image; other guests get a 404).
The deposit is **verified by Accounting** (§7.4), which is what turns the `pending`
website reservation into `confirmed`. Holds expire defensively (`expire_booking_holds` is called at
the top of every inventory recount); an unpaid website `pending` past its payment deadline releases
its inventory and its hold/payment are expired. Payment proofs are never sent to the AI layer
(Gemini reads only rooms/guest_requests/transportation aggregates).

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
- **Payments** — submit a stay-payment proof; Accounting verifies it.
- **Guest requests** — submitted as a **batch** (§7.7): up to 12 structured picks per submission,
  routed to departments only after Front Desk approves the batch.
- **Transportation** (`/account/transportation`) — request a pickup/drop-off/round-trip against an
  active reservation (locations are free text; hotel-side endpoints come from policy), and cancel a
  pending request with a reason.
- **Notifications** — durable, user-scoped event rows from deposit/stay-payment review,
  guest-request review, and transportation schedule/cancellation actions. The customer shell reads
  the newest events from `notifications`; optional Resend delivery is a non-blocking copy, so
  email failure never rolls back the completed hotel action. The deposit-verified confirmation
  email also carries the guest count and a payment-state line (remaining balance or "Fully paid").
- **Reminders** — daily automated guest communication (§7.13): a **pre-arrival** email/notification
  ~24 h before check-in (confirmation, room type, stay + guests, check-in time from the policy
  snapshot, approved early check-in, scheduled transportation) and a **pre-departure** reminder
  ~24 h before checkout (checkout time, outstanding balance when > 0, scheduled transportation).
  One delivery per reservation per kind — `guest_reminder_deliveries` unique index makes cron
  retries, redeploys, and manual re-runs no-ops.
- **Receipts** (`/account/receipts/[id]`), profile/password/settings, and a public find-room view.

### 7.4 Reservation lifecycle (authoritative narrative)

The one connected spine everything else hangs off. Reservation statuses:
`pending → confirmed → checked_in → checked_out`, plus terminal `cancelled` and `no_show`.

```
website guest books ──hold 15 min──> deposit submitted ──accounting verifies──> confirmed
                                                                               │
walk-in / phone (front desk create) ────────────────────────────────────────> confirmed
                                                                               │  (identity verified, zero balance,
                                                                               │   check-in window, early-check-in rule)
checked_in ──charges/payments on folio──> checkout (balance cleared) ───────> checked_out
                                                                               │  room → dirty; turnover task auto-created
pending/confirmed ── cancel ──────────> cancelled            (refund queue if deposit eligible)
pending/confirmed ── no-show ─────────> no_show              (only after local no-show cutoff)
```

**Refunds have two paths, and only the exception path involves the Manager** (D-006: Accounting owns
routine financial operations). `cancel_reservation` computes the entitlement from the reservation's
frozen policy snapshot (basis points × settled deposit) and inserts the `refund_requests` row with
`exception_approval_id NULL` — that policy computation **is** the authorization, so Accounting settles
it directly (`process_refund`) with no Manager step. Only when the requested refund departs from the
policy amount does the refund_exception approval engine run (§7.8): Manager approves the exception
amount (validated ≤ settled deposit − already refunded; the approved amount is written to
`eligible_amount` with `normal_policy_amount` as baseline), and Accounting then executes exactly that
approved amount. The refund queue badges each row "Within policy" vs "Approved exception" so the
distinction is visible at settlement time.

Staff operations (each a named RPC with row locks + audit, §10):

- **Front Desk create** (walk-in/phone), **assign room** (pre-arrival; eligibility =
  administratively active, clean, serviceable, no overlap, respects the room-type/upgrade
  rules — a retired room is refused with `ROOM_INACTIVE`), **check-in** (identity verified,
  zero balance, check-in window vs `checkInTime`, `earlyCheckInAllowed`, honouring a
  manager-approved early check-in (the approval runs through the *requested arrival time*
  on the check-in date; legacy or already-passed requests fall back to an 8-hour window);
  records the active room assignment), **change room** (cross-type = upgrade needing
  owner/admin/manager), **extend stay** (in-house only; extra nights — the checkout *date* moves,
  distinct from late checkout which is a same-day time exception. Front Desk's Extend stay dialog
  previews every figure from `front_desk_extend_stay_preview` (nights, per-night rates, additional
  lodging, projected folio total, room conflict — never client-derived); `front_desk_extend_stay`
  posts one idempotent `extension` folio charge at the room type's current per-night resolver rates
  (added nights only; the frozen breakdown is appended), pushes
  check-out and the active assignment. If the room is taken it refuses with
  `EXTENSION_REQUIRES_ROOM_CHANGE`, and the dialog hands off to the `stay_extension` Manager
  exception — see §7.8. Before arrival, a later checkout is a `reservation_modification`, not an
  extension), **update guest** (phone/arrival/notes), **checkout** (folio must balance —
  `FOLIO_BALANCE_REQUIRED`; closes assignment, room dirty, creates a typed `checkout_cleaning`
  housekeeping task), **verify identity**, **record payment / post folio charge**, **review guest
  request batches** (§7.7).
- **Deposit / stay-payment verification is Accounting-only** (`canVerifyDeposit`; the RPC guards
  re-check `accounting`), and **staff verification has no time limit** — the 15-minute window is
  strictly the *customer's* payment-submission window on the hold; once proof is submitted it stays
  verifiable until resolved. `verify_reservation_deposit` re-checks the rounded amount, confirms the
  reservation, posts any legacy transport lines as folio charges (deterministic idempotency keys),
  and files the booking's transportation preference as a live request (§7.11). `accounting_reject_deposit`
  returns a proof with a reason.
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

**Inspection semantics** (policy-gated, `housekeepingInspectionRequired`, default on): completing a
vacant room's turnover parks it at `housekeeping='inspection'`, `inspection_status='pending'` — the
room is **not sellable same-day** until an inspection is recorded. Pass → clean/available (+
`housekeeping_room_ready` audit); fail (reason mandatory) → `reclean_required` and a child `reclean`
task; history is never rewritten — the failure stays on the original task. Inspection authority is
housekeeping-only (`HOUSEKEEPING_INSPECTION_FORBIDDEN` for every other role); since assignment is
self-serve, **the person who cleaned may inspect their own work** — a deliberate, documented
separation-of-duties trade-off, kept after review.

**Operational queue.** All roles see the Housekeeping section as a grouped card queue
(`components/manager/housekeeping-queue-panel.tsx`), not a CRUD table: Needs attention (unassigned or
urgent/high) → My tasks → Cleaning in progress → Waiting for inspection → Blocked by Maintenance →
Scheduled open work → Completed today (collapsed). Cards sort by the stored priority, then next
arrival, then age, and show the room's recorded state — never a derived "available" claim. Actions
reuse the exact RPC handlers and role gates as before: housekeeping acts, manager Prioritizes,
front desk views. Readiness is decided by the audited workflow, not by the view.

**Suggested assignments** (roadmap Phase 6 — advisory only). `GET /api/housekeeping/
assignment-suggestions` (housekeeping/manager/owner/admin) returns a suggested plan for the queue's
unassigned open tasks (inspections excluded): tasks ordered by stored priority → next arrival →
age, dealt round-robin to the Housekeeping teammate carrying the fewest open assignments — workload
from the Staff & Duty derivation (§7.9: operational records only, **login is never a duty signal**),
never a skill score, never an invented preference. The queue renders the plan as a clearly labeled
"Suggested assignments — suggestion, you decide" strip; a row drops out the moment its task stops
being open unassigned work. Applying one still routes through the audited
`housekeeping_assign_task` RPC via `POST /api/housekeeping/tasks/[id]/assign`: Housekeeping
self-assigns ("Assign to me" — the RPC's `SELF_ASSIGNMENT_ONLY` rule unchanged), the Owner assigns
the suggested teammate, and the Manager — who has no assign authority — sees the plan read-only and
acts through Prioritize. Nothing anywhere auto-assigns; the system suggests, a person confirms.

### 7.6 Maintenance workflow

Work orders: `open → assigned → in_progress → resolved → completed`, plus `waiting_parts`,
`deferred`, `cancelled`. A **serviceability model** decides room blocking: diagnosis sets
`serviceability_impact ∈ {serviceable, blocked, out_of_service}` — a blocked room flips to
`maintenance` and is invisible to availability until `maintenance_restore_room_state` un-blocks it
(only when nothing else blocks it). Technicians self-assign; roles are re-checked. Resolution
requires a diagnosis, and if `cleanup_required` it creates the housekeeping cleanup task. Room-level
departments are coordinated, not owned, by maintenance (escalation is a Manager action, §7.8).

**Preventive maintenance (roadmap Phase 8)** — a registry of **real assets** (`maintenance_assets`,
migrations `20260932010000` + role-tightening `20260933010000`): Maintenance staff and the Manager
register actual equipment (name, category, optional room, optional location, service interval,
optional last-serviced date) through four audited `SECURITY DEFINER` RPCs
(`maintenance_register_asset` / `maintenance_record_asset_service` / `maintenance_update_asset` /
`maintenance_deactivate_asset`, service-role-only, null-safe actor guards). **`next_service_date` is
a stored generated column** (`last_serviced_at + service_interval_days`) — the schedule is derived,
never manually entered, and advances only when a service is recorded (each recording is an audited
event with before/after; service history lives in `audit_logs`). Deactivation retires an asset
without deleting it. **No equipment is ever seeded** — the table starts empty and the hotel
registers what it really owns. **Nothing here touches rooms**: a due or overdue service is
visibility only (the Maintenance section's "Preventive maintenance" card group: overdue / ≤7 days /
≤30 days / scheduled / no-history), and the serviceability model stays owned by work-order
diagnosis — the predictive risk model may suggest, but a room is never blocked because a service is
due. Owner/Admin are deliberately absent from these routes (departmental execution boundary, §7.9):
`GET/POST /api/maintenance/assets` + `POST /api/maintenance/assets/[id]/[action]` allow
maintenance + manager only.

### 7.7 Guest requests (structured, batched, approved)

Chosen at booking (`request_options`) and auto-filed when a website reservation confirms
(`file_booking_guest_requests` — idempotent per option, one `batch_id` per booking), or submitted
live by a guest (`customer_submit_guest_requests`, up to 12 picks per submission, each submission a
batch). A single router `guest_request_route(type)` maps every type to a department — front desk,
housekeeping, maintenance, … — and auto-creates the matching housekeeping task / maintenance order.
Requests carry priority/severity and can be escalated to a Manager.

**Batch approval.** `guest_requests` carry `batch_id` + `approval_status ∈ {pending, approved,
rejected}` (+ `approved_by/at/note`). A customer submission (or a booking's auto-filed batch) starts
`pending`; **Front Desk reviews the batch as one decision**
(`front_desk_review_guest_request_batch` — approve or reject the whole batch; rejection requires a
note). Only approved requests enter the departmental lane. Live staff routing from the Front Desk
uses the same lane (`components/manager/guest-requests-panel.tsx`).

### 7.8 Manager approvals & exceptions

The escalation engine over the operational workflow. Anything the policy would refuse — room
upgrade, reservation modification, early check-in, late checkout, guest compensation, refund
exception, checkout exception, stay extension, guest escalation — can be filed as a **manager approval
request** (`request_manager_approval`, front desk/housekeeping/maintenance/accounting; manager excluded).
Each request records severity, the proposed `requested_action`, and the *normal policy result* it
would overrule. Optimistic versioning (`version` + partial-unique "one pending per entity").

**Review** (`review_manager_approval`, owner/admin/manager; self-approval forbidden) re-feasibility-
checks each approve *at review time*: the upgrade needs a same-type-away + target room free, a
modification re-counts inventory under the advisory lock (its execution reprices only the room
component — current target rate × new nights — while preserving every posted folio charge;
balances settle through `sync_invoice_financials`, never an invoice rewrite), late checkout checks the assignment
conflict, compensation ≤ folio, refund exception ≤ settled deposit. **Execution is separated from
approval**: the front desk (`front_desk_execute_manager_approval`) executes the approved operational
exception, accounting executes the financial one (`accounting_execute_manager_financial_approval`,
guest compensation as a credit). High/critical exceptions can be **escalated to Owner**
(`escalate_manager_approval_to_owner`), after which only an Owner re-read as `owner` can review them
(`review_owner_exception` → delegates to `review_manager_approval` then stamps the owner review).

**Room-type exceptions are guided, never free-typed.** When check-in Step 3 finds no eligible room of
the reserved type, the arrival dialog offers a **Target room type** dropdown populated only from
`GET reservations/[id]/eligible-rooms` (`front_desk_eligible_room_inventory` RPC: active type,
administratively active, available + clean, not maintenance-blocked, no overlapping assignment — the
server is the sole eligibility authority), then a **Physical room** dropdown of that type's eligible
rooms. The request carries structured IDs (`requestedRoomTypeId`, `requestedRoomId`,
`originalRoomTypeId`, plus display names) and is validated at three points by
`validate_room_type_exception_request/approval/check_in` triggers (migration 20260919): a fabricated
or stale room/type is rejected at insert, the Manager's approve re-checks eligibility, and check-in
re-checks the exact approved room (`ROOM_TYPE_EXCEPTION_ROOM_CHANGED` when it no longer matches).
The generic "Request Manager exception" form no longer offers this type — only the arrival dialog
creates it.

**Room-type change financial responsibility is derived from an approved structured reason — never a
manual "who pays?" control** (migration 20260922). Every `room_type_exception` and `room_upgrade`
request must carry a `reasonCode` from the allowlist in `room_type_change_responsibility()` (mirrored
in `lib/room-type-change-reasons.ts`); `hotel_early_checkin_failure` additionally requires an
approved early check-in (`early_check_in_approved_until`) — an unapproved early arrival is never
hotel-caused. `request_manager_approval` strips any client-submitted financial field and stamps a
server-computed snapshot into `requested_action.financials`
(`{reasonCode, responsibility, originalTotal (= reservations.total), targetRate (single figure only
when every night prices the same), nights, targetTotal, nightlyRates, difference}`), frozen at
request time; approval and execution consume the stamp, so
history is reproducible even if base rates later change (a nights change at check-in raises
`APPROVAL_STALE`). Consumption branches on the derived responsibility:

- **Hotel-caused** (type unavailable, unserviceable, maintenance, overbooking, hotel error, failed
  approved early check-in): the guest keeps the original agreed price — `reservations.total` and the
  folio are untouched; the absorbed amount is recorded in the audit trail.
- **Guest-requested** (larger room, premium type, better view, early-arrival upgrade): the guest pays
  the positive difference. Front Desk records the guest's acceptance
  (`record_room_type_change_acceptance` — posts the difference to the folio through the standard
  `folio_charges`/`invoices` architecture, idempotent on the approval id; for arrival-time
  `room_type_exception`s the charge posts at acceptance so the existing `REMAINING_BALANCE_REQUIRED`
  gate enforces settlement before check-in; mid-stay `room_upgrade`s post at execution), and
  execution raises `ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED` without it. The manual
  `priceDifference`/`waived` inputs on the legacy `room_upgrade` form are gone.
- **Negative difference (downgrade)**: displayed and flagged for Manager review; pricing stays at
  the original total — no refund policy exists for this path.
- **Same-type reassignment** remains ₱0 and needs no exception (`type_mismatch=false` path).

The "same-type room available ⇒ exception unnecessary" gates (`ROOM_TYPE_EXCEPTION_NOT_NEEDED`,
`SAME_TYPE_ROOM_AVAILABLE`) apply to **hotel-caused** changes only — a guest-requested voluntary
upgrade is legitimate while reserved-type rooms remain, so the eligible-rooms endpoint always offers
alternative types and the dialog warns before submitting a hotel-caused reason in that situation.
Requests predating the reason model (no `financials` stamp) can no longer be approved — they are
rejected with `ROOM_TYPE_EXCEPTION_REASON_REQUIRED` and must be re-requested. Check-in no longer
rewrites the invoice for an exception: the folio already reflects any posted difference (the old
rewrite also silently dropped unrelated charges such as transportation fares from
`invoices.amount`).

**Stay extension (extra nights) is an explicit exception type — and a last resort** (migration
20260923). A stay extension changes the checkout *date* (extra nights); a late checkout changes the
checkout *time on the same day* — the two are never interchangeable, and the dropdown labels say so
("Stay extension (extra nights)" vs "Late checkout (same day)"). The normal path comes first: Front
Desk extends in place whenever the room is free, with no Manager involved. Only when
`front_desk_extend_stay` refuses (`EXTENSION_REQUIRES_ROOM_CHANGE` — the room is taken during the
added nights) does the `stay_extension` request exist, filed from the Extend stay dialog's handoff
(or the generic form, which demands a `requestedCheckOut`). Status rules: in-house only
(`STAY_EXTENSION_REQUIRES_IN_HOUSE`; a pre-arrival checkout change is a `reservation_modification`,
not duplicated here), and the requested date must be later than the current checkout
(`STAY_EXTENSION_INVALID_DATE`). Like `financials`, any client-supplied `stayExtension` snapshot is
stripped and the RPC stamps its own server-computed
`{currentCheckOut, requestedCheckOut, nights, rate, nightlyRates, additionalAmount, projectedTotal,
roomConflict, roomNumber, roomType}` (per-night resolver rates for the added nights — the same rule
as the normal path; `rate` is a single figure only when those nights price uniformly. No separate
extension pricing exists). Approval is allowed **with** a room conflict — the
conflict is why the exception exists — but only in-house with a valid stamp. Execution (Front Desk)
performs the *same* `front_desk_extend_stay` with the approval id as idempotency key, so every guard
re-runs atomically; an optional `room_id` parameter executes a validated **same-type** room move
first (`EXTENSION_ROOM_NOT_READY` / `EXTENSION_ROOM_UNAVAILABLE`; a cross-type move must go through
the room-change exception first, then extend normally at the new type's rate) — an overlap can never
be created. Departure transportation booked on the old checkout date is flagged, never rescheduled.

**The dropdown audit (2026-09-23)** traced every generic "Request Manager exception" option end to
end (form → route → RPC → review → execution → audit): all eight are live business cases with
working handlers — none removed. Label clarifications only. `room_type_exception` stays absent from
the generic form by design (arrival dialog only, D-003).

### 7.9 Role portals (`/manager_dashboard` — one route, role-switched)

A single route renders the right client by role: `owner` → OwnerDashboardClient, `admin` →
AdminDashboardClient, everything else (manager, front_desk, housekeeping, maintenance, accounting)
→ ManagerDashboardClient. The operational client is one screen whose **navigation is gated per role**
(client-side mirror of permissions) and organized into **collapsible sidebar categories** —
Workspace, Front Office, Operations, Finance, Management (manager-only; it auto-hides for every
other role, as does any category RBAC empties). The active module's category is always expanded
(its page can never be hidden inside a collapsed group); a category's open/closed choice persists
per browser in `localStorage["haven-sidebar-groups"]`, alongside the rail toggle
`haven-sidebar-collapsed`. Grouping is presentational — the `access` map and per-module role gates
are unchanged. Workspaces offered per role:

| Role | Sections offered |
|---|---|
| Manager | Overview (risk command centre), reservations, rooms (+ **Manage rooms** roster, §6), guests, guest requests, **Transportation**, **Room Types & Photos**, **Transfer Vehicles**, housekeeping, maintenance, inventory, **Approvals & Escalations**, **Reports** (performance center + daily-report review, §7.12) |
| Front Desk | Overview (arrivals/departures/in-house/rooms ready), reservations, rooms, guests, guest requests, **Transportation**, housekeeping, billing, Deposit verification (queue view — verification itself is Accounting's), **Transactions · Guest folios · Cash & shifts · Financial documents**, Approvals, **Reports** (daily operations report, §7.12) |
| Housekeeping | Overview, rooms, guest requests, housekeeping tasks, inventory, Approvals |
| Maintenance | Overview, rooms, guest requests, maintenance orders, inventory, Approvals |
| Accounting | Overview, reservations, billing, **Deposit verification** (the only role that can act on it), Refunds, **Transactions · Folios · Cash & shifts · Reconciliation · Documents**, Reports, Approvals |

**Consolidated guest profile (roadmap Phase 2).** The Guests module is more than a raw grid: every
row opens a read-only dossier (`GET /api/staff/guests/[id]`, gated on `canViewGuestContact` —
owner/manager/front desk; `getStaffGuestProfile` in `lib/staff-data.ts`). It consolidates, in one
batched query set, the guest identity (contact, nationality, address, loyalty tier, ID-verification
status from their stays), the full stay history grouped current/upcoming/completed/cancelled/
no-show, service history (guest requests, transportation, room changes, and — manager/owner only —
the manager-approval trail), preferences **strictly from explicitly saved records** (stored guest
preferences, special requests, and request options chosen across bookings — nothing inferred, no
invented tiers or auto-VIP), and a financial summary across the guest's folios. Payment-proof
images and identity documents are never selected. The same modal opens from a reservation's detail
footer ("Guest profile") for one-click context during a stay. Tests: `lib/guest-profile.test.ts`.

The **accounting workspace is ledger-readonly**: every action posts to an accounting route that calls
a definer RPC — corrections are reversals/adjustments, settled payments are never edited (§13). The
refund queue distinguishes **Within policy** (policy-computed, settle directly) from **Approved
exception** (Manager-authorized amount) on each row, so routine refunds never loop through the
Manager. Cash-shift expected cash is derived from recorded payments; counted differences are stored
as a variance, never used to rewrite a guest payment. Reconciliations compare recorded vs
external-statement totals and only record variance. Documents (receipts `RCP-`, folio statements
`FOL-`) are generated server-side snapshots; each carries a **VAT-inclusive tax breakdown**
(net subtotal / service charge / VAT / gross, §8) derived at issue time from the reservation's
frozen tax rates — the lines always sum exactly to the gross (the VAT line absorbs rounding).
Issued documents are immutable: a later tax-rate change never rewrites them, and documents
issued while both rates are 0 carry no breakdown at all.

**Staff notification surfaces (2026-09-11)** — three complementary mechanisms with distinct
meanings, all confined to `ManagerDashboardClient` (Admin/Owner governance dashboards and the
customer portal have none):

1. **Sidebar module badge = pending actionable workload.** A compact amber pill (`nav-badge`,
   capped `99+`, absent at 0) on a module whose queue holds work the *current role can act on*:
   Guest Requests (front desk/manager: pending submission batches, i.e. distinct `batch_id` with
   `approval_status='pending'`, matching the panel's "Awaiting approval" card; housekeeping/
   maintenance: approved requests routed to their department, status open/in-progress),
   Transportation (`REQUESTED` rides awaiting review; front desk/manager), Approvals & Escalations
   (pending approvals; manager only), Housekeeping (open tasks — the pre-existing meaning,
   unchanged), Maintenance (open work orders), Deposit Verification (`pending_verification`
   payments; **accounting only** — Front Desk's queue view never gains a badge, matching its
   read-only authority), and Refunds (pending + failed; accounting only). A collapsed category
   header sums its modules' badges. Counts come from `getDashboard`'s new metrics
   (`pendingRequestBatches`, `departmentRequests`, `transportationRequested`, `pendingVerifications`,
   `pendingRefundCount`) computed server-side with the same domain predicates the module queues use —
   never from notification counts, and never a total record count. Phase 5 added the deposit-SLA
   metrics (`depositSlaHours`, `oldestPendingVerificationMinutes`, `pendingPastSla` — accounting
   aging aggregates; the threshold is fetched for financial roles so Front Desk's read-only queue
   can render the same aging chips).
2. **Header bell = live derived alerts.** The existing popover over `dashboard.notifications` —
   role-scoped alerts computed per request in `getDashboard` (§5). Deliberately *not* a persistent
   read/unread inbox: no `staff_notifications` table exists, alerts resolve with the underlying work,
   and no schema change was made. The bell button shows the live alert count.
3. **Transient in-app toast = new-event alert** (`components/ui/toast-stack.tsx`). The client diffs
   the polled notification list by id: the first poll after load seeds silently (a refresh never
   replays history as toasts), and only alerts appearing later pop a bottom-right toast (info 6 s /
   warning 8 s; hover or focus pauses the timer; max 3 visible with overflow queued; "View" jumps to
   the alert's module; × removes only the popup). Local action feedback (`notify()`) uses the same
   stack with a success tone. A toast's disappearance never resolves anything — the bell keeps
   listing the alert and the badge keeps counting the work until it is genuinely handled.

Refresh architecture: no Supabase Realtime exists anywhere (the browser never talks to Supabase —
service-role-only, §13 — and realtime would require anon-key policies). Instead the operational
client polls `/api/manager_dashboard` every 30 s even on non-Overview sections (a dedicated
`refreshAlerts` interval) so badges, bell, and toasts stay live everywhere — the same cadence as the
section-data poll, never faster. Contract tests: `lib/staff-notification-badges.test.ts` (count
definitions, role gating, silent seed, id dedup); behavior tests: `components/ui/toast-stack.test.tsx`
and the sidebar badge cases in `manager-sidebar-nav.test.tsx`.

Admin and Owner get dedicated governance screens (§7.10).

### 7.10 Admin governance & Owner executive

Both governance clients use the same collapsible category sidebar as the operational client
(§7.9): Admin groups its modules into Workspace · Accounts · Configuration · Governance, Owner into
Executive · Governance · Catalog. The active module's category is always expanded and each client
persists its own open/closed choices (`localStorage["haven-admin-sidebar-groups"]` /
`["haven-owner-sidebar-groups"]`). Grouping is presentational — every module stays reachable.

- **System Administrator** (internal role `admin`, displayed as "System Administrator" /
  "System Administration" in the UI; `AdminDashboardClient`, `/api/admin/*`): HAVEN's
  system administrator — maintains users, system configuration, hotel setup, technical
  health, security administration, and administrative auditability. It is NOT a hotel
  operations role and does not bypass department authority (no check-in/out, no payment
  verification, no housekeeping/maintenance execution, no transport operation, no Manager
  approvals). Scope: staff account lifecycle
  (`admin_create_staff`, status changes, role changes, metadata), **secure account recovery** tokens,
  room/room-type/policy editing. The Users & Staff module carries a client-side filter toolbar
  (role / status / recovery-required / department / search over the loaded rows, with a clear-filters
  empty state and a showing-count footer — same pattern as the approvals queue) plus
  summary cards (Accounts on record / Active / Suspended / Recovery required / Staff; the
  status and recovery cards activate the matching selects). The other governance modules follow
  the same presentation layer (all client-side over loaded rows, no API change): **Room
  Configuration** shows summary cards, type/wing/status filters, search, and badges for
  administrative + read-only operational/housekeeping state; **Audit Logs** and **Security**
  share one `AuditView` (cards, action/entity filters, search, `en-PH` formatted timestamps);
  **Roles & Permissions** renders the fixed `ROLE_CAPABILITIES` catalogue as role cards with
  capability chips; **Hotel Policies** groups the raw policy columns into labeled, formatted
  sections (times as `HH:MM`, booleans as Yes/No, basis points as a percent, unknown keys under
  "Additional settings" so schema additions are never hidden); **Admin Reports** summarizes the
  overview payload (six cards, an accounts-by-role table with shares, a configuration summary).
  Everything is
  version-checked (`ACCOUNT_STALE`,
  `ROOM_CONFIGURATION_STALE`, `ROOM_TYPE_STALE`, `POLICY_STALE`); protected roles (owner/admin),
  self-lifecycle changes, and the last active Owner are guarded; timezone changes are
  Owner-or-System-Administrator (migration `20261001010000` intentionally removed the
  former Owner-only gate — hotel timezone is system configuration);
  a room with an active/upcoming assignment cannot be deactivated.
- **Admin System Health** (`/api/admin/data?section=system`, migration
  `20260924010000`): a technical-operations module in the Governance group. It
  probes the live database (trivial query, timed for latency — reachable or
  unreachable with the error message, never a 500), reports system activity
  (last audit event, audit events in 24h, pending Manager approvals), and
  compares local migration files against the remote ledger via the
  service-role-only `admin_read_migration_ledger()` RPC (reads
  `supabase_migrations.schema_migrations`; EXECUTE revoked from
  public/anon/authenticated). `next.config.mjs`
  (`outputFileTracingIncludes`) bundles `supabase/migrations/**` with the route
  so the local count works on Vercel; when the files are unavailable the module
  degrades to remote-count-only (`unknown` status). The section auto-refreshes
  silently every minute while open plus a manual "Run checks now" button. Extended
  (Unknown-first, read-only, no secrets): **Application** (environment from `NODE_ENV`,
  `package.json` version, Vercel commit short hash when present — otherwise `Unknown`),
  **Storage** (service-role `list` probe on the `room-photos` bucket — status only, never
  keys or URLs), **Email** (`RESEND_API_KEY` presence → Configured/Not configured; delivery
  history untracked → `Unknown`), **Scheduled automations** (the two real `vercel.json`
  crons — guest reminders daily 01:05 UTC, analytics generation daily 18:35 UTC — with
  last-run `Unknown`), **Deployment** (provider Vercel, status `Unknown` — no deployment
  feed connected), **Domain** (`Not connected` — health reporting not connected), and a
  **Recent technical issues** list derived from live probes only. No deploy/redeploy/
  rollback/SQL/shell/env controls exist anywhere in the workspace.
- **Owner** (`OwnerDashboardClient`, `/api/owner/data`, `/api/owner/exceptions/[id]/review`):
  executive data, the top-tier exception review above Manager authority, plus read-only views of the
  room-type catalogue, transfer vehicle types, and the live Transportation workspace
  (`TransportationPanel` with no action buttons — `canOperate`/`canCancel` are false for owner).

**Per-module quick overview cards.** Modules that carry operational status render a compact
summary-card strip via the shared `ModuleSummaryCards` component
(`components/manager/module-summary-cards.tsx`), always in the order
page title → cards → filter chips → search/table: label, count (or peso total), one-line hint,
and an icon chip with a restrained semantic tone (`attention` / `today` / `active` / `done`).
A card whose `queue` maps to an existing filter renders as a button (`aria-pressed`, reusing
the module's filter state — clicks never duplicate filtering logic); informational cards are
non-interactive `<article>`s. All counts derive client-side from the already-loaded,
role-scoped, unpaginated rows using the *same* predicates as the module's filters or grouped
queue, so card count == filter count == table rows by construction; the workspace loading gate
means cards never render false zeros, and `today` comes from the shared Asia/Manila
`Intl.DateTimeFormat` string (never UTC drift). The grid keeps any card count in one row
(`repeat(auto-fit,minmax(0,1fr))`; 2 columns ≤1000px with an odd last card spanning the row,
1 column ≤480px).

Cards live in: **Reservations** (front desk: Active / Arrivals today / Departures today /
In-house / Arrivals needing prep — today's confirmed arrivals still missing ID verification,
a room, or settlement, the retired ArrivalLane strip's blocker logic — with Arrivals /
Departures / In-house clickable onto the queue filters; manager oversight panel: Attention
Required — the authoritative `needsAttention` definition from `lib/manager-attention.ts` —
plus Arrivals / Departures / In-house, all clickable), the seven status modules
(Maintenance, Rooms, Inventory, Deposit Verification, Refunds, Billing, and the
Housekeeping/Maintenance view of Guest Requests — informational, via one shared
`moduleSummary` helper in the generic `ResourceView`; Deposit Verification's cards include
**Past SLA** — pending payments waiting past the policy's `depositSlaHours`), **Transportation** (its KPI cards
migrated onto the shared component, still queue-clickable), the **Accounting**
sections (Transactions/Folios/Cash/Reconciliation/Documents, informational),
**Approvals & Escalations** (Pending — clickable onto the status pills — plus High priority,
Escalations, Awaiting Accounting, and Oldest waiting as an age value; replaced the old
`arrival-lane approval-summary` chip strip), **Housekeeping** (five cards from the same
`groupQueueTask` grouping the queue renders: Needs attention / In progress / Waiting for
inspection / Blocked by Maintenance / Completed today), the **Guest Requests panel** for
front desk/manager (Awaiting approval / Open work / Approved / Declined, all clickable onto
the submission queue filters), and the **Front Desk Reports history** (Submitted /
Acknowledged / Returned clickable onto the status chips, plus On record). The **admin
governance modules** follow the same pattern: Users & Staff (Active / Suspended /
Recovery required clickable onto the selects), Room Configuration (Administratively
inactive clickable onto the status filter; Rooms on record / Room types / Floors
informational), and Admin Reports (six informational cards over the overview metrics).
Reference/summary
surfaces (Guests, the Manager performance-report page, Insights, HAVEN AI, Room Types,
Transfer Vehicles, Request Types) and Staff & Duty (its own KPI cards) deliberately have
none. The "needs attention" count is intentionally absent from the front-desk Reservations
queue itself — no authoritative definition exists there; arrival readiness is the
"Arrivals needing prep" card.

### 7.11 Transportation service (standalone)

Guest pickup, drop-off, and round-trip rides as a first-class operational queue — **no external
APIs**: locations are plain validated text, and `lib/transportation.test.ts` enforces that no
`api.tomtom.com` / `TOMTOM_API_KEY` code ships anywhere (a TomTom-priced variant was built and then
deliberately removed; `docs/TRANSPORTATION_FUTURE_ENHANCEMENTS.md` records what was deferred).

- **Origins.** Two ways a request exists: (a) at booking, the guest's optional **transportation
  preference** rides the hold → reservation as `transportation_preferences` jsonb and is filed as a
  `transportation_requests` row by a trigger the moment the website reservation first confirms (the filer never
  raises — it re-validates defensively and skips, with an audit row, anything that no longer fits);
  (b) live from the customer portal (`/account/transportation` → `customer_submit_transportation_request`,
  idempotent by key; `customer_cancel_transportation_request` cancels a not-yet-scheduled
  (REQUESTED/REVIEWED) request with a reason, version-guarded). The hotel side of each
  route comes from `hotel_operational_policies` (`transfer_hotel_label`), so a client can never
  invent it. A partial unique index keeps **one active request per reservation**.
- **Lifecycle.** `REQUESTED → REVIEWED → SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED`, plus
  terminal `CANCELLED`/`REJECTED`. Every transition goes through one version-guarded RPC,
  `staff_transition_transportation_request(p_request_id, p_action, p_details, p_staff_user_id,
  p_expected_version)`: **Front Desk executes** the operational path (review with internal/guest
  notes → schedule the pickup date/time the guest sees → assign driver + vehicle type → start →
  complete); **Manager may only cancel/reject with a required reason**; **Owner is read-only**.
- **Money.** Fares are **flat per vehicle type** — `(base_fare + booking_fee) × legs` from
  `transport_vehicle_types` (a round trip is 2 legs). On **assign**, the fare is posted to the
  guest's folio (`fare_amount`/`fare_posted_at` on the request, idempotent by key). A later
  cancel/reject does **not** auto-reverse a posted fare — the correction goes through Accounting's
  existing charge-reversal/adjustment flow (separation of duties: the role that cancels the trip
  must not also rewrite the folio). The vehicle-type catalogue is manager-maintained (§7.1).
- **Guard rails.** A trigger (`enforce_transportation_stay_window`) keeps pickup/return inside the
  reservation's stay window; the staff workspace (`components/manager/transportation-panel.tsx`)
  offers queue filters (needs review / today / active / completed / closed), service-type and search
  filters, and auto-refreshes every 30 s.

### 7.12 Daily Front Desk Operations Report

The centralized reporting surface for Front Desk (§7.9). Per-module "Export" print buttons were
removed from the operational modules; the Reports page is now the one place reports live.
Legitimate document downloads — receipts/folios via `generateDocument`, and the `exportToCSV` kit in
`components/ui/DataTable.tsx` — are untouched; the Reports page's Export is the single
`window.print()` in the operational dashboard.

- **Generation.** `lib/front-desk-reports.buildDailyReport(date)` aggregates a hotel day (exact UTC
  window `[dateT00:00+08:00, +24h)`, matching the Asia/Manila policy) across reservations
  (created/by-source, arrivals, departures, cancellations + no-shows from audit actions), guest
  requests (opened, escalated, open by department), collections (settled payments, count/total/by
  purpose — front-desk scope only), **room-care turnover** (completed housekeeping tasks: count, by
  type, awaiting inspection, average turnaround minutes — aggregated from the authoritative
  `housekeeping_tasks` table, not a duplicate), rooms, transportation, and manager approvals. The
  default date is the hotel's local today.
- **Submission.** `POST /api/front-desk/reports` builds the snapshot **server-side** (the browser
  never supplies snapshot content — the preview the user saw is exactly the immutable evidence
  stored) and calls `submit_front_desk_report` (front-desk-guarded, future dates refused,
  `front_desk_reports` row with id/timestamps/submitter/status, one **live submission per hotel day**
  via a partial unique index).
- **Export ≠ submit.** The Export button prints the preview and is explicitly labeled as never
  submitting anything to the Manager.
- **Review.** The Manager (only) acknowledges or returns a submitted report
  (`review_front_desk_report`, optimistic-`version` guarded; a return requires a note). A returned
  report can be **resubmitted** with `p_supersedes` — the original stays in history, the new
  submission supersedes it (lineage is a self-referencing column). Notifications flow both ways:
  the Manager's bell shows submitted reports, Front Desk's shows returned ones.
- **History.** Paginated (`REPORT_PAGE_SIZE = 10`), status-filterable, snapshot viewer included.
  Snapshots are never updated — immutability comes from RLS-with-no-policies + service-role-only
  writes through the two RPCs (same trust model as `financial_documents`).

### 7.13 Innovation layer — Predictive Analytics, Gemini AI assistance, QR operations

The capstone innovation layer. Full architecture and defense narrative:
`docs/innovation-architecture.md`. One data flow, three cooperating pieces:

```
hotel operational data → lib/analytics (HAVEN's own forecasts — the ONLY predictor)
  → structured predictions (FACT / PREDICTION labeled, data-quality graded)
  → Gemini (explanation, summary, recommendation — advisory, read-only, server-side)
  → authorized human (every decision and operation stays with HAVEN's existing workflows)
```

**Predictive analytics engine** (`lib/analytics/`, pure functions over plain arrays — dual-mode and
unit-testable). Four forecasts: **occupancy** (7-day; per day KNOWN/booked occupancy as FACT from
confirmed+checked-in reservations, plus a PREDICTED final occupancy from same-weekday historical
pickup — shown only when enough observations exist, always labeled with its basis), **housekeeping
workload** (expected departures → checkout cleans, stayovers → services, inspections per policy,
labor hours from historical task durations), **inventory demand** (per item: 3-day predicted
consumption from `inventory_movements` daily means → projected shortage + recommended reorder —
genuinely predictive, not a low-stock alert; items without history are flagged, never guessed),
**maintenance recurring-issue risk** (repeat-incidence grouping per room+category over 90 days —
"recurring issue risk", never a failure-probability claim). `runner.ts` orchestrates the four,
persists snapshots to `analytics_model_runs` + `analytics_predictions`, and computes evaluation
metrics (predicted vs actual for elapsed target dates: occupancy MAE/MAPE, housekeeping MAE,
inventory MAE — shown in the UI as "Prediction performance"). Snapshots generate daily via a
Vercel cron (`vercel.json` → `/api/analytics/generate`, 02:35 Manila) or on-demand by an
authorized Manager (rate-limited ≥1 h between runs); `/api/analytics/insights` serves the latest
snapshot with on-demand-compute fallback. UI: Manager dashboard → **Predictive Insights**
(metric cards with FACT vs PREDICTION separation, 7-day occupancy chart with booked-fact bars vs
dashed predicted line, housekeeping/inventory forecast tables, maintenance-risk cards, performance
metrics, honest data-quality notes everywhere).

**Gemini AI assistance** (`lib/ai/`, server-side only, `@google/genai`). `gemini-client.ts`
returns a discriminated `AiResult` and **never throws** — a Gemini outage (unconfigured,
unavailable, rate-limited, timeout, invalid) only disables AI explanations; every HAVEN operation
keeps working (UI: "AI assistance is temporarily unavailable…"). Access is Manager/Owner/Admin
only (`guardAiSession`, enforced server-side before any data is fetched). Four features:
**daily brief** (`/api/ai/brief` — Gemini narrates the analytics output into summary, priority
actions, warnings and forecast notes; cached per hotel day, refresh rate-limited), **Ask HAVEN**
(`/api/ai/ask` — tool-calling loop over an explicit read-only tool registry in `lib/ai/tools.ts`;
**no generic SQL tool**; each tool returns aggregated PII-minimized payloads — "3 arrivals
require accessibility preparation", never names/rooms), **Explain with AI** (`/api/ai/explain` —
server rebuilds the forecast and its contributing factors; Gemini explains, never recomputes; the
client never supplies numbers), and **AI-assisted report summary** (`/api/ai/report-summary` —
summarizes `buildDailyReport` output; the original report data stays authoritative and untouched).
Every Gemini response is schema-guided **and** zod-validated before it reaches the UI, and every
interaction writes an `ai_interactions` audit row (user, role, feature, tool calls, status, model,
latency — no prompt/response bodies stored) which also serves as the durable rate-limit counter.
Every AI surface carries the disclosure line: *"AI-generated operational guidance. Verify important
decisions using authoritative HAVEN records."* Gemini never predicts, computes forecasts, or
executes any operation.

**QR-based operations** (`lib/qr/tokens.ts`, `app/api/qr/**`, dashboard scan modal, `/qr-placard/[roomId]`).
Tokens are opaque 32-byte crypto-random strings; only their **SHA-256 hash** is stored (`qr_tokens`,
with expiry + revocation). QR codes never contain guest data — resolution re-checks session, role
and **current resource state** on every scan, and every scan writes a `qr_scan_events` audit row.
Two kinds: **reservation check-in QR** (guest's own confirmation/detail page fetches a QR for a
`confirmed` reservation; tokens rotate on each fetch — only the currently displayed QR is valid —
and expire check-out + 2 days; a scan by Front Desk preloads check-in context but **bypasses
nothing**: ID verification, deposit and room readiness are still enforced by the existing
`front_desk_check_in` RPC and a cancelled/checked-out reservation can never initiate check-in),
and **per-room operations QR** (persistent placard token, printable at `/qr-placard/[roomId]`,
rotatable by Manager; the same QR resolves role-aware: guest with an active in-room stay → guest
request entry; housekeeping → room task context; maintenance → room work orders; front
desk/manager/owner/admin → room summary; anyone else → generic refusal). The scanner is a
dashboard modal (opened from Overview and Reservations): camera via jsQR (works in iPhone Safari)
with a manual token-entry fallback (camera failures differentiate blocked / unavailable / unsupported),
and explicit
invalid/expired/revoked/unauthorized states. All manual workflows remain fully intact.

### 7.14 Manager Staff & Duty (operational supervision)

`GET /api/manager/staff-duty` (`canViewStaffDuty`, manager-only, enforced at the route — sidebar
visibility is never the gate) serves a **read-only** workforce snapshot derived by
`lib/staff-duty.ts` from the operational tables that already exist. It is supervision, not HR:

- **Manager ≠ Admin/Owner.** This view never touches employee lifecycle. Creating/deactivating
  accounts, role changes, password recovery, and account governance stay exclusively with the
  Admin/Owner portals (§7.10); `canViewStaffDuty` grants no write path of any kind. Department
  staff have no access to it at all — a hotel-wide workforce view is Manager supervision scope.
- **Authoritative "on duty" definition.** HAVEN has no shift/schedule model, and **login is never a
  duty signal** — authentication state is deliberately excluded. Duty is *derived*: **working** =
  an `in_progress` housekeeping task, an `in_progress` maintenance order, or an open cash shift;
  **assigned** = open (not-yet-started) task/order; **no active work** = neither. No shift times,
  break states, or off-duty rosters are invented — if a `staff_shifts` table is ever added, it
  becomes the duty authority and this module joins onto it.
- **Data sources.** One batched parallel query set (no per-member queries): active `user_accounts`
  (name + role only — no contact, credential, or account-security columns), open + completed-today
  `housekeeping_tasks`, open + resolved-today `maintenance_orders`, and open `cash_shifts`.
  Completed-today counting uses the Asia/Manila hotel day (fixed UTC+8), matching
  `buildDailyReport`. Transportation is shown only insofar as it produces work — it assigns no
  staff FK today, so it does not appear in duty derivation.
- **UI.** The Manager dashboard sidebar (Staff & Duty, under the Management category) renders
  `components/manager/staff-duty-panel.tsx` in the standard operations-workspace anatomy: semantic
  KPI cards (each toggles its duty filter), a dashed derivation note, department coverage buttons
  with on-duty meter bars, a search/filter toolbar with Clear filters, a sticky-header staff table
  with a mobile card twin (≤720px), pulse-skeleton loading, and a branded detail modal per staff
  member (duty status, current assignment, workload, active work). A failed request renders an
  explicit error state — never "no staff".
- **Demo mode.** Without Supabase env the snapshot is served from the demo store (assignee names
  matched by name; no cash shifts in demo data).

### 7.15 Inventory replenishment (roadmap Phase 7 — draft-only)

The inventory demand forecast (§7.13) closes its loop into purchasing — as a **suggestion, never an
order**. `GET /api/inventory/purchase-orders` (Manager/Owner/Admin) returns the same
`forecastInventory` output the Predictive Insights panel uses, filtered to projected shortages (plus
`current-low-stock` items without movement history — facts, not guesses), with a suggested reorder
quantity (forecast's `recommendedReorder`, else the reorder point) and the live unit cost. The
Manager dashboard's Inventory section renders a **"Replenishment suggestions"** strip (each card:
stock, reorder point, predicted 3-day need, shortage, suggested quantity, estimated total) with a
**"Create draft PO"** button opening a dialog where **quantity and vendor are staff-editable**
(default = the suggested quantity). `POST` to the same route creates a row in the existing
`purchase_orders` table:

- **Draft means draft.** The route writes `status: 'draft'` (via `lib/purchase-orders.ts`
  `buildDraftPurchaseOrder`, whose `status` type is the literal `"draft"`) and can write no other
  status — there is no update/submit/send path of any kind, and nothing is ever transmitted to a
  vendor. Existing drafts render read-only beneath the strip ("Draft only — review before any
  order").
- **Server-side truth.** Unit cost is re-read from the `inventory` rows (never trusted from the
  client), the vendor must be active or absent, the total is recomputed server-side, and an
  `audit_logs` row (`inventory_draft_purchase_order`, `after_data.submittedToVendor: false`)
  records the creation. Submitting/receiving against a real vendor remains a human, out-of-system
  act — `purchase_orders` is still the future supply-chain interface table (§9).

## 8. Business policies & configuration

**Central policy table** `hotel_operational_policies` — a single `default` row, versioned, editable
by Admin/Manager (timezone by Owner only, validated against `pg_timezone_names`). **Every booking
freezes a `operational_policy_snapshot`** (BEFORE-INSERT trigger) so a later policy edit cannot
retroactively change a booking's terms; reads use `coalesce(snapshot, live)`. The row also carries
the transfer endpoints (`transfer_hotel_lat/lon/label`) used by the transportation service (§7.11).

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
| VAT / service charge | **VAT-inclusive**: 12% VAT + 10% service charge (`vat_rate_bp` 1200, `service_charge_bp` 1000, basis points 0–10000, Owner/Admin-editable) — displayed prices are the full amount guests pay; documents derive the breakdown (net = gross ÷ ((1+sc)×(1+vat)), VAT line absorbs rounding). Rates freeze into `operational_policy_snapshot` per reservation; settled documents are never recomputed |
| Deposit verification SLA | **4 hours** (`deposit_sla_hours`, 0–72, 0 = tracking off; Owner/Admin-editable, migration `20260931010000`). **Visibility only**: pending-deposit rows in the Deposit Verification queue show an aging chip (amber ≥1 h, red at the SLA), the module's summary cards include a Past-SLA count, and Accounting's bell gains a "past SLA" alert when any deposit has waited too long. Nothing anywhere auto-approves or auto-rejects a payment (`lib/deposit-sla.ts`) |

Percentages are **integer basis points 0–10000** in the DB; deposit/refund math is computed in
integer centavos in TS (`lib/booking.ts`) and `round(…,2)` pesos in SQL. Money is stored as
`numeric(12,2)` PHP throughout. The `reservation_deposit_policies` row mirrors the operational
pattern for money: read at hold creation, frozen into `deposit_policy_snapshot`.

## 9. Data model

64 migrations (`20260826125341_initial_hotel_schema.sql` … `20260934010000_ota_readiness.sql`)
define 50 tables historically; two legacy tables were later dropped, leaving about 48 current tables.
Grouped by domain:

| Domain | Tables | Notes |
|---|---|---|
| Identity & auth | `user_accounts`, `account_recovery_tokens`, `guests`, `staff` | `user_accounts` = app auth (role enum, `active`, `auth_version`, `recovery_required`); `guests` links guest users ↔ stay profiles; `staff` mirrors staff accounts |
| Rooms | `rooms`, `room_types`, `room_rate_plans`, `reservation_room_assignments` | Room statuses + housekeeping state + `administratively_active` (+ `deactivated_at`/`deactivation_reason`, `configuration_version`); `room_types` = sellable catalogue (rate, amenities, **`photo_urls`**, **`badge_color_key`** — semantic badge-color key, unique among active types); `room_rate_plans` = approved dated per-night rate overlays with a day-of-week bitmask (§6 rate plans); assignments ledger with a **GiST exclusion** (one active assignment per room per date-range) |
| Reservations | `reservations`, `booking_holds`, `reservation_change_requests` | `reservations` = the spine (statuses, money snapshot, policy snapshots, `request_options`, **`transportation_preferences`** (transport_lines is legacy/deprecated — superseded by `transportation_requests` + folio charges, kept read-only for history), source website/front desk, payment mirror, **`nightly_rates`** frozen per-night breakdown, **OTA-provenance columns** `external_channel`/`external_reference`/`external_synced_at` — nullable, unconsumed, §15); holds = 15-min carts keyed by `token uuid` (also carry the frozen `nightly_rates`) |
| Housekeeping | `housekeeping_tasks`, `housekeeping_task_assignments` | Typed tasks + history; one in-progress task per room invariant |
| Maintenance | `maintenance_orders`, `maintenance_order_events`, `maintenance_order_assignments`, **`maintenance_assets`** | Work orders + serviceability model + append-only event log; the asset registry (§7.6) has a derived `next_service_date` generated column, starts empty (real assets only, deactivated never deleted) |
| Guest requests | `guest_requests`, `guest_request_catalog` | Structured batched requests plus the Manager-maintained active type/department catalogue used by future guest forms and routing; historical rows keep their text type even if a catalogue item is retired |
| Transportation | `transportation_requests`, `transport_vehicle_types` | Requests: service type, text locations, pickup/return date-time, passengers, status machine, driver, `fare_amount`/`fare_posted_at`, `version`; **one active request per reservation** (partial unique index) + stay-window trigger. Vehicle types: seats, base fare, per-km/per-minute, booking fee. (The earlier `transport_services` price-list table was **dropped** in favor of vehicle types.) |
| Money | `invoices`, `folio_charges`, `payments`, `financial_adjustments`, `refund_requests`, `refund_attempts`, `cash_shifts`, `payment_reconciliations`, `financial_documents` | Folio truth is **derived** (`sync_invoice_financials`); settled payments are immutable; manual deposit payments retain private proof-storage metadata for Accounting review; documents are generated snapshots |
| Manager/owner | `manager_approval_requests`, `manager_notes`, **`front_desk_reports`** | Exception engine with `version`, `execution_status`, `authority_level` manager/owner; reports = immutable daily snapshots (`snapshot` jsonb, `supersedes` lineage, one live per date) |
| Retail/back-office | `inventory`, `vendors`, `purchase_orders` | From the initial schema (inventory is a live stock grid; usage tracking is movements-based, §7.13). `purchase_orders` now receives **draft-only** rows from the replenishment flow (§7.15) — no status other than `draft` is writable and nothing is ever sent to a vendor; the tables remain the future supply-chain interface (the unused `reviews` table was dropped 2026-09-14) |
| Guest communication | `notifications`, `guest_reminder_deliveries` | Immutable guest-facing event content with per-user scope, timestamp, link, and optional `read_at`; the email copy is best-effort and not the source of truth. Deliveries: one row per reservation+reminder kind (`pre_arrival`/`pre_departure`, unique index = idempotency), status/error/sent-at for audit |
| Innovation layer | `analytics_model_runs`, `analytics_predictions`, `ai_interactions`, `inventory_movements`, `qr_tokens`, `qr_scan_events` | §7.13. Analytics run/prediction snapshots (predictions indexed by type+date); AI interaction audit rows (no prompt/response bodies — also the durable rate-limit counter); append-only consumption/restock/adjustment movements feeding the inventory forecast; hashed QR tokens (unique `token_hash`, active-per-resource partial index) + scan events. Same RLS/no-policies/service-role-only trust model as every other table |
| Audit | `audit_logs` | Append-only event trail (`protect_audit_history`), `before_data`/`after_data` jsonb |

**RLS.** Enabled on every table; **zero policies on public tables** — the app reaches them only from
its server with the service-role key. Workflow mutations use definer RPCs; narrow server-guarded
side channels/catalogue operations (notifications and guest-request catalogue maintenance) use the
service-role client directly. The sole RLS policy in the repo is `room_photos_public_read` on `storage.objects` so `<img>` tags can load room photos.

**IDs.** Human-visible entities use DB-generated text prefixes + 8 hex (`GST-`, `RM-`, `RSV-`,
`HKT-`, `MWO-`, `INV-`, `ITM-`, `STF-`); later tables are `uuid`; `booking_holds` keyed by `token`;
`audit_logs` is a bigint identity. Human numbers are generated in function bodies: confirmations
`HVN-YYMMDD-XXXXXX`, receipts `RCP-`, folio documents `FOL-`. Idempotency keys are caller-supplied
uuids behind partial unique indexes (some derived, e.g. `md5(reservation_id||'|'||option)::uuid` for
auto-filed requests/transport lines).

**Indexes/invariants worth knowing:** GiST exclusion on active assignments; partial unique indexes
for one-pending manager approval per entity, one open cash shift per staff, one active maintenance
assignment, one in-progress housekeeping task per room, **one active transportation request per
reservation**, **one submitted daily report per hotel day**; confirmation/idempotency lookups.

## 10. Postgres functions by workflow

201 function definitions across the 63 migrations (118 distinct
public function names — many definitions replace an earlier version as columns/rules
evolve). All are **SECURITY DEFINER** (plus `set search_path = public`), **EXECUTE-granted to
`service_role` only**, re-check the actor role with the null-safe `actor is null or` guard,
row-lock everything they mutate (`for update` before validation), use `pg_advisory_xact_lock` around
availability/room-state counts, and write `audit_logs` rows. Grouped by workflow:

| Workflow | Functions (purpose) |
|---|---|
| Booking & availability | `room_nightly_rates` (**the one pricing resolver** — per-night winning rate for a type/window, §6), `create_booking_hold` (price + hold; validates request options + transportation preferences; `ROOM_TYPE_UNAVAILABLE`), `submit_reservation_deposit` (pending res + invoice + pending deposit + proof metadata; `PROOF_REQUIRED` for manual methods; idempotent by token; per-night `RATE_CHANGED` re-check), `verify_reservation_deposit` (**accounting-guarded** confirm + transport/transportation filing), `expire_booking_holds`, `front_desk_create_reservation`, `file_booking_guest_requests` (+ batch trigger), `file_booking_transportation_request` (+ confirmation trigger) |
| Front desk | `front_desk_room_is_eligible`, `front_desk_eligible_room_inventory`, `front_desk_assign_room`, `front_desk_check_in`, `front_desk_change_room`, `front_desk_extend_stay` (the one extension implementation — also performed by approved `stay_extension` execution), `front_desk_extend_stay_preview` (read-only dialog preview; nights/rate/totals/conflict), `front_desk_checkout`, `front_desk_update_guest`, `verify_guest_identity`, `record_staff_payment`, `post_folio_charge`, `customer_submit_stay_payment` / `verify_customer_stay_payment` (**accounting-guarded**) |
| Guest requests | `customer_submit_guest_requests` (batch), `front_desk_review_guest_request_batch` (approve/reject whole batch; note required on reject), `guest_request_route` (single department-routing table), request/task-creation triggers, `link_housekeeping_tasks_to_assigned_room` |
| Housekeeping | `housekeeping_assign_task`, `housekeeping_start_task`, `housekeeping_complete_task`, `housekeeping_inspect_task`, `housekeeping_defer_task`, `housekeeping_report_maintenance`, task-creation triggers, assignment backfill |
| Maintenance | `maintenance_create_work_order`, `maintenance_assign_work_order`, `maintenance_start_work_order`, `maintenance_record_diagnosis`, `maintenance_defer_work_order`, `maintenance_add_progress`, `maintenance_resolve_work_order`, `maintenance_close_work_order`, `maintenance_cancel_work_order`, `maintenance_room_is_blocked`, `maintenance_restore_room_state` |
| Transportation | `customer_submit_transportation_request` (idempotent; hotel-side route from policy), `customer_cancel_transportation_request` (reason + version), `staff_transition_transportation_request` (one version-guarded RPC for review/schedule/assign/start/complete/cancel/reject; fare posting at assign), `enforce_transportation_stay_window` (trigger fn) |
| Cancellation/refunds | `cancel_reservation` (snapshot-timezone refund basis points; opens `refund_requests`), `process_refund` (idempotent `purpose='refund'` payment; refund attempts; `REFUND_EXCEEDS_RECEIVED`), `accounting_fail_refund`, `reverse_reservation_transport` (+ cancel trigger) |
| No-show | `mark_reservation_no_show` (local-time cutoff gate) |
| Accounting | `sync_invoice_financials` (single folio recompute; internal-only, revoked even from service_role), `accounting_reject_deposit`, `accounting_reverse_charge`, `accounting_record_adjustment`, `accounting_open/close_cash_shift`, `accounting_reconcile_cash_shift`, `accounting_reconcile_payments`, `accounting_generate_document`; immutability triggers `protect_settled_payment` (economic fields **and status**), `protect_audit_history` |
| Manager & Owner | `request_manager_approval` (reason-code validation + server-stamped `financials` for room-type changes; `stayExtension` snapshot for stay extensions), `review_manager_approval` (feasibility re-check + version), `validate_room_type_exception_request`, `validate_room_type_exception_approval`, `validate_room_type_exception_check_in` (exact-ID validation triggers), `room_type_change_responsibility` (reason→payer helper; internal), `record_room_type_change_acceptance` (guest acceptance + idempotent folio posting), `front_desk_execute_manager_approval` (stay_extension branch performs `front_desk_extend_stay` after an optional validated same-type room move), `accounting_execute_manager_financial_approval`, `manager_prioritize_housekeeping`, `manager_escalate_maintenance`, `escalate_manager_approval_to_owner`, `review_owner_exception`, `protect_owner_exception_review`, `sync_manager_financial_execution` |
| Front-desk reports | `submit_front_desk_report` (front-desk-guarded; future-date + supersedes validation; one live per day), `review_front_desk_report` (manager-guarded; version-guarded; note required on return) |
| Customer | `register_guest_account`, `customer_request_reservation_change`, recovery RPCs (`admin_initiate_account_recovery`, `complete_account_recovery`), policy snapshot triggers |
| Governance/catalogue | `admin_create_staff`, `admin_change_account_status`, `admin_change_user_role`, `admin_update_user_metadata`, `admin_create_room`, `admin_update_room_metadata`, `admin_update_room_type` (incl. `photo_urls`), `admin_update_operational_policy`, `upsert_transport_vehicle_type`, `current_operational_policy_snapshot`, `hotel_today`, `manager_propose_room_rate_plan` / `admin_review_room_rate_plan` / `manager_retire_room_rate_plan` (rate-plan governance, §6) |

Known quirks the code comments carry: `resolve_maintenance_order` is deliberately a raising stub
after the maintenance rework (callers use `maintenance_resolve_work_order`). `room_is_sellable(...)`
is still defined only in the deployed database (no migration file creates it), but as of
`20260916010000` it is the shared predicate behind all seven SQL inventory counts rather than a
zero-caller helper — see §7.2 and §15.

## 11. API reference

104 route files under `app/api`. The **`resources`** CRUD below is the only generic surface;
most other handlers are named, role-guarded workflow endpoints. Workflow state transitions call
definer RPCs; storage, notification, and simple catalogue endpoints use narrowly scoped server-only
service-role operations.

**Generic resource CRUD** — `GET/PATCH/POST /api/resources/[resource]`
(resource ∈ reservations, rooms, guests, guest_requests, housekeeping_tasks, maintenance_orders,
invoices, payments, refunds, inventory, staff): GET is role-scoped (`listForRole`; a guest sees only
their own rows). POST/PATCH apply only to *administrative* resources — **protected workflow rows are
refused with 403**; housekeeping task completion on PATCH routes through
`complete_housekeeping_task`. The single generic route exists so the staff grid can create/advance
rows (e.g. walk-in reservation draft) without duplicating per-resource handlers, while every
real state change happens in the named endpoints below.

**Booking & guest.** `POST /booking/holds` (guest details + request options + transportation
preference validation → hold token); `POST /booking/holds/[token]/proof` (stage the payment-proof
image in the private `payment-proofs` bucket — multipart upload, magic-byte sniffed, hold-owner
guarded; DELETE removes a staged path for that hold); `POST /booking/holds/[token]/confirm`
(deposit submission — reference + staged proof path, re-validated server-side, staged upload
removed on failure); `GET /booking/payments/[id]/proof` (60-second signed URL — paying guest or
Accounting only); `POST /register`; `POST /recover/[token]`; `/api/auth/[...nextauth]` (NextAuth
handler).

**Customer self-service** (`/api/account`): `PATCH profile`, `PATCH password`,
`POST requests` (guest-request batch), `POST reservations/[id]/cancel`,
`POST reservations/[id]/change-request`, `POST reservations/[id]/payments` (submit stay-payment
proof); **Transportation**: `GET/POST /account/transportation` (list own / submit request),
`POST /account/transportation/[id]/cancel`.

**Front desk** (`/api/front-desk`): `GET availability`, `POST reservations`, `POST check-in`,
`GET reservations/[id]/eligible-rooms`, `POST reservations/[id]/assign`, `…/change-room`,
`…/charge`, `…/checkout`, `…/extend`, `GET …/extend-preview` (server-calculated extension figures
for the dialog), `PATCH …/guest`, `POST …/identity`, `POST …/payment`,
`POST …/requests`; **`POST deposits/[id]/verify`** (accounting-only guard — the handler lives under
front-desk for queue symmetry, but `permitted = {"accounting"}`); `POST guest-requests/review`
(batch approve/reject); **Reports**: `GET /front-desk/reports?date=` (preview) / `?page=` (history),
`POST /front-desk/reports` (submit), `POST /front-desk/reports/[id]/review` (manager
acknowledge/return).

**Housekeeping** (`/api/housekeeping/tasks/[id]/`): `POST assign, start, complete, inspect, defer,
maintenance`; **`GET /api/housekeeping/assignment-suggestions`** (housekeeping/manager/owner/admin —
advisory assignment plan, §7.5; applying still goes through the audited assign route).

**Maintenance** (`/api/maintenance`): `POST orders`, `POST orders/[id]/[action]`
(action ∈ assign, start, diagnose, defer, progress, resolve, close, cancel);
**`GET/POST /api/maintenance/assets` + `POST /api/maintenance/assets/[id]/[action]`**
(action ∈ record-service, update, deactivate — the §7.6 preventive-maintenance asset
registry; maintenance/manager only, never touches rooms).

**Inventory replenishment** (§7.15): `GET/POST /api/inventory/purchase-orders`
(manager/owner/admin — forecast shortage suggestions + draft-PO creation; POST writes status
`draft` only, no submit/send path exists).

**Transportation** (`/api/transportation`, staff): `GET /transportation` (workspace rows + vehicle
types), `POST /transportation/[id]/transition` (action ∈ review, schedule, assign, start, complete,
cancel, reject — optimistic version).

**Manager** (`/api/manager`): `GET/POST approvals`, `GET staff-duty`, `POST approvals/[id]/review | execute |
financial-execute | escalate-owner`, `POST housekeeping/[id]/prioritize`,
`POST maintenance/[id]/escalate`.

**Accounting** (`/api/accounting`): `GET ledger`; `POST payments/[id]/verify | reject`;
`POST refunds/[id]/process | fail`; `POST cash-shifts` / `PATCH cash-shifts/[id]`;
`POST reconciliations`; `POST adjustments`; `POST charges/[id]/reverse`; `POST documents`.

**Admin** (`/api/admin`): `POST users`, `POST users/[id]/action`, `PATCH policy`,
`PATCH rooms/[id]`, `GET data`.

**Owner** (`/api/owner`): `GET data`, `POST exceptions/[id]/review`.

**Catalog** (`/api/catalog`): `GET/POST request-types` + `PATCH/DELETE request-types/[id]`, `GET/PATCH room-types[/id]`, `GET room-types/[id]/rate-plans` (list) + `POST room-types/[id]/rate-plans` (Manager proposes) + `POST rate-plans/[id]/review` (Owner/Admin approve/reject) + `POST rate-plans/[id]/retire` (any catalog role, §6 rate plans), `POST photos`,
`GET/POST rooms` + `PATCH rooms/[id]` (physical-room roster and configuration, §6 — same RPCs as
Governance's `PATCH /api/admin/rooms/[id]`, so authority lives in PL/pgSQL and the two routes cannot
diverge),
`GET/PATCH/POST transport-vehicle-types[/id]` (vehicle-type catalogue — replaced the old
`transport-services` price list); **Staff dossiers** (`/api/staff`): `GET/PATCH reservations/[id]` (reservation detail +
closeReservation), `GET rooms/[id]` (room dossier), `GET guests/[id]` (consolidated guest profile,
§7.9 — guest-contact roles only, GET only); **dashboard** `GET /api/manager_dashboard`.

**Analytics** (`/api/analytics`, §7.13; manager/owner/admin — front desk gets a reduced subset on
insights): `GET /insights` (latest prediction snapshot + evaluation metrics, on-demand-compute
fallback); `POST /generate` (run the analytics engine + persist snapshot — Vercel cron bearer
`CRON_SECRET` or authorized session, ≥1 h between runs).

**Guest reminders** (`/api/guest-reminders`, §7.13): `GET/POST` run one reminder pass — the same
`CRON_SECRET` bearer or manager/owner/admin session guard as analytics generate. The Vercel cron
fires daily at 01:05 UTC (≈09:05 Manila). Sends are idempotent (§9
`guest_reminder_deliveries`); failures mark the delivery row and never touch the reservation.

**AI assistance** (`/api/ai`, §7.13; **manager/owner/admin only**, `guardAiSession`): `GET /brief`
(cached daily brief, `?refresh=1` rate-limited); `POST /ask` (question + short history → tool-loop
answer with tool provenance); `POST /explain` (type ∈ occupancy/housekeeping/inventory/maintenance
— server rebuilds the forecast context); `POST /report-summary` (AI-assisted summary of a hotel
day's report). All return `{ data: null, message }` degradation, never 5xx, when Gemini is down.

**QR operations** (`/api/qr`, §7.13): `POST /resolve` (token → role-aware resolution with current
resource-state re-check + scan audit); `GET /reservation/[id]` (guest-owner or staff; **confirmed
reservations only** — token rotates on each fetch); `GET /room/[roomId]` (staff placard data) and
`POST /room/[roomId]/rotate` (manager/owner/admin). Scanner: dashboard modal opened from Overview
and Reservations; pages: `/qr-placard/[roomId]`
(printable placard).

Error conventions: RPC failures are mapped to friendly messages and status codes in the route-module
guards (`admin-route.ts` etc. — `PROTECTED_ROLE_FORBIDDEN`→403, `*_STALE`/version→409, etc.); raw
database error text is never echoed to the client.

## 12. Testing & verification

**Command gates (run 2026-09-09):** `npm run typecheck` and `npm run build` pass. `npm run lint`
passes with 72 warnings. `npm test` reports 52 passing / 2 failing files and 671 passing / 3
failing cases. The failures are stale UI expectations in `manager-reservations-panel.test.tsx` (two
ordering/label assertions) and `predictive-insights-panel.test.tsx` (one missing “Booked (fact)”
label assertion). `node scripts/system-test.mjs` was not run in this documentation-only audit because it
requires the configured live database; its design is described below.

**Automated suite:** 54 files / 674 cases combine domain tests, migration/route contract tests, and
jsdom component tests. Domain coverage includes booking/availability, customer ownership and
workflows, Accounting, Admin/Owner governance, Front Desk operations/reports, Housekeeping,
Maintenance, transportation, guest-request batches/catalogue, physical rooms, room details,
manager attention/staff duty, approval display, durable notifications, auth/environment, theme,
analytics, advisory AI guards/tools/audit, and hashed QR tokens. Component coverage includes the
arrival and walk-in dialogs, Manager reservations/approvals/guest requests/staff duty/transportation,
predictive insights, HAVEN AI, booking arrival-time selection, QR scanning, breadcrumbs, and modal
focus behavior.

`lib/fake-supabase.ts` provides the in-memory query-builder subset used by domain tests.
Migration-content tests additionally assert SQL and route wiring (RBAC guards, immutability,
revoke/grant sets, and deliberately absent integrations). Gemini is mocked in the normal suite; no
real AI key or network call is used.

**Live system test** — `scripts/system-test.mjs` (results recorded in `SYSTEM-TEST-REPORT.md`):
a rollback-safe end-to-end run across all 8 access types. It opens one transaction, creates its own
fixtures (role actors + a private room type), runs **savepointed RPC assertions** (expected failures
inside SAVEPOINTs so the run continues), and **always rolls back** — no data is left behind
(attested at the end). RPC arguments are introspected from the **live schema** (identity argument
names, invoked positionally with parameter binding) so signature drift never breaks a call. Lanes:
Guest (far-out booking: deposit → verify → requests → self-change → full-refund cancel), Front Desk +
Maintenance (interleaved: walk-in lifecycle on one room while the spare is maintenance-blocked,
proving availability math), Housekeeping (turnover lifecycle, **then the full inspection cycle**:
policy flipped on via the Owner RPC — completion parks the room at `inspection`/pending and it is
`room_is_sellable`-false same-day, manager/front-desk/maintenance inspection refusals, fail-with-reason
→ `reclean_required` + child reclean task with history intact, double-inspect refusal, reclean pass →
clean/available/sellable + `housekeeping_room_ready` audit), Accounting (settled-payment
immutability first, then refund processing), Manager (escalation review), **Front Desk daily
operations report** (submit → double-submit refused → manager returns → front desk resubmits →
manager acknowledges; RBAC + version guards exercised), **physical rooms** (front desk refused;
manager creates a room via `admin_create_room` — the fixture's own rooms come from the same RPC, so
no raw insert remains — rate copied from the type, operational state left to defaults, sellable count
rises; then `ROOM_NUMBER_TAKEN`, `ROOM_TYPE_NOT_FOUND`, `ROOM_HAS_FUTURE_COMMITMENT` on retype while
a confirmed reservation points at the room, `ROOM_HAS_ACTIVE_ASSIGNMENT` on deactivation,
`ROOM_CONFIGURATION_STALE`, retype succeeding after cancel, and deactivation dropping the room out of
`create_booking_hold`'s SQL gate — the §7.2 requalification's regression test), Admin/Owner
governance, an **innovation lane** (the DB contract behind §7.13: all six new tables exist with
RLS enabled and anon/authenticated denied; analytics model-run + prediction snapshot persist and
cascade; enum check constraints refuse bogus risk levels, AI features, movement directions and scan
results; inventory consumption movements aggregate for the forecast input; a QR token is stored as
a SHA-256 hash only, duplicate hashes are refused by the unique constraint, and every scan outcome
— authorized or ineligible — lands in `qr_scan_events`), a security cross-cut, and the rollback
attestation.

**Helper scripts** (§4): `verify-auth.mjs` (login probe against a configured environment),
`row-counts.mjs` (table census), `set-passwords.mjs` (activate + set real passwords on a fresh DB),
`ai-smoke.mjs` (opt-in live Gemini probe — one minimal call plus a model-listing check; never part
of CI/tests), `migrate.mjs` (legacy; **not** the supported migration path).

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
  account (`… and active`) even mid-session. Proof verification (deposits, stay payments) is
  Accounting's decision alone at both layers.
- **Stateless JWT re-validation** each request (`auth_version`/inactive → disabled).
- **Passwords** bcrypt (cost 12 at registration); seeded hashes neutralised in a migration; recovery
  tokens stored hashed, expiry + single-use, unauthenticated by design.
- **Immutability:** settled payments (economic fields **and status**) and the audit log are
  write-protected at the DB layer; money corrections are reversals/adjustments; financial documents
  and daily report snapshots are generated server-side and never updated.
- **Audit trail:** every privileged mutation appends to `audit_logs` (before/after jsonb).
- **Boot-time env validation**; demo mode is refused in production.
- **Client is untrusted:** request bodies zod-parsed; transportation preferences and request options
  re-validated server-side (the client never supplies the hotel side of a route or a report
  snapshot); RPC error text never echoed raw, friendly-path redirects only (`safeInternalPath`).
  Payment-proof images: browser MIME/filename never trusted (magic-byte sniffed server-side, at
  upload AND again at confirm), stored in the policy-less private `payment-proofs` bucket, served
  only via 60-second signed URLs to the paying guest or Accounting (§7.2), never sent to the AI
  layer, never public.
- **No third-party API keys.** The transportation service runs entirely on local data — a test
  enforces that no external mapping/routing code is present. The sole external dependency is the
  **server-side Gemini client** (§7.13): `GEMINI_API_KEY` is never exposed to browser JavaScript
  (no `NEXT_PUBLIC_` variant exists), never logged, and never returned by any route; routes only
  report whether AI is configured.
- **AI is advisory and read-only** (§7.13). Server-side RBAC (manager/owner/admin) before any data
  fetch or Gemini call; no generic SQL tool — only an explicit registry of read-only functions
  returning aggregated, PII-minimized payloads; every response zod-validated before render; every
  interaction audited (`ai_interactions`) and rate-limited; Gemini cannot mutate any row, execute
  any RPC, or bypass any business rule — all operations still run through the existing role-guarded
  workflows; a Gemini outage degrades to a message, never an error cascade.
- **QR codes carry no guest data and grant nothing on their own** (§7.13). Tokens are opaque
  crypto-random strings stored only as SHA-256 hashes; every scan re-validates session, role and
  current resource state (a cancelled or checked-out reservation can never initiate check-in);
  reservation tokens rotate on each fetch and expire; room tokens rotate only by explicit Manager
  action; every scan attempt writes an audit row; QR never bypasses check-in business rules.

## 14. Deployment & environments

Deployed to **Vercel** (project `haven-hotel-management`, see `HAVEN-FINAL-DEPLOYMENT-REPORT.md`
and `.vercel/project.json`; SSO-protected; Hobby-plan commit-attribution nuance noted in that report).
A fresh environment needs: Vercel env vars (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIRECT_URL`, plus the innovation
layer's `GEMINI_API_KEY` / optional `GEMINI_MODEL` and `CRON_SECRET`), `supabase db push` for the
schema, then `set-passwords.mjs` on the empty database to create/activate the staff accounts.
`vercel.json` registers **two daily crons** (Hobby-plan Vercel allows daily only): 02:35 Manila
`/api/analytics/generate` and 09:05 Manila `/api/guest-reminders`, both with the `CRON_SECRET`
bearer (§7.13, §11); mid-day prediction refresh happens through the Manager's
[Refresh predictions] button. There is no CI
pipeline config in the repo at this tree.

## 15. Current gaps & deferred configuration

Honest inventory of what is **not** wired up yet (not prescriptions). Full split notes:
`docs/lacking-of-the-system/`.

- **Payments/refunds are manual, not gateway-backed.** Deposits and stay payments are staff-verified
  proof-of-transfer; refunds are recorded attempts with a transaction reference. No real card/gateway
  or actual money movement. `payments.status` has no `paid`→gateway-confirmed automatic path.
  **This is deliberate (roadmap Phase 9A, 2026-09-30):** the guest-facing methods are exactly
  `manual_gcash` / `manual_bank_transfer` with reference + proof, the payment page states transfers
  are verified manually, and **no "Pay online" UI exists or may exist** (contract-tested in
  `lib/ota-readiness.test.ts`). A gateway integration adds a real provider module only when the
  hotel selects one — no provider abstraction was created speculatively.
- **OTA/channel-manager integration is column-ready, nothing more (roadmap Phase 9B, 2026-09-30).**
  `reservations.external_channel` / `external_reference` / `external_synced_at` are nullable,
  start NULL on every row, and are read/written by **nothing** in the app (partial unique index on
  channel+reference when present). No sync code, cron, API route, or UI exists — a fake
  integration is never shown to users. A real channel manager is a future project: two-way
  availability/booking sync against the `room_is_sellable` predicate and rate plans.
- **Group/corporate bookings are a future project, deliberately (roadmap Phase 9C, 2026-09-30).**
  A party booking N rooms is not N independent holds: it needs group-level inventory semantics
  (multi-room availability under the advisory lock), a corporate billing entity with one
  consolidated folio across reservations, and cancellation/attrition rules — all touching the
  booking spine's invariants. Nothing unsafe was bolted on; today a group is handled as separate
  reservations with a shared guest note, which is honest and sufficient at this property's size.
- **F&B / minibar need no new machinery (roadmap Phase 9D, 2026-09-30).** Posting arbitrary
  guest charges is exactly `post_folio_charge` (description + amount, audited, settles through
  `sync_invoice_financials`) — front desk posts restaurant/minibar charges the same way today.
  A dedicated F&B module (stock-linked menu, auto-posting) only becomes worthwhile with a real
  outlet operation.
- **Email is optional and SMS is not integrated.** When `RESEND_API_KEY` is configured, the server
  sends best-effort transactional copies for selected payment, request, and transportation events;
  durable in-app notifications remain authoritative. Email verification is off, and booking expiry
  still has no external reminder service.
- **Minimum-age (18) has no data source** — the hotel cannot yet verify a guest's date of birth
  against government ID through the app.
- **Transportation is deliberately local.** Locations are free text, fares are flat per vehicle
  type, and there is no external mapping/routing — the TomTom-priced variant was removed.
  `docs/TRANSPORTATION_FUTURE_ENHANCEMENTS.md` records the deliberately deferred work (route
  pricing, distance validation, fleet integrations).
- **`schema.sql` is a deployed-database snapshot, not a hand-maintained source of truth**
  (memory: `schema-sql-lags-behind-migrations`). It is regenerated with
  `npx supabase db dump -f supabase/schema.sql` when Docker and the linked database are available.
  At this audit it does **not** yet contain the local 20260918 request catalogue, 20260919 controlled
  room-exception inventory, 20260920 notifications, or 20260921 payment-proof changes. It also
  carries the
  btree_gist/Postgres builtin helper grants to `anon`/`authenticated` (harmless — those are not
  application RPCs; `lib/accounting.test.ts` asserts no application function is granted to
  them). Regenerate it after each feature block; `supabase/migrations/` stays the source of
  truth.
- **One deployed helper is remote-only**: `room_is_sellable(...)` is defined in neither
  `supabase/migrations` nor the repo's older snapshots — it is captured in the current dump but has
  no migration file, even though `20260916010000` now routes all seven SQL inventory counts through
  it. Some live function bodies therefore exist only in the deployed database (memory:
  `db-function-drift-live-definitions`). Read the live body via `DIRECT_URL` before recreating any
  existing RPC.
- **`rooms.rate` and `rooms.amenities` are vestigial.** `rate` is read by no SQL function and only
  displayed in the staff room card / detail modal; `amenities` is already shadowed by the room
  type's. `admin_create_room` copies `base_rate` in only to satisfy the NOT NULL, so the copy goes
  stale once a type's rate is approved upward. Dropping both columns is a separate cleanup.
- Demo-mode portals and `DataTable.tsx` are partially scaffolded rather than fully surfaced. Hotel
  inventory usage tracking is movements-based (§7.13) and replenishment is **draft-only** (§7.15):
  `purchase_orders` can hold `draft` rows for human review, but submitting, receiving, and any
  vendor-side integration stay out-of-system; `vendors`/`purchase_orders` remain the interface
  tables for that future phase (the unused `reviews` table was dropped).
- **Innovation layer limitations (§7.13, honest by design).** The dataset is young (system created
  2026-08-26), so occupancy pickup estimates and labor-hour figures start at "Limited" data
  quality and are always labeled with their observation basis rather than faked confidence.
  `inventory_movements` starts empty at deploy — the inventory forecast is movements-based only
  once history accumulates; until then items are flagged "not yet predictable" rather than
  guessed. Maintenance risk is room-scoped and expressed as recurring-issue
  risk, never a failure probability (the §7.6 asset registry does not feed the
  risk model — due dates are calendar facts, not predictions). Hobby-plan
  Vercel allows daily crons only — the analytics
  snapshot refreshes once per night plus on-demand Manager refresh.
- No CI config; no production observability; guest-facing behaviour depends on the provisional
  policies in §8 until real ones are configured.

## 16. Further reading

- `docs/PROVISIONAL_BUSINESS_POLICIES.md`, `docs/FRONT_DESK_OPERATIONS.md`,
  `docs/MANAGER_OPERATIONS.md` — current operational specs the workflows implement.
- `docs/TRANSPORTATION_FUTURE_ENHANCEMENTS.md` — what the transportation service deliberately
  defers.
- `docs/innovation-architecture.md` — the innovation layer's architecture and defense narrative
  (predictive analytics vs Gemini assistance vs QR operations, methodologies, security, limits).
- `docs/DIAGRAMS.md` — BPA, ERD, use-case, and WBS diagrams of the system (Mermaid).
- `docs/lacking-of-the-system/` — the full split gap list.
- `HAVEN-FINAL-DEPLOYMENT-REPORT.md` — deployment detail, env wiring, SSO/Vercel notes.
- `SYSTEM-TEST-REPORT.md` — recorded results of the live system test (§12).
- `DESIGN-STATUS.md` / `DESIGN.md` / `design-system/haven-hotel/` — the UI design system and its
  current status.
- `docs/ui-motion-guidelines.md` — area-based UI motion policy: intensity matrix, motion tokens,
  reduced-motion contract, and bundle rules (GSAP in landing + auth chunks only).
- `research-paper/` — an earlier snapshot of the design (07 chapters; older than the current tree).
- `nano_bots/` — a notes vault.
- Migration-by-migration walkthrough: the fresh notes captured for this document (id scheme, basis
  points, timezone policy data, hold expiry, advisory locks + GiST backstop) mirror the migration
  set; for code-level reference, start at `20260826125341_initial_hotel_schema.sql` and read the
  migrations in filename order.
- Project memory (this session's persistent notes) records the drift/tooling facts this doc relies
  on: `supabase db push` over `npm run migrate`, `schema.sql` lag, the null-role guard rule, the
  anon-EXECUTE grant hole, live-vs-migration definer drift, and migration-number collisions between
  parallel sessions.
