# 5. Implementation

## 5.1 Project structure (module-based)

The codebase is organised by use case using Next.js route groups, so folder names state
the business module rather than the URL:

```
app/
  layout.tsx                              # fonts, SessionProvider, global CSS
  globals.css                             # landing + light dashboard theme
  manager-dashboard-theme.css             # dark theme overrides (.app-shell scope)
  (landing-page)/page.tsx                 # "/" — public site
  (auth)/login/page.tsx                   # "/login" — sign-in
  (manager)/manager_dashboard/page.tsx    # "/manager_dashboard" — operations
  api/auth/[...nextauth]/route.ts
  api/manager_dashboard/route.ts
  api/resources/[resource]/route.ts
components/
  manager/manager-dashboard-client.tsx    # entire dashboard client
  rooms-browser.tsx                       # public room filter grid
  providers.tsx
lib/
  types.ts  data.ts  auth.ts  permissions.ts  demo-store.ts
supabase/schema.sql
scripts/migrate.mjs
```

Total application source is ~560 lines of TypeScript written in a deliberately dense,
one-statement-per-line style.

## 5.2 Key modules

### 5.2.1 Landing page (`app/(landing-page)/page.tsx`)

A server component marked `force-dynamic` that renders hero content, a booking bar, and
a room browser fed by `list("rooms")` called server-side. Rooms are filtered client-side
by `components/rooms-browser.tsx`.

### 5.2.2 Sign-in (`app/(auth)/login/page.tsx`)

A client form calling `signIn("credentials", { redirect: false })`; on success it routes
to `/manager_dashboard`. Demo credentials are surfaced for evaluation and pre-filled in
development.

### 5.2.3 Manager dashboard gate (`app/(manager)/manager_dashboard/page.tsx`)

Server component: `getServerSession(authOptions)` → `redirect("/login")` when absent,
otherwise renders `ManagerDashboardClient` with the session user.

### 5.2.4 Dashboard client (`components/manager/manager-dashboard-client.tsx`)

One declaratively-driven client component containing:

- **Sidebar navigation** filtered by role; section switching triggers a fresh fetch.
- **`config` registry** per resource: columns, create-form fields, status enum — new
  modules are added by extending this object.
- **Resource tables** with client-side search over loaded rows.
- **Status advancement** — clicking a badge advances to the next enum value.
- **Create modal** generated from config fields.
- **Overview & Reports** views with Recharts area/pie charts.
- **Theme toggle** (dark default) persisted to `localStorage`.
- **Print export** via `window.print()` and print stylesheet.

### 5.2.5 Data layer (`lib/data.ts`)

Mode-switching `list` / `create` / `update` plus `getDashboard` aggregation (§4.6).
Demo mode mutates seeded arrays on `globalThis.__hotelStore`; Supabase mode issues
typed queries against the service-role client.

### 5.2.6 Auth (`lib/auth.ts`) and permissions (`lib/permissions.ts`)

NextAuth credentials provider: demo-user map first (evaluation path), then `app_users`
lookup with `bcrypt.compare`. JWT callbacks carry `role` onto the session. The
permission matrix exports `canAccess(role, resource)` used by every API handler.

## 5.3 Theming & responsiveness

Two hand-written CSS files: `globals.css` (light landing/dashboard) and
`manager-dashboard-theme.css` (dark operations theme scoped under `.app-shell`).
Responsive breakpoints at 1000 px (sidebar collapses to drawer, grids restack) and
680 px (single-column metrics), plus a dedicated print stylesheet for report export.

## 5.4 Notable implementation decisions

1. **Declarative module registry** over bespoke screens — one code path serves eight
   resources.
2. **Route groups for module naming** — `(landing-page)`, `(auth)`, `(manager)` keep
   folders self-describing while URLs stay clean.
3. **Dual-mode persistence behind one interface** — demonstration capability without a
   code fork.
4. **Server-side authorisation at the handler boundary** — the client's role-filtered
   navigation is cosmetic; security does not depend on it.
