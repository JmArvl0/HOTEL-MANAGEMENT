import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

export const transportVehicleTypeColumns = "id,name,description,seats,base_fare,per_km,per_minute,booking_fee,active,sort,version,created_at,updated_at";

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const { data, error } = await c.client
    .from("transport_vehicle_types")
    .select(transportVehicleTypeColumns)
    .order("active", { ascending: false })
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "Unable to load the transfer vehicle rates." }, { status: 500 });
  return NextResponse.json({ data });
}

export const transportVehicleTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  seats: z.coerce.number().int().min(1).max(20).optional().default(4),
  baseFare: z.coerce.number().min(0).max(10000000).optional().default(0),
  perKm: z.coerce.number().min(0).max(10000000).optional().default(0),
  perMinute: z.coerce.number().min(0).max(10000000).optional().default(0),
  bookingFee: z.coerce.number().min(0).max(10000000).optional().default(0),
  active: z.boolean().optional().default(true),
  sort: z.coerce.number().int().min(0).max(1000).optional().default(0),
  reason: z.string().trim().min(3).max(500).optional().default(""),
});

export async function POST(request: Request) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = transportVehicleTypeSchema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter valid transfer vehicle rate details." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("upsert_transport_vehicle_type", {
    p_id: null,
    p_name: v.name,
    p_description: v.description || null,
    p_seats: v.seats,
    p_base_fare: v.baseFare,
    p_per_km: v.perKm,
    p_per_minute: v.perMinute,
    p_booking_fee: v.bookingFee,
    p_active: v.active,
    p_sort: v.sort,
    p_reason: null,
    p_expected_version: null,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to create the transfer vehicle.");
  return NextResponse.json({ data }, { status: 201 });
}
