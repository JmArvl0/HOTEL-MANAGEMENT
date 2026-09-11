// Roadmap Phase 7 — inventory replenishment, DRAFT-ONLY. Pure draft-PO
// helpers plus source-scan contracts pinning the guarantee the phase is named
// for: a draft means draft — the route can only ever write status 'draft',
// unit costs are re-read server-side, an audit row records creation, and no
// code path submits or sends anything to a vendor.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDraftPurchaseOrder, draftPurchaseTotal, DRAFT_PO_STATUS, suggestedQuantity } from "./purchase-orders";

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

  it("writes status draft only — no other purchase-order status is ever set", () => {
    expect(route).toContain("status: draft.status"); // insert carries the builder's status…
    expect(route).toContain('after_data: { status: "draft"'); // …and the audit row repeats it
    // No transition to any other status anywhere in the route, and no update
    // path that could change a status after the fact.
    expect(route).not.toMatch(/status:\s*"(ordered|submitted|approved|sent|received|cancelled)"/i);
    expect(route).not.toMatch(/purchase_orders"\)\.(update|delete|upsert)/);
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

describe("surface contracts", () => {
  it("the Inventory section renders the advisory strip and a quantity-editable draft dialog", () => {
    const ui = read("components/manager/manager-dashboard-client.tsx");
    expect(ui).toContain("Replenishment suggestions");
    expect(ui).toContain("Create draft PO");
    expect(ui).toContain("defaultValue: suggestion.suggestedQuantity"); // quantity editable, forecast default
    expect(ui).toContain("Nothing was ordered"); // the toast tells the truth
    expect(ui).toContain("Draft only — review before any order");
    expect(ui).toContain("nothing is ordered or sent automatically");
  });
});
