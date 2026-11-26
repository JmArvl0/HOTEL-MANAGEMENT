import { publicJson } from "@/lib/server-errors";
import { getAuthenticatedSession } from "@/lib/authorization";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const ASSET_ROLES: Role[] = ["maintenance", "manager"];

const hotelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!ASSET_ROLES.includes(session.user.role as Role)) return publicJson({ error: "Asset registry access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  try {
    const { data, error } = await supabase
      .from("maintenance_assets")
      .select("id,name,category,room_id,location,last_serviced_at,service_interval_days,next_service_date,notes,active,created_at,updated_at,rooms(number)")
      .eq("active", true)
      .order("next_service_date", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    const assets = (data ?? []).map((row) => {
      // PostgREST returns the to-one rooms embed as an object; the client's
      // inferred type says array — normalize both shapes.
      const room = row.rooms as unknown as { number?: string } | { number?: string }[] | null | undefined;
      return {
      id: String(row.id),
      name: row.name,
      category: row.category,
      room_id: row.room_id ?? null,
      room_number: Array.isArray(room) ? room[0]?.number ?? null : room?.number ?? null,
      location: row.location ?? null,
      last_serviced_at: row.last_serviced_at ?? null,
      service_interval_days: Number(row.service_interval_days),
      next_service_date: row.next_service_date ?? null,
      notes: row.notes ?? null,
      active: Boolean(row.active),
      updated_at: row.updated_at,
      created_at: row.created_at
      };
    });
    return publicJson({ data: { assets, today: hotelToday() } });
  } catch {
    return publicJson({ error: "Unable to load the asset registry." }, { status: 500 });
  }
}

export async function POST() {
  const session = await getAuthenticatedSession();
  if (!session) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!ASSET_ROLES.includes(session.user.role)) return publicJson({ error: "Equipment history access required." }, { status: 403 });
  return publicJson({ error: "Facilities owns the equipment register. Report a room issue from Hotel Maintenance." }, { status: 410 });
}
