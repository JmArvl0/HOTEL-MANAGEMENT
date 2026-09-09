import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notifyWithOptionalEmail } from "@/lib/notifications";

const permitted = new Set(["accounting"]);
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
      HOLD_EXPIRED: "This payment can no longer be verified — the hold was already completed or the reservation was cancelled.",
      PAYMENT_NOT_PENDING: "This payment is no longer awaiting verification.",
      PAYMENT_AMOUNT_MISMATCH: "The submitted deposit does not match the authoritative reservation amount.",
      ROOM_TYPE_UNAVAILABLE: "Inventory could not be revalidated. The reservation was not confirmed.",
    };
    const key = Object.keys(messages).find((item) => error.message.includes(item));
    return NextResponse.json({ error: key ? messages[key] : "Unable to verify this reservation deposit." }, { status: 409 });
  }
  const result = Array.isArray(data) ? data[0] : data;
  // Side channel: tell the guest their booking is confirmed. Never blocks the
  // verification that already committed.
  const row = result as { reservation_id?: string } | null;
  if (row?.reservation_id) {
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id,user_id,confirmation_number,guest_email,room_type,check_in,check_out,total,deposit")
      .eq("id", row.reservation_id)
      .maybeSingle();
    if (reservation?.user_id) {
      void notifyWithOptionalEmail(
        { userId: reservation.user_id, type: "reservation_confirmed", title: "Reservation confirmed", detail: `${reservation.room_type} — ${reservation.confirmation_number}`, href: `/my-reservations/${reservation.id}` },
        reservation.guest_email,
        {
          subject: "Your Haven reservation is confirmed",
          heading: "Your reservation is confirmed",
          bodyHtml: `<p>Your deposit has been verified and your stay is confirmed.</p>
<table style="font-size:14px;line-height:1.8">
<tr><td style="color:#8a8a8a">Confirmation</td><td><strong>${reservation.confirmation_number}</strong></td></tr>
<tr><td style="color:#8a8a8a">Room</td><td>${reservation.room_type}</td></tr>
<tr><td style="color:#8a8a8a">Stay</td><td>${reservation.check_in} to ${reservation.check_out}</td></tr>
<tr><td style="color:#8a8a8a">Deposit paid</td><td>PHP ${Number(reservation.deposit).toLocaleString("en-PH")}</td></tr>
</table>`
        }
      );
    }
  }
  return NextResponse.json({ data: result });
}
