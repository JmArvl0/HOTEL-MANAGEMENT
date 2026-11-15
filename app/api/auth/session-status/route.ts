import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const unauthorized = () => publicJson({ error: "Session expired." }, { status: 401 });

/** Non-mutating synchronization: background checks never extend the session. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || !session.user.id) return unauthorized();
  return publicJson({ data: { expiresAt: session.sessionExpiresAt ?? null } }, { headers: { "Cache-Control": "no-store" } });
}

/** Called only after a real pointer/keyboard interaction in an authenticated shell. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || !session.user.id || !session.activityId || !supabase) return unauthorized();
  const { data, error } = await supabase.from("auth_session_activity").select("last_seen_at")
    .eq("session_id", session.activityId).eq("user_id", session.user.id).maybeSingle();
  if (error) return publicJson({ error: "Unable to refresh session activity." }, { status: 503 });
  if (!data || Date.now() - Date.parse(data.last_seen_at) >= 60_000) {
    const touched = await supabase.from("auth_session_activity").upsert({
      session_id: session.activityId, user_id: session.user.id, last_seen_at: new Date().toISOString(),
    });
    if (touched.error) return publicJson({ error: "Unable to refresh session activity." }, { status: 503 });
  }
  const refreshed = await getServerSession(authOptions);
  if (!refreshed || refreshed.user.disabled || !refreshed.user.id) return unauthorized();
  return publicJson({ data: { expiresAt: refreshed.sessionExpiresAt ?? null } }, { headers: { "Cache-Control": "no-store" } });
}
