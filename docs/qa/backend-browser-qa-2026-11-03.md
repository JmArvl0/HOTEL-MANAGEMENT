# Backend browser QA — 2026-11-03

Status: **hosted Supabase restored; five roles verified in the browser; 43/43 HTTP smoke checks passed. Full mutation-flow verification remains incomplete.**

Tested the current checkout with Next.js development server at `http://localhost:3000` in Brave. Backend remediation is present in commit `5d43490`. At the user's request, the ignored `.env.local` was restored from stopped local Supabase to the already linked hosted Supabase project. Existing project API keys were retrieved privately through the authenticated Supabase CLI and placed only in that ignored environment file. Stale local `DATABASE_URL` / `DIRECT_URL` entries were removed; other app settings were preserved. No credentials were printed or copied into reports, and no account passwords were changed.

## Actual browser verification after restoring hosted Supabase

| Role | Result | Views checked |
|---|---|---|
| Admin | Login passed | Governance overview and live account/room summary |
| Manager | Login passed | Operational overview; Predictive Insights loaded live forecast data |
| Owner | Login passed | Executive overview and Financial Overview loaded authoritative ledger data |
| Front Desk | Login passed | Operational overview; Cash & Shifts loaded history and correctly showed no open shift |
| Accounting | Login rejected | Read-only diagnosis: account exists, active, no recovery requirement; supplied password does not match |
| Guest | Login passed | Account overview, Rewards and points ledger, Payments & Folio with seven stay records |

The landing page showed live room types again after restoring the connection. No booking, cancellation, payment, cash-shift opening/closing, stock consumption, reward redemption, policy change, or analytics-generation action was executed against hosted records. Ordinary login/session activity can update account activity and failed-login audit records.

Browser use then reported **“Local browser use is disabled in Work settings.”** Further clicks were stopped. Guest folio pagination beyond the first visible page, remaining visual checks, and browser confirmation of availability were not completed. No alternative browser automation was used to bypass this setting.

## HTTP checks after browser access was disabled

**43/43 checks passed** against the running local app connected to hosted Supabase. These are HTTP checks, not browser interaction coverage. A credential-free result summary is stored in the ignored `.tmp/backend-browser-qa/http-results.json`.

- Admin, Manager, Owner, Front Desk and Guest login/session roles were correct.
- Reading session status twice did not extend its expiry for each tested role. This does not simulate the full absolute-session lifetime.
- Generic reservation PATCH was rejected with `403` for all five tested roles, using a nonexistent synthetic ID.
- Owner financial, Accounting ledger, and cash-shift read boundaries matched the role capability rules.
- Guest reservation/invoice/loyalty reads succeeded; all-payments and operational-dashboard APIs were denied.
- The seven reservations returned to the guest exactly matched that account's owned database rows.
- Guest reservations, payments, rewards and room-search pages returned successful responses; public room catalogue and availability no longer returned the database-unavailable fallback.
- Direct guest access to the staff page returned a Next.js streamed HTML redirect to `/account`, with no staff dashboard content. An initial assertion expected only a 3xx response and was corrected after checking the actual redirect markup and separate `403` API boundary.

## Initial offline checks (before the configuration was restored)

- Public landing renders and shows an explicit room-catalog unavailable message when the database cannot be reached.
- Room-search navigation works. Submitting the default valid dates updates the search URL and renders an explicit live-availability unavailable message.
- Selecting My account while signed out redirects to `/login`.
- Login form renders; a synthetic nonexistent account is rejected without creating an authenticated session.
- One attempt with the supplied administrator account remained signed out while the configured database was offline. After restoring hosted Supabase, that account signed in successfully.
- Actual HTTP checks against the running local app: session GET returns `200 {}`; session-status GET, cash-shifts GET, analytics-generate POST, and `/api/resources/reservations` PATCH each return `401` when anonymous.

An initial probe used a nonexistent reservation URL with an ID suffix and returned 404; the actual resource endpoint above was then verified separately.

## Infrastructure and pending rollout

Initially the app pointed to `http://127.0.0.1:54321`, whose REST endpoint refused connections. Docker Desktop startup failed initializing its Inference manager / `dockerInference` listener. The user then requested returning to hosted Supabase, which was completed and verified by a database read and successful browser logins. **The app no longer depends on the local Docker database.** Docker was not uninstalled or reset, and its data was not deleted.

The complete authenticated-session lifetime, booking/room assignment, OTP/recovery, proof lifecycle, loyalty writes, cash handling cycle, stock fulfillment, notification durability and analytics-generation writes remain **unverified through the browser**. Earlier automated and isolated PostgreSQL results are documented separately; they are not browser coverage.

A fresh linked-remote `supabase db push --linked --dry-run --skip-vault` still lists only `20261102010000_backend_audit_remediation.sql` as pending. No migration or app deployment was performed. Successful login/read checks do not prove the new RPC/trigger contracts are deployed. The coordinated rollout requirements in `docs/qa/backend-remediation-2026-11-02.md` still apply, especially avoiding simultaneous old JavaScript and new trigger-based inventory deductions.

## Additional observation

With the availability backend offline, room search displays both “Live availability is temporarily unavailable” and a filter chip saying “No rooms available for these dates.” The latter treats an unsuccessful lookup as zero availability. Source: `app/(booking)/booking/search/page.tsx:116`. This UI issue was recorded without changing source during verification.

## Resume

Use the local Next.js app with its restored hosted Supabase configuration. Re-enable browser use in Work settings for remaining visual checks, use valid Accounting credentials, and coordinate the pending application/database rollout before testing the new operational writes in a controlled environment. Keep B-005 PayMongo envelope parsing excluded. Credentials supplied in chat were not copied into this report or memory notes.
