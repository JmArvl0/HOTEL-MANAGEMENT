import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ensureRoomQrToken, qrDataUrl } from "@/lib/qr/tokens";
import { QrPlacard } from "@/components/qr/qr-placard";

/**
 * Printable room operations placard. Staff-only. The QR is the room's
 * persistent operations token — what a scan opens depends on who scans it
 * (guest request entry for the assigned guest, task context for housekeeping,
 * work orders for maintenance, room summary for front desk and management).
 */

const STAFF = new Set(["front_desk", "manager", "owner", "admin", "housekeeping", "maintenance"]);

export default async function RoomPlacardPage({ params }: { params: Promise<{ roomId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent("/manager_dashboard")}`);
  if (!STAFF.has(session.user.role)) redirect("/manager_dashboard");
  if (!supabase) redirect("/manager_dashboard");

  const { roomId } = await params;
  const { data: room } = await supabase.from("rooms").select("id,number,floor,type,administratively_active").eq("id", roomId).maybeSingle();
  if (!room || room.administratively_active === false) notFound();

  const token = await ensureRoomQrToken(roomId, session.user.id);
  if (!token) notFound();

  return (
    <QrPlacard
      room={{ id: room.id, number: room.number, floor: room.floor, type: room.type }}
      dataUrl={await qrDataUrl(token)}
      canRotate={["manager", "owner", "admin"].includes(session.user.role)}
    />
  );
}
