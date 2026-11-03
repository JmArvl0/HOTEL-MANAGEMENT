# Comprehensive QA pass — 2026-11-03

**Remediation update:** see [QA fixes](qa-fixes-2026-11-03.md). Local migration
conflicts, font builds, Admin lint and mobile verification are now resolved;
operating-day schema works locally. Hosted rollout and credential rotation remain
pending. The original findings below preserve the audit-time evidence.

**Status: partial acceptance.** Core staff workflows pass on an isolated PostgreSQL
stack, and the current repository test suite passes. The hosted-backed app is not
ready for rollout: the new operating-day read returns HTTP 503, remote migration
history conflicts with the local candidate, and a fresh production build could not
fetch the Google Fonts used by the app.

## Scope and data boundary

This audit covers the current working checkout, the same-day browser and isolated
database QA recorded in the linked reports, and a focused Admin Shell UX pass. The
local application configuration points to hosted Supabase. Although the supplied
records were described in chat as dummy data, the connected project contains
existing account and guest records. This pass therefore did not create, edit,
approve, delete, charge, or otherwise mutate hosted business records. No migration,
deployment, or password change was performed during this pass. Login/session and
failed-login audit activity may still be recorded by the app.

Detailed source evidence for the same-day staff walkthrough and prior role/HTTP QA:

- [Staff walkthrough](staff-walkthrough-2026-11-03.md) — isolated PostgreSQL browser
  workflows and SQL assertions.
- [Backend browser QA](backend-browser-qa-2026-11-03.md) — hosted read-only role and
  HTTP checks.
- [Housekeeping integration audit](housekeeping-integration-2026-11-03.md) — real
  isolated SQL and role-boundary checks.

## Role and workflow coverage

| Role / area | Result | Boundary |
|---|---|---|
| Admin | Sign-in and governance overview/account list passed. Search returned the matching row. Create/edit dialogs showed required-field and reason validation; Escape dismissed the editor. | No save was submitted against hosted accounts, so persisted Admin CRUD is not certified. |
| Manager | Sign-in and operational overview loaded. The operating-day resource request returned HTTP 503 in the current-source preview. | Local isolated workflows passed; hosted operating-day integration did not. |
| Owner | Sign-in, executive overview, financial overview, and local operations oversight passed. | No hosted mutations or approvals performed. |
| Front Desk | Sign-in and read views passed. Local arrival, companion, identity, collection, check-in, room-move, fee, and checkout-block flows passed. | Local synthetic data only for writes. |
| Accounting | A hosted browser QA record reports the supplied password did not authenticate. Another same-day staff walkthrough reports successful login after a separate, explicitly authorized password reset. | Those are different credential states; the password supplied for this pass is not established as current. No password was changed here. |
| Guest | Sign-in, account, rewards, and folio views passed; the API returned only that account's owned stay records. | No booking, payment, reward, or profile mutation performed. |
| Housekeeping / Maintenance | Local cleaning, inspection/reclean, handover, diagnosis, and room-blocking workflows passed. | No credentials for these roles were supplied for hosted login checks. |

The local walkthrough verified staff workflows against real application APIs,
PostgREST, and disposable PostgreSQL with the local migration set. Accounting's
prior-day close created one immutable snapshot, advanced the operating date once,
and preserved the active Maintenance hold and handover. Fee totals and the
reservation's contracted total were checked after reload. These results do not
prove that the currently linked hosted database has the required new RPCs.

## Highest-priority findings

### [P1] Hosted operating-day endpoint returns 503

**Evidence:** During the manager preview, `GET /api/staff/operational-date` returned
503 while the dashboard and the manager overview API returned 200. The route calls
the `hotel_operating_day` RPC. The route intentionally maps unrecognized RPC errors
to 503, so the exact database error was not captured in the browser log.

**Impact:** Staff can see the dashboard but cannot trust or use the operating-day
assessment/activation flow against the linked environment.

**Next action:** Reconcile the remote ledger and live RPC definitions with the local
candidate, then retest against a verified non-production database. Do not infer that
the RPC is missing solely from the 503 and do not push or repair migration history
until the conflicting remote changes are recovered and reviewed.

### [P1] Local migration candidate conflicts with remote migration history

The prior read-only release dry-run recorded remote version `20261103010000` as
`restore_cash_controls` while local uses that version for nightly availability;
remote `20261103030000` is `guest_request_withdrawal` while local uses it for the
operating day. Remote versions `20261103070000` through `20261103120000` were also
absent from the local migration source at that check. This blocks a safe release of
the new operations features and may explain integration failures, but does not by
itself prove the cause of the observed 503.

