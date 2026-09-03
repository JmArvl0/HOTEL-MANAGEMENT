import { NextResponse } from "next/server";
import { z } from "zod";
import { guardOwner, ownerGuardFailed, ownerRpcFailure } from "@/lib/owner-route";

const schema = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(3).max(1000), version: z.coerce.number().int().positive() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardOwner();
  if (ownerGuardFailed(context)) return context;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A decision, reason, and current version are required." }, { status: 400 });
  const { data, error } = await context.client.rpc("review_owner_exception", { p_approval_id: (await params).id, p_decision: parsed.data.decision, p_reason: parsed.data.reason, p_expected_version: parsed.data.version, p_owner_user_id: context.actorId });
  if (error) return ownerRpcFailure(error, "Unable to review this Owner-level exception.");
  return NextResponse.json({ data });
}