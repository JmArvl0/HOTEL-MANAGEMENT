// Roadmap Phase 7 — inventory replenishment assistance, DRAFT-ONLY.
//
// A forecast shortage (lib/analytics/inventory.ts) suggests a reorder; a
// Manager/Owner/Admin turns it into a DRAFT purchase order that a human
// reviews. A draft is a draft: nothing is ever submitted, sent, e-mailed, or
// ordered externally by this system, and no purchase-order status other than
// "draft" is writable from here. Quantities and vendors stay editable by
// design — the forecast suggests, people decide.

export interface DraftPurchaseItem {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface DraftPurchaseOrder {
  items: DraftPurchaseItem[];
  vendorId: string | null;
  orderedBy: string;
  /** Always "draft" — the only status this module can ever write. */
  status: "draft";
  total: number;
  note?: string;
}

export const DRAFT_PO_STATUS = "draft" as const;

/** Σ quantity × unit cost, rounded to centavos — never trusted from the client. */
export function draftPurchaseTotal(items: DraftPurchaseItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) * 100) / 100;
}

/** A suggested reorder quantity from the forecast, or a sane editable default. */
export function suggestedQuantity(recommendedReorder: number | null, reorderPoint: number): number {
  const recommended = Number(recommendedReorder ?? 0);
  if (recommended > 0) return Math.ceil(recommended);
  return Math.max(1, Math.ceil(reorderPoint));
}

export function buildDraftPurchaseOrder(input: { items: DraftPurchaseItem[]; vendorId?: string | null; orderedBy: string; note?: string }): DraftPurchaseOrder {
  const items = input.items.filter((item) => item.quantity > 0);
  if (items.length === 0) throw new Error("EMPTY_DRAFT");
  if (input.items.some((item) => !(item.unitCost >= 0) || !Number.isFinite(item.unitCost))) throw new Error("INVALID_UNIT_COST");
  return {
    items,
    vendorId: input.vendorId ?? null,
    orderedBy: input.orderedBy,
    status: DRAFT_PO_STATUS,
    total: draftPurchaseTotal(items),
    note: input.note
  };
}
