import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { numericInput } from "@/lib/input-validation";
import { xenditConfigured } from "@/lib/xendit";

import { z } from "zod";
import { DEPOSIT_METHODS } from "@/lib/online-checkout";
import { guardAdmin, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({
  depositMethod: z.enum(DEPOSIT_METHODS),
  reason: z.string().trim().min(3, "Record why the deposit method is changing.").max(500),
  version: numericInput(z.number().int().positive()),
});

export async function PATCH(request: Request) {
  const context = await guardAdmin();
  if (adminGuardFailed(context)) return context;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Check the deposit method." }), { status: 400 });
  if (parsed.data.depositMethod === "xendit" && !xenditConfigured()) {
    return publicJson({ error: "Configure Xendit before enabling guest checkout." }, { status: 409 });
  }
  const { data, error } = await context.client.rpc("admin_update_deposit_method", {
    p_deposit_method: parsed.data.depositMethod,
    p_reason: parsed.data.reason,
    p_expected_version: parsed.data.version,
    p_actor_user_id: context.actorId,
  });
  if (error) {
    if (error.message.includes("DEPOSIT_METHOD_FORBIDDEN")) return publicJson({ error: "Only the Owner or an Admin can perform this action." }, { status: 403 });
    if (error.message.includes("POLICY_STALE")) return publicJson({ error: "The configuration changed since you opened it. Refresh and try again." }, { status: 409 });
    return adminRpcFailure(error, "Unable to update the deposit method.");
  }
  return publicJson({ data });
}
