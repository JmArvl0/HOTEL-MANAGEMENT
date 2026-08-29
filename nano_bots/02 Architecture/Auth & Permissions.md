# Auth & Permissions

Source: `lib/auth.ts`, `lib/permissions.ts`, `lib/types.ts`

## Authentication
- **Provider:** NextAuth CredentialsProvider, JWT session strategy.
- **Resolution in `authorize()`:** a single path — Supabase `user_accounts` (via service-role key): fetch by email → verify `active` → `bcrypt.compare` against `password_hash`. Returns `null` when Supabase is unconfigured, so demo mode has no logins at all. There is no hardcoded account map.
- Passwords are issued only by `npm run set-passwords` and exist only as bcrypt hashes in the database.
- Custom cookie name `haven.session-token` in development, `__Secure-haven.session-token` with `secure` in production (avoids stale localhost cookies).
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
- No demo/plaintext login path exists; bcrypt against `user_accounts` is the only route in.
- Sessions are stateless JWTs: `jwt`/`session` callbacks do no database lookup, so `active` and `password_hash` are read **only at sign-in**. Changing a password or setting `active = false` does not sign out a live session — rotate `NEXTAUTH_SECRET` to invalidate all of them.
- Dev-only fallback `NEXTAUTH_SECRET`; production requires a real secret.
- Service-role key used for auth lookups and all data access; RLS blocks direct client access.
