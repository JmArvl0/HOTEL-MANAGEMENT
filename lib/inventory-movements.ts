import { supabase } from "@/lib/supabase";

/**
 * Inventory movement logging — the consumption history that makes the
 * shortage forecast possible. HAVEN's original schema stored only current
 * quantities; these hooks record every change so `lib/analytics/inventory.ts`
 * has real demand data.
 *
 * Guests never log movements directly: consumption is recorded when
 * Housekeeping completes a task that originated from a mapped guest request
 * (extra towels etc.), and quantity adjustments made through the generic
 * inventory resource are recorded as restock/adjustment deltas.
 */

export interface MovementRecord {
  itemId: string;
  quantity: number;
  direction: "consumption" | "restock" | "adjustment";
  sourceType?: string;
  sourceId?: string;
  recordedBy?: string;
  note?: string;
}

export async function recordInventoryMovement(movement: MovementRecord): Promise<void> {
  if (!supabase || !(movement.quantity > 0)) return;
  await supabase.from("inventory_movements").insert({
    item_id: movement.itemId,
    quantity: movement.quantity,
    direction: movement.direction,
    source_type: movement.sourceType ?? null,
    source_id: movement.sourceId ?? null,
    recorded_by: movement.recordedBy ?? null,
    note: movement.note ?? null
  });
}

/** Map a structured guest-request type to the inventory item it consumes. */
const REQUEST_CONSUMPTION: Record<string, { match: RegExp; quantity: number }> = {
  extra_towels: { match: /towel/i, quantity: 2 },
  extra_pillows: { match: /pillow/i, quantity: 1 },
  toiletries: { match: /toiletr|shampoo|soap|amenit/i, quantity: 1 }
};

/**
 * On completion of a housekeeping task that originated from a guest request,
 * consume the mapped stock. Failures are deliberately non-fatal: the task is
 * already completed and movement logging must never roll back operations.
 */
export async function logGuestRequestConsumption(guestRequestId: string, staffUserId: string): Promise<void> {
  if (!supabase) return;
  const { data: request } = await supabase.from("guest_requests").select("request_type").eq("id", guestRequestId).maybeSingle();
  const mapping = request?.request_type ? REQUEST_CONSUMPTION[request.request_type] : undefined;
  if (!mapping) return;

  const { data: items } = await supabase.from("inventory").select("id,name,quantity").order("name");
  const match = (items ?? []).find((candidate) => mapping.match.test(candidate.name));
  if (!match || Number(match.quantity) < mapping.quantity) return; // nothing to consume — do not go negative

  await supabase.from("inventory").update({ quantity: Number(match.quantity) - mapping.quantity, updated_at: new Date().toISOString() }).eq("id", match.id);
  await recordInventoryMovement({
    itemId: match.id,
    quantity: mapping.quantity,
    direction: "consumption",
    sourceType: "guest_request",
    sourceId: guestRequestId,
    recordedBy: staffUserId,
    note: `Consumed fulfilling guest request (${request?.request_type})`
  });
}

/** Record the delta when staff change an inventory item's quantity directly. */
export async function logQuantityAdjustment(itemId: string, newQuantity: number, previousQuantity: number, staffUserId: string): Promise<void> {
  const delta = Math.round((newQuantity - previousQuantity) * 100) / 100;
  if (delta === 0) return;
  await recordInventoryMovement({
    itemId,
    quantity: Math.abs(delta),
    direction: delta > 0 ? "restock" : "adjustment",
    recordedBy: staffUserId,
    note: `Quantity ${delta > 0 ? "restocked" : "reduced"} by ${Math.abs(delta)} (was ${previousQuantity})`
  });
}
