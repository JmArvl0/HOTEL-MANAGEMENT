import type { z } from "zod";
import { scheduleFleetDelivery } from "@/lib/fleet-delivery";
import { fleetRideInstructions } from "@/lib/fleet-pickup-input";
import { publicJson } from "@/lib/server-errors";
import { type TransportationContext, transportationRpcFailure } from "@/lib/transportation-route";
import type { transportationRequestSchema } from "@/lib/transportation";

export async function submitFleetTransportation(
  { client, actorId }: TransportationContext,
  { reservationId, idempotencyKey, fleetPickup, ...ride }: z.infer<typeof transportationRequestSchema>,
) {
  if (!fleetPickup) return publicJson({ error: "Confirm the passenger contact and sharing permission." }, { status: 400 });
  const { vehicleSeats, ...profile } = fleetPickup;
  const { data, error } = await client.rpc("submit_fleet_transportation_request", {
    p_actor: actorId, p_reservation_id: reservationId,
    p_ride: { ...ride, specialInstructions: fleetRideInstructions(ride.specialInstructions, vehicleSeats) },
    p_profile: profile, p_idempotency_key: idempotencyKey,
  });
  if (error) return transportationRpcFailure(error, {
    RESERVATION_NOT_FOUND: "An eligible reservation with a guest account is required.",
    RESERVATION_NOT_REQUEST_READY: "This reservation must be confirmed before requesting transportation.",
    INVALID_TRANSPORTATION_SCHEDULE: "Choose a future ride time within the stay dates.",
    INVALID_TRANSPORTATION_SAME_LOCATION: "Choose a different location from the hotel.",
    INVALID_RETURN_SCHEDULE: "The return must follow the arrival pickup.",
    TRANSPORTATION_REQUEST_DUPLICATE: "An active transportation request already exists for this trip.",
    RETRY_PAYLOAD_CONFLICT: "This request changed. Check the saved ride before trying again.",
    CUSTOMER_ACCESS_REQUIRED: "An active guest or Front Desk account is required.",
  }, "We couldn't confirm this request. Check Transportation before trying again.");
  scheduleFleetDelivery(client, { requestId: data.id });
  return publicJson({ data, fleetDelivery: "queued" }, { status: 201 });
}
