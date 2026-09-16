import { supabase } from "@/lib/supabase";
import { requestLabel, type RequestOption } from "@/lib/request-options";

/**
 * Pre-arrival (booking checkout) request options.
 *
 * Two independent categories share one section in Guest Details:
 * - amenities: Manager-linked inventory rows, offered only while
 *   active + pre_arrival_requestable + linked item quantity > 0.
 *   inventory.quantity is authoritative — inventory.status is
 *   staff-maintained display state with no trigger behind it, so gating
 *   ignores status (a stale status can neither hide an available item nor
 *   expose an empty one). Quantities never leave the server.
 * - services: structured service/preference constants, never inventory.
 *
 * Nothing here reserves or decrements stock: offering is eligibility only,
 * consumption stays at fulfillment (logGuestRequestConsumption).
 */

export const PRE_ARRIVAL_SERVICE_VALUES = ["high_floor_quiet", "early_check_in", "celebration"] as const;

export interface PreArrivalAmenity extends RequestOption {
  inventoryItemId: string;
}

export interface PreArrivalOptions {
  amenities: PreArrivalAmenity[];
  services: RequestOption[];
}

export function preArrivalServices(): RequestOption[] {
  return PRE_ARRIVAL_SERVICE_VALUES.map((value) => ({ value, label: requestLabel(value) }));
}

interface CatalogRow {
  value: string;
  label: string;
  active: boolean;
  inventory_item_id: string | null;
  pre_arrival_requestable: boolean;
}

interface InventoryRow {
  id: string;
  quantity: number | string | null;
}

/** Pure: which catalog rows are offered as amenities right now. */
export function resolvePreArrivalAmenities(
  catalog: readonly CatalogRow[],
  inventory: readonly InventoryRow[]
): PreArrivalAmenity[] {
  const quantity = new Map(inventory.map((item) => [item.id, Number(item.quantity)]));
  return catalog
    .filter(
      (row) =>
        row.active &&
        row.pre_arrival_requestable &&
        row.inventory_item_id &&
        (quantity.get(row.inventory_item_id) ?? 0) > 0
    )
    .map((row) => ({ value: row.value, label: row.label, inventoryItemId: row.inventory_item_id as string }));
}

/** Pure: submitted values not currently offered (unknown, disabled, or out of stock). */
export function findUnavailableSelections(submitted: readonly string[], live: PreArrivalOptions): string[] {
  const allowed = new Set([...live.amenities.map((item) => item.value), ...live.services.map((item) => item.value)]);
  return [...new Set(submitted)].filter((value) => !allowed.has(value));
}

/**
 * Pre-arrival governance is Manager-only. Owner and System Administrator keep
 * their existing generic catalog administration, but the business rule gives
 * them no authority over which inventory items guests may request at booking
 * (SYSTEM.md grants no such Owner capability), and every other role is out.
 */
export function canConfigurePreArrival(role: string): boolean {
  return role === "manager";
}

export const PRE_ARRIVAL_UNAVAILABLE_MESSAGE =
  "One of your selected request items is no longer available. Please review your pre-arrival requests.";

/** Server-only: live pre-arrival options. Never throws, never invents amenities. */
export async function getPreArrivalOptions(): Promise<PreArrivalOptions> {
  const services = preArrivalServices();
  if (!supabase) return { amenities: [], services };
  try {
    const { data: rows, error: catalogError } = await supabase
      .from("guest_request_catalog")
      .select("value,label,active,inventory_item_id,pre_arrival_requestable")
      .eq("active", true)
      .eq("pre_arrival_requestable", true)
      .order("sort_order");
    if (catalogError || !rows?.length) return { amenities: [], services };
    const linked = (rows as CatalogRow[]).filter((row) => row.inventory_item_id);
    if (!linked.length) return { amenities: [], services };
    const { data: items, error: inventoryError } = await supabase
      .from("inventory")
      .select("id,quantity")
      .in(
        "id",
        linked.map((row) => row.inventory_item_id as string)
      );
    if (inventoryError) return { amenities: [], services };
    return {
      amenities: resolvePreArrivalAmenities(rows as CatalogRow[], (items ?? []) as InventoryRow[]),
      services,
    };
  } catch {
    return { amenities: [], services };
  }
}
