import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { pesoAmount } from "@/lib/input-validation";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { canAccess } from "@/lib/permissions";
const schema = z.object({ idempotencyKey: z.string().uuid(), itemId: z.string().min(1).max(80), kind: z.enum(["issue", "count"]), quantity: pesoAmount(0, 9999999999.99), expectedUpdated: z.string().datetime({ offset: true }).nullable(), reason: z.string().trim().min(3).max(500), reference: z.string().trim().min(1).max(120) });
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!canAccess(session.user.role, "inventory")) return publicJson({ error: "Inventory access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const [items, movements] = await Promise.all([supabase.from("inventory").select("id,name,category,quantity,reorder_point,unit,status,updated_at").order("name"), supabase.from("inventory_movements").select("id,item_id,quantity,direction,source_type,source_id,note,created_at").order("created_at", { ascending: false }).limit(100)]);
  if (items.error || movements.error) return publicJson({ error: "Unable to load stock and movement history. Refresh to try again." }, { status: 503 });
  return publicJson({ data: { items: items.data, movements: movements.data } });
}
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!["housekeeping", "maintenance"].includes(session.user.role)) return publicJson({ error: "Supply operations access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Check the quantity, reference and reason." }), { status: 400 });
  const v = parsed.data;
  const { data, error } = await supabase.rpc("hms_stock_movement", { p_actor: session.user.id, p_key: v.idempotencyKey, p_item: v.itemId, p_kind: v.kind, p_quantity: v.quantity, p_expected_updated: v.expectedUpdated, p_reason: v.reason, p_reference: v.reference });
  if (error) return publicJson({ error: error.message.includes("INSUFFICIENT") ? "Not enough stock. Nothing was deducted; refresh the available balance." : error.message.includes("STALE") ? "This count changed since you opened it. Refresh and recount before correcting it." : error.message.includes("RETRY_CONFLICT") ? "These stock details differ from the earlier submission. Check movement history before starting another stock change." : "Unable to save the complete movement. Keep your entries and retry." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return publicJson({ data });
}
