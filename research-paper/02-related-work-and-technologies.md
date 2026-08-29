# 2. Related Work & Technologies

## 2.1 Related systems

| System | Class | Relevance |
|---|---|---|
| Oracle Opera Cloud | Enterprise PMS | Full hospitality suite; heavy licensing, over-scoped for small properties. Motivates a lightweight alternative. |
| Mews | Cloud PMS | Modern SaaS PMS; subscription pricing scales with volume, not feasible for evaluation/teaching use. |
| Little Hotelier / Cloudbeds | Small-property PMS | Target the same segment but are closed SaaS; no self-hosting or customisation. |
| Spreadsheet-based workflows | Status quo | Ubiquitous in small properties; no concurrent editing, access control, or aggregation. |

Haven differentiates by being **self-hostable, source-available, zero-configurable for
demonstration**, and scoped deliberately to one property.

## 2.2 Technology review

### 2.2.1 Frontend — React 18 + Next.js 16 (App Router)

React's component model drives both the marketing site and the operations dashboard.
Next.js App Router provides file-system routing organised into route groups
(`(landing-page)`, `(auth)`, `(manager)`) that separate surfaces without affecting URLs.
Server Components perform session gating (`app/(manager)/manager_dashboard/page.tsx`),
while Client Components handle interactive tables, charts, and modals
(`components/manager/manager-dashboard-client.tsx`). Visualisation uses Recharts;
iconography uses lucide-react.

### 2.2.2 Language — TypeScript

All application code is TypeScript compiled by `tsc` with `strict: true`. TypeScript is
a typed superset of JavaScript that compiles to it, satisfying the JavaScript runtime
requirement while adding static verification. Domain types are centralised in
`lib/types.ts`.

### 2.2.3 Backend — Next.js Route Handlers (Node.js)

Backend logic lives in REST-style route handlers executed on the Node.js runtime inside
the same deployment:

```
app/api/auth/[...nextauth]/route.ts     → NextAuth handler
app/api/manager_dashboard/route.ts      → GET aggregated metrics
app/api/resources/[resource]/route.ts   → GET / POST / PATCH per resource
```

Each handler re-derives the session via `getServerSession` and authorises through the
permission matrix before touching data.

### 2.2.4 Database — PostgreSQL via Supabase

The relational schema (`supabase/schema.sql`) defines 15 tables, 6 indexes, foreign keys,
check constraints (e.g. `check_out > check_in`), unique constraints on room numbers, and
Row-Level Security enabled on every table. Access is exclusively server-side using the
service-role key; RLS deny-all policies ensure no anonymous client-direct reads.
Migration is applied by `scripts/migrate.mjs` over a direct Postgres connection.

### 2.2.5 Authentication — NextAuth.js v4

Credentials-based authentication with JWT session strategy. Roles ride inside the JWT
(`callbacks.jwt`) and are copied onto `session.user.role`. Passwords for provisioned
database users are hashed with bcryptjs; a demo-user map enables instant evaluation.

### 2.2.6 DevOps — GitHub + Vercel

Version control is Git with a GitHub remote (`JmArvl0/HOTEL-MANAGEMENT`). The project
targets Vercel deployment, which hosts Next.js natively without additional configuration;
environment variables (`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) are supplied through the platform dashboard.

## 2.3 Conceptual framework

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser clients                        │
│  Public visitor │ Staff (8 roles) │ Demo evaluators         │
└────────┬───────────────┬──────────────────┬─────────────────┘
         │               │                  │
┌────────▼───────────────▼──────────────────▼─────────────────┐
│              Next.js deployment (Vercel/Node)               │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐  │
│  │ landing-page │ │     auth     │ │      manager        │  │
│  │ route group  │ │ route group  │ │     route group     │  │
│  └──────────────┘ └──────────────┘ └─────────────────────┘  │
│  REST route handlers ← getServerSession → permission matrix │
│  Data layer (lib/data.ts): demo store ⇄ Supabase client     │
└──────────────────────────────┬──────────────────────────────┘
                               │ service-role key
                    ┌──────────▼──────────┐
                    │  PostgreSQL (15     │
                    │  tables, RLS deny-  │
                    │  all, 6 indexes)    │
                    └─────────────────────┘
```
