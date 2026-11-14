import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function DELETE(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user.id || session.user.disabled || session.user.otpPending || session.user.role !== "guest") {
    return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  }
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) {
    return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  }
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });

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
    return NextResponse.json({ error: "Could not release this hold. Please try again." }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "This hold has changed. Refresh to see the latest booking status." }, { status: 409 });
  return new Response(null, { status: 204 });
}
