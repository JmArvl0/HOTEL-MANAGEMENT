import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { canAccess } from "@/lib/permissions";
const schema = z.object({ idempotencyKey: z.string().uuid(), itemId: z.string().min(1).max(80), kind: z.enum(["issue", "count"]), quantity: z.number().finite().min(0).max(9999999999.99).multipleOf(0.01), expectedUpdated: z.string().datetime({ offset: true }).nullable(), reason: z.string().trim().min(3).max(500), reference: z.string().trim().min(1).max(120) });
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(session.user.role, "inventory")) return NextResponse.json({ error: "Inventory access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const [items, movements] = await Promise.all([supabase.from("inventory").select("id,name,category,quantity,reorder_point,unit,status,updated_at").order("name"), supabase.from("inventory_movements").select("id,item_id,quantity,direction,source_type,source_id,note,created_at").order("created_at", { ascending: false }).limit(100)]);
  if (items.error || movements.error) return NextResponse.json({ error: "Unable to load stock and movement history. Refresh to try again." }, { status: 503 });
  return NextResponse.json({ data: { items: items.data, movements: movements.data } });
}
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["housekeeping", "maintenance"].includes(session.user.role)) return NextResponse.json({ error: "Supply operations access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the quantity, reference and reason." }, { status: 400 });
  const v = parsed.data;
  const { data, error } = await supabase.rpc("hms_stock_movement", { p_actor: session.user.id, p_key: v.idempotencyKey, p_item: v.itemId, p_kind: v.kind, p_quantity: v.quantity, p_expected_updated: v.expectedUpdated, p_reason: v.reason, p_reference: v.reference });
  if (error) return NextResponse.json({ error: error.message.includes("INSUFFICIENT") ? "Not enough stock. Nothing was deducted; refresh the available balance." : error.message.includes("STALE") ? "This count changed since you opened it. Refresh and recount before correcting it." : error.message.includes("RETRY_CONFLICT") ? "This retry differs from the original submission. Refresh before recording another movement." : "Unable to save the complete movement. Keep your entries and retry." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return NextResponse.json({ data });
}
