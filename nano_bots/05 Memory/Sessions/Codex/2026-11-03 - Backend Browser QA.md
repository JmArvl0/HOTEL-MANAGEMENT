# Backend Browser QA — 2026-11-03

User requested browser verification of the backend remediation, confirmed the local app target, and supplied six role accounts. Credentials were not saved in repository files or memory.

- Started the local Next.js dev server and checked actual Brave navigation: landing, booking search, account-to-login redirect, failed login behavior.
- Anonymous HTTP checks: empty session 200; session status, cash shifts, analytics generation, protected reservation PATCH all 401.
- Initial local Supabase REST/PostgreSQL were offline; Docker Desktop startup failed on its Inference manager / `dockerInference` listener. No reset or Docker configuration changes performed.
- User requested returning the local app to hosted Supabase. Restored the existing linked project's API configuration in ignored `.env.local`, removed stale local direct database URLs, verified database read and restarted the app. Keys were handled privately; Docker was not uninstalled or its data deleted.
- Actual Brave login/view checks passed for Admin, Manager, Owner, Front Desk and Guest. Inspected overview, forecasts, financial overview/cash history, guest rewards and folios. Accounting account is active without recovery requirement, but supplied password mismatches; no reset performed.
- Browser access then reported disabled in Work settings. Stopped further clicks and continued HTTP testing: 43/43 checks passed for authenticated role/session reads, reservation PATCH denial, financial permissions, guest ownership, and public/guest availability. Result summary contains no credentials in ignored `.tmp/backend-browser-qa/http-results.json`.
- An initial guest staff-page assertion expected a 3xx status; inspected the actual Next.js streamed meta redirect and separate 403 API guard, then corrected the assertion. No access leak found.
- Fresh remote migration dry-run still lists only the remediation migration; no DB push/deployment/operational-write testing. Normal login activity and failed-login audit writes can occur.
- Found contradictory no-availability chip during failed lookup; recorded, no source fix in this QA.
- Source remediation is now committed (`5d43490`) by subsequent workspace activity; earlier no-commit notes are historical.

Details: `docs/qa/backend-browser-qa-2026-11-03.md`. Prior automated verification remains in `docs/qa/backend-remediation-2026-11-02.md` and is not browser coverage.
