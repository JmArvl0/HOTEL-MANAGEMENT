import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";

export const transportServiceColumns = "id,name,description,price,unit,active,sort,version,created_at,updated_at";

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const { data, error } = await c.client
    .from("transport_services")
    .select(transportServiceColumns)
    .order("active", { ascending: false })
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "Unable to load the transport price list." }, { status: 500 });
  return NextResponse.json({ data });
}

export const transportServiceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(""),
  price: z.coerce.number().positive().max(10000000),
  unit: z.string().trim().max(40).optional().default("per trip"),
  active: z.boolean().optional().default(true),
  sort: z.coerce.number().int().min(0).max(1000).optional().default(0),
  reason: z.string().trim().min(3).max(500).optional().default(""),
});

export async function POST(request: Request) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = transportServiceSchema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter valid transport service details." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("upsert_transport_service", {
    p_id: null,
    p_name: v.name,
    p_description: v.description || null,
    p_price: v.price,
    p_unit: v.unit,
    p_active: v.active,
    p_sort: v.sort,
    p_reason: null,
    p_expected_version: null,
    p_actor_user_id: c.actorId,
  });
  if (error) return adminRpcFailure(error, "Unable to create the transport service.");
  return NextResponse.json({ data }, { status: 201 });
}
