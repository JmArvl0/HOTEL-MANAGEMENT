# Haven Hotel Management System

A full-stack hotel operations starter built with Next.js, TypeScript, REST APIs, NextAuth, PostgreSQL/Supabase, and a Vercel-ready deployment setup.

## Included workflows

- Public hotel landing page with live room-type availability and a connected guest booking flow
- Role-based portal for Owner, Admin, Manager, Front Desk, Housekeeping, Maintenance, Accounting, and Guest
- One connected reservation lifecycle with deposits, identity and balance gates, conflict-safe room assignment history, preassignment, room changes, stay extensions, check-in/out, folio charges, cancellation/no-show handling, refund processing, room turnover, and audit history
- Reservations, live room status, guest profiles, housekeeping tasks, maintenance work orders, billing, inventory, staff, and analytics
- Search, record creation, status progression, print/export views, responsive navigation, and live dashboard calculations
- REST endpoints under `/api/resources/:resource`, `/api/manager_dashboard`, and protected role-specific workflow APIs
- Supabase-backed authentication and production hotel data, with demo operational data available only when Supabase is not configured

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. User authentication is resolved from the Supabase `user_accounts` table; there is no hardcoded runtime login fallback.

## Connect Supabase

1. Create a Supabase project.
2. For an existing linked project, run `npx supabase db push --linked`. For a new unlinked project, the consolidated [`supabase/schema.sql`](supabase/schema.sql) remains available for the SQL Editor.
3. Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=YOUR_LONG_RANDOM_SECRET
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or commit `.env.local`. The supplied SQL enables row-level security and the server-only service role performs database access after NextAuth authorization.

The tracked migrations create the eight role accounts **inactive, with no usable password** — this repository is public, so no hash is committed to it. Activate an account by setting its password:

```bash
npm run set-passwords -- --list            # show accounts and password state
npm run set-passwords -- owner@haven.test  # prompts, echo off
```

The script prompts for the password with terminal echo disabled, never generates or displays one, and stores only the bcrypt hash (cost 12). Only accounts named on the command line are touched. Re-run it to rotate. Runtime authentication reads only `user_accounts`.

Sessions are stateless JWTs, so changing a password does not sign out an existing session. To force every session to re-authenticate, rotate `NEXTAUTH_SECRET` as well.

## REST API

Authenticated resources support `GET`, `POST`, and `PATCH`:

`reservations`, `rooms`, `guests`, `guest_requests`, `housekeeping_tasks`, `maintenance_orders`, `invoices`, `payments`, `refunds`, `inventory`, and `staff`.

Permissions are enforced server-side in `lib/permissions.ts`; hiding a navigation item is only a user-interface convenience, not the security boundary.

The current configurable rules and end-to-end lifecycle are documented in [`docs/PROVISIONAL_BUSINESS_POLICIES.md`](docs/PROVISIONAL_BUSINESS_POLICIES.md). The Front Desk data flow, department boundaries, and protected endpoints are documented in [`docs/FRONT_DESK_OPERATIONS.md`](docs/FRONT_DESK_OPERATIONS.md). The Manager oversight, approval lifecycle, separation of duties, and stale-state protections are documented in [`docs/MANAGER_OPERATIONS.md`](docs/MANAGER_OPERATIONS.md).

## Deploy to Vercel

Push the project to GitHub, import it into Vercel, and add the four environment variables above. Set `NEXTAUTH_URL` to the deployed HTTPS URL. Vercel will run `npm run build` automatically.

## Generated visual asset

The landing-page hero at `public/hotel-hero.png` was created with the built-in image generation tool. Prompt: a premium, photorealistic contemporary tropical Southeast Asian hotel lobby at golden hour, with a dark left-side copy area, no people, logos, text, or watermark.
