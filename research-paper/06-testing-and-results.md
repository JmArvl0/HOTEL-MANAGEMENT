# 6. Testing & Results

## 6.1 Verification performed

| Check | Method | Result |
|---|---|---|
| Type safety | `npm run typecheck` (`tsc --noEmit`, `strict: true`) | Passes clean |
| Production build | `next build` (Turbopack) | Compiled successfully; all 7 routes generated |
| Route generation | build output inspection | `/`, `/login`, `/manager_dashboard`, `/api/*` all present |
| CRUD smoke test | manual, demo mode | All 8 resources list, create, and advance status |
| RBAC | manual | Role-based nav filtering and server-side `canAccess` both function |
| Supabase path | end-to-end wiring review | Schema, migration script, service-role client, bcrypt login wired |
| Theming/responsive | manual | Dark/light toggle persisted; breakpoints at 1000 px / 680 px; print stylesheet |

## 6.2 Build output (as of 2026-08-26)

```
Route (app)
┌ ○ /                                  (static)
├ ○ /_not-found                        (static)
├ ƒ /api/auth/[...nextauth]            (dynamic)
├ ƒ /api/manager_dashboard             (dynamic)
├ ƒ /api/resources/[resource]          (dynamic)
├ ○ /login                             (static)
└ ƒ /manager_dashboard                 (dynamic)
```

## 6.3 Known limitations

Documented exhaustively in [`../SYSTEM.md`](../SYSTEM.md) §11; summarised by category:

- **Security**: hardcoded demo accounts reachable in production builds; no input
  validation (zod installed but unused); no row-level scoping (any guest reads all
  reservations/invoices); read/write share one permission grant; no login rate limiting;
  no audit logging.
- **Domain logic**: no reservation availability check (double-booking possible); no
  public booking flow; room status changes are manual and unlinked from reservations;
  `payments` table unused; flat pricing only; UTC-based "today" for a Manila property.
- **Integrity**: status cycling is not a guarded state machine; last-write-wins
  concurrency; denormalised names unreconciled; demo/schema ID prefix mismatch
  (`INVTRY-` vs `ITM-`).
- **Performance**: unbounded `select *`; aggregation in JS over full dumps; nothing
  cached or paginated.
- **UX/a11y**: silent fetch failures; modal lacks ARIA/focus trap; mojibake in some UI
  strings; no edit/delete/detail views.
- **Engineering hygiene**: zero tests/CI; dashboard is a single 21 KB client component;
  permission logic duplicated client/server.

## 6.4 Discussion

Verification confirms the system meets its stated objectives (§1.3) for the
demonstration and evaluation context: it boots without configuration, enforces
role-appropriate access at the API boundary, and operates identically across both data
modes. The limitations above are concentrated at the production-hardening frontier —
validation, scoping, availability constraints, and payment workflow — and constitute
the recommended future work rather than defects in the demonstrated design.
