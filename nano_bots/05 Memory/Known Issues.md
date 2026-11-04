# Known Issues

## KI-021 — Normal refund workflow cannot link a physical cash payout to a drawer

Status: Open (2026-11-04), high operational risk. Real isolated PostgreSQL QA
reproduces `process_refund` saving a paid `manual_refund` payment with NULL
`cash_shift_id`. Refund request/attempt/payment/folio/audit records persist,
but Cash & Shifts cash-out includes only paid refunds linked to that drawer.
If staff actually pay from the drawer, the payout cannot currently be expressed
and may appear as a shortage. Noncash refunds should remain excluded.
Do not auto-attach every refund or rewrite history. Correction needs an explicit
payout method and atomic authorized cash-drawer link. No migration/fix in this QA.
See `docs/qa/cash-shifts-data-flow-qa-2026-11-04.md`, CASH-DATA-01, and
[[2026-11-04 - Cash Shifts Data Flow QA]].

## KI-018 — Physical stock count draft silently rebases on refresh

Status: Resolved (2026-11-03). Count draft now retains its original version through
refresh; explicit clear/recount resets baseline. Normal regression test passes.
Original P1: `stock-integrity-panel.tsx` retains physical count
but substitutes the refreshed item timestamp, allowing the stale count to pass
the server's version guard. Isolated actual-component reproduction in
`hms-qa-regressions.test.tsx` originally used `it.fails`; now asserts the fix.
See `docs/HMS-WORKFLOW-QA-2026-11-03.md`, QA-01 and follow-up.

## KI-019 — Cash count draft survives active drawer replacement

Status: Resolved (2026-11-03). Form is keyed by drawer/actor/role and rejects blank
counts. Same-drawer preservation/new-drawer reset regression passes.
Original P1: `cash-count-panel.tsx` retains the old drawer's
count/note when refreshed props select a new drawer; submission uses the new ID.
Existing authorization still applies. Isolated component reproduction is marked
`it.fails` originally; now a normal passing test. See QA report QA-02 and follow-up.

## KI-020 — Cash split layout fragments the ledger

Status: Resolved (2026-11-03). Ledger wrapped as one grid child; signed-in browser
confirms adjacent desktop columns and mobile stacking without page overflow.
Original P2: AccountingView fragment siblings become separate
children of `.hms-accounting-split`, squeezing the table and placing cash count
far below it. Verified signed in as Front Desk at 1280px. Wrap ledger output as
one grid child; see QA report QA-03 and ignored browser screenshot evidence.

Unresolved bugs, risks, limitations, and technical debt. Resolved issues stay here with
`Status: Resolved` until the next archive pass (move to `04 Archive/Memory/` when navigation
gets cluttered — do not archive aggressively).

## Hotel operations release blocker — remote history changed (2026-11-03)

Status: Resolved (2026-11-03). The recovered/reconciled combined history was
pushed (remote ledger 112 migrations, 0 missing vs local) together with the
matching production deployment; promote and production verification passed and
the maintenance gate is closed. Backup + restore rehearsal preceded the push;
pre-cutover dump retained in `.tmp/qa-rollout`. Open follow-ups (not this
blocker): delete the disabled firewall rule, credential rotation, external
sandbox tests. Details: [[2026-11-03 - Coordinated Production Cutover]].

## KI-001 — Room-type exception repricing policy not business-confirmed

Status: Resolved (2026-09-22) — the business rule arrived and is implemented
Area: [[Check-in & Room Assignment]]

Description:
The technical repricing rule existed (target `base_rate × nights`, balance-due gate — [[D-004]]),
but the hotel had not confirmed whether some exceptions (e.g. compensation upgrades) should
waive the difference.

Resolution:
The 2026-09-22 business rule supersedes it: financial responsibility derives from the
Manager-approved reason code (hotel-caused → hotel absorbs; guest-requested → guest pays with
recorded acceptance; downgrade → flagged, no refund invented). Implemented in migration
`20260922010000`; see [[D-008]] and SYSTEM.md § "Room-type change financial responsibility".

Related:
[[D-004 — Room-type change financial responsibility derives from the approved reason]] · [[D-008]]

---

## KI-002 — `schema.sql` fresh-install snapshot lags the migrations

