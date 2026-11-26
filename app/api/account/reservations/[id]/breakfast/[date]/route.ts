import { getAuthenticatedSession } from "@/lib/authorization";
import { breakfastDate, breakfastDayLabel } from "@/lib/breakfast";
import { canShowBreakfastPass, getGuestBreakfast } from "@/lib/breakfast-server";
import { breakfastPassPng } from "@/lib/breakfast-pass-image";
import { displayTime } from "@/lib/hotel-policy";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; date: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return new Response(null, { status: 401 });
  if (session.user.role !== "guest") return new Response(null, { status: 403 });
  const { id, date } = await params;
  if (!breakfastDate.safeParse(date).success) return new Response(null, { status: 404 });
  try {
    const booking = await getGuestBreakfast(session.user.id, id);
    const day = booking?.days.find(item => item.service_date === date);
    if (!booking?.snapshot || !day || day.used >= day.allowance || !canShowBreakfastPass(booking.stay, date, booking.snapshot.timezone, booking.snapshot.end)) {
      return new Response(null, { status: 404 });
    }
    const png = await breakfastPassPng({
      code: day.pass_code, date: breakfastDayLabel(date), venue: booking.snapshot.venue,
      hours: `${displayTime(booking.snapshot.start)} – ${displayTime(booking.snapshot.end)} · hotel time`,
      room: booking.stay.room_number ? `Room ${booking.stay.room_number}` : "Room to be assigned",
      reference: booking.stay.confirmation_number ?? booking.stay.id, allowance: day.allowance,
    });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="haven-breakfast-${date}.png"`, "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "The pass image could not be generated. Show the pass on your screen or try again." }, { status: 503 });
  }
}
