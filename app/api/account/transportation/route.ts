import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validationBody } from "@/lib/errors";
import { submitFleetTransportation } from "@/lib/fleet-submission";
import { publicJson } from "@/lib/server-errors";
import { supabase } from "@/lib/supabase";
import { isDateWithinStay, transportationRequestSchema } from "@/lib/transportation";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) {
    return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (session.user.role !== "guest") {
    return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  }
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const parsed = transportationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return publicJson(validationBody(parsed.error, { error: "Please check your transportation details." }), { status: 400 });
  }

  const ride = parsed.data;
  try {
    const { data: reservation, error: reservationError } = await supabase.from("reservations")
      .select("check_in,check_out").eq("id", ride.reservationId).eq("user_id", session.user.id).maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation) return publicJson({ error: "Reservation not found." }, { status: 404 });
    if (!isDateWithinStay(ride.pickupDate, reservation.check_in, reservation.check_out) ||
      (ride.returnDate && !isDateWithinStay(ride.returnDate, reservation.check_in, reservation.check_out))) {
      return publicJson({ error: `Choose a transportation date from ${reservation.check_in} through ${reservation.check_out}.` }, { status: 400 });
    }
    if (ride.fleetPickup) {
      return await submitFleetTransportation({ client: supabase, actorId: session.user.id, role: "guest" }, ride);
    }

    // Older clients submit a local request without Fleet sharing permission.
    const { data, error } = await supabase.rpc("customer_submit_transportation_request", {
      p_user_id: session.user.id, p_reservation_id: ride.reservationId, p_service_type: ride.serviceType,
      p_pickup_location: ride.pickupLocation ?? null, p_dropoff_location: ride.dropoffLocation ?? null,
      p_pickup_date: ride.pickupDate, p_pickup_time: ride.pickupTime,
      p_return_location: ride.returnLocation ?? null, p_return_date: ride.returnDate ?? null,
      p_return_time: ride.returnTime ?? null, p_passenger_count: ride.passengerCount,
      p_special_instructions: ride.specialInstructions ?? null, p_idempotency_key: ride.idempotencyKey,
    });
    if (!error) return publicJson({ data }, { status: 201 });
    if (error.message.includes("RESERVATION_NOT_FOUND")) return publicJson({ error: "Reservation not found." }, { status: 404 });
    if (error.message.includes("RESERVATION_NOT_REQUEST_READY")) return publicJson({ error: "You can request transportation once your reservation is confirmed. Contact Front Desk if you need help before then." }, { status: 409 });
    if (error.message.includes("TRANSPORTATION_OUTSIDE_STAY_WINDOW")) return publicJson({ error: "Transportation dates must be within the reserved stay." }, { status: 400 });
    if (error.message.includes("INVALID_TRANSPORTATION_SAME_LOCATION")) return publicJson({ error: "Choose a different location from the hotel." }, { status: 400 });
    if (error.message.includes("RETRY_PAYLOAD_CONFLICT")) return publicJson({ error: "This request changed. Check your ride requests before trying again." }, { status: 409 });
    if (error.message.includes("TRANSPORTATION_REQUEST_DUPLICATE")) return publicJson({ error: "You already have an active transportation request for this trip." }, { status: 409 });
    if (error.message.includes("CUSTOMER_ACCESS_REQUIRED")) return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
    if (error.message.includes("INVALID_")) return publicJson({ error: "Check the transportation details and try again." }, { status: 400 });
    throw error;
  } catch {
    return publicJson({ error: "Unable to submit your transportation request." }, { status: 500 });
  }
}
