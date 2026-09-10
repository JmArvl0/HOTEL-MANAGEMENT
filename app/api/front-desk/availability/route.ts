import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAvailability, searchSchema } from "@/lib/booking";
import { supabase } from "@/lib/supabase";

const allowed = new Set(["front_desk"]);

// Staff-facing availability: the same server-side pricing/inventory arithmetic the public
// search page uses (lib/booking.ts getAvailability). The client never computes money.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!allowed.has(session.user.role)) return NextResponse.json({ error: "Front Desk access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const parsed = searchSchema.safeParse({
    checkIn: params.get("checkIn") ?? "",
    checkOut: params.get("checkOut") ?? "",
    guests: params.get("guests") ?? "1",
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid search." }, { status: 400 });
  try {
    const data = await getAvailability(parsed.data);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unable to check availability right now." }, { status: 502 });
  }
}
