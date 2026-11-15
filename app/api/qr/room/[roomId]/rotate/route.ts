import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { qrDataUrl, rotateRoomQrToken } from "@/lib/qr/tokens";

/**
 * Rotate a room's operations QR (Manager/Owner/Admin). Revokes the current
 * token — any printed placard showing it stops working immediately — and
 * returns a fresh QR to print.
 */

const AUTHORIZED = new Set(["manager", "owner", "admin"]);

export async function POST(_request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!AUTHORIZED.has(session.user.role)) return publicJson({ error: "Manager access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });

  const { roomId } = await context.params;
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle();
  if (!room) return publicJson({ error: "Room not found." }, { status: 404 });

  const token = await rotateRoomQrToken(roomId, session.user.id);
  if (!token) return publicJson({ error: "Unable to rotate the room QR." }, { status: 500 });
  return publicJson({ data: { dataUrl: await qrDataUrl(token), rotatedAt: new Date().toISOString() } });
}
