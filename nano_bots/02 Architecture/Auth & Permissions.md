# Auth & Permissions

Source: `lib/auth.ts`, `lib/permissions.ts`, `lib/types.ts`

## Authentication
- **Provider:** NextAuth CredentialsProvider, JWT session strategy.
- **Resolution order in `authorize()`:**
  1. Hardcoded demo users (`*@haven.test`, password `demo123`)
  2. Supabase `app_users` table (via service-role key): fetch by email → verify `active` → `bcrypt.compare` against `password_hash`
- Custom cookie name `haven.session-token` (avoids stale localhost cookies).
- Sign-in page: `/login`.
- `role` is added to the JWT on sign-in and copied onto `session.user.role`.

## Roles
`owner`, `admin`, `manager`, `front_desk`, `housekeeping`, `maintenance`, `accounting`, `guest`

## Access matrix (`canAccess(role, resource)`)
| Role | Resources |
|---|---|
| owner / admin / manager | all 8 |
| front_desk | reservations, rooms, guests, housekeeping_tasks, invoices |
| housekeeping | rooms, housekeeping_tasks, inventory |
| maintenance | rooms, maintenance_orders, inventory |
| accounting | reservations, guests, invoices, inventory |
| guest | reservations, invoices |

## Security notes
- Demo users bypass bcrypt entirely — never enable them in production.
- Dev-only fallback `NEXTAUTH_SECRET`; production requires a real secret.
- Service-role key used for auth lookups and all data access; RLS blocks direct client access.
