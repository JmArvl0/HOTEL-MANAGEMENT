import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function DELETE(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user.id || session.user.disabled || session.user.otpPending || session.user.role !== "guest") {
    return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 401 });
  }
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) {
    return publicJson({ error: "Reopen this booking from your account." }, { status: 400 });
  }
  if (!supabase) return publicJson({ error: "Booking is temporarily unavailable." }, { status: 503 });

  // The conditional update locks the same row as deposit conversion. Once a
  // payment has claimed it, this action can no longer release the room.
  const { data, error } = await supabase.from("booking_holds")
    .update({ status: "expired" })
    .eq("token", token)
    .eq("user_id", session.user.id)
    .eq("status", "active")
    .is("reservation_id", null)
    .select("token")
    .maybeSingle();
  if (error) {
    console.error("Booking hold release failed", { code: error.code });
    return publicJson({ error: "We couldn't confirm whether the hold was released. Refresh your bookings to check its status." }, { status: 503 });
  }
  if (!data) return publicJson({ error: "This hold has changed. Refresh to see the latest booking status." }, { status: 409 });
  return new Response(null, { status: 204 });
}
