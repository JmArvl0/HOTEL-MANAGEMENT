# 2026-09-14 - Client Fetch Resilience

## Work completed

- Removed the app-wide NextAuth `SessionProvider`; staff and public pages do not consume
  session context and no longer issue the unnecessary client `/api/auth/session` request.
- Scoped `SessionProvider` to the customer profile page, where `ProfileForm` uses
  `useSession().update()` after a name change. The authenticated server session is passed
  in directly and focus refetch is disabled.
- Wrapped the Manager/Front Desk/Housekeeping/Maintenance/Accounting dashboard loader in
  `try/catch/finally`. Initial network or JSON failures now render a clear retry state;
  silent 30-second refresh failures keep the last successful data visible.
- Added `lib/client-fetch-resilience.test.ts` to lock both boundaries.

## Behavior preserved

- Server-side session enforcement, role redirects, API authorization, RBAC, Supabase
  access, and polling cadence are unchanged.
- Sign-in/sign-out helpers remain available without session context.

## Verification

- `npx vitest run lib/client-fetch-resilience.test.ts` — 2/2 passed.
- `npm run typecheck` — passed.
- `npm test` — 92 files, 1029 tests passed.
- `npm run lint` — 0 errors, 71 pre-existing warnings.
- `npm run build` — passed; all routes generated successfully.