**Next action:** Recover and review the remote migration source and live function /
table definitions, reconcile behavior, replay the combined history locally, and
only then produce a new dry-run. The prior detailed release notes remain in the
[staff walkthrough](staff-walkthrough-2026-11-03.md).

### [P1, conditional] Shared test credential was disclosed in chat

The same credential was supplied for multiple role accounts. If any of those
accounts authenticate against a live project, treat the shared value as disclosed
and replace it with distinct credentials through the normal secure process. This
pass did not change credentials.

### [P2] Mobile staff navigation consumed workspace width

**Evidence:** At a narrow viewport, the existing built UI translated the sidebar off
screen but kept it in the `.app-shell` flex row, leaving the workspace compressed to
a narrow strip. In this checkout the sidebar is now fixed-position at the existing
mobile breakpoint; the Admin menu has state-aware labels, `aria-expanded` /
`aria-controls`, a dismissible backdrop, and Escape-to-close behavior.

**Verification:** The two focused test files pass (6 tests), TypeScript passes, and
the source contract checks pass. A fresh visual retest could not be completed: the
browser bridge could not reach a loopback-only preview. A network-wide bind was
rejected by the approval review because the app is connected to hosted data. Treat
the source fix as implemented but visually unverified.

### [P2] Availability error can be presented as “no rooms available”

The prior browser QA observed an outage message alongside a “No rooms available”
filter chip when the live availability request failed. This conflates an unknown
result with zero inventory and can mislead guests. Only show the empty-inventory
state after a successful availability response; retain the unavailable state after
a failed request. Source: `app/(booking)/booking/search/page.tsx`.

### [P2] Fresh production build is blocked by font network access

The isolated `npm run build` stopped while Next.js tried to fetch Inter and Playfair
Display from Google Fonts. The environment could not reach `fonts.googleapis.com`.
This is a build-environment blocker; no source compilation failure was established.
An earlier same-day production build passed before the current UI adjustment, but
that is not a fresh build of this exact checkout.

### [P3] Seven existing Admin lint warnings

Focused ESLint completed with **0 errors / 7 warnings** in
`components/admin/admin-dashboard-client.tsx`: three unused icon imports, hook
dependency/state-in-effect notices, and one raw `<img>` warning. They do not come
from the navigation changes and were left unchanged.

## Focused Admin Shell design audit

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 3/4 | Labeled controls, validation, escape handling, and menu state are present; the whole dashboard did not receive a full keyboard/contrast audit. |
| Performance | 3/4 | No new performance issue found; existing hook warnings and raw image use remain. Bundle profiling was not run. |
| Theming | 3/4 | Staff surface uses the documented Haven token/theme layer; no full color-contrast measurement was run. |
| Responsive design | 2/4 | Narrow layout defect was observed and source fix added; visual verification of the updated source remains pending. |
| Implementation integrity | 3/4 | Role-specific shell and design system are coherent; the focused deterministic detector returned no findings for the Admin client. |
| **Total** | **14/20 — Good** | Score is limited to the Admin Shell; it is not a score for every public, guest, or staff screen. |

## Verification results

- `npm run typecheck`: **passed** (including after the final navigation-label change).
- Full Vitest: **203 files / 2,203 tests passed**.
- Focused Admin/mobile tests: **2 files / 6 tests passed**.
- Focused ESLint: **0 errors / 7 warnings**.
- Impeccable detector on `components/admin/admin-dashboard-client.tsx`: **no findings**.
- `git diff --check`: **passed**.
- Fresh isolated production build: **blocked** by Google Fonts network fetch.
- Hosted smoke checks documented in the linked report: **43/43 passed** for the
  checks run, including role boundaries and guest ownership. They were not a full
  browser mutation suite.

## Remaining coverage gaps and next steps

1. Use a disposable Supabase/PostgreSQL project with seeded dummy identities to
   complete persisted create/read/update/approve/delete checks for each role. The
   hosted project is not an acceptable CRUD fixture.
2. Resolve the local/remote migration conflict and retest the operating-day API
   against the reconciled schema.
3. Confirm the current Accounting test credential state in that isolated project;
   do not reuse a shared secret.
4. Retest the staff drawer at phone and tablet widths in a browser that can reach
   the loopback preview, including opening, navigation selection, backdrop close,
   Escape, and workspace width.
5. Correct the public availability error/empty-state distinction.
6. Run the exact production build in a network-enabled environment or make the
   required font assets available locally, then repeat browser smoke checks against
   the deployed app only after release reconciliation.

No hosted business data was mutated, no migration was applied, and no deployment
was performed by this QA pass.
