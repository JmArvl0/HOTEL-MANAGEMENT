import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readAllRows } from "@/lib/read-all-rows";

async function context() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!["manager", "maintenance"].includes(session.user.role)) return publicJson({ error: "Maintenance coordination access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  return { user: session.user, client: supabase };
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), assetId: z.string().uuid(), technicianId: z.string().uuid() }),
  z.object({ action: z.literal("record_service"), orderId: z.string().min(1).max(80), serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(500).default("") })
]);
export async function GET() {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  try {
    const rows = await readAllRows(() => ctx.client.from("maintenance_asset_work")
      .select("order_id,due_date,serviced_at,service_note,maintenance_assets(name),maintenance_orders(status,assigned_user_id)")
      .order("created_at", { ascending: false }), "order_id");
    const links = rows.map(({ maintenance_assets: assets, maintenance_orders: orders, ...row }) => ({
      ...row,
      assetName: (Array.isArray(assets) ? assets[0]?.name : (assets as { name: string } | null)?.name) ?? "Equipment",
      order: Array.isArray(orders) ? orders[0] ?? null : orders,
    }));
    return publicJson({ data: { links } });
  } catch {
    return publicJson({ error: "Linked maintenance work is temporarily unavailable." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter valid service details." }), { status: 400 });
  const v = parsed.data;
  if (v.action === "create") return publicJson({ error: "Facilities schedules preventive work. You can still record completion for a linked Hotel work order." }, { status: 410 });
  const { data, error } = await ctx.client.rpc("record_linked_asset_service", { p_actor: ctx.user.id, p_order: v.orderId, p_date: v.serviceDate, p_note: v.note });
  if (error) return publicJson({ error: error.message.includes("NOT_COMPLETED") ? "Complete the assigned work order before recording service." : "Unable to save. Check the service date, assigned technician and latest work order state." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return publicJson({ data });
}
