# 3. Methodology

## 3.1 Development approach

The system was developed using an **incremental/iterative (agile-inspired) approach**:
each operational module was delivered as a vertical slice — schema table → data-layer
function → REST handler → dashboard UI config entry — so that every iteration produced a
usable increment. The declarative `config` object in
`components/manager/manager-dashboard-client.tsx:15-24` made each new module primarily a
data-definition exercise rather than bespoke UI work.

## 3.2 Tools and environment

| Concern | Tool | Role |
|---|---|---|
| Framework | Next.js 16.3.2 (App Router, Turbopack) | Full-stack framework; dev server & production bundler |
| Language | TypeScript 5.7 (`strict: true`) | Static typing over JavaScript |
| UI library | React 18.3, lucide-react, Recharts | Components, icons, charts |
| Auth | NextAuth.js 4.24 | Credentials auth, JWT sessions |
| Database | PostgreSQL via Supabase JS 2.57 | Persistence, RLS, constraints |
| Validation | zod 3.25 | Schema validation (installed; adoption planned) |
| Migration | `pg` + `scripts/migrate.mjs` | Applies `supabase/schema.sql` via `DIRECT_URL` |
| Version control | Git + GitHub | Source hosting, history |
| Hosting | Vercel | Deployment platform for Next.js |

## 3.3 Dual-mode persistence strategy

A defining methodological decision is **progressive enhancement of the data layer**
(`lib/data.ts:5-8`):

```ts
databaseMode = url && key ? "supabase" : "demo";
```

- **Demo mode** (default): all eight resources are served from a seeded in-memory store
  on `globalThis.__hotelStore` (`lib/demo-store.ts`). The application boots with zero
  configuration — used for presentations, teaching, and evaluation.
- **Supabase mode**: when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
  present, the identical `list()` / `create()` / `update()` interface transparently
  delegates to Postgres. Callers are mode-unaware apart from a surfaced `mode` flag.

This preserves a single code path per operation and makes the demonstration constraint
(§12 of SYSTEM.md) a first-class architectural feature rather than a fork.

## 3.4 Module-based project organisation

Code is organised by use case/module using Next.js route groups:

```
app/
├── (landing-page)/page.tsx              # public marketing surface → "/"
├── (auth)/login/page.tsx                # unified sign-in → "/login"
├── (manager)/manager_dashboard/page.tsx # operations surface → "/manager_dashboard"
└── api/
    ├── auth/[...nextauth]/route.ts
    ├── manager_dashboard/route.ts
    └── resources/[resource]/route.ts
components/manager/manager-dashboard-client.tsx   # entire dashboard client
lib/{types,data,auth,permissions,demo-store}.ts   # domain layer
```

Route groups separate concerns by module without changing public URLs, keeping each
business module independently locatable.

## 3.5 Data collection / requirements elicitation

Requirements were derived from standard small-property hotel workflows (front-desk
check-in/check-out cycles, housekeeping room-turn sequencing, maintenance triage,
folio settlement, stock reorder thresholds) and encoded as the status enums and column
sets of the 15-table schema (§4.4). Seed data in `lib/demo-store.ts` models one property
with 8 sample rooms, reservations, tasks, orders, invoices, inventory items, and staff.
