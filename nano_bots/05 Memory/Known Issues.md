# Known Issues

Unresolved bugs, risks, limitations, and technical debt. Resolved issues stay here with
`Status: Resolved` until the next archive pass (move to `04 Archive/Memory/` when navigation
gets cluttered — do not archive aggressively).

## KI-001 — Room-type exception repricing policy not business-confirmed

Status: Open
Area: [[Check-in & Room Assignment]]

Description:
The technical repricing rule exists (target `base_rate × nights`, balance-due gate — [[D-004]]),
but the hotel has not confirmed whether some exceptions (e.g. compensation upgrades) should
waive the difference.

Impact:
Do not change reservation pricing in the exception flow without an explicit business decision.

Related:
[[D-004 — Approved room-type exceptions reprice the folio to target base rate × nights]]

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
