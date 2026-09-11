import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { canProposeRoomTypeRate } from "@/lib/permissions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const proposeSchema = z.object({
  name: z.string().trim().min(3).max(80),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(z.enum(DAYS)).min(1),
  nightlyRate: z.coerce.number().min(0).max(10000000),
  reason: z.string().trim().min(3).max(500),
});

const dayBitmask = (labels: readonly string[]) =>
  labels.reduce((mask, label) => mask | (1 << DAYS.indexOf(label as (typeof DAYS)[number])), 0);

// Rate plans for one room type — every status, newest first. Manager proposes;
// Owner/Admin review. Listing is read-only for any catalog role.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const { data, error } = await c.client
    .from("room_rate_plans")
    .select("id,name,start_date,end_date,days_of_week,nightly_rate,status,reason,decision_reason,decided_at,created_at")
    .eq("room_type_id", (await params).id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load rate plans." }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (!canProposeRoomTypeRate(c.role)) return NextResponse.json({ error: "Only a Manager proposes rate plans; Owner and Admin review them." }, { status: 403 });
  const p = proposeSchema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter a plan name, date range, at least one day, a rate, and a reason." }, { status: 400 });
  if (p.data.endDate < p.data.startDate) return NextResponse.json({ error: "The end date cannot be before the start date." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("manager_propose_room_rate_plan", {
    p_room_type_id: (await params).id,
    p_name: v.name,
    p_start_date: v.startDate,
    p_end_date: v.endDate,
    p_days_of_week: dayBitmask(v.days),
    p_nightly_rate: v.nightlyRate,
    p_reason: v.reason,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to submit the rate plan.");
  return NextResponse.json({ data }, { status: 201 });
}
