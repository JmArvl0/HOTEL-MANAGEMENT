import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { hashQrToken } from "@/lib/qr/tokens";

const schema = z.object({ qrToken: z.string().trim().min(10).max(200) });

const FRIENDLY: Record<string, string> = {
  SELF_CHECKIN_NOT_CONFIRMED: "This reservation is not confirmed yet. Please see the Front Desk.",
  SELF_CHECKIN_ID_UNVERIFIED: "Your ID is not verified yet. Please see the Front Desk with a valid ID.",
  SELF_CHECKIN_BALANCE_DUE: "There is a remaining balance on your folio. Please settle it at the Front Desk first.",
  SELF_CHECKIN_OUTSIDE_WINDOW: "Self check-in is available from your check-in date. Please see the Front Desk.",
  SELF_CHECKIN_TOO_EARLY: "Your room is not ready for early check-in. Please see the Front Desk.",
  SELF_CHECKIN_NO_ROOM: "No room is assigned to your reservation yet. Please see the Front Desk.",
  SELF_CHECKIN_ROOM_NOT_READY: "Your room is still being prepared. Please see the Front Desk.",
  SELF_CHECKIN_INVALID_QR: "This QR code is not recognized. It may have been replaced.",
};

/**
 * Express self-check-in for the reservation owner. The QR is a lookup key;
 * every eligibility rule is enforced inside express_qr_self_check_in. Any
 * failure routes the guest to the Front Desk with a friendly reason.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A QR code is required." }, { status: 400 });

  const { data, error } = await supabase.rpc("express_qr_self_check_in", {
    p_qr_token_hash: hashQrToken(parsed.data.qrToken),
    p_user_id: session.user.id,
  });
  if (error) {
    const code = error.message.split(":")[0].trim();
    if (code === "SELF_CHECKIN_FORBIDDEN")
      return NextResponse.json({ error: "This QR code does not belong to your reservation." }, { status: 403 });
    if (code in FRIENDLY) return NextResponse.json({ error: FRIENDLY[code], code }, { status: 409 });
    return NextResponse.json({ error: "Self check-in is unavailable. Please see the Front Desk." }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    reservation_id: string;
    room_number: string;
    room_floor: string;
    digital_key: string;
  };
  return NextResponse.json({
    data: {
      reservationId: row.reservation_id,
      roomNumber: row.room_number,
      roomFloor: row.room_floor,
      digitalKey: row.digital_key,
    },
  });
}
