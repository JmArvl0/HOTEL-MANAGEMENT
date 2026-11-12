import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardAdmin, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardAdmin();
  if (adminGuardFailed(c)) return c;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the current version and a reason for archiving." }, { status: 400 });
  const { data, error } = await c.client.rpc("catalog_archive_room_type", {
    p_type: (await params).id, p_version: parsed.data.version, p_reason: parsed.data.reason, p_actor: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to archive this room type.");
  revalidatePath("/");
  return NextResponse.json({ data });
}