Status: Open
Area: Setup / database

Description:
`supabase/schema.sql` (the fresh-install snapshot) is missing the last several feature blocks.
`Setup & Commands` still tells readers to run it for a fresh install.

Impact:
A fresh install from `schema.sql` will not match the live schema. Use
`npx supabase db push` against the migration files instead; refresh the snapshot when
convenient.

---

## KI-003 — Live SECURITY DEFINER bodies drift from migration files

Status: Open
Area: Database / RPCs

Description:
Applied `create or replace function` bodies on the remote DB can differ from the migration
files (later migrations or manual fixes).

Impact:
Before recreating an existing RPC, read the live body from the `DIRECT_URL` database first —
editing from the migration file alone can silently drop live behavior (e.g. housekeeping
guest_request inserts needing an assigned room).

Related:
[[D-001 — Migrations are applied with `supabase db push`, never `npm run migrate]]

---

## KI-004 — `npm run test` intermittently fails on a `next.config.mjs` flip

Status: Open
Area: Tests

Description:
`npm run test` occasionally fails because `next.config.mjs` reverts to HEAD mid-run
(known with the room-catalog test).

Impact:
Re-run once before investigating; a single failure of this shape is a flake, not a regression.

---

## KI-005 — No headless browser path for UI verification

Status: Open
Area: Testing / verification

Description:
Real UI verification needs a logged-in user session; there is no headless login path.

Impact:
Use jsdom component tests for logic, and hand the user a manual checklist for visual/flow
verification.

For **CSS/cascade** standards specifically there is a usable substitute: parse the
stylesheets and assert the rule that must not exist (see the wrapper guard in
`components/ui/haven-data-controls.test.tsx`, D-026). This catches "some stylesheet
re-draws the card" but proves nothing about how the page actually looks — it does not
discharge the manual checklist.

---

## KI-006 — Several Level-1 vault docs predate the current system

Status: Open
Area: Documentation (this vault)

Description:
`Overview`, `Roadmap`, `API Routes`, `Data Model`, `Folder Structure`, `Dependencies`, and
`Setup & Commands` describe an early state (single `/dashboard`, demo-mode fallback, "add
tests" as a TODO — the suite is now 49 files / 600 cases). `System Integration`,
`Guest Booking Flow`, `Customer Portal`, `Maintenance Operations`, and the governance notes
are current. `SYSTEM.md` remains authoritative wherever they disagree.

Impact:
Treat the stale notes as historical; do not rely on them for current behavior. Refresh is
queued in [[Next Tasks]].

---

## KI-007 — Pre-existing lint error in `customer-notification-row.tsx`

Status: Open
Area: Lint

Description:
`npm run lint` reports one error, `react-hooks/static-components` ("Cannot create components
during render") at `components/customer/customer-notification-row.tsx:45`, because
`notificationIcon(item.type)` returns a component that the render then mounts. The identical
code is present at HEAD (`git show HEAD:components/customer/customer-notification-row.tsx`), so
this predates the receipt work — it is not a regression.

Impact:
`npm run lint` cannot exit 0 while this stands. The rule wants the type→icon mapping expressed as
a returned element rather than a component reference. Touching it was out of scope for the
receipt task (and the file is being edited by a parallel session).

---

## KI-008 — Notification-history tests red in the shared working tree

Status: Open
Area: Tests

Description:
`npm test` reports 4 failing cases — `lib/notification-display.test.ts` (two `relativeTime`
expectations that disagree with the shipped thresholds: a 5-minute gap is expected to read
"Just now" but the implementation's window is < 60 s, and a 12-hour gap is expected to fall back
to the Manila clock), `components/customer/notification-history-modal.test.tsx`
(`within(today).getByRole("time")` matches three rows — should be `getAllByRole`), and
`components/customer/customer-shell-notifications.test.tsx` (the bell's "Try again" retry state
never appears when the history fetch fails).

Impact:
None for the receipt surface: no receipt module appears in any of those files' import graphs, and
the files were being rewritten during the receipt session by a concurrently active session in the
same working tree (their mtimes advanced without any write from this session). Fix them in the
notification-history stream, not here.

---

## KI-009 — Session callback neutralized every login while the policy migration was unapplied

Status: Resolved (2026-10-09)
Area: Auth / session security

Description:
After the Security Configuration work, `lib/auth.ts` treated a `last_seen_at`
select returning no row as "unknown account" and neutralized the session
(`disabled` + guest + blank id). With `20261009010000` not yet pushed, the
column did not exist, so the select errored on every request and every role —
including System Administrator — fell into a silent login loop
(`/auth/continue` → `/account` → `/login`). Credentials were always accepted;
the session was rejected one step later.

Resolution:
`resolveSessionEnforcement` in `lib/security-policy.ts` separates query error
(fail-open: proves nothing about the account) from a cleanly absent row or an
expired verdict (neutralize); the session callback routes through it, and
`/auth/continue` bounces neutralized sessions straight to `/login`. Both
pending migrations (`20261008010000`, `20261009010000`) were reviewed for order
and compatibility, pushed, and ledger-verified; live probe confirmed the policy
row, the `last_seen_at` column, and an active, recovery-free `admin` account.
The Codex empty-UUID customer guard was unrelated and is unchanged.

Related:
[[D-021]] · `lib/security-policy.test.ts` (decision matrix + surface contracts)

---

## KI-010 — Requested staff conversions are blocked by protected roles or guest history

Status: Partially resolved 2026-09-20 (1/5 converted; 4/5 still blocked, safe refusal, no data corruption)
Area: Account governance / test accounts

Description:
Of the five exact Gmail test accounts requested for staff OTP testing, four own
reservation, hold, and payment history. The one history-free account is assigned
to the protected `admin` role, which a System Administrator cannot grant.

Impact:
All five remain guest accounts. No staff-login or real-email OTP receipt test can
be claimed for them. Converting the four history-bearing accounts would strand
guest business history on current staff identities; converting the history-free
account requires a legitimate authenticated Owner action and subsequent recovery.

Update 2026-09-20: `arvild10.4@gmail.com` was converted guest → `admin`
(Owner-authorized, user-approved, live-verified: inactive + recovery-required,
auth v2, staff mirror, audited). The remaining four are still blocked as
described above; Track B (identity/history model proposal) is the user's
chosen next step.

Safe options:
Use fresh Gmail `+` aliases with `admin_create_staff`; have an authenticated Owner
convert the history-free account through the guarded workflow; or first approve a
separate identity/history model before attempting any history-bearing conversion.
Never detach or rewrite reservations merely to pass the conversion gate.

Related:
[[D-023]] · `supabase/migrations/20261012010000_guest_to_staff_conversion.sql` ·
`supabase/migrations/20261012020000_guest_to_staff_conversion_input_hardening.sql`

---

## KI-011 — The ledger can record a migration whose objects are absent

Status: Resolved for `submit_gateway_deposit` (2026-09-29); the class stays Open
Area: Database / migrations

Description:
`supabase_migrations.schema_migrations` stores version+name only, and `supabase db push`
consults it to decide what to run. If a migration file is edited after its version was
recorded — or applied only in part — the added objects never reach the database, because
that version is never re-run. `20261016010000_express_checkin_and_gateway.sql` was edited
after being recorded this way: `public.submit_gateway_deposit` existed in **no** schema on
the live database while every other object of that file was present.

`20261021010000` already documented the class in a comment ("ledgers that applied an earlier
revision of that file lack it") but guarded only the function's *grants*, so the missing
function stayed missing for four months. Nothing ever drops this function — the restore
reverts no deliberate removal.

Impact:
An RPC defined by an "applied" migration can be absent at runtime. PostgREST answers
`PGRST202` ("Could not find the function … in the schema cache"), which surfaces as whatever
the caller's unmapped-error branch returns — here the generic 500 "Unable to start online
payment.", which is precisely how it went unnoticed. The online-deposit flow had never once
succeeded (PayMongo: zero payments collected, ever).

Detection — read-only, one statement (see `scripts/dbq.mjs`):
`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
p.proname='<fn>'`. Zero means absent, whatever the ledger says. Also compare the ledger's
max version against the highest file in `supabase/migrations/`.

Resolution:
`supabase/migrations/20261024040000_restore_submit_gateway_deposit.sql` re-creates the
function from the canonical body, idempotently, in the re-assertion style of
`20261021010000`. Pushed 2026-09-29 and verified live: `pg_proc` row present, `proacl` =
`{postgres=X/postgres,service_role=X/postgres}` (no public/anon/authenticated), `prosecdef`
true with `search_path=public`, a whitespace-normalized digest of the live `prosrc` matching
the canonical body, and the RPC resolving through PostgREST (`P0001 HOLD_NOT_FOUND`, not
`PGRST202`). The route now logs an RPC failure before mapping it, and `lib/paymongo.test.ts`
pins every guard code the RPC raises to an explicit route mapping.

Related:
[[D-001 — Migrations are applied with `supabase db push`, never `npm run migrate]] ·
KI-002 · KI-003 · `lib/paymongo.test.ts`

