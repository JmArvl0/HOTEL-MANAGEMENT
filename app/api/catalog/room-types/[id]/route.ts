import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({
  description: z.string().trim().min(3).max(1000),
  maxGuests: z.coerce.number().int().positive().max(50),
  beds: z.string().trim().min(1).max(120),
  sizeSqm: z.coerce.number().int().positive().max(2000).optional().nullable(),
  amenities: z.array(z.string().trim().min(1).max(100)).max(100),
  baseRate: z.coerce.number().min(0).max(10000000),
  active: z.boolean(),
  photoUrls: z.array(z.string().trim().url().max(400)).max(24).optional(),
  reason: z.string().trim().min(3).max(500),
  version: z.coerce.number().int().positive(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = schema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter valid room-type configuration and a reason." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("admin_update_room_type", {
    p_room_type_id: (await params).id,
    p_description: v.description,
    p_max_guests: v.maxGuests,
    p_beds: v.beds,
    p_size_sqm: v.sizeSqm ?? null,
    p_amenities: v.amenities,
    p_base_rate: v.baseRate,
    p_active: v.active,
    p_photo_urls: v.photoUrls ?? null,
    p_reason: v.reason,
    p_expected_version: v.version,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to update the room type.");
  return NextResponse.json({ data });
}
