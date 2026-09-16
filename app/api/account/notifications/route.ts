import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getCustomerNotifications, hotelDayKey } from "@/lib/notifications";

// Fuller history for the notification-history modal. The header dropdown keeps
// its 5-item server seed; this route serves the modal (default 100, max 200)
// with optional ?date=YYYY-MM-DD hotel-day filtering.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 100;
    const date = url.searchParams.get("date");
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    }
    const rows = await getCustomerNotifications(session.user.id, limit);
    const data = date ? rows.filter((row) => hotelDayKey(row.createdAt) === date) : rows;
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}