---

## KI-012 — `lib/password-reset-audit.test.ts` fails on a CRLF migration file

Status: Open
Area: Tests / line endings

Description:
One case ("replaces `complete_account_recovery` with the selfie-gated overload") asserts a
multi-line source literal containing `\n`:

`complete_account_recovery(\n  p_token_hash text,\n  p_password_hash text,\n  p_selfie_path text)`

The scanned file `supabase/migrations/20261022010000_password_reset_audit.sql` is checked out
with **CRLF** terminators (88 `\r`), so every newline is `\r\n` and the `,\n` sequences never
match. Both the migration and the test are unmodified at HEAD; the failure is environmental,
not a regression.

Impact:
`npm test` cannot exit 0 on a CRLF checkout (1 failing case in the full suite). Unrelated to
any payment or owner work — surfaced during the 2026-10-03 Owner Payment Settings session.

Fix options: normalize the migration to LF, or make the assertion whitespace/line-ending
agnostic (e.g. match on the parameter list with a regex). Prefer the LF normalization if the
repo's other migrations are LF.

Related:
`lib/password-reset-audit.test.ts` · [[2026-10-03 - Owner Payment Method Persist]]

---

## KI-013 — Repeated receipts / folio statements for the same source records (unverified)

Status: Open
Area: Accounting documents

