---
name: haven-qa-testing
description: Comprehensive, evidence-based QA of the Haven Hotel Management System. Use when asked to run QA, test all user roles, verify hotel workflows (reservations, check-in/out, housekeeping, folios, payments, reports), test CRUD, check Gemini AI / QR / analytics features, do responsive UI QA, or run a demo-readiness assessment. Covers automated checks (vitest, tsc, eslint, next build) and manual browser QA when credentials are supplied.
---

# Haven QA Testing

## 1. Purpose and invocation

This skill performs structured, evidence-based QA of the Haven Hotel Management
System (Next.js 16 + Supabase + Vitest, repo root of this skill). It exists so a
QA run is repeatable, safe (read-only toward app code and production data), and
scoped to what the system *actually* contains — discovered from source, not
assumed.

**When to invoke:** any request like "run full QA for all user roles", "test the
booking/check-in/folio workflows", "QA the AI or QR features", "demo-readiness
check", or "run the baseline automated checks".

**How this skill is discovered by the agent:** project-level skills live in
`.opencode/skills/<skill-name>/SKILL.md` and are discovered on **session
startup** in OpenCode. If the skill was created mid-session, start a new
session (or use `/skills` to inspect) before invoking by name.

**Example invocation:**

> Run full QA for all user roles.

## 2. Repository discovery

Do not assume features exist — derive the real system structure first:

- **Roles:** re-derive from `lib/types.ts` (`Role` union) and navigation
  permissions in `config/role-navigation.ts`. Do not hardcode a stale list: at
  the time of writing the roles are `owner`, `admin`, `manager`, `front_desk`,
  `housekeeping`, `maintenance`, `accounting`, `guest` (8 total; no separate
  "Super Administrator" role exists — `owner` is the top role).
- **Routes/be it:** enumerate `app/` Next.js route tree (staff app, customer
  app, API routes) and map each route to its allowed role(s).
- **Database:** read `supabase/migrations/` for actual models, constraints, and
  RLS policies. Migrations are the DB authority.
- **Feature modules:** scan `lib/` for feature implementations and
  co-located `*.test.ts` suites (e.g. folio, refund, housekeeping, loyalty).
- **Test tooling:** inspect `package.json` scripts (`typecheck`, `lint`,
  `test`, `test:watch`, `build`, `dev`, `start`, `set-passwords`). Use only
  scripts that exist; never invent npm script names. **Never run
  `npm run migrate`** — migrations are applied only via `supabase db push` with
  explicit authorization.
- **Existing test coverage:** list the Vitest suites relevant to what you are
  QA-ing before writing or running any test.

## 3. All-role testing

For **every account the user supplies**, one at a time:

1. Authentication: login, session behavior, logout, (OTP flows are enforced —
   see `lib/auth-otp.ts`; never capture or persist OTPs).
2. Navigation: every sidebar/nav item reachable per role matches
   `config/role-navigation.ts`.
3. Access restrictions: attempt known cross-role URLs to verify blocks;
   protected routes must not leak data or crash.
4. API authorization: server responses for cross-role calls must be denied
   (401/403), not silently succeed.

Roles actually present (verify from source at run time): Guest, Front Desk,
Housekeeping, Maintenance, Accounting, Manager, Administrator, Owner
(equivalent of Super Administrator). Test each individually; report any account
you could not test as BLOCKED with the reason (missing credentials, etc.).

## 4. CRUD testing

Per role and module where the feature is implemented:

- Create: valid data, invalid data, validation messages.
- Read: list, search, filters, sorting, pagination.
- Update: edit, persistence after reload.
- Delete / archive: whichever the implementation actually provides (e.g.
  soft-archive vs hard delete — check the code/migration first).
- Edge cases: duplicate submissions, empty states, error handling.
- Do **not** report an unsupported operation as a defect — verify against
  requirements (`SYSTEM.md`) and implementation first; mark NOT APPLICABLE with
  evidence if the system never offered it.

## 5. Hotel workflows

- Reservations and availability (calendar, no double-booking).
- Booking and cancellation (incl. deposit/cancellation policy
  effects — `lib/cancel-reservation.ts`, `lib/deposit*`).
