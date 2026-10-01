import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({
  depositMethod: z.enum(["paymongo", "manual", "off"]),
  reason: z.string().trim().min(3, "Record why the deposit method is changing.").max(500),
  version: z.coerce.number().int().positive(),
});

// Owner + Admin can switch the exclusive deposit method. Pending payments on
// the previous path finish honestly — verification paths are untouched.
export async function PATCH(request: Request) {
  const context = await guardAdmin();
  if (adminGuardFailed(context)) return context;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the deposit method." }, { status: 400 });
  const { data, error } = await context.client.rpc("admin_update_deposit_method", {
    p_deposit_method: parsed.data.depositMethod,
    p_reason: parsed.data.reason,
    p_expected_version: parsed.data.version,
    p_actor_user_id: context.actorId,
  });
  if (error) {
    if (error.message.includes("DEPOSIT_METHOD_FORBIDDEN")) return NextResponse.json({ error: "Owner or Admin authority required." }, { status: 403 });
    if (error.message.includes("POLICY_STALE")) return NextResponse.json({ error: "The configuration changed since you opened it. Refresh and try again." }, { status: 409 });
    return adminRpcFailure(error, "Unable to update the deposit method.");
  }
  return NextResponse.json({ data });
}
