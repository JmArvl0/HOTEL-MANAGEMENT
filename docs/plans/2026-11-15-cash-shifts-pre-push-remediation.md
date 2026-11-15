# Cash & Shifts Pre-Push Remediation Implementation Plan

> **For the implementing agent:** Follow `AGENTS.md` in one-agent mode. Read the relevant Next 16 guide in `node_modules/next/dist/docs/` before changing a route. Keep the current uncommitted Cash & Shifts work intact.

**Goal:** Correct the financial report and drawer display issues found in Cash & Shifts QA, clear the production build gate, and repeat the pre-push acceptance checks.

**Architecture:** Classify paid refunds as outflows in the existing server-built daily snapshot, while leaving submitted JSON snapshots immutable. Keep the Current Drawer headline derived from the newest ledger during a count-context refresh, and require a fresh server count basis before saving or closing. Remove unsupported exports from two Next route files; no schema migration or new package is needed.

**Tech stack:** Next.js 16 App Router, React, TypeScript, Supabase/PostgreSQL, Vitest, Playwright and the existing local PostgreSQL QA harness.

**Status:** Implemented and verified locally on 2026-11-15. See the later verification section in [Cash & Shifts pre-push QA](../qa/cash-shifts-pre-push-qa-2026-11-15.md). Concurrent repository activity pushed the shared source in commit `386cd49`; the separately discovered Billing migration repair and this verification record remain local.

---

## Guardrails

- Check `git status` and reread each target before editing. Preserve the uncommitted popover work and unrelated changes; stage only reviewed files later.
- Use fictional records in a fresh loopback-only QA database for financial writes. Configured/hosted data is read-only during verification. Do not run `npm run migrate` or push migrations.
- Keep the stored `cash_shifts` count, variance and existing `front_desk_reports.snapshot` values unchanged. Report submission remains explicit; Close must not submit.
- Treat the two older cash QA scripts as historical until their legacy RPC/UI calls are updated. Use `scripts/cash-findings-qa.mjs` for current SQL behavior.

## Task 1 — Separate collections from refund outflows (KI-022, P1)

**Files:**

- Modify: `lib/front-desk-reports.ts` (`DailyReportSnapshot`, `summarizeDailyActivity`)
- Test: `lib/front-desk-reports.test.ts`
- Read-only reference: `app/api/front-desk/reports/route.ts` (GET preview and POST submission both call the builder)

1. Add a failing aggregation test with one paid ₱2,000 cash collection, one paid ₱250 cash refund, and one paid ₱100.25 GCash refund. Assert `collections.total === 2000`, `collections.count === 1`, `collections.byMethod.cash === 2000`, refund outflow `total === 350.25`, and net receipts `=== 1649.75`. Include a no-refund case, and confirm `buildDailyReport` still queries only `status='paid'`; the pure aggregation input does not carry payment status.
2. Run `npx vitest run lib/front-desk-reports.test.ts`; confirm the refund fixture fails on the current ₱2,350.25 total before changing the builder.
3. In `summarizeDailyActivity`, partition `rows.settledPayments` by `purpose === "refund"`. Compute `collections` only from the other paid rows. Add optional `refunds: { count, total, byMethod }` and `netReceipts` fields to `DailyReportSnapshot`, always populated for newly generated snapshots. Use centavo-safe rounding already used by the module; keep the database read query broad enough to include refund rows.
4. Run the focused test again. Assert the cash drawer calculation stays separate: ₱1,000 float + ₱2,000 collection − ₱250 cash payout = ₱2,750 expected, while the external GCash refund does not alter the drawer.
5. Keep the existing route and submitted-report RPC contract. `GET ?date=` and `POST` must share the corrected builder; no client-supplied financial amount may replace it.

**Acceptance:** New previews and submissions distinguish incoming collections, outgoing refunds and net receipts. Existing stored snapshots are not updated or silently reclassified.

## Task 2 — Render exact money and honest legacy snapshots (KI-024, P2)

**Files:**

- Modify: `components/manager/front-desk-reports-panel.tsx`
- Test: `components/manager/front-desk-reports-print.test.tsx` (extend its snapshot-render coverage)
- Update after verification: `SYSTEM.md` daily-report description and, if labels change materially, `DESIGN.md`

1. Add failing render assertions for ₱100.25 and ₱1,649.75 in preview, submitted snapshot, history summary and print content. Add a fixture for an old stored snapshot with `collections.byPurpose.refund > 0` and no new `refunds` field.
2. Run `npx vitest run components/manager/front-desk-reports-print.test.tsx`; confirm the centavos and legacy-label assertions fail first.
3. Replace the report-only whole-peso formatter (`maximumFractionDigits: 0`) with two-decimal PHP currency formatting for every report money value, including shift variance, method breakdown and history/print summary.
4. For new snapshots, show **Collections received**, **Refunds paid out**, and **Net receipts** in the report breakdown; show cash collection and cash payout separately. Make the preview, Manager review, history and print use the same snapshot presentation.
5. For immutable old snapshots without `refunds`, retain the stored numbers. If `collections.byPurpose.refund > 0`, label the figure **Legacy settled payments (includes refunds)** and explain that a refund amount cannot be reconstructed from that snapshot. If no refund is recorded, retain the normal Collections label. Do not invent a corrected historic total.
6. Rerun component and domain tests; inspect print preview at a page break so the extra rows remain readable. Update `SYSTEM.md` only after the verified behavior ships locally.

