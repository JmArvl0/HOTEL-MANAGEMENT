import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { ROOM_TYPE_COLORS } from "@/lib/room-type-badge";

const schema = z.object({
  description: z.string().trim().min(3).max(1000),
  maxGuests: z.coerce.number().int().positive().max(50),
  beds: z.string().trim().min(1).max(120),
  sizeSqm: z.coerce.number().int().positive().max(2000).optional().nullable(),
  amenities: z.array(z.string().trim().min(1).max(100)).max(100),
  baseRate: z.coerce.number().min(0).max(10000000),
  active: z.boolean(),
  acknowledgeAmenities: z.boolean().optional().default(false),
  photoUrls: z.array(z.string().trim().url().max(400)).max(24).optional(),
  badgeColorKey: z.enum(ROOM_TYPE_COLORS).nullable(),
  reason: z.string().trim().min(3).max(500),
  version: z.coerce.number().int().positive(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = schema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter valid room-type configuration and a reason." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("catalog_update_room_type", {
    p_type: (await params).id, p_body: v, p_actor: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to update the room type.");
  revalidatePath("/");
  return NextResponse.json({ data });
}
