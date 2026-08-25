# Setup & Commands

## Install & run
```bash
npm install
npm run dev      # http://localhost:3000
```

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint (eslint-config-next) |
| `npm run typecheck` | `tsc --noEmit` |

## Environment variables
| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | optional | Without it the app runs in demo mode |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Server-side only; enables real DB mode |
| `NEXTAUTH_SECRET` | required in prod | Dev falls back to a local dev secret |

## Database setup
1. Run `supabase/schema.sql` in Supabase SQL Editor (creates all tables, RLS enabled, seeds first owner account).
2. Default seeded owner: `owner@yourhotel.com` / `ChangeMe123!` — change immediately.

## Demo logins (dev)
All use password `demo123`: `owner@haven.test`, `admin@haven.test`, `manager@haven.test`, `frontdesk@haven.test`, `housekeeping@haven.test`, `maintenance@haven.test`, `accounting@haven.test`, `guest@haven.test`