**Acceptance:** Centavos are visible throughout; no old snapshot displays a mixed refund total under an unqualified “Collections” or “Cash received” label. Export remains a print/save action, not a submission.

## Task 3 — Keep Current Drawer figures coherent while refreshing (KI-028, P2)

**Files:**

- Modify: `components/manager/cash-count-panel.tsx`
- Test: `components/manager/cash-count-panel.test.tsx`
- Inspect: `components/manager/cash-shifts-workspace.tsx` and `lib/cash-shift-display.ts`

1. Add a failing component test: start with ₱3,000 expected; rerender with a paid ₱250 linked refund and a delayed `/api/accounting/cash-shifts/[id]` context response. Immediately expect the Current Drawer figure to be ₱2,750, with no transient ₱3,000 beside the ₱250 payout. Keep a typed count/note intact during the refresh. Assert save/close stays unavailable until the fresh context arrives.
2. Run `npx vitest run components/manager/cash-count-panel.test.tsx` and confirm the delayed-context case fails on the current implementation.
3. Derive the **displayed** expected amount from the newest ledger (`opening_amount + collected`) whenever the cached count context belongs to an older paid-movement/collected-value fingerprint. Track which activity fingerprint the successful context GET represents; abort/ignore older responses. Use the server context for a fresh count basis and disable Save/Close until it matches the current ledger activity. Preserve existing draft input and the server's stale-basis rejection.
4. Rerun the component test and the focused Cash & Shifts suite. In the isolated browser/database QA, delay the count-context GET after a cash refund and confirm the headline, payout and close controls behave as above; repeat for a same-net movement change.

**Acceptance:** No inconsistent expected/payout figures after refresh, and no close request uses an old count basis. Saved drafts still resume after reload.

## Task 4 — Clear Next route-export build errors

**Files:**

- Modify: `app/api/catalog/transport-vehicle-types/route.ts`
- Modify: `app/api/owner/payment-qr/route.ts`
- Guide: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

1. Confirm with `rg` that `transportVehicleTypeColumns`, `transportVehicleTypeSchema`, and `QR_BUCKET` are used only inside their own route files. Keep each value local to its route by removing `export`; preserve request validation and handler behavior.
2. Run touched-file ESLint, `npm run typecheck`, and the related existing `lib/room-catalog.test.ts` and `components/owner/payment-settings-panel.test.tsx` checks. Those are adjacent behavior coverage; the production build is the definitive route-export check. Do not add a test that merely checks the absence of the `export` keyword.
3. Run an isolated production build on Windows: `$env:HAVEN_BUILD_DIR='.tmp/cash-release-build'; npm run build -- --webpack`. Require exit code 0; compilation alone is insufficient. If Next reveals another route-export error, inspect and fix that exact route before claiming build success.
4. Inspect `git diff -- next-env.d.ts tsconfig.json` after the build and restore only generated type-path edits; preserve any independent changes.

**Acceptance:** Production build and generated route types pass without altering the route responses or permissions.

## Task 5 — Repeat the release gate and prepare the push

1. Run `npm run typecheck`, ESLint on every touched TS/TSX file, focused Vitest for report, count, cash route and print cases, `npm test`, `node scripts/cash-findings-qa.mjs`, and `git diff --check`.
2. Rerun authenticated Front Desk and Accounting browser QA on 1440px, 390px and 320px: open → collect → cash refund → draft → Close → reconcile; verify database read-back, report preview totals and centavos, post-close navigation, and popover no-reflow/no-scroll behavior. Use a fresh disposable database for writes. If configured test credentials remain invalid, document that limit without resetting accounts.
3. Run the isolated Webpack production build again and require exit code 0. Check current configured-database migration status read-only; no migration is expected for these fixes.
4. Refresh [the QA report](../qa/cash-shifts-pre-push-qa-2026-11-15.md), `Known Issues.md` and the session handoff with verified results. Mark KI-022, KI-024 and KI-028 resolved only after their specific repros pass. Review `git status` and the staged diff so ignored QA artifacts, generated type paths and unrelated files are excluded.
5. Prepare reviewable local commit(s). Push only after every financial and build gate passes and the user asks to proceed with the push.

**Push-ready criteria:** refund-inclusive report example yields ₱2,000 collections / ₱350.25 payouts / ₱1,649.75 net; old snapshots are labeled honestly; all money retains centavos; drawer headline is immediately coherent after refund; both cash roles and data destinations pass; full test suite and production build exit successfully.
