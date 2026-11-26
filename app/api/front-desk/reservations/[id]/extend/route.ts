import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { STAY_EXTENSION_HOLD_MESSAGE } from "@/lib/error-messages";
import { validationBody } from "@/lib/errors";
import { roomHeldConflict } from "@/lib/front-desk-room-conflict";
import { publicJson } from "@/lib/server-errors";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["front_desk"]);
const schema = z.object({
  checkOut: z.string().date(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!allowed.has(session.user.role)) return publicJson({ error: "Stay-extension access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "A later checkout date and reason are required." }), { status: 400 });

  const { data, error } = await supabase.rpc("front_desk_extend_stay", {
    p_reservation_id: (await params).id,
    p_new_check_out: parsed.data.checkOut,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_staff_user_id: session.user.id,
  });
  if (error) {
    const holdConflict = roomHeldConflict(error, STAY_EXTENSION_HOLD_MESSAGE);
    if (holdConflict) return holdConflict;

    switch (error.message) {
      case "EXTENSION_REQUIRES_ROOM_CHANGE":
        return publicJson({ code: error.message, error: "The assigned room conflicts with a future stay. Coordinate a room change or choose another date." }, { status: 409 });
      case "INVALID_EXTENSION_DATE":
        return publicJson({ code: error.message, error: "The new checkout must be later than the current checkout." }, { status: 409 });
      case "EXTENSION_IDEMPOTENCY_CONFLICT":
        return publicJson({ code: error.message, error: "This extension attempt cannot be reused. Review the current checkout date and folio before trying again." }, { status: 409 });
      case "EXTENSION_FORBIDDEN":
        return publicJson({ error: "Stay-extension access required." }, { status: 403 });
      case "RESERVATION_NOT_IN_HOUSE":
      case "ACTIVE_ASSIGNMENT_NOT_FOUND":
      case "ROOM_TYPE_UNAVAILABLE":
      case "FOLIO_NOT_FOUND":
        return publicJson({ error: "This stay cannot be extended. Refresh the reservation and check its room assignment and folio." }, { status: 409 });
    }
  }

  if (error || !data?.[0]) {
    return publicJson({ error: "Could not confirm the extension. Retry with the same details to recover the result." }, { status: 503 });
  }
  return publicJson({ data: data[0] });
}
