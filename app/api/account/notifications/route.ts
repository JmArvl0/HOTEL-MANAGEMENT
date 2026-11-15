import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { countUnreadNotifications, getCustomerNotifications, hotelDayKey } from "@/lib/notifications";

// Fuller history for the notification-history modal. The header dropdown keeps
// its 5-item server seed; this route serves the modal (default 100, max 200)
// with optional ?date=YYYY-MM-DD hotel-day filtering and an additive
// ?offset=0.. for "Load more" paging through the complete history.
// Note: date filtering stays a client-side slice of the loaded rows, so the
// modal never combines a date filter with a server offset.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 100;
    const rawOffset = Number(url.searchParams.get("offset") ?? "0");
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;
    const date = url.searchParams.get("date");
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return publicJson({ error: "Please choose a valid date." }, { status: 400 });
    }
    const [rows, unreadCount] = await Promise.all([
      getCustomerNotifications(session.user.id, limit, offset),
      countUnreadNotifications(session.user.id),
    ]);
    const data = date ? rows.filter((row) => hotelDayKey(row.createdAt) === date) : rows;
    return publicJson({ data, unreadCount });
  } catch {
    return publicJson({ error: "Unable to load notifications." }, { status: 500 });
  }
}
