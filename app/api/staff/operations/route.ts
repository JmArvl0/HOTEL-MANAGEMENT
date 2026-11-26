import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { OPERATIONAL_ROLES, operationsAction } from "@/lib/operations";

async function context() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!OPERATIONAL_ROLES.includes(session.user.role)) return publicJson({ error: "Please sign in with an authorized staff account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  return { user: session.user, client: supabase };
}
export async function GET(request: Request) {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const manager = ctx.user.role === "manager";
  const rawFrom = new URL(request.url).searchParams.get("from");
  const start = rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? new Date(`${rawFrom}T00:00:00+08:00`) : new Date();
  if (!Number.isFinite(start.getTime())) return publicJson({ error: "Choose a valid week." }, { status: 400 });
  const end = new Date(start.getTime() + 7 * 86400000);
  let roster = ctx.client.from("staff_roster").select("id,staff_user_id,department,starts_at,ends_at,note,status,version").lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).order("starts_at").limit(300);
  let handovers = ctx.client.from("shift_handovers").select("id,department,summary,source_type,source_id,follow_up_user_id,submitted_by,submitted_at,acknowledged_at,resolved_at,resolution,version").order("submitted_at", { ascending: false }).limit(100);
  let staff = ctx.client.from("user_accounts").select("id,name,role").eq("active", true).in("role", OPERATIONAL_ROLES).order("name");
  if (!manager) { roster = roster.eq("staff_user_id", ctx.user.id); handovers = handovers.eq("department", ctx.user.role); staff = staff.eq("role", ctx.user.role); }
  const results = await Promise.all([roster, handovers, staff]);
  if (results.some(r => r.error)) return publicJson({ error: "Schedules and handovers are unavailable right now. Try again shortly, or contact the system administrator." }, { status: 503 });
  return publicJson({ data: { roster: results[0].data, handovers: results[1].data, staff: results[2].data } });
}
export async function POST(request: Request) {
  const ctx = await context(); if (ctx instanceof NextResponse) return ctx;
  const parsed = operationsAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Check the form." }), { status: 400 });
  const v = parsed.data;
  let rpc: string; let args: Record<string, unknown>;
  if (v.action === "schedule") {
    return publicJson({ error: "New staff schedules are managed by Workforce. You can still record a Hotel handover." }, { status: 403 });
  }
  if (v.action === "cancel_schedule") {
    if (ctx.user.role !== "manager") return publicJson({ error: "Only Manager can change schedules." }, { status: 403 });
    rpc = "cancel_roster_assignment"; args = { p_actor: ctx.user.id, p_id: v.id, p_version: v.version, p_reason: v.note };
  } else if (v.action === "handover") {
    rpc = "submit_shift_handover"; args = { p_actor: ctx.user.id, p_id: v.id, p_summary: v.summary, p_source_type: v.sourceType, p_source_id: v.sourceId, p_follow_up: v.followUpId };
  } else {
    rpc = "act_shift_handover"; args = { p_actor: ctx.user.id, p_id: v.id, p_version: v.version, p_action: v.action, p_resolution: v.note };
  }
  const { data, error } = await ctx.client.rpc(rpc, args);
  if (error) return publicJson({ error: error.message.includes("OVERLAP") ? "This staff member already has a shift in that time window." : error.message.includes("SOURCE") ? "Choose an existing source record that belongs to your department." : "Unable to save. Check your access and refresh for the latest record." }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  return publicJson({ data });
}
