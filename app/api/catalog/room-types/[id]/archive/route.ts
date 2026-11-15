import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardAdmin, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardAdmin();
  if (adminGuardFailed(c)) return c;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter a reason for archiving. Reopen the room type if a reason is already entered." }), { status: 400 });
  const { data, error } = await c.client.rpc("catalog_archive_room_type", {
    p_type: (await params).id, p_version: parsed.data.version, p_reason: parsed.data.reason, p_actor: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to archive this room type.");
  revalidatePath("/");
  return publicJson({ data });
}
