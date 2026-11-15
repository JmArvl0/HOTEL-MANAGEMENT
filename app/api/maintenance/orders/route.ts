import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["front_desk", "maintenance"]);
const schema = z.object({
  roomId: z.string().trim().max(40).optional().nullable(),
  targetType: z.enum(["room", "equipment", "facility"]).default("room"),
  targetLabel: z.string().trim().max(120).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().min(3).max(1000),
  priority: z.enum(["low", "normal", "high", "urgent", "critical"]).default("normal"),
  reservationId: z.string().trim().max(40).optional().nullable(),
  guestRequestId: z.string().uuid().optional().nullable(),
  sourceType: z.string().trim().max(40).default("manual"),
  sourceId: z.string().trim().max(120).optional().nullable(),
  idempotencyKey: z.string().uuid().default(() => crypto.randomUUID()),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!allowed.has(session.user.role)) return publicJson({ error: "Maintenance reporting access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter a valid issue, location, and priority." }), { status: 400 });
  const value = parsed.data;
  const { data, error } = await supabase.rpc("maintenance_create_work_order", {
    p_room_id: value.roomId ?? null,
    p_target_type: value.targetType,
    p_target_label: value.targetLabel ?? null,
    p_category: value.category ?? null,
    p_description: value.description,
    p_priority: value.priority,
    p_reservation_id: value.reservationId ?? null,
    p_guest_request_id: value.guestRequestId ?? null,
    p_source_type: value.sourceType,
    p_source_id: value.sourceId ?? null,
    p_idempotency_key: value.idempotencyKey,
    p_staff_user_id: session.user.id,
  });
  if (error) return publicJson({ error: error.message.includes("ROOM_NOT_FOUND") ? "Choose a valid room." : "Unable to create the work order." }, { status: 409 });
  return publicJson({ data: { id: data } }, { status: 201 });
}
