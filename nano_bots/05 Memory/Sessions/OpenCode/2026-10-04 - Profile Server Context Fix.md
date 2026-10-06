# 2026-10-04 - Profile Server Context Fix

## Bug
Clicking any profile entry point (header account menu → My Profile, Cmd+K, direct URL) crashed `/account/profile` for every guest with `React Context is unavailable in Server Components` (Next 16.3.2).

## Root cause
`app/(booking)/(customer)/account/profile/page.tsx` — an async Server Component — directly imported and rendered `SessionProvider` from `next-auth/react`. That package's compiled output has no `"use client"` directive and executes `createContext`, so the context code ran in the server bundle. Structural, not data-dependent → 100% reproducible for all users. Verified it was the only server file importing `next-auth/react`; all other hook/context users already carry `"use client"`, and staff `profile-menu-btn` popovers are local `useState` (unaffected).

## Fix (3 files, no new modules)
- `components/account/account-forms.tsx` (already `"use client"`): new `ProfileWithSession({ session, defaults })` export wrapping `ProfileForm` in `SessionProvider`.
- `app/(booking)/(customer)/account/profile/page.tsx`: pure server again — no `next-auth/react` import, renders `<ProfileWithSession>`.
- `lib/client-fetch-resilience.test.ts`: the old assertion pinned the buggy pattern; now asserts the page has no `next-auth/react` import and the provider lives in the client boundary. New test failed before the fix, passes after.

## Verification
`typecheck` clean, eslint clean on touched files, targeted 9/9, full suite **182 files / 2034 tests pass**, `npm run build` all routes compiled. No migration, no db push. Manual guest browser QA of My Profile pending (KI-005). Not committed (user didn't request).
