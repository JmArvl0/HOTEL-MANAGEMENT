import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAvailability, searchSchemaFor, hotelToday, getBookingTimezone } from "@/lib/booking";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["front_desk"]);

// Staff-facing availability: the same server-side pricing/inventory arithmetic the public
// search page uses (lib/booking.ts getAvailability). The client never computes money.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!allowed.has(session.user.role)) return publicJson({ error: "Only Front Desk can perform this action. Ask Front Desk for help." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const parsed = searchSchemaFor(hotelToday(await getBookingTimezone())).safeParse({
    checkIn: params.get("checkIn") ?? "",
    checkOut: params.get("checkOut") ?? "",
    guests: params.get("guests") ?? "1",
  });
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Please check the stay dates and number of guests." }), { status: 400 });
  try {
    const data = await getAvailability(parsed.data);
    return publicJson({ data });
  } catch {
    return publicJson({ error: "Unable to check availability right now." }, { status: 502 });
  }
}
