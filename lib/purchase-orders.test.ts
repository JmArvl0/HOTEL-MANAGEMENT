// Roadmap Phase 7 — inventory replenishment, DRAFT-ONLY. Pure draft-PO
// helpers plus source-scan contracts pinning the guarantee the phase is named
// for: a draft means draft — the route can only ever write status 'draft',
// unit costs are re-read server-side, an audit row records creation, and no
// code path submits or sends anything to a vendor.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDraftPurchaseOrder, draftPurchaseTotal, DRAFT_PO_STATUS, suggestedQuantity, resolvePoSubmission, validateReceivedItems, PO_AUTO_APPROVE_THRESHOLD_DEFAULT } from "./purchase-orders";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("draft purchase order helpers", () => {
  it("sums quantity × unit cost, rounded to centavos", () => {
    expect(draftPurchaseTotal([{ itemId: "a", name: "A", quantity: 3, unit: "pcs", unitCost: 12.5 }])).toBe(37.5);
    expect(draftPurchaseTotal([
      { itemId: "a", name: "A", quantity: 2, unit: "pcs", unitCost: 10.333 },
      { itemId: "b", name: "B", quantity: 1, unit: "box", unitCost: 5.001 }
    ])).toBe(25.67); // 20.666 + 5.001 = 25.667 → 25.67
  });

  it("suggests the forecast's recommended reorder, else a sane reorder-point default", () => {
    expect(suggestedQuantity(17.4, 10)).toBe(18); // ceil, never under-order
    expect(suggestedQuantity(null, 10)).toBe(10); // no forecast → reorder point
    expect(suggestedQuantity(0, 0)).toBe(1); // never suggests nothing
  });

  it("builds a draft with status draft and a server-computed total", () => {
    const draft = buildDraftPurchaseOrder({
      items: [{ itemId: "a", name: "A", quantity: 4, unit: "pcs", unitCost: 25 }],
      orderedBy: "staff-1",
      vendorId: "vendor-1",
      note: "Towel shortage forecast"
    });
    expect(draft.status).toBe(DRAFT_PO_STATUS);
    expect(draft.status).toBe("draft");
    expect(draft.total).toBe(100);
    expect(draft.vendorId).toBe("vendor-1");
    expect(draft.orderedBy).toBe("staff-1");
  });

  it("drops zero-quantity lines and refuses a draft with nothing to order", () => {
    const draft = buildDraftPurchaseOrder({
      items: [
        { itemId: "a", name: "A", quantity: 0, unit: "pcs", unitCost: 5 },
        { itemId: "b", name: "B", quantity: 2, unit: "pcs", unitCost: 5 }
      ],
      orderedBy: "staff-1"
    });
    expect(draft.items).toHaveLength(1);
    expect(() => buildDraftPurchaseOrder({ items: [{ itemId: "a", name: "A", quantity: 0, unit: "pcs", unitCost: 5 }], orderedBy: "staff-1" })).toThrow("EMPTY_DRAFT");
  });

  it("rejects negative or non-finite unit costs", () => {
    const items = [{ itemId: "a", name: "A", quantity: 1, unit: "pcs", unitCost: -1 }];
    expect(() => buildDraftPurchaseOrder({ items, orderedBy: "staff-1" })).toThrow("INVALID_UNIT_COST");
  });
});

