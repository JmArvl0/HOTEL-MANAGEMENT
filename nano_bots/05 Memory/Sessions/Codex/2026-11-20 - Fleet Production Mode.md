# Fleet production mode

Haven commit `5e51dd6` supports `HAVEN_FLEET_MODE=production` through the
existing dispatch, callback, photo and tracking adapter. The Staff Pickup & Fleet
panel shows which configured mode is active. Production requires HTTPS and its
own distinct outbound, callback and photo credentials. There is no schema change.

Fleet public main was `3cf85b5` when checked. The published source supports its
Haven-specific hosted switch on the existing Fleet deployment. Its current
callback settings retain the `HAVEN_STAGING_API_URL` and
`HAVEN_STAGING_API_KEY` names. The Fleet fare API requires a completed trip and
an authorized Fleet operator. Keep the Haven QA pickup stay open until the fare
is posted. See `docs/integrations/HAVEN_FLEET_PREPARATION.md` for the setting map.

Typecheck, scoped ESLint, isolated production build and 2,669 Vitest tests
passed. Authenticated Edge with a local production build, disposable PostgreSQL
and a synthetic TLS Fleet endpoint verified dispatch, separate callback/photo
keys, trip completion, and final fare evidence. Front Desk confirmation and
both exact retries left one PHP 321.23 line and a PHP 521.23 folio balance.
The guest view showed the line once. No hosted trip or charge was created.
Local evidence is under `.tmp/fleet-production-mode`.

GitHub main fast-forwarded to `5e51dd6`. Vercel marked Production successful at
12:00 Manila time. Production login returned 200 and signed-out transport
routes returned 401. The separate Supabase Preview check failed. The hosted
ledger still has 154 migrations through `20261120030000`.

Fleet health returned 200. Haven's deployed callback and photo endpoints
returned 503, and the hosted ledger had zero Fleet dispatch attempts or
applied fare events. The partner test remains blocked on hosted credentials
and a coordinated QA pickup. No new production migration or secret change
was required to ship the application code.
