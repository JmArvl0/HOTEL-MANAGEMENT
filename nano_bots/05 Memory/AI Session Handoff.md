# AI Session Handoff

Current execution state. SYSTEM.md and source/migrations remain authoritative.

## Latest — QA-01–03 fixes (2026-11-03)

User authorized fixing all three QA defects. Fixed locally: stock count baseline
survives refresh until explicit clear/recount; cash form keyed by drawer/actor/role
and blank count blocked; AccountingView wrapped as one ledger grid child.
KI-014–016 resolved. Former expected failures are normal passing regressions.
6 targeted form tests pass (including expanded recount/same-drawer assertions);
typecheck, lint and build pass (two existing dashboard hook warnings).
Full suite: 2,102 pass / existing KI-012 fail. Signed-in Front Desk desktop/mobile
cash layout verified; no business writes or migration/deployment. Screenshots and
follow-up in `docs/HMS-WORKFLOW-QA-2026-11-03.md`.
Session: [[2026-11-03 - HMS QA Fixes]]. Earlier QA section below is historical.

## Latest QA — 2026-11-03

User requested QA and supplied test accounts. Six roles signed in normally;
Front Desk/Accounting/Manager/Guest received focused read-only walkthroughs,
Owner/Admin dashboard smoke only. No business writes through the browser;
credentials were not saved. Housekeeping/Maintenance browser QA remains untested.

QA is **not green**: P1 stock count silently rebases after refresh; P1 cash count
draft survives a drawer-ID switch; P2 cash grid splits AccountingView fragment
siblings and buries count form. No runtime fixes made during this audit.
Two `it.fails` component repros in `hms-qa-regressions.test.tsx` reproduce open
defects; remove expected-failure markers when fixed. See
`docs/HMS-WORKFLOW-QA-2026-11-03.md` and Known Issues KI-014–016.

Fresh typecheck/build/lint pass; 166 targeted passes; real PostgreSQL 19 passes;
configured DB rollback smoke passes; 8 unauthenticated HTTP checks return 401.
Full suite before new repro file: 2,100 passes / existing KI-012 failure.
Owner has no inventory-history UI despite API read permission; prior coverage
wording overstated this. No new migration/deployment. Session:
[[2026-11-03 - HMS Workflow QA]].

## Latest — approved HMS workflow implementation (2026-11-03)

User approved `/prototypes/hms-workflow-preview.html`, requested implementation,
then said continue. Implemented in the local application and configured Supabase.
No Git push or hosted application deployment. Existing unrelated dirty work preserved.
Single agent; no delegation.

- Inventory: shared table/history and issue/count form, protected stock RPC,
  atomic movement/audit, stable retries, shortages and stale-count rejection.
  Housekeeping and direct department completion share source-locked consumption.
  Old best-effort JS/name guessing retired; generic quantity PATCH blocked.
- Cash: strict shared drawer fixes reused; payment/folio/receipt commit together;
  retry-safe forms, blank physical count and explained variance. Only opener or
  Accounting closes. Cash investigation panel is in content, not the header.
- Guest: atomic account/canonical guest save, historical booking names preserved;
  exact uploaded-document review and reservation verification save together.
  Replacement invalidates verification; manual on-site check remains available.
- Requests: own pending withdrawal serializes with approval and assignment;
  new department tasks are created after approval. Untouched unassigned legacy
  work cancelled in place, assigned/started work preserved. Independent handover
  UI/API has department scope, owner/source, filters, acknowledgement/resolution,
  versions and audit, without roster dependency.

## Verified database release

Applied with scoped official CLI `db push`, dry-run first:
`20261103010000`, `20261103030000`, `20261103070000`, `20261103080000`,
`20261103090000`, `20261103100000`, `20261103110000`, `20261103120000`.
Previous live baseline: `20261024130000`. Final live rollback-only smoke passed;
all fictional records rolled back. Preflight found zero negative stock, duplicate
linked profiles, known unresolved legacy supply mappings and open drawers.

Held and unapplied: unrelated `20261024140000`, partial receiving
`20261103020000`, bundled roster/handover `20261103040000`, asset work
`20261103050000`, Lost & Found `20261103060000`. Their earlier local source remains.
Held tables confirmed absent. Do not blindly push root migrations or falsely mark
held versions applied. Bundled `040000` requires rebasing against already-applied
standalone handover before any future rollout. New Inventory avoids held receiving,
new handover avoids roster, Lost & Found navigation is hidden.

## Verification and limitations

- Fresh loopback PostgreSQL: 108 scoped migrations; 19 real SQL scenarios pass,
  including concurrent issues, both cash/close orders and withdrawal/approval race.
- Typecheck and final production build passed (font network access required).
  New workflow/components/routes/tests ESLint clean; dashboard has two existing
  unrelated hook warnings. Latest affected tests 48 passed.
- Full suite: 2,100 pass / 1 existing Windows CRLF-sensitive password-reset SQL
  assertion. Recovery implementation was not changed.
- Actual React components inspected in browser at desktop/tablet/phone using
  isolated fictional API responses. Screenshot `.tmp/hms-stock-component-render.png`.
  This is not signed-in E2E: dashboard redirects to login in the in-app browser.
  Signed-in role walkthrough remains manual; no credentials requested/auth bypass.

Read `docs/HMS-WORKFLOW-IMPLEMENTATION-2026-11-03.md` for exact manifest, evidence,
limitations and scripts. Session: [[2026-11-03 - Approved HMS Workflow Implementation]].
Prototype remains reference only. Ambiguous/unlinked profiles and legacy supply
mappings require explicit resolution, not automatic merge/remap. No historical
stock/cash corrections or external-system integration was performed.

## Other retained context

- Shared sidebar refinements are implemented across staff/Admin/Owner/Guest:
  redundant pills removed, transparent larger logo/icons, 280/80px rails and
  hidden scrollbar chrome with native scrolling preserved. See sidebar sessions.
- Landing proposal V4 remains a separate prototype stream. HMS approval does
  not authorize a landing replacement; preserve existing unrelated landing edits.
- Prior broad role expansion exceeded the clarified HMS-only scope. HR,
  enterprise Financials, Logistics, Facilities and Restaurant are separate,
  currently unintegrated systems. Only the focused hotel workflows were released.
- Older handoff content is preserved verbatim under Memory/Archive as
  [[2026-11-03 - Handoff before approved HMS implementation]]. Consult older
  sessions selectively; historical release claims do not override this state.
