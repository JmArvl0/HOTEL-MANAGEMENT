# 2026-11-20 — Lost & Found port to main

Ported the custody register, status counters, filters, role actions, and
responsive item detail from `1880a93` onto `main` at `2a10620`. The port keeps the
existing shared staff error handling and the existing API and custody RPCs.
Browser QA caught a sequential prompt closing the release confirmation. Release
and disposition now use one form that requires a note and explicit confirmation.
The shared form displays the validation error under the checkbox. The narrow
register returns to the queue if an action removes the item from the filter.

The isolated Windows production build was exercised in Edge with real NextAuth
sessions, PostgREST, and disposable PostgreSQL. The existing 149 migrations
replayed locally. Eight checks covered Housekeeping record/secure and claim-note
privacy, Front Desk claim and verified release, Manager authorization, decline and
disposition, custody transfers, Accounting denial, and mobile navigation. SQL
readback matched all five events and audit entries for the released item. Desktop
1440px and mobile 390px/320px were checked.

Typecheck, the Webpack production build, 47 focused tests, and the full Vitest
suite (268 files, 2,660 tests) passed. Scoped ESLint had zero errors and six
existing warnings in the shared form. The test database was stopped. Browser
captures and the loopback QA scripts are in `.tmp/lost-found-port-qa/`.

The port includes no new migrations. The branch's migration conflicts and
hosted deployment are separate work.
