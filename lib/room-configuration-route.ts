import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { updatePhysicalRoomSchema } from "./room-configuration";
import { adminRpcFailure, type AdminContext } from "./admin-route";

export async function updatePhysicalRoom(request: Request, id: string, context: AdminContext) {
  const parsed = updatePhysicalRoomSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Enter valid room configuration and a reason." }), { status: 400 });
  const { data, error } = await context.client.rpc("catalog_save_room", {
    p_room: id, p_body: parsed.data, p_actor: context.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to update room configuration.");
  revalidatePath("/");
  return publicJson({ data });
}
