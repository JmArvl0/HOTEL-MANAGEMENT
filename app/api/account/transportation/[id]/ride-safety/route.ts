import { NextResponse } from "next/server";
import { z } from "zod";
import { guestFleetSafety, type FleetSafetyRow } from "@/lib/fleet-safety";
import { guardPickupRequest, pickupJson } from "@/lib/transport-pickup-route";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return pickupJson({ error: "Request not found." }, 404);
  const guard = await guardPickupRequest(id);
  if (guard instanceof NextResponse) return guard;
  if (guard.role !== "guest") return pickupJson({ error: "Please sign in with a guest account to continue." }, 403);
  if (["COMPLETED", "CANCELLED", "REJECTED"].includes(guard.trip.status)) return pickupJson({ rides: [] });
  const reservation = await guard.client.from("reservations").select("status").eq("id", guard.trip.reservation_id).maybeSingle();
  if (reservation.error) return pickupJson({ error: "Ride details unavailable." }, 503);
  if (!reservation.data || !["confirmed", "checked_in"].includes(reservation.data.status)) return pickupJson({ rides: [] });
  const result = await guard.client.from("fleet_transport_links").select("id,leg,partner_status,partner_version,assignment_active,needs_review,guest_safety").eq("request_id", id).order("leg");
  if (result.error) return pickupJson({ error: "Ride details unavailable." }, 503);
  return pickupJson({ rides: guestFleetSafety(result.data as FleetSafetyRow[], process.env.HAVEN_FLEET_TRACKING_ORIGINS ?? "") });
}