Description:
The Accounting QA pass (2026-10-03) reported what looked like duplicate immutable documents — the
same source payment/folio apparently producing more than one receipt or folio statement. The report
itself **did not count this as a confirmed bug** and asked for product clarification rather than a
code fix, and it named no document numbers, so nothing has been reproduced. No code was changed for
it (BUG-001 in the same report was fixed separately).

Impact:
Unknown until reproduced. If a receipt is genuinely re-issued for one source record, the document
trail is confusing to audit. If a new immutable document per generation is deliberate, the behaviour
is correct and only the listing/traceability needs to say so.

Fix options: none yet — this needs a reproduction (the duplicated document numbers with their
`created_at`, plus the source payment/folio ids) and a product decision on whether re-issuing a
document for the same source record is allowed. [[D-019]] (one canonical customer receipt document;
eligibility mirrors the staff document RPC) is the closest governing decision — check it before
touching generation.

Related:
`lib/customer.ts` (`getCustomerReceipt`) · `lib/receipt-pdf.ts` · `lib/receipt-image.ts` ·
[[D-019]] · [[2026-10-03 - Occupancy Basis Fix]]

## KI-014 — Frontend remediation Phase 1 outcomes need browser verification

Status: Open
Area: [[Frontend / Haven UI]]

2026-11-03 QA added fixed off-canvas positioning plus accessible close/backdrop/
Escape behavior to the staff mobile drawer. Follow-up production-build browser
checks passed at390px/1366px, including44px menu sizing, Escape and backdrop close.
Other checklist items below retain their separate verification requirements. See
`docs/qa/qa-fixes-2026-11-03.md`.

Description:
The audit remediation delivered 2026-10-18 (HUI-011 close re-enable, 9px type
floor across staff/guest sheets, Navigation/Modal dead-code deletions,
AppShell/saas-shell deletion — see docs/qa/frontend-ui-audit.md §11 and
[[D-032]]) is verified by automated gates only. No browser automation exists.
NEEDS BROWSER VERIFICATION:

1. Cash-shift close → count → reconcile happy path as front_desk and accounting.
2. Owner-only sign-out block while a shift is open (dialog → Cash & Shifts).
3. Sidebar mobile drawer at ≤1000px and ≤360px after globals.keep + Navigation
   Sidebar deletion (drawer base lives in globals.css; staff-theme owns desktop).
