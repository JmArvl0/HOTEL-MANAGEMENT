import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const PICKUP_PHOTO_BUCKET = "transport-pickup-photos";
export const pickupJson = (body: unknown, status = 200) => publicJson(body, { status, headers: { "Cache-Control": "no-store" } });
export async function guardPickupRequest(id: string, writing = false) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return pickupJson({ error: "Please sign in to continue." }, 401);
  if (!supabase) return pickupJson({ error: "This service is temporarily unavailable. Please try again shortly." }, 503);
  const role = session.user.role;
  if (!(writing ? ["guest", "front_desk"] : ["guest", "front_desk", "manager", "owner"]).includes(role)) return pickupJson({ error: "Transportation access required." }, 403);
  // Recheck active identity before returning private data, including existing sessions.
  const actor = await supabase.from("user_accounts").select("id").eq("id", session.user.id).eq("role", role).eq("active", true).eq("account_status", "active").maybeSingle();
  if (actor.error) return pickupJson({ error: "Unable to verify access." }, 503);
  if (!actor.data) return pickupJson({ error: "Please sign in to continue." }, 401);
  const trip = await supabase.from("transportation_requests").select("id,reservation_id,status,version,reservations!inner(user_id)").eq("id", id).maybeSingle();
  if (trip.error) return pickupJson({ error: "Unable to load this request." }, 503);
  const reservation = trip.data?.reservations as unknown as { user_id: string | null } | undefined;
  if (!trip.data || (role === "guest" && reservation?.user_id !== session.user.id)) return pickupJson({ error: "Request not found." }, 404);
  return { client: supabase, actor: session.user.id, role, trip: trip.data };
}
