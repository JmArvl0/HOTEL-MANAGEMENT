# Folder Structure

```
HOTEL-MANAGEMENT/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (providers)
│   ├── page.tsx                # Landing page
│   ├── globals.css             # Global styles
│   ├── dashboard-theme.css     # Dashboard styling
│   ├── login/page.tsx          # Sign-in page (custom NextAuth page)
│   ├── dashboard/page.tsx      # Dashboard shell (server component)
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # NextAuth handler
│       ├── dashboard/route.ts            # GET aggregated dashboard data
│       └── resources/[resource]/route.ts # Generic CRUD per resource
├── components/
│   ├── providers.tsx           # SessionProvider wrapper
│   └── dashboard-client.tsx    # Client-side dashboard UI + charts
├── lib/
│   ├── types.ts                # Role, Resource, RecordItem, DashboardData
│   ├── auth.ts                 # NextAuth config (demo users + Supabase lookup)
│   ├── permissions.ts          # Role → resource access matrix
│   ├── data.ts                 # list/create/update/getDashboard (Supabase or demo)
│   └── demo-store.ts           # In-memory fallback store
├── supabase/schema.sql         # Full PostgreSQL schema (RLS enabled)
├── public/hotel-hero.png
└── nano_bots/                  # This documentation vault
```

Related: [[API Routes]], [[../01 Project/Overview|Overview]]
