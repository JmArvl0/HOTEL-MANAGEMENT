import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  seats: z.coerce.number().int().min(1).max(20).optional().default(4),
  baseFare: z.coerce.number().min(0).max(10000000).optional().default(0),
  perKm: z.coerce.number().min(0).max(10000000).optional().default(0),
  perMinute: z.coerce.number().min(0).max(10000000).optional().default(0),
  bookingFee: z.coerce.number().min(0).max(10000000).optional().default(0),
  active: z.boolean(),
  sort: z.coerce.number().int().min(0).max(1000).optional().default(0),
  reason: z.string().trim().min(3, "Enter a reason for this change.").max(500),
  version: z.coerce.number().int().positive(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = schema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Enter valid transfer vehicle rate details and a reason." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("upsert_transport_vehicle_type", {
    p_id: (await params).id,
    p_name: v.name,
    p_description: v.description || null,
    p_seats: v.seats,
    p_base_fare: v.baseFare,
    p_per_km: v.perKm,
    p_per_minute: v.perMinute,
    p_booking_fee: v.bookingFee,
    p_active: v.active,
    p_sort: v.sort,
    p_reason: v.reason,
    p_expected_version: v.version,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to update the transfer vehicle.");
  return NextResponse.json({ data });
}
