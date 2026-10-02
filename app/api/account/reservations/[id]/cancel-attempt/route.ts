import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * Guest abandon of an unsettled gateway checkout. Frees the room the guest
 * never paid for so they can start over; a settled payment cannot be
 * cancelled here (it is already confirmed).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("cancel_gateway_attempt", {
    p_reservation_id: id,
    p_user_id: session.user.id,
  });
  if (error) {
    if (error.message.includes("GATEWAY_ATTEMPT_NOT_FOUND"))
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    if (error.message.includes("GATEWAY_ALREADY_SETTLED"))
      return NextResponse.json({ error: "This payment already went through — nothing to cancel." }, { status: 409 });
    if (error.message.includes("GATEWAY_ATTEMPT_NOT_GATEWAY") || error.message.includes("GATEWAY_ATTEMPT_NOT_PENDING"))
      return NextResponse.json({ error: "Only an unsettled online payment can be cancelled." }, { status: 409 });
    return NextResponse.json({ error: "Unable to cancel this payment attempt." }, { status: 500 });
  }
  return NextResponse.json({ data: Array.isArray(data) ? data[0] : data });
}
