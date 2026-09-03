import { NextResponse } from "next/server";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const { data, error } = await c.client
    .from("room_types")
    .select("id,name,description,max_guests,beds,size_sqm,amenities,base_rate,active,version,created_at,updated_at,photo_urls")
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "Unable to load the room catalog." }, { status: 500 });
  return NextResponse.json({ data });
}
