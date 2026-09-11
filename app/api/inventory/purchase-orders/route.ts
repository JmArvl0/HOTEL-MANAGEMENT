import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { forecastInventory } from "@/lib/analytics/inventory";
import { getAnalyticsInputs } from "@/lib/analytics/data";
import { buildDraftPurchaseOrder, suggestedQuantity, type DraftPurchaseItem } from "@/lib/purchase-orders";
import type { Role } from "@/lib/types";

// Roadmap Phase 7 — inventory replenishment assistance, DRAFT-ONLY.
// GET returns the forecast shortage suggestions (predicted 3-day consumption
// vs stock) plus the existing draft purchase orders, read-only. POST creates a
// DRAFT purchase order from a suggestion (Manager/Owner/Admin). "Draft means
// draft": the row is written with status 'draft' (the table default), nothing
// is submitted or sent to any vendor, and this route can never write any
// other status. Quantity and vendor are staff-editable inputs; unit cost is
// re-read from the inventory row server-side (never trusted from the client);
// the total is recomputed. An audit_logs row records the draft's creation.

const DRAFT_PO_ROLES: Role[] = ["manager", "owner", "admin"];

/** Shortage suggestions from the same forecast the Predictive Insights panel uses. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DRAFT_PO_ROLES.includes(session.user.role as Role)) return NextResponse.json({ error: "Replenishment suggestion access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const inputs = await getAnalyticsInputs();
    const forecast = forecastInventory({ items: inputs.inventoryItems, movements: inputs.movements, today: inputs.today });
    // Suggest reorders for predicted shortages (and current out-of-stock items
    // without history — those are facts, not predictions). Unit cost comes from
    // the live inventory rows via a second narrow read.
    const shortageIds = forecast.items
      .filter((item) => (item.projectedShortage ?? 0) > 0 || item.riskBasis === "current-low-stock")
      .map((item) => item.itemId);
    const [costResult, ordersResult, vendorResult] = await Promise.all([
      shortageIds.length ? supabase.from("inventory").select("id,unit_cost,vendor_id").in("id", shortageIds) : Promise.resolve({ data: [] as { id: string; unit_cost: number | null; vendor_id: string | null }[], error: null as null }),
      supabase.from("purchase_orders").select("id,vendor_id,status,total,items,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("vendors").select("id,name").eq("status", "active").order("name")
    ]);
    if (costResult.error || ordersResult.error || vendorResult.error) throw costResult.error ?? ordersResult.error ?? vendorResult.error;
    const costs = new Map((costResult.data ?? []).map((row) => [String(row.id), row]));
    const suggestions = forecast.items
      .filter((item) => (item.projectedShortage ?? 0) > 0 || item.riskBasis === "current-low-stock")
      .map((item) => {
        const cost = costs.get(item.itemId);
        return {
          itemId: item.itemId,
          name: item.name,
          unit: item.unit,
          currentStock: item.currentStock,
          reorderPoint: item.reorderPoint,
          predictedConsumption: item.predictedConsumption,
          projectedShortage: item.projectedShortage,
          suggestedQuantity: suggestedQuantity(item.recommendedReorder, item.reorderPoint),
          unitCost: Number(cost?.unit_cost ?? 0),
          riskBasis: item.riskBasis,
          risk: item.risk
        };
      });
    return NextResponse.json({ data: { suggestions, drafts: ordersResult.data ?? [], vendors: vendorResult.data ?? [], method: forecast.method, notes: forecast.notes } });
  } catch {
    return NextResponse.json({ error: "Unable to load replenishment suggestions." }, { status: 500 });
  }
}

const schema = z.object({
  items: z.array(z.object({
    itemId: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().positive().max(100000),
    unit: z.string().trim().max(50).default("")
  })).min(1),
  vendorId: z.string().uuid().nullable().default(null),
  note: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DRAFT_PO_ROLES.includes(session.user.role as Role)) return NextResponse.json({ error: "Draft purchase order access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose valid items and quantities." }, { status: 400 });

  // Server-side truth: unit cost (and name sanity) come from the inventory
  // rows themselves — the client payload only carries what to order.
  const ids = parsed.data.items.map((item) => item.itemId);
  const { data: inventoryRows, error: inventoryError } = await supabase.from("inventory").select("id,name,unit_cost,unit,vendor_id").in("id", ids);
  if (inventoryError) return NextResponse.json({ error: "Unable to read inventory items." }, { status: 500 });
  const byId = new Map((inventoryRows ?? []).map((row) => [String(row.id), row]));
  for (const item of parsed.data.items) {
    if (!byId.has(item.itemId)) return NextResponse.json({ error: `Item ${item.name} is no longer in inventory.` }, { status: 409 });
  }

  // Optional vendor must exist and be active.
  let vendorOk = true;
  if (parsed.data.vendorId) {
    const { data: vendor } = await supabase.from("vendors").select("id,status").eq("id", parsed.data.vendorId).maybeSingle();
    vendorOk = Boolean(vendor) && vendor?.status === "active";
  }
  if (!vendorOk) return NextResponse.json({ error: "Choose an active vendor or leave the vendor unassigned." }, { status: 409 });

  const items: DraftPurchaseItem[] = parsed.data.items.map((item) => ({
    itemId: item.itemId,
    name: String(byId.get(item.itemId)?.name ?? item.name),
    quantity: item.quantity,
    unit: item.unit || String(byId.get(item.itemId)?.unit ?? ""),
    unitCost: Number(byId.get(item.itemId)?.unit_cost ?? 0)
  }));

  let draft;
  try {
    draft = buildDraftPurchaseOrder({ items, vendorId: parsed.data.vendorId, orderedBy: session.user.id, note: parsed.data.note });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: code === "EMPTY_DRAFT" ? "Nothing to order — all quantities are zero." : "Choose valid unit costs." }, { status: 400 });
  }

  const { data, error } = await supabase.from("purchase_orders").insert({
    vendor_id: draft.vendorId,
    status: draft.status, // always 'draft' — the only value this route writes
    items: draft.items,
    total: draft.total,
    ordered_by: draft.orderedBy
  }).select("id,status,total").single();
  if (error) return NextResponse.json({ error: "Unable to create the draft purchase order." }, { status: 409 });

  await supabase.from("audit_logs").insert({
    user_id: session.user.id,
    action: "inventory_draft_purchase_order",
    entity_type: "purchase_order",
    entity_id: String(data.id),
    after_data: { status: "draft", vendorId: draft.vendorId, total: draft.total, items: draft.items, note: draft.note ?? null, submittedToVendor: false }
  });

  return NextResponse.json({ data }, { status: 201 });
}
