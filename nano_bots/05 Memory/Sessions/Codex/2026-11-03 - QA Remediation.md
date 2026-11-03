# QA remediation — 2026-11-03

Report: `docs/qa/qa-fixes-2026-11-03.md`.

- Confirmed hosted operating-day failure is missing RPC (`PGRST202`). Added safe
  server classification and visible retryable UI failures; polling pauses on error.
- Recovered eight remote migrations verbatim. Renumbered only unpublished hotel
  files to 20261103130000/140000/150000. Linked dry-run lists exactly four pending
  migrations without ledger conflicts; no hosted apply or ledger repair.
- Clean 112-migration replay and real hosted upgrade-order replay both passed;
  all 87 SQL checks/groups passed in both histories. Added `--upgrade-order` to
  the backend harness. Tests expect the recovered remote stock guard's error code
  while retaining rollback/movement/state assertions.
- Bundled official Inter/Playfair fonts and SIL licenses. Production build passes:
  `1pkarVr96xetkX6XpkXS-`. Typecheck passes. Touched-file lint: zero errors/warnings.
  Full Vitest:203 files/2205 tests; final focused:6 files/44 tests. Detector clean.
- Browser on loopback disposable real app:390px/1366px Admin layout, Escape and
  backdrop, additional44px header/menu sizing, dummy create/edit/suspend/reload.
  SQL readback confirmed edited suspended account. Synthetic Accounting login and
  operating-day activation/assessment passed; current-day close stayed blocked.
- Availability-error display was already fixed in the working tree; retained and
  verified its three behavior regressions. Preserved all unrelated changes.
- Vercel whoami confirms logged out. User asked to run vercel login; hosted rollout
  awaits sign-in. Shared hosted credentials need secure user-controlled rotation;
  provider/storage/email sandbox coverage remains open. No credentials in notes.

QA browser signed out and viewport restored. Owned helpers and disposable PG stopped;
test records discarded. Original hosted configuration/port3000 app preserved.
