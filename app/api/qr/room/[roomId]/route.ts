import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
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
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!STAFF.has(session.user.role)) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const { roomId } = await context.params;
  const { data: room } = await supabase.from("rooms").select("id,number,floor,type").eq("id", roomId).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const token = await ensureRoomQrToken(roomId, session.user.id);
  if (!token) return NextResponse.json({ error: "Unable to generate the room QR." }, { status: 500 });
  return NextResponse.json({ data: { room, dataUrl: await qrDataUrl(token) } });
}
