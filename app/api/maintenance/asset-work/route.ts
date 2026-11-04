import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

async function context() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "maintenance"].includes(session.user.role)) return NextResponse.json({ error: "Maintenance coordination access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  return { user: session.user, client: supabase };
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), assetId: z.string().uuid(), technicianId: z.string().uuid() }),
  z.object({ action: z.literal("record_service"), orderId: z.string().min(1).max(80), serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500).default("") })
]);
export async function GET() {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const [links, staff] = await Promise.all([
    ctx.client.from("maintenance_asset_work").select("order_id,asset_id,due_date,serviced_at,service_note,maintenance_orders(status,assigned_user_id)").order("created_at", { ascending: false }).limit(200),
    ctx.client.from("user_accounts").select("id,name").eq("role", "maintenance").eq("active", true).order("name")
  ]);
  if (links.error || staff.error) return NextResponse.json({ error: "Preventive work is unavailable. Check pending migrations or retry." }, { status: 503 });
  return NextResponse.json({ data: { links: links.data, technicians: staff.data } });
}
export async function POST(request: Request) {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid service details." }, { status: 400 });
  const v = parsed.data;
  if (v.action === "create" && ctx.user.role === "maintenance" && v.technicianId !== ctx.user.id) return NextResponse.json({ error: "Technicians can assign preventive work only to themselves." }, { status: 403 });
  const { data, error } = v.action === "create"
    ? await ctx.client.rpc("create_asset_work", { p_actor: ctx.user.id, p_asset: v.assetId, p_technician: v.technicianId })
    : await ctx.client.rpc("record_linked_asset_service", { p_actor: ctx.user.id, p_order: v.orderId, p_date: v.serviceDate, p_note: v.note });
  if (error) return NextResponse.json({ error: error.message.includes("NOT_COMPLETED") ? "Complete the assigned work order before recording service." : "Unable to save. Check the service date, assigned technician and latest work order state." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return NextResponse.json({ data });
}
