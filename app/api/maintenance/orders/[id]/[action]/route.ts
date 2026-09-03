import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["maintenance"]);
const input = z.object({
  assignedUserId: z.string().uuid().optional().nullable(),
  diagnosis: z.string().trim().max(2000).optional(),
  severity: z.enum(["low", "normal", "high", "critical"]).optional(),
  serviceabilityImpact: z.enum(["serviceable", "blocked", "out_of_service"]).optional(),
  serviceabilityReason: z.string().trim().max(1000).optional().nullable(),
  partsRequired: z.boolean().optional(),
  partsStatus: z.enum(["none", "required", "ordered", "available"]).optional(),
  externalServiceRequired: z.boolean().optional(),
  estimatedCompletion: z.string().datetime().optional().nullable(),
  status: z.enum(["waiting_parts", "deferred"]).optional(),
  reason: z.string().trim().max(1500).optional(),
  note: z.string().trim().max(2000).optional(),
  resolution: z.string().trim().max(2000).optional(),
  cleanupRequired: z.boolean().optional(),
});

const messages: Record<string, string> = {
  WORK_ORDER_NOT_FOUND: "Work order not found.", WORK_ORDER_ASSIGNED_TO_ANOTHER_TECHNICIAN: "This order is assigned to another technician.",
  WORK_ORDER_NOT_STARTABLE: "Only assigned or deferred work can be started.", WORK_ORDER_NOT_RESOLVABLE: "Only active work can be resolved.",
  DIAGNOSIS_REQUIRED: "Record the technical diagnosis before resolving the repair.", RESOLUTION_REQUIRED: "A repair resolution is required.",
  INVALID_DIAGNOSIS: "Enter a diagnosis and a valid technical serviceability decision.", CANCELLATION_REASON_REQUIRED: "A cancellation reason is required.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Maintenance action access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id, action } = await params;
  const parsed = input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid maintenance workflow details." }, { status: 400 });
  const value = parsed.data;
  let rpc: string;
  let args: Record<string, unknown>;
  switch (action) {
    case "assign": rpc = "maintenance_assign_work_order"; args = { p_order_id: id, p_assigned_user_id: value.assignedUserId ?? null, p_staff_user_id: session.user.id }; break;
    case "start": rpc = "maintenance_start_work_order"; args = { p_order_id: id, p_staff_user_id: session.user.id }; break;
    case "diagnose":
      if (!value.diagnosis || !value.severity || !value.serviceabilityImpact || !value.partsStatus) return NextResponse.json({ error: "Diagnosis, severity, serviceability, and parts status are required." }, { status: 400 });
      rpc = "maintenance_record_diagnosis"; args = { p_order_id: id, p_diagnosis: value.diagnosis, p_severity: value.severity, p_serviceability_impact: value.serviceabilityImpact, p_serviceability_reason: value.serviceabilityReason ?? null, p_parts_required: value.partsRequired ?? false, p_parts_status: value.partsStatus, p_external_service_required: value.externalServiceRequired ?? false, p_estimated_completion: value.estimatedCompletion ?? null, p_staff_user_id: session.user.id }; break;
    case "defer":
      if (!value.status || !value.reason || !value.partsStatus) return NextResponse.json({ error: "Choose a deferred state and provide the reason and parts status." }, { status: 400 });
      rpc = "maintenance_defer_work_order"; args = { p_order_id: id, p_status: value.status, p_reason: value.reason, p_parts_status: value.partsStatus, p_estimated_completion: value.estimatedCompletion ?? null, p_staff_user_id: session.user.id }; break;
    case "progress":
      if (!value.note || !value.partsStatus) return NextResponse.json({ error: "A progress note and parts status are required." }, { status: 400 });
      rpc = "maintenance_add_progress"; args = { p_order_id: id, p_note: value.note, p_parts_status: value.partsStatus, p_estimated_completion: value.estimatedCompletion ?? null, p_staff_user_id: session.user.id }; break;
    case "resolve":
      if (!value.resolution) return NextResponse.json({ error: "A repair resolution is required." }, { status: 400 });
      rpc = "maintenance_resolve_work_order"; args = { p_order_id: id, p_resolution: value.resolution, p_cleanup_required: value.cleanupRequired ?? false, p_staff_user_id: session.user.id }; break;
    case "close": rpc = "maintenance_close_work_order"; args = { p_order_id: id, p_staff_user_id: session.user.id }; break;
    case "cancel":
      if (!value.reason) return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });
      rpc = "maintenance_cancel_work_order"; args = { p_order_id: id, p_reason: value.reason, p_staff_user_id: session.user.id }; break;
    default: return NextResponse.json({ error: "Unknown maintenance action." }, { status: 404 });
  }
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) { const key = Object.keys(messages).find((item) => error.message.includes(item)); return NextResponse.json({ error: key ? messages[key] : "The maintenance action could not be completed." }, { status: 409 }); }
  return NextResponse.json({ data });
}
