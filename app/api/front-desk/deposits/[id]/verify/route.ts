import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const permitted = new Set(["front_desk","accounting"]);
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permitted.has(session.user.role)) return NextResponse.json({ error: "Payment verification permission required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid payment record." }, { status: 400 });
  const { data, error } = await supabase.rpc("verify_reservation_deposit", { p_payment_id: id, p_staff_user_id: session.user.id });
  if (error) {
    const messages: Record<string,string> = {
      HOLD_EXPIRED: "The reservation hold expired; this payment can no longer confirm the room.",
      PAYMENT_NOT_PENDING: "This payment is no longer awaiting verification.",
      PAYMENT_AMOUNT_MISMATCH: "The submitted deposit does not match the authoritative reservation amount.",
      ROOM_TYPE_UNAVAILABLE: "Inventory could not be revalidated. The reservation was not confirmed.",
    };
    const key = Object.keys(messages).find((item) => error.message.includes(item));
    return NextResponse.json({ error: key ? messages[key] : "Unable to verify this reservation deposit." }, { status: 409 });
  }
  return NextResponse.json({ data: Array.isArray(data) ? data[0] : data });
}