- Check-in / check-out (regular, express, ETA-aware flows).
- Room assignments and physical room mapping.
- Housekeeping queue and task status transitions.
- Folios, invoices, payment status, balances, refunds (PayMongo — see §9).
- Reports (front-desk reports, analytics/dashboard numbers must be derived
  from data, not just render).
- Staff workflows: duty/status, notifications, guest-staff conversion,
  guest requests and reminders.

Trace each workflow end to end (UI action → API/DB effect → persisted result)
before calling it PASS.

## 6. Special system features

- **Google Gemini AI:** `lib/ai/` — concierge, guest services, tools, guard,
  schemas, audit. Verify actual behavior and responses, not just a rendered
  chat panel; check that guard/audit paths behave.
- **QR-based operations:** `qrcode` generation and `jsqr` scanning flows.
  Verify the decoded payload actually maps to a working action/record.
- **Predictive analytics:** `lib/analytics/` (occupancy, dynamic pricing,
  maintenance, inventory, housekeeping predictions). Verify outputs track
  source data; flag stale or fabricated-looking numbers.

A rendered page or a clickable button is NOT proof — verify the data path.

## 7. UI and responsive QA

- Viewports: desktop (~1366×768+ and a large desktop), tablet (~768–1024px),
  mobile ~390px width.
- Check navigation, dashboards, tables (horizontal scroll/expansion), forms,
  modals, focus behavior, responsive overflow, and visual regressions.
- Pay special attention to the staff CSS consolidation — `.app-shell` and
  `.customer-shell` styling (see `app/staff-theme*` and the 2026-10 staff CSS
  rewrite session notes in the vault).
- No headless browser runner exists in this repo (jsdom testing only).
  Browser QA must be manual; report it as BLOCKED/NOT TESTED when no
  credentials or no running dev server are available. Do not fabricate results.

## 8. Automated quality checks

Inspect `package.json` before running anything. Standard baseline order
(only scripts that exist at run time):

1. `npm run typecheck` (tsc --noEmit)
2. `npm run lint` (eslint .)
3. `npm test` (vitest run)
4. `npm run build` (next build) — only after the above are sane; it writes
   `.next/` and can be slow.

Record the exact commands, exit codes, pass/fail totals, and any errors.
If vitest or the build fails, copy the first failing error verbatim. Do not
edit test assertions to make tests pass unless the user separately authorizes
fixes.

## 9. Security and test safety

- Never print or persist passwords, OTPs, tokens, session cookies, or API
  keys to screens, memory files, reports, or logs. Placeholders only.
- Use only authorized test accounts supplied by the user.
- Use disposable records; clean up data you created.
- **Never execute real payments or real refunds** (PayMongo) — use test/sandbox
  paths or simulate at the UI/API level; stop and report if only live payment
  is possible.
- No destructive tests against production. Do not modify production data,
  apply migrations, `supabase db push`, or change auth controls as part of QA.
- DB reads go through the server with service-role key only where the code
  already does so; do not put service-role keys in client code or shell
  commands echoed anywhere.

## 10. Defect reporting

Every confirmed defect gets:

- ID (e.g. `HQA-001`), severity (P0 crash/data-loss, P1 core-flow broken,
  P2 degraded, P3 cosmetic).
- Role + module + workflow.
- Reproduction steps, expected result, actual result, evidence (command
  output, route, DB row shape — never secrets).

Triage vocabulary — use accurately:
- **CONFIRMED** — reproduced with evidence.
- **HYPOTHESIS** — suspected but not reproduced; say what would confirm it.
- **BLOCKED** — could not attempt; state the blocker.
- PASS / FAIL / BLOCKED / NOT TESTED / NOT APPLICABLE per test item.

## 11. Change restrictions

- QA-only runs must **not** change application code unless the user separately
  authorizes fixes.
- Never `git commit`, `push`, `deploy`, `reset`, or `rebase` without explicit
  authorization from the user.
- Preserve unrelated staged, unstaged, untracked, and vault files
  (`nano_bots/`). Do not modify memory/session files as part of QA.

## 12. Final report

End every QA run with:

1. Test totals and results broken down by **role**, **module**, **workflow**,
   and **viewport**.
2. Untested areas with reasons: missing credentials, browser limitations,
   DB-access blockers, features not implemented.
3. An evidence-based **demo-readiness assessment**: which shipped flows are
   demo-safe, which are risky, which must not be shown.
