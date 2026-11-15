# My Stay sandbox completion and release — 2026-11-14

## Completed and verified

User requested finishing local Xendit setup, confirmation and remaining QA/release.
They securely added the existing test key, callback token and HTTPS origin to the
ignored environment file. Validated metadata only; no secrets logged. Local auth
origin now matches127.0.0.1:3000. Used a dedicated synthetic QA guest registered
through the application API, with credentials only in ignored local test storage.

Real local GCash deposit and Maya full checkouts passed amount, selected-wallet,
provider retrieval and same-session retry/one-deposit checks. User completed both
Xendit simulators. Provider and webhook-settled records independently show:

- RSV-0D58789C: GCash paid₱3,840, balance₱8,960, confirmed.
- RSV-C843202B: Maya paid₱12,800, balance₱0, confirmed.

No real money. Both test bookings remain confirmed for inspection. The configured
HTTPS return origin is the existing hosted site, while the checkouts belong to
the dedicated QA account. User returned under another guest and correctly saw
an ownership refusal. Both hosted confirmations opened under the actual QA login.
No access rules were weakened. Added a scoped confirmation404 recovery with a
destination-preserving sign-in action, Front Desk help and no-repeat-payment copy.
Rendered recovery test passes. Account credentials were opened locally, not put
in chat, memory or release source.

Authenticated HTTP smoke passed account, guide, search, requests, help and history.
Ten confirmed-booking production checks passed, including both confirmations,
details, all paid receipts, read-only cancellation previews, wrong-guest404 and
confirmed primary stay. No cancellation or change was submitted. Streamed404
uses an RSC boundary; static HTTP does not prove visible browser rendering.

## Release

Prepared isolated source in `.tmp/my-stay/release` from deployed main6424807.
Commit0f81105d78809a3eeb62a813a8c9bf59377933f9 contains59scoped files: guest
account/forms/search/recovery prerequisites, tests, licensed flag assets and QA
note. Excludes secrets, schema and unrelated breakfast/Fleet/Workforce/finance.
The original working tree and branch were preserved.

Node22 production webpack build/typecheck passed. Focused135/14 plus recovery1
passed. Full release2517pass/4fail across246files. All4failures independently
reproduced on clean deployed main (Owner/Admin sidebar2, PO workspace1, landing
review1). No unrelated test or implementation was weakened to hide them. New
recovery lint and detector clean; whitespace checks passed.

Automatic approval review rejected `git push origin HEAD:main`: the exact direct
main push triggers production deployment and requires explicit authorization.
The user then explicitly answered "Approve push + production deployment".
The same scoped push succeeded (6424807 → 0f81105 on main); Vercel reports
"Deployment has completed" for deployment5L1XQ6G7mEmgVK1mtB9Pz35Hng1x.
The canonical hosted site passed all17 authenticated live HTTP checks: sign-in
and six guest pages, both confirmations/details/paid receipts/read-only cancel
previews, wrong-guest404 recovery boundary and the real confirmed My Stay.
Deployed PH/US phone-picker flags return200 SVG. No further payment or booking
mutation was made. Evidence remains in ignored deployment-status.json,
release-http-qa-results.json and confirmed-http-results.json under .tmp/my-stay.
Live: https://haven-hotel-management-ten.vercel.app/account.
Build also served locally on3180; primary dev remains3000.

## Remaining

Full mobile/dark visual QA is not complete. Browser runtime reports its trusted
service unconfigured even after the user reconnects. Desktop helper previously
stopped on browser URL confidence; latest metadata showed unrelated PBB Live, so
no screenshot or input was attempted. Do not infer visual success from HTTP,
jsdom or user-opened tabs. Records: `docs/qa/my-stay-2026-11-14.md` and the latest
section in `docs/integrations/XENDIT_SANDBOX.md`.
