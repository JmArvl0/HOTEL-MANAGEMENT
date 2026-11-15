import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { hotelToday } from "@/lib/booking";
import { findAssetRoom } from "@/lib/asset-room";
import { calendarDate } from "@/lib/input-validation";

const schemas = {
  "record-service": z.object({ serviceDate: calendarDate, note: z.string().trim().max(500).nullish() }),
  update: z.object({
    expectedUpdated: z.string().datetime({ offset: true }),
    name: z.string().trim().min(3).max(120).nullish(),
    category: z.string().trim().min(2).max(80).nullish(),
    roomId: z.string().trim().max(40).nullish(),
    location: z.string().trim().max(120).nullish(),
    serviceIntervalDays: z.number().int().min(1).max(3650).nullish(),
    notes: z.string().trim().max(500).nullish(),
  }),
  deactivate: z.object({ expectedUpdated: z.string().datetime({ offset: true }), reason: z.string().trim().min(3).max(500) }),
};

const messages: Record<string, [string, number]> = {
  SERVICE_WORK_NOT_COMPLETED: ["Complete the linked work order and record linked service in Preventive work.", 409],
  ASSET_NOT_FOUND: ["This asset is no longer in the registry.", 404],
  ASSET_STALE: ["This asset changed. Refresh the registry before saving again.", 409],
  ASSET_INACTIVE: ["This asset has been deactivated.", 409],
  INVALID_SERVICE_DATE: ["Choose a valid service date on or before today.", 400],
  ROOM_NOT_FOUND: ["Choose a valid room or leave the room blank.", 404],
  ASSET_REGISTRY_FORBIDDEN: ["Asset registry access required.", 403],
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!["maintenance", "manager"].includes(session.user.role)) return publicJson({ error: "Asset registry access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { id, action } = await params;
  if (!z.string().uuid().safeParse(id).success) return publicJson({ error: "Select an asset from the registry and try again." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const base = { p_actor: session.user.id, p_asset_id: id };
  let operation: string;
  let payload: Record<string, unknown>;
  if (action === "record-service") {
    const parsed = schemas[action].safeParse(body);
    if (!parsed.success || parsed.data.serviceDate > hotelToday()) return publicJson({ error: "Choose a valid service date on or before today." }, { status: 400 });
    operation = "maintenance_record_asset_service";
    payload = { ...base, p_service_date: parsed.data.serviceDate, p_notes: parsed.data.note ?? null };
  } else if (action === "update") {
    const parsed = schemas[action].safeParse(body);
    if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter valid asset details." }), { status: 400 });
    const value = parsed.data;
    const room = value.roomId ? await findAssetRoom(supabase, value.roomId) : null;
    if (room?.error) return publicJson({ error: "Could not look up the room." }, { status: 503 });
    if (room && !room.data) return publicJson({ error: "Choose an existing room or leave it blank." }, { status: 404 });
    operation = "maintenance_apply_asset_change";
    payload = { ...base, p_expected_updated: value.expectedUpdated, p_action: "update", p_details: {
      ...value, roomId: room?.data?.id ?? (value.roomId === undefined ? null : ""),
    } };
  } else if (action === "deactivate") {
    const parsed = schemas[action].safeParse(body);
    if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Give a reason for deactivating the asset." }), { status: 400 });
    operation = "maintenance_apply_asset_change";
    payload = { ...base, p_expected_updated: parsed.data.expectedUpdated, p_action: "deactivate", p_details: { reason: parsed.data.reason } };
  } else {
    return publicJson({ error: "Unknown asset action." }, { status: 404 });
  }
  const { data, error } = await supabase.rpc(operation, payload);
  if (error) {
    const key = Object.keys(messages).find(code => error.message.includes(code));
    const [message, status] = key ? messages[key] : ["The asset action could not be completed.", 503] as const;
    return publicJson({ error: message }, { status });
  }
  return publicJson({ data });
}
