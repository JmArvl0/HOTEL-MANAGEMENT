# Staff walkthrough — 2026-11-03

Requested staff walkthrough completed against the real app/API/PostgREST/disposable
PostgreSQL stack. Final report: `docs/qa/staff-walkthrough-2026-11-03.md`.

- Verified supplied hosted-backed Admin/Manager/Owner/Front Desk logins. Accounting
  failed once; user explicitly requested its password reset. Reset only that account,
  bumped auth_version and recorded operator_password_reset; browser login then passed.
  Never record the credential. Unlabeled supplied account is guest, not staff.
- Synthetic browser flows passed: party/identity/payment/arrival timing/check-in,
  fee definition/quote/post/unpaid checkout block/payment, room move/checkout/turnover,
  cleaning/failed inspection/reclean/pass, handover history/archive/restore/reopen,
  Maintenance diagnosis/block, Manager/Owner oversight without financial execution,
  Accounting explicit activation/current-day blocker and prior-day atomic close.
- Browser close used a clearly local-only Nov2 fixture while calendar remained Nov3.
  One snapshot survived reload; date advanced once; Maintenance hold/handover remained.
  Read-back asserted one25.50 refresh fee and original contracted total200 unchanged.
- Fixed navigation guard, non-id pagination keys, post-fee modal/readiness refresh,
  in-house remaining-night picker predicate, stale resource response race. Demonstrated
  failing regressions before fixes; final browser retests passed. No test weakening.
- Final Node22:202 files/2201 tests; typecheck/build pass; changed-source lint0errors/
  11warnings. 104-migration replay + backend23/HK27/availability24/operations13 pass.
  Final build Cl_DYGMoO2ijiYDMSMd6C; manifest refreshed. Hosted .env.local unchanged.
- Final release preflight FAILED: remote ledger changed since initial inspection.
  Six missing versions03070000–03120000; collisions at03010000 restore_cash_controls
  and03030000 guest_request_withdrawal. Full versions/names in QA report. No repair,
  production migration, operating activation, operational test write or deployment.
  Production maintenance authorization persists; Vercel logged out. Other sessions'
  applied work must be recovered/reviewed before any candidate renumbering/push.
- DND/stock/concurrency were real SQL checks, not additional browser claims. Storage,
  provider and outbound integrations were disabled in disposable QA. Post-deployment
  production smoke remains distinct. No subagents used.

Temporary helpers/state are ignored in .tmp/staff-walkthrough. Never publish state.json.
QA helpers and isolated PG stopped; owned synthetic DB discarded; browser signed out.
Normal hosted-config local app restored on3000, PID18484. Source manifest71 hashes verified.
The earlier progress report and four-pending-file dry-run are historical, not release
acceptance. See Known Issues and latest handoff for the current blocker.
