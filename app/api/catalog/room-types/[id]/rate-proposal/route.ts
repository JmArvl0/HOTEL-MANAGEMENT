import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { numericInput } from "@/lib/input-validation";

import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { canProposeRoomTypeRate } from "@/lib/permissions";

const schema = z.object({
  rate: numericInput(z.number().min(0).max(10000000)),
  reason: z.string().trim().min(3).max(500),
  version: numericInput(z.number().int().positive()),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (!canProposeRoomTypeRate(c.role)) return publicJson({ error: "Only a Manager proposes rate changes; Owner and Admin set rates directly." }, { status: 403 });
  const p = schema.safeParse(await request.json().catch(() => null));
  if (!p.success) return publicJson(validationBody(p.error, { error: "Enter the proposed rate and a reason. Reopen the room type if these details are already complete." }), { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("admin_propose_room_type_rate", {
    p_room_type_id: (await params).id,
    p_rate: v.rate,
    p_reason: v.reason,
    p_expected_version: v.version,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to submit the rate proposal.");
  return publicJson({ data }, { status: 201 });
}
