# Haven Hotel Management System

A full-stack hotel operations starter built with Next.js, TypeScript, REST APIs, NextAuth, PostgreSQL/Supabase, and a Vercel-ready deployment setup.

## Included workflows

- Public hotel landing page and availability entry point
- Role-based portal for Owner, Admin, Manager, Front Desk, Housekeeping, Maintenance, Accounting, and Guest
- Reservations, live room status, guest profiles, housekeeping tasks, maintenance work orders, billing, inventory, staff, and analytics
- Search, record creation, status progression, print/export views, responsive navigation, and live dashboard calculations
- REST endpoints under `/api/resources/:resource` and `/api/dashboard`
- Zero-configuration demo mode; Supabase mode is enabled when its environment variables are present

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Demo accounts use the password `demo123`; try `manager@haven.test`, `frontdesk@haven.test`, `housekeeping@haven.test`, `maintenance@haven.test`, or `accounting@haven.test`.

## Connect Supabase

1. Create a Supabase project.
2. Paste [`supabase/schema.sql`](supabase/schema.sql) into the Supabase SQL Editor and run it.
3. Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=YOUR_LONG_RANDOM_SECRET
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or commit `.env.local`. The supplied SQL enables row-level security and the server-only service role performs database access after NextAuth authorization.

The schema creates an initial database-backed owner account: `owner@yourhotel.com` / `ChangeMe123!`. Change it immediately. The `.test` demo accounts remain available for presentations even when Supabase is connected.

## REST API

Authenticated resources support `GET`, `POST`, and `PATCH`:

`reservations`, `rooms`, `guests`, `housekeeping_tasks`, `maintenance_orders`, `invoices`, `inventory`, and `staff`.

Permissions are enforced server-side in `lib/permissions.ts`; hiding a navigation item is only a user-interface convenience, not the security boundary.

## Deploy to Vercel

Push the project to GitHub, import it into Vercel, and add the four environment variables above. Set `NEXTAUTH_URL` to the deployed HTTPS URL. Vercel will run `npm run build` automatically.

## Generated visual asset

The landing-page hero at `public/hotel-hero.png` was created with the built-in image generation tool. Prompt: a premium, photorealistic contemporary tropical Southeast Asian hotel lobby at golden hour, with a dark left-side copy area, no people, logos, text, or watermark.
