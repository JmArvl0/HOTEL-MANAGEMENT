import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ensureRoomQrToken, qrDataUrl } from "@/lib/qr/tokens";

/**
 * Room operations QR — placard payload for staff. The token is persistent
 * (printed placards stay valid) and is re-issued lazily the first time a room
 * has no active token. The QR itself carries only the opaque token; what a
 * scan grants depends entirely on who scans it (see /api/qr/resolve).
 */

const STAFF = new Set(["front_desk", "manager", "owner", "admin", "housekeeping", "maintenance"]);

export async function GET(_request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!STAFF.has(session.user.role)) return publicJson({ error: "Staff access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });

  const { roomId } = await context.params;
  const { data: room } = await supabase.from("rooms").select("id,number,floor,type").eq("id", roomId).maybeSingle();
  if (!room) return publicJson({ error: "Room not found." }, { status: 404 });

  const token = await ensureRoomQrToken(roomId, session.user.id);
  if (!token) return publicJson({ error: "Unable to generate the room QR." }, { status: 500 });
  return publicJson({ data: { room, dataUrl: await qrDataUrl(token) } });
}
