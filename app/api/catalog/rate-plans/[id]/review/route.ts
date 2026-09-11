import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { canSetRoomTypeRate } from "@/lib/permissions";

const schema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(1000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (!canSetRoomTypeRate(c.role)) return NextResponse.json({ error: "Only Owner or Admin can review rate plans." }, { status: 403 });
  const p = schema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter a decision and a reason." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("admin_review_room_rate_plan", {
    p_plan_id: (await params).id,
    p_decision: v.decision,
    p_reason: v.reason,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to review the rate plan.");
  return NextResponse.json({ data });
}
