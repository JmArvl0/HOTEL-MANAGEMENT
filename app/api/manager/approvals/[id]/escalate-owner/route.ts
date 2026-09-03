import { NextResponse } from "next/server";
import { z } from "zod";
import { guardManager, managerGuardFailed, managerRpcFailure } from "@/lib/manager-route";

const schema = z.object({ reason: z.string().trim().min(3).max(1000), version: z.coerce.number().int().positive() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardManager((role) => role === "manager", "Manager authority required.");
  if (managerGuardFailed(context)) return context;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "An escalation reason and current version are required." }, { status: 400 });
  const { data, error } = await context.client.rpc("escalate_manager_approval_to_owner", { p_approval_id: (await params).id, p_reason: parsed.data.reason, p_expected_version: parsed.data.version, p_manager_user_id: context.actorId });
  if (error) return managerRpcFailure(error, { OWNER_ESCALATION_REQUIRES_HIGH_RISK: "Only high or critical exceptions require Owner authority.", ALREADY_ESCALATED_TO_OWNER: "This exception is already awaiting Owner review.", APPROVAL_ALREADY_REVIEWED: "This exception changed or has already been reviewed." }, "Unable to escalate this exception to Owner.");
  return NextResponse.json({ data });
}