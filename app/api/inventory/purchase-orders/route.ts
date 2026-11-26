import { publicJson } from "@/lib/server-errors";
import { getAuthenticatedSession } from "@/lib/authorization";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/read-all-rows";
import type { Role } from "@/lib/types";

const PURCHASE_HISTORY_ROLES: Role[] = ["manager", "owner", "admin"];

/** Existing deliveries and purchase records retained for Hotel reference. */
export async function GET(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "housekeeping" && !PURCHASE_HISTORY_ROLES.includes(session.user.role)) return publicJson({ error: "Hotel delivery access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const client = supabase;
  try {
    if (session.user.role === "housekeeping") {
      const data = await readAllRows(() => client.from("purchase_orders")
        .select("id,status,items,received_quantities,version,created_at,purchase_order_receipts(id,items,created_at)")
        .in("status", ["approved", "partially_received"]).order("created_at").order("id"));
      const drafts = data.map(order => ({
        ...order,
        items: (order.items as { itemId: string; name: string; quantity: number; unit: string }[])
          .map(({ itemId, name, quantity, unit }) => ({ itemId, name, quantity, unit })),
      }));
      return publicJson({ data: { drafts, vendors: [], receivingOnly: true } });
    }
    const params = new URL(request.url).searchParams;
    const [ordersResult, vendorResult] = await Promise.all([
      readAllRows(() => {
        let q = client.from("purchase_orders").select("id,vendor_id,status,total,items,received_quantities,created_at,version,approved_at,received_at,purchase_order_receipts(id,items,created_at)").order("created_at", { ascending: false }).order("id");
        const status = params.get("status");
        if (status) q = q.eq("status", status);
        const vendor = params.get("vendor");
        if (vendor) q = q.eq("vendor_id", vendor);
        const from = params.get("from");
        if (from) q = q.gte("created_at", from);
        const to = params.get("to");
        if (to) q = q.lte("created_at", to);
        return q;
      }),
      client.from("vendors").select("id,name").order("name")
    ]);
    if (vendorResult.error) throw vendorResult.error;
    return publicJson({ data: { drafts: ordersResult, vendors: vendorResult.data ?? [] } });
  } catch {
    return publicJson({ error: "Unable to load Hotel delivery records." }, { status: 503 });
  }
}

export async function POST() {
  const session = await getAuthenticatedSession();
  if (!session) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!PURCHASE_HISTORY_ROLES.includes(session.user.role)) return publicJson({ error: "Hotel purchase history access required." }, { status: 403 });
  return publicJson({ error: "Supply Chain handles new purchase orders. Receive or close existing Hotel orders from Hotel Supplies." }, { status: 410 });
}
