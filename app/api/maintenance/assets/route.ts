import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { findAssetRoom } from "@/lib/asset-room";
import { calendarDate } from "@/lib/input-validation";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

// Roadmap Phase 8 — preventive maintenance asset registry.
// GET lists the hotel's active assets with their DERIVED due dates (read-only
// visibility; due dates never block a room). POST registers a REAL asset the
// hotel actually owns — the table starts empty and no equipment is ever seeded.
// Roles: departmental staff only — Owner/Admin supervise through their
// executive surfaces and never operate departmental routes (governance tests
// pin this boundary for everything under app/api/maintenance).

const ASSET_ROLES: Role[] = ["maintenance", "manager"];

const hotelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
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

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  category: z.string().trim().min(2).max(80),
  roomId: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  lastServicedAt: calendarDate.optional().nullable(),
  serviceIntervalDays: z.number().int().min(1).max(3650),
  notes: z.string().trim().max(500).optional().nullable()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!ASSET_ROLES.includes(session.user.role as Role)) return publicJson({ error: "Asset registry access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter a valid asset name, category, and service interval (1–3650 days)." }), { status: 400 });
  const value = parsed.data;
  if (value.lastServicedAt && value.lastServicedAt > hotelToday()) return publicJson({ error: "The last service date cannot be in the future." }, { status: 400 });

  // The staff-facing field is a room number or id — resolve it to the room id
  // the RPC expects (same id-or-number tolerance as work-order reporting).
  let roomId: string | null = null;
  if (value.roomId) {
    const { data: room, error } = await findAssetRoom(supabase, value.roomId);
    if (error) return publicJson({ error: "Could not look up the room." }, { status: 503 });
    if (!room) return publicJson({ error: "Choose a valid room or leave the room blank." }, { status: 409 });
    roomId = String(room.id);
  }

  const { data, error } = await supabase.rpc("maintenance_register_asset", {
    p_actor: session.user.id,
    p_name: value.name,
    p_category: value.category,
    p_room_id: roomId,
    p_location: value.location ?? null,
    p_last_serviced_at: value.lastServicedAt ?? null,
    p_service_interval_days: value.serviceIntervalDays,
    p_notes: value.notes ?? null
  });
  if (error) {
    const key = ["ASSET_REGISTRY_FORBIDDEN", "INVALID_ASSET", "ROOM_NOT_FOUND"].find((item) => error.message.includes(item));
    return publicJson({ error: key === "ROOM_NOT_FOUND" ? "Choose a valid room or leave the room blank." : "Unable to register this asset." }, { status: 409 });
  }
  return publicJson({ data: { id: data } }, { status: 201 });
}
