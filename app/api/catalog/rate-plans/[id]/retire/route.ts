import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({ reason: z.string().trim().min(3).max(1000) });

// Retiring stops a plan from pricing future nights. Already-frozen bookings keep
// their agreed rates — nothing is recomputed. Manager, Owner, or Admin.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = schema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter a reason for retiring the plan." }, { status: 400 });
  const { data, error } = await c.client.rpc("manager_retire_room_rate_plan", {
    p_plan_id: (await params).id,
    p_reason: p.data.reason,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to retire the rate plan.");
  return NextResponse.json({ data });
}
