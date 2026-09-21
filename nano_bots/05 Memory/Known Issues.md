# Known Issues

Unresolved bugs, risks, limitations, and technical debt. Resolved issues stay here with
`Status: Resolved` until the next archive pass (move to `04 Archive/Memory/` when navigation
gets cluttered — do not archive aggressively).

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
