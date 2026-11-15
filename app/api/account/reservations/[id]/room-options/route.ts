import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getAvailability, searchSchemaFor, hotelToday, getBookingTimezone } from "@/lib/booking";

// Customer-safe room-type options for the Request-a-Change modal. Availability
// comes from getAvailability — the same authoritative engine as Find a Room —
// projected down to name + units so the dropdown cannot misuse anything else.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const id = (await params).id;
  const query = new URL(request.url).searchParams;
  const { data: owned } = await supabase
    .from("reservations")
    .select("id,guests")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!owned) return publicJson({ error: "Reservation not found." }, { status: 404 });
  const parsed = searchSchemaFor(hotelToday(await getBookingTimezone())).safeParse({
    checkIn: query.get("checkIn"),
    checkOut: query.get("checkOut"),
    guests: Number(owned.guests ?? 1),
  });
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Choose valid dates." }), { status: 400 });
  try {
    const rooms = await getAvailability(parsed.data);
    return publicJson({
      data: rooms
        .filter((room) => room.availableUnits > 0)
        .map((room) => ({ name: room.name, availableUnits: room.availableUnits })),
    });
  } catch {
    return publicJson({ error: "We couldn't check room availability. Please try again." }, { status: 503 });
  }
}
