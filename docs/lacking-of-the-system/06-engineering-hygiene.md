# 06 — Engineering Hygiene

All references verified 2026-08-26.

## 6.1 Zero tests, no CI, no lint pipeline

- **Where:** Repository root — no test runner, no `.github/workflows`, `package.json` has no lint
  script wired into any gate. `npm run typecheck` is the only check and is run manually.
- **What is lacking:** Nothing prevents a regression from landing. The auth matrix, availability
  logic (once it exists), and money math are exactly the code that needs tests first.

## 6.2 The dashboard is one monolithic client component

- **Where:** `components/manager/manager-dashboard-client.tsx` — ~21 KB, nav + 8 tables + modal +
  charts + theme toggle in one file.
- **What is lacking:** No per-route code splitting, no server components below `/manager_dashboard`,
  no separation between the (genuinely reusable) declarative `config` and the imperative shell.

## 6.3 Permission logic duplicated client and server

- **Where:** Server truth in `lib/permissions.ts:3-12`; a second hand-copied matrix for nav
  visibility in `components/manager/manager-dashboard-client.tsx:28`.
- **What is lacking:** The two can drift silently; the client copy hides nav items but the server
  matrix decides what actually works — or vice versa after an edit to only one side.

## 6.4 No middleware

- **Where:** No `middleware.ts` exists; each route re-derives its own session check
  (e.g. `app/(manager)/manager_dashboard/page.tsx`).
- **What is lacking:** Route protection is opt-in per file. One forgotten check = open route. A
  single matcher-based session gate would make protection structural.

## 6.5 No structured logging or observability

- **Where:** Bare `catch {}` blocks swallow the Supabase/Postgres cause at
  `app/api/resources/[resource]/route.ts:22,30,41`.
- **What is lacking:** Errors are collapsed into four generic strings; nothing is logged, so
  production failures are undebuggable from the deployed artifact.

## 6.6 Untested migration path & undocumented env

- **Where:** `scripts/migrate.mjs` parses `DIRECT_URL` out of `.env.local`; `.env.example` does not
  document it.
- **What is lacking:** The schema-application step relies on a variable that isn't documented
  anywhere a new developer would look.

## 6.7 Uncommitted reorganisation

- **Where:** As of 2026-08-26 the working tree carries uncommitted changes: route-group
  reorganisation (`(landing-page)`, `(auth)`, `(manager)`), `manager_dashboard` naming,
  `components/manager/`, plus untracked `components/rooms-browser.tsx` and modified
  `app/globals.css`.
- **What is lacking:** The structure `SYSTEM.md` documents exists only as uncommitted diff; a fresh
  clone would get the pre-reorganisation layout.

## 6.8 Dense one-line style with no formatting gate

- **Where:** Whole codebase (e.g. a 61-line file at 21 KB); no Prettier/EditorConfig enforcement.
- **What is lacking:** Nothing prevents encoding corruption (see 05-ux-and-accessibility.md §5.5) or
  merge-diff noise; readability depends entirely on author discipline.
