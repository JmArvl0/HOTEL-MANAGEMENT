import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { depositSubmissionSchema } from "@/lib/booking";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.role !== "guest") return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  try {
    const parsed = depositSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the payment reference." }, { status: 400 });
    const { data, error } = await supabase.rpc("submit_reservation_deposit", {
      p_token: token, p_user_id: session.user.id,
      p_payment_method: parsed.data.paymentMethod, p_payment_reference: parsed.data.paymentReference
    });
    if (error) {
      const messages: Record<string,string> = {
        HOLD_EXPIRED: "Your reservation hold expired before payment was submitted. Please choose from the currently available rooms.",
        ROOM_TYPE_UNAVAILABLE: "This room is no longer available. No reservation was confirmed.",
        RATE_CHANGED: "The room rate changed. Please search again to review the current rate.",
        INVALID_PAYMENT_REFERENCE: "Enter a valid payment reference.",
      };
      const key = Object.keys(messages).find((item) => error.message.includes(item));
      return NextResponse.json({ error: key ? messages[key] : "We could not submit the reservation deposit." }, { status: 409 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ reservationId: row.reservation_id, confirmationNumber: row.confirmation_number, reservationStatus: row.reservation_status, paymentStatus: row.payment_status });
  } catch {
    return NextResponse.json({ error: "We could not submit the reservation deposit. Please try again." }, { status: 500 });
  }
}
