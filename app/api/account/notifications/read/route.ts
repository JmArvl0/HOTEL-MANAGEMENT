import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { countUnreadNotifications, markAllNotificationsRead, markNotificationsRead } from "@/lib/notifications";

// Date-scoped mark-read for the history modal ("Mark this day as read" sends
// the visible day's unread ids). No bulk-all path: opening the modal itself
// never calls this route.
const schema = z.union([
  z.object({ ids: z.array(z.string().min(1).max(80)).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Please check the highlighted details." }), { status: 400 });
    if ("all" in parsed.data) {
      await markAllNotificationsRead(session.user.id);
      return publicJson({ data: { all: true }, unreadCount: 0 });
    }
    const ids = [...new Set(parsed.data.ids)];
    await markNotificationsRead(session.user.id, ids);
    const unreadCount = await countUnreadNotifications(session.user.id);
    return publicJson({ data: { read: ids.length }, unreadCount });
  } catch {
    return publicJson({ error: "Unable to update notifications." }, { status: 500 });
  }
}
