import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { markNotificationsRead } from "@/lib/notifications";

// Date-scoped mark-read for the history modal ("Mark this day as read" sends
// the visible day's unread ids). No bulk-all path: opening the modal itself
// never calls this route.
const schema = z.object({ ids: z.array(z.string().min(1).max(80)).min(1).max(200) });

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const ids = [...new Set(parsed.data.ids)];
    await markNotificationsRead(session.user.id, ids);
    return NextResponse.json({ data: { read: ids.length } });
  } catch {
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}
