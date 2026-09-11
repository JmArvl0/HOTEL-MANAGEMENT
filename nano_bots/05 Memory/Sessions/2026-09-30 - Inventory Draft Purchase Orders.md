# Inventory Draft Purchase Orders (Roadmap Phase 7)

**Date:** 2026-09-30
**Scope:** Post-audit roadmap Phase 7 — inventory replenishment **assistance, DRAFT-ONLY**.
Predicted shortage → suggested reorder → **draft** purchase order → human review. Nothing is
ever submitted, sent, or ordered externally. No migration (existing `purchase_orders` +
`vendors` tables reused; both were empty with RLS on and service-role INSERT verified first).

## What was built

- **`lib/purchase-orders.ts`** (pure): `buildDraftPurchaseOrder` — its `DraftPurchaseOrder`
  interface types `status` as the literal `"draft"` (`DRAFT_PO_STATUS`), so the builder
  *cannot* produce any other status; filters zero-quantity lines, throws `EMPTY_DRAFT` /
  `INVALID_UNIT_COST`; `draftPurchaseTotal` (Σ qty × cost, centavos rounding);
  `suggestedQuantity` (forecast's `recommendedReorder` → ceil, else the reorder point, min 1 —
  never suggests nothing).
- **Route `GET/POST /api/inventory/purchase-orders`** (manager/owner/admin):
  - **GET** runs the same `forecastInventory` (3-day horizon) that Predictive Insights uses,
    filtered to projected shortages **plus** `current-low-stock` items without movement
    history (facts, not predictions); unit costs come from a second narrow read of the live
    inventory rows; also returns the last 50 purchase orders (read-only) and active vendors.
  - **POST** accepts items (positive-int quantities), optional vendor, optional note. Unit
    cost, name, and unit are **re-read from the inventory rows server-side** — the client
    payload only says *what* to order and *how many*; a missing item is a 409, an inactive
    vendor is a 409; the total is recomputed; the insert writes `status: draft.status` (always
    `'draft'`); an `audit_logs` row (`inventory_draft_purchase_order`,
    `after_data.submittedToVendor: false`) records the creation. **No update / submit / send
    path exists anywhere in the route.**
- **UI** (Manager dashboard, Inventory section — manager/owner/admin): a "Replenishment
  suggestions" strip (TrendingUp; each card: current stock · reorder point · predicted 3-day
  need · shortage · suggested quantity · estimated total, or "unit cost not set") with
  **"Create draft PO"** opening a dialog where **quantity and vendor are staff-editable**
  (default = the suggested quantity, "No vendor yet" allowed, free-text note). The toast tells
  the truth: "Draft purchase order created (₱…) — awaiting Manager review. **Nothing was
  ordered.**" Existing drafts render read-only beneath the strip
  ("Draft only — review before any order").

## Decisions / notes

- **Draft means draft, enforced by the type system, not convention.** The builder's return
  type can only carry `"draft"`; the route's insert uses `draft.status`; a source-scan test
  additionally asserts no other status literal and no `purchase_orders` update/delete/upsert
  anywhere in the route. Escalating a draft to a real order stays a human, out-of-system act.
- Reused `purchase_orders`/`vendors` exactly as the roadmap required — the tables were already
  the designed supply-chain interface (SYSTEM.md §9), RLS on, service-role INSERT confirmed
  live before writing any code.
- Suggestions deliberately include `current-low-stock` items without movement history: those
  are facts (stock < reorder point), not forecasts — the strip's per-card `riskBasis` keeps the
  distinction visible.
- No fake vendor or PO data seeded — `vendors` starts empty, the dialog offers "No vendor yet",
  and the vendor select simply lists whatever active vendors exist.

## Verification

- `npx vitest run lib/purchase-orders.test.ts` — 11/11.
- Full gates: typecheck ✓, lint 0 errors (72 warnings pre-existing), `npm test` **946/946**
  (11 new), `npm run build` ✓.
- No migration, no RPC changes — nothing to live-verify in the DB beyond the pre-implementation
  column/permission probes.

## Affected files

- `lib/purchase-orders.ts` (new), `lib/purchase-orders.test.ts` (new)
- `app/api/inventory/purchase-orders/route.ts` (new)
- `components/manager/manager-dashboard-client.tsx` (ReplenishmentSuggestion type,
  replenishment state + fetch, `createDraftPo` dialog, ResourceView strips)
- `SYSTEM.md` (§7.15 new section, §9 purchase_orders row, §11 API line, route count 102,
  §15 replenishment note)
- `Current Status.md`, this note

## Unresolved / next

- Phase 8 — preventive maintenance foundation: `maintenance_assets` table (generated
  `next_service_date`), register/record-service/update/deactivate RPCs, due-window card group;
  staff register real assets, no fake data; predictive risk never auto-blocks a room. Migration
  number must be re-verified (local files AND remote ledger; expected next free after
  `20260931010000`).
- Manual UI verification pending: Inventory section suggestions strip + draft dialog (needs
  Manager/Owner login; forecast needs movement history to produce predictions, so a demo run
  will show `current-low-stock` items at most).
