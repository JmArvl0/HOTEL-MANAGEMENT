import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { ROOM_TYPE_COLORS } from "@/lib/room-type-badge";

const proposalColumns = "id,proposed_rate,reason,status,proposed_by,created_at,decided_by,decided_at,decision_reason";
const badgeColorKey = z.enum(ROOM_TYPE_COLORS); // required on create — every new type enters with its badge identity

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const [typesResult, roomsResult] = await Promise.all([
    c.client
      .from("room_types")
      .select(`id,name,description,max_guests,beds,size_sqm,amenities,base_rate,active,version,created_at,updated_at,photo_urls,badge_color_key,room_rate_proposals(${proposalColumns})`)
      .order("name", { ascending: true }),
    // One aggregate pass — physical-room counts per type (no per-type queries).
    c.client.from("rooms").select("type,administratively_active"),
  ]);
  if (typesResult.error) return NextResponse.json({ error: "Unable to load the room catalog." }, { status: 500 });
  if (roomsResult.error) return NextResponse.json({ error: "Unable to load the room catalog." }, { status: 500 });
  const counts = new Map<string, { physicalRooms: number; activeRooms: number }>();
  for (const room of roomsResult.data ?? []) {
    const entry = counts.get(String(room.type)) ?? { physicalRooms: 0, activeRooms: 0 };
    entry.physicalRooms += 1;
    if (room.administratively_active !== false) entry.activeRooms += 1;
    counts.set(String(room.type), entry);
  }
  const data = (typesResult.data ?? []).map((type) => ({ ...type, ...(counts.get(String(type.name)) ?? { physicalRooms: 0, activeRooms: 0 }) }));
  return NextResponse.json({ data });
}

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(3).max(1000),
  maxGuests: z.coerce.number().int().positive().max(50),
  beds: z.string().trim().min(1).max(120),
  sizeSqm: z.coerce.number().int().positive().max(2000).optional().nullable(),
  amenities: z.array(z.string().trim().min(1).max(100)).max(100),
  baseRate: z.coerce.number().min(0).max(10000000),
  active: z.boolean().optional().default(false),
  photoUrls: z.array(z.string().trim().url().max(400)).min(1).max(24),
  badgeColorKey,
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  const p = createSchema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: "Enter valid room-type configuration, a reason, and at least one room photo." }, { status: 400 });
  const v = p.data;
  const { data, error } = await c.client.rpc("admin_create_room_type", {
    p_name: v.name,
    p_description: v.description,
    p_max_guests: v.maxGuests,
    p_beds: v.beds,
    p_size_sqm: v.sizeSqm ?? null,
    p_amenities: v.amenities,
    p_base_rate: v.baseRate,
    p_active: v.active,
    p_photo_urls: v.photoUrls ?? null,
    p_reason: v.reason,
    p_actor_user_id: c.actorId,
    p_badge_color_key: v.badgeColorKey,
  });
  if (error) return adminRpcFailure(error, "Unable to create the room type.");
  return NextResponse.json({ data }, { status: 201 });
}
