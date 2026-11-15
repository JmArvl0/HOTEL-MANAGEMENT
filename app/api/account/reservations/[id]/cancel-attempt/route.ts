import { publicJson } from "@/lib/server-errors";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * Guest abandon of an unsettled gateway checkout. Frees the room the guest
 * never paid for so they can start over; a settled payment cannot be
 * cancelled here (it is already confirmed).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("cancel_gateway_attempt", {
    p_reservation_id: id,
    p_user_id: session.user.id,
  });
  if (error) {
    if (error.message.includes("GATEWAY_ATTEMPT_NOT_FOUND"))
      return publicJson({ error: "Reservation not found." }, { status: 404 });
    if (error.message.includes("GATEWAY_ALREADY_SETTLED"))
      return publicJson({ error: "This payment has already been confirmed and cannot be cancelled here. Please contact Front Desk if you need help." }, { status: 409 });
    if (error.message.includes("GATEWAY_ATTEMPT_NOT_GATEWAY") || error.message.includes("GATEWAY_ATTEMPT_NOT_PENDING"))
      return publicJson({ error: "Only an online payment that is still awaiting confirmation can be cancelled here." }, { status: 409 });
    return publicJson({ error: "Unable to cancel this payment attempt." }, { status: 500 });
  }
  return publicJson({ data: Array.isArray(data) ? data[0] : data });
}