4. 9px type floor layout shifts in AI/insights/pricing/report microcopy at
   390/768/1366 px.
5. .haven-account-dialog visual parity after Modal.css section deletion (its
   own sheet untouched).

Related: [[D-032]], docs/qa/important-review.md (HUI-005 !important report),
docs/qa/browser-qa-checklist.md (2026-10-18 Phase-1 + Phase-2 manual gate;
its §F gates the HUI-005 wall removal itself).

## KI-015 — Shared profile popover needs browser verification

Status: Open
Area: [[Frontend / Haven UI]]

Description:
The Admin/Owner/Manager account popover (`ProfilePopover`) is covered by jsdom
behaviour + wiring tests (31 targeted, full suite green) but not by a real
browser. VERIFY:

1. Click, Escape, outside press, Tab/arrow keys and focus return to the trigger
   for each staff role; submenu Escape closes only the submenu.
2. Anchor placement at ≤1000px and the ≤480px bottom sheet (not clipped by the
   sticky header, scrolls at 85vh).
3. Dark and light themes: panel/border/text/hover/danger contrast.
4. Settings opens its modal; Sound toggles without closing the panel and
   persists; Sign Out fires once.
5. Guest header unchanged (`.customer-account-popover`).

Related: [[D-033]], [[2026-10-21 - Unified Profile Popover]],
components/ui/ProfilePopover.tsx, components/ui/profile-popover.css.

## KI-016 — Backend fixes await coordinated rollout; PayMongo envelope fix excluded

Status: Implemented locally; rollout pending (2026-11-02)
Area: Backend / security / booking / financial integrity

23 findings are fixed in local app/source and the new migration; B-005 is explicitly
excluded by the user. Results: `docs/qa/backend-remediation-2026-11-02.md`.
Verification: 2106 Vitest tests, 23 PostgreSQL cases, typecheck, touched-backend lint,
and production build pass. The session probe passes; two excluded webhook probes fail.

Linked CLI verified the live ledger (100 matching versions) and current function bodies.
Dry-run lists only `20261102010000_backend_audit_remediation.sql`; it is **not applied**,
and the application is **not deployed**. Roll out together: old JavaScript stock
consumption must not run alongside the new transactional DB trigger. Existing unrelated
frontend work also needs to be accounted for before deploying the checkout.

Related: [[2026-11-02 - Backend Remediation]], [[2026-11-02 - Backend Audit]], [[KI-002]], [[KI-003]].

## KI-017 — Hotel operations candidate conflicts with remote ledger; operating-day API returns 503

Status: Local reconciliation complete; hosted rollout pending (2026-11-03)
Area: Hotel operations / database rollout

Update: read-only hosted diagnosis confirmed missing `hotel_operating_day(p_actor)`
(`PGRST202`). Recovered/restored all eight remote migrations; unpublished hotel
files moved to versions 20261103130000/140000/150000. Linked dry-run now passes.
Clean and actual upgrade-order replays and all 87 SQL checks pass; disposable
browser assessment/activation passes. Vercel CLI is logged out, so hosted app/DB
rollout is still pending. Details: `docs/qa/qa-fixes-2026-11-03.md`.

The local 2026-11-03 candidate conflicts with remote migration names at versions
`20261103010000` and `20261103030000`; the remote ledger also contained versions
`20261103070000` through `20261103120000` that were absent from the local migration
source at the last read-only dry-run. In the hosted-backed Manager preview,
`GET /api/staff/operational-date` returned 503 while the dashboard returned 200.
The route maps unrecognized RPC errors to 503, and its raw database error was not
captured, so the ledger conflict is a risk and correlation rather than a proven
direct cause.

Impact:
Staff cannot rely on operating-day assessment/activation in the linked environment.
The local candidate cannot be safely released until remote source and live object
definitions are recovered and reconciled.

Next action:
Recover/review remote migrations and live function/table definitions, replay the
combined history locally, then rerun a read-only dry-run and operating-day smoke
test in a verified non-production project. Do not repair history or push the
candidate blindly. Details: `docs/qa/comprehensive-qa-2026-11-03.md` and
`docs/qa/staff-walkthrough-2026-11-03.md`.
