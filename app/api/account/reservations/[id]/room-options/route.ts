import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getAvailability, searchSchema } from "@/lib/booking";

// Customer-safe room-type options for the Request-a-Change modal. Availability
// comes from getAvailability — the same authoritative engine as Find a Room —
// projected down to name + units so the dropdown cannot misuse anything else.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const id = (await params).id;
  const query = new URL(request.url).searchParams;
  const { data: owned } = await supabase
    .from("reservations")
    .select("id,guests")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  const parsed = searchSchema.safeParse({
    checkIn: query.get("checkIn"),
    checkOut: query.get("checkOut"),
    guests: Number(owned.guests ?? 1),
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Choose valid dates." }, { status: 400 });
  try {
    const rooms = await getAvailability(parsed.data);
    return NextResponse.json({
      data: rooms
        .filter((room) => room.availableUnits > 0)
        .map((room) => ({ name: room.name, availableUnits: room.availableUnits })),
    });
  } catch {
    return NextResponse.json({ error: "Availability is unavailable right now. Please try again." }, { status: 503 });
  }
}
