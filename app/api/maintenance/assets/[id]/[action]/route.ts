import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

// Roadmap Phase 8 — asset registry actions: record-service (advances the
// derived schedule), update (registry fields), deactivate (retire; no delete).
// Every action runs through its audited SECURITY DEFINER RPC. Nothing here
// creates work orders or touches rooms — due dates are visibility only.

const ASSET_ROLES: Role[] = ["maintenance", "manager"];

const hotelToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

const input = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional().nullable(),
  name: z.string().trim().min(3).max(120).optional().nullable(),
  category: z.string().trim().min(2).max(80).optional().nullable(),
  roomId: z.string().trim().max(40).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  serviceIntervalDays: z.number().int().min(1).max(3650).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  reason: z.string().trim().min(3).max(500)
});

const messages: Record<string, string> = {
  ASSET_NOT_FOUND: "This asset is no longer in the registry.",
  ASSET_INACTIVE: "This asset has been deactivated.",
  INVALID_SERVICE_DATE: "The service date cannot be in the future.",
  ROOM_NOT_FOUND: "Choose a valid room or leave the room blank."
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ASSET_ROLES.includes(session.user.role as Role)) return NextResponse.json({ error: "Asset registry access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id, action } = await params;
  const parsed = input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid asset details." }, { status: 400 });
  const value = parsed.data;
  if (action === "record-service" && value.serviceDate > hotelToday()) return NextResponse.json({ error: "The service date cannot be in the future." }, { status: 400 });

  // Room is staff-typed (number or id) — resolve before the RPC, same as
  // registration. Null means "leave unchanged" for update.
  let roomId: string | null | undefined;
  if (value.roomId) {
    const { data: room } = await supabase.from("rooms").select("id").or(`id.eq.${value.roomId},number.eq.${value.roomId}`).maybeSingle();
    if (!room) return NextResponse.json({ error: "Choose a valid room or leave the room blank." }, { status: 409 });
    roomId = String(room.id);
  }

  let rpc: string;
  let args: Record<string, unknown>;
  switch (action) {
    case "record-service":
      rpc = "maintenance_record_asset_service";
      args = { p_actor: session.user.id, p_asset_id: id, p_service_date: value.serviceDate, p_notes: value.note ?? null };
      break;
    case "update":
      rpc = "maintenance_update_asset";
      args = { p_actor: session.user.id, p_asset_id: id, p_name: value.name ?? null, p_category: value.category ?? null, p_room_id: roomId ?? null, p_location: value.location ?? null, p_service_interval_days: value.serviceIntervalDays ?? null, p_notes: value.notes ?? null };
      break;
    case "deactivate":
      rpc = "maintenance_deactivate_asset";
      args = { p_actor: session.user.id, p_asset_id: id, p_reason: value.reason };
      break;
    default:
      return NextResponse.json({ error: "Unknown asset action." }, { status: 404 });
  }
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) {
    const key = Object.keys(messages).find((item) => error.message.includes(item));
    return NextResponse.json({ error: key ? messages[key] : "The asset action could not be completed." }, { status: 409 });
  }
  return NextResponse.json({ data });
}
