import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { OPERATIONAL_ROLES, operationsAction } from "@/lib/operations";

async function context() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!OPERATIONAL_ROLES.includes(session.user.role)) return NextResponse.json({ error: "Operational staff access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  return { user: session.user, client: supabase };
}
export async function GET() {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const manager = ctx.user.role === "manager";
  let handovers = ctx.client.from("shift_handovers").select("id,department,summary,source_type,source_id,follow_up_user_id,submitted_by,submitted_at,acknowledged_at,resolved_at,resolution,version").order("submitted_at", { ascending: false }).limit(100);
  let staff = ctx.client.from("user_accounts").select("id,name,role").eq("active", true).in("role", OPERATIONAL_ROLES).order("name");
  if (!manager) { handovers = handovers.eq("department", ctx.user.role); staff = staff.eq("role", ctx.user.role); }
  const results = await Promise.all([handovers, staff]);
  if (results.some(r => r.error)) return NextResponse.json({ error: "Operational handover service is unavailable. Try again or ask an administrator to check pending migrations." }, { status: 503 });
  return NextResponse.json({ data: { handovers: results[0].data, staff: results[1].data } });
}
export async function POST(request: Request) {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const parsed = operationsAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const v = parsed.data;
  let rpc: string; let args: Record<string, unknown>;
  if (v.action === "schedule" || v.action === "cancel_schedule") {
    return NextResponse.json({ error: "Schedules belong to a separate workflow." }, { status: 403 });
  } else if (v.action === "handover") {
    rpc = "submit_shift_handover"; args = { p_actor: ctx.user.id, p_id: v.id, p_summary: v.summary, p_source_type: v.sourceType, p_source_id: v.sourceId, p_follow_up: v.followUpId };
  } else {
    rpc = "act_shift_handover"; args = { p_actor: ctx.user.id, p_id: v.id, p_version: v.version, p_action: v.action, p_resolution: v.note };
  }
  const { data, error } = await ctx.client.rpc(rpc, args);
  if (error) return NextResponse.json({ error: error.message.includes("OVERLAP") ? "This staff member already has a shift in that time window." : error.message.includes("SOURCE") ? "Choose an existing source record that belongs to your department." : "Unable to save. Check your access and refresh for the latest record." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return NextResponse.json({ data });
}