describe("route contract (app/api/inventory/purchase-orders/route.ts)", () => {
  const route = read("app/api/inventory/purchase-orders/route.ts");

  it("writes status draft on insert — submit/receive/cancel live in their own RPC routes", () => {
    expect(route).toContain("status: draft.status"); // insert carries the builder's status…
    expect(route).toContain('after_data: { status: "draft"'); // …and the audit row repeats it
    // No transition to any other status anywhere in this route file.
    expect(route).not.toMatch(/status:\s*"(ordered|submitted|approved|sent|received|cancelled|pending_approval)"/i);
    // The only update path is the draft-edit branch: draft rows, version-guarded.
    expect(route).toContain('.eq("status", "draft").eq("version"');
  });

  it("never trusts the client: unit cost comes from the inventory rows, total is recomputed", () => {
    expect(route).toContain('from("inventory").select("id,name,unit_cost,unit,vendor_id")');
    expect(route).toContain("buildDraftPurchaseOrder(");
    expect(route).toContain("Number(byId.get(item.itemId)?.unit_cost ?? 0)");
  });

  it("records an audit row and marks the draft as never submitted to a vendor", () => {
    expect(route).toContain('action: "inventory_draft_purchase_order"');
    expect(route).toContain("submittedToVendor: false");
    expect(route).not.toMatch(/resend|sendEmail|fetch\(/i); // no external send of any kind
  });

  it("gates suggestions and creation to manager/owner/admin", () => {
    expect(route).toMatch(/\["manager",\s*"owner",\s*"admin"\]/);
    expect(route).toContain("Draft purchase order access required.");
    expect(route).toContain("Replenishment suggestion access required.");
  });

  it("validates quantities as positive integers and vendors as active", () => {
    expect(route).toMatch(/quantity:\s*z\.number\(\)\.int\(\)\.positive\(\)/);
    expect(route).toContain('vendor?.status === "active"');
  });
});

describe("submission routing + receive validation (pure)", () => {
  it("auto-approves at or below the threshold, files an exception above it", () => {
    expect(PO_AUTO_APPROVE_THRESHOLD_DEFAULT).toBe(50000);
    expect(resolvePoSubmission(50000, 50000)).toBe("approved");
    expect(resolvePoSubmission(49999.99, 50000)).toBe("approved");
    expect(resolvePoSubmission(50000.01, 50000)).toBe("pending_approval");
  });

  it("accepts received <= ordered, refuses over-receipt and negatives", () => {
    const ordered = [{ itemId: "a", name: "A", quantity: 10, unit: "pcs", unitCost: 5 }];
    expect(() => validateReceivedItems(ordered, [{ itemId: "a", quantity: 10 }])).not.toThrow();
    expect(() => validateReceivedItems(ordered, [])).not.toThrow(); // absent = full receipt
    expect(() => validateReceivedItems(ordered, [{ itemId: "a", quantity: 11 }])).toThrow("PO_INVALID_RECEIVED_QTY");
    expect(() => validateReceivedItems(ordered, [{ itemId: "a", quantity: -1 }])).toThrow("PO_INVALID_RECEIVED_QTY");
  });
});

describe("workflow migration (20261014010000_inventory_replenishment_workflow.sql)", () => {
  const migration = read("supabase/migrations/20261014010000_inventory_replenishment_workflow.sql");

  it("extends the status machine and adds lifecycle columns + threshold policy", () => {
    expect(migration).toContain("'draft','pending_approval','approved','received','cancelled'");
    expect(migration).toContain("received_at");
    expect(migration).toContain("received_by");
    expect(migration).toContain("approval_request_id");
    expect(migration).toContain("po_auto_approve_threshold");
    expect(migration).toContain("purchase_order_approval");
  });

  it("receives atomically: approved-only, row lock, inventory increment, restock movement, audit", () => {
    expect(migration).toContain("create or replace function public.inventory_receive_purchase_order");
    expect(migration).toContain("for update");
    expect(migration).toContain("if po.status <> 'approved' then raise exception 'PO_NOT_APPROVED'");
    expect(migration).toContain("update inventory set quantity = coalesce(quantity,0) + rqty");
    expect(migration).toContain("'restock','purchase_order'");
    expect(migration).toContain("'purchase_order_received'");
    expect(migration).toContain("PO_STALE");
  });

  it("submits with server-recomputed totals and files a manager approval above threshold", () => {
    expect(migration).toContain("create or replace function public.submit_purchase_order");
    expect(migration).toContain("select unit_cost into cost from inventory where id = item->>'itemId'");
    expect(migration).toContain("insert into manager_approval_requests");
    expect(migration).toContain("'purchase_order_approval'");
    expect(migration).toContain("'purchase_order_auto_approved'");
  });

  it("locks received orders immutable and revokes public execute", () => {
    expect(migration).toContain("protect_received_po");
    expect(migration).toContain("raise exception 'PO_IMMUTABLE'");
    expect(migration).toContain("actor is null or actor not in("); // null-safe guard rule
    expect(migration).toContain("grant execute on function public.submit_purchase_order");
    expect(migration).toContain("to service_role");
  });
});

describe("action route contracts", () => {
  it("submit/receive/cancel call their RPCs with version guards and mapped errors", () => {
    const actions = read("app/api/inventory/purchase-orders/_actions.ts");
    expect(actions).toContain('rpc("submit_purchase_order"');
    expect(actions).toContain('rpc("inventory_receive_purchase_order"');
    expect(actions).toContain('rpc("cancel_purchase_order"');
    expect(actions).toContain("PO_STALE");
    expect(actions).toContain("PO_NOT_APPROVED");
    expect(actions).toContain("PO_IMMUTABLE");
  });

  it("receive is open to housekeeping; submit/cancel stay manager/owner/admin", () => {
    const actions = read("app/api/inventory/purchase-orders/_actions.ts");
    expect(actions).toMatch(/\["manager",\s*"housekeeping",\s*"owner",\s*"admin"\]/);
    expect(actions).toMatch(/\["manager",\s*"owner",\s*"admin"\]/);
  });

  it("owner/admin review PO exceptions through the dedicated RPC, never the generic review", () => {
    const review = read("app/api/inventory/purchase-orders/approvals/[id]/review/route.ts");
    expect(review).toContain('rpc("review_purchase_order_approval"');
    expect(review).toMatch(/\["owner",\s*"admin"\]/);
    const generic = read("app/api/manager/approvals/[id]/review/route.ts");
    expect(generic).toContain("purchase_order_approval");
    expect(generic).toContain("PO_REVIEW_ELSEWHERE");
  });
});

describe("surface contracts", () => {
  it("the Inventory section renders the advisory strip and a quantity-editable draft dialog", () => {
    const ui = read("components/manager/manager-dashboard-client.tsx");
    expect(ui).toContain("Replenishment suggestions");
    expect(ui).toContain("Create draft PO");
    expect(ui).toContain("defaultValue: suggestion.suggestedQuantity"); // quantity editable, forecast default
    expect(ui).toContain("Nothing was ordered"); // the toast tells the truth
    expect(ui).toContain("nothing is ordered or sent automatically");
  });

  it("the PO workspace offers status filters and the submit/receive/cancel lifecycle", () => {
    const panel = read("components/manager/inventory-replenishment-panel.tsx");
    expect(panel).toContain("pending_approval");
    expect(panel).toContain("Confirm stock restock");
    expect(panel).toContain("Received — immutable");
    expect(panel).toContain("onSubmit");
    expect(panel).toContain("haven-filter-badge");
    const ui = read("components/manager/manager-dashboard-client.tsx");
    expect(ui).toContain("Confirm stock restock");
    expect(ui).toContain("atomically and the order becomes immutable");
  });
});
