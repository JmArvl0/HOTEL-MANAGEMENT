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
1. Run `supabase/schema.sql` in Supabase SQL Editor (creates all tables, RLS enabled, seeds the eight role accounts).
2. Seeded accounts are created **inactive with no usable password** — no hash is committed to this repo.
3. Activate one by setting its password: `npm run set-passwords -- <email>`. It prompts with echo off; nothing is generated, printed, or written to disk.

## Staff logins
`owner@haven.test`, `admin@haven.test`, `manager@haven.test`, `frontdesk@haven.test`, `housekeeping@haven.test`, `maintenance@haven.test`, `accounting@haven.test`, `guest@haven.test` — passwords are set only by `npm run set-passwords` and live only in the database as bcrypt hashes. Re-run it to rotate; rotate `NEXTAUTH_SECRET` too if existing sessions must be invalidated.
