import { z } from "zod";
import { hotelToday } from "@/lib/booking";
import { calendarDate, isCalendarDate } from "@/lib/input-validation";
import { fleetPickupSchema, validateFleetVehiclePreference } from "@/lib/fleet-pickup-input";
import { supabase } from "@/lib/supabase";
import { FLEET_RIDE_STATUS_LABELS, type CustomerTransportationRequest } from "@/lib/transportation-display";

/**
 * Standalone internal Transportation Service (server-only helpers).
 *
 * No TomTom, no external fleet API, no GPS: locations are plain validated text.
 * The single source of truth for state transitions is the
 * staff_transition_transportation_request RPC in
 * supabase/migrations/20260905010000_transportation_requests.sql — the maps in
 * lib/transportation-display.ts drive UI affordances and tests only.
 *
 * Client-safe constants/types live in lib/transportation-display.ts and are
 * re-exported here for server callers.
 */

export * from "@/lib/transportation-display";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Customer submit payload. The hotel side of the route is deliberately absent: the
 * RPC fills it from hotel_operational_policies, so the client can never claim a
 * different drop-off for a pickup (or pickup for a drop-off).
 */
export const transportationRequestSchema = z.object({
  reservationId: z.string().min(1).max(80),
  serviceType: z.enum(["PICKUP", "DROPOFF", "ROUND_TRIP"]),
  pickupLocation: z.string().trim().min(5, "Enter the pickup location.").max(200).optional(),
  dropoffLocation: z.string().trim().min(5, "Enter the destination.").max(200).optional(),
  pickupDate: calendarDate,
  pickupTime: z.string().regex(timePattern, "Choose a valid time."),
  returnLocation: z.string().trim().min(5, "Enter the departure destination.").max(200).optional(),
  returnDate: calendarDate.optional(),
  returnTime: z.string().regex(timePattern).optional(),
  passengerCount: z.coerce.number().int().min(1, "At least one passenger is required.").max(20, "Transportation accommodates at most 20 passengers."),
  specialInstructions: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().uuid(),
  fleetPickup: fleetPickupSchema.optional(),
}).superRefine((value, ctx) => {
  validateFleetVehiclePreference(value.passengerCount, ctx, value.fleetPickup?.vehicleSeats, value.specialInstructions);
  if (value.serviceType === "PICKUP" && !value.pickupLocation)
    ctx.addIssue({ code: "custom", path: ["pickupLocation"], message: "Enter the pickup location." });
  if (value.serviceType === "DROPOFF" && !value.dropoffLocation)
    ctx.addIssue({ code: "custom", path: ["dropoffLocation"], message: "Enter the destination." });
  if (value.serviceType === "ROUND_TRIP") {
    if (!value.pickupLocation) ctx.addIssue({ code: "custom", path: ["pickupLocation"], message: "Enter the arrival pickup location." });
    if (!value.returnLocation) ctx.addIssue({ code: "custom", path: ["returnLocation"], message: "Enter the departure destination." });
    if (!value.returnDate) ctx.addIssue({ code: "custom", path: ["returnDate"], message: "Choose the return date." });
    if (!value.returnTime) ctx.addIssue({ code: "custom", path: ["returnTime"], message: "Choose the return time." });
    if (value.returnDate && value.returnDate < value.pickupDate)
      ctx.addIssue({ code: "custom", path: ["returnDate"], message: "The return must be on or after the arrival pickup." });
    if (value.returnDate === value.pickupDate && value.returnTime && value.returnTime <= value.pickupTime)
      ctx.addIssue({ code: "custom", path: ["returnTime"], message: "Choose a return time after pickup." });
  }
  if (value.pickupDate && value.pickupDate < hotelToday())
    ctx.addIssue({ code: "custom", path: ["pickupDate"], message: "Transportation cannot be in the past." });
});

export type TransportationRequestInput = z.infer<typeof transportationRequestSchema>;

/** ISO hotel dates sort chronologically, so this check is timezone-independent. */
export function isDateWithinStay(value: string, checkIn: string, checkOut: string): boolean {
  return isCalendarDate(value) && value >= checkIn && value <= checkOut;
}

const customerColumns = "id,reservation_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,driver_name,fare_amount,customer_visible_notes,cancellation_reason,version,created_at,transport_vehicle_types(name),fleet_transport_links(leg,needs_review,partner_status,fleet_transport_outbox(attempts,auto_dispatch,state))";

type FleetDelivery = { attempts: number; auto_dispatch?: boolean; state?: string };
type FleetGuestUpdate = {
  leg: "OUTBOUND" | "RETURN";
  needs_review: boolean;
  partner_status: string | null;
  fleet_transport_outbox: FleetDelivery | FleetDelivery[] | null;
};

export function wasDispatchedToFleet(links: Pick<FleetGuestUpdate, "fleet_transport_outbox">[]) {
  return links.some(({ fleet_transport_outbox: outbox }) =>
    ((Array.isArray(outbox) ? outbox[0]?.attempts : outbox?.attempts) ?? 0) > 0);
}

export function getFleetDeliveryState(links: Pick<FleetGuestUpdate, "fleet_transport_outbox" | "needs_review">[]) {
  const delivery = links.flatMap(link => [link.fleet_transport_outbox].flat()).filter(item => item?.auto_dispatch);
  if (!delivery.length) return undefined;
  if (links.some(link => link.needs_review) || delivery.some(item => item?.state === "FAILED" || item?.state === "NEEDS_REVIEW")) return "attention";
  return delivery.every(item => item?.state === "SENT") ? "accepted" : "pending";
}

/** Own transportation requests, scoped through the owning reservation (never staff_notes). */
export async function getCustomerTransportation(userId: string, reservationId?: string): Promise<CustomerTransportationRequest[]> {
  if (!supabase) return [];
  const owned = supabase.from("reservations").select("id,confirmation_number,room_type,check_in,check_out").eq("user_id", userId);
  if (reservationId) owned.eq("id", reservationId);
  const { data: reservations, error } = await owned;
  if (error) throw error;
  const ids = (reservations ?? []).map((item) => item.id);
  if (!ids.length) return [];
  const { data, error: requestError } = await supabase
    .from("transportation_requests").select(customerColumns)
    .in("reservation_id", ids).order("created_at", { ascending: false });
  if (requestError) throw requestError;
  // The generated type models the many-to-one embed as an array; PostgREST returns an object. Accept both.
  return (data ?? []).map(({ transport_vehicle_types, fleet_transport_links, ...row }) => {
    const vehicleType = transport_vehicle_types as { name?: string } | { name?: string }[] | null;
    const vehicleName = Array.isArray(vehicleType) ? vehicleType[0]?.name : vehicleType?.name;
    const links = (fleet_transport_links ?? []) as FleetGuestUpdate[];
    const fleetDispatched = wasDispatchedToFleet(links);
    const rideUpdates = row.status === "CANCELLED" || row.status === "REJECTED" ? [] : links.flatMap(({ leg, needs_review, partner_status }) => {
      if (needs_review || !partner_status || !Object.hasOwn(FLEET_RIDE_STATUS_LABELS, partner_status)) return [];
      return [{ leg, status: partner_status as keyof typeof FLEET_RIDE_STATUS_LABELS }];
    });
    return { ...row, vehicle_type: vehicleName ?? null, fleetDispatched, fleetDelivery: getFleetDeliveryState(links),
      rideUpdates, reservation: (reservations ?? []).find((item) => item.id === row.reservation_id) ?? null };
  });
}

/** Active transfer vehicle catalogue (reused as the assignment pick list). The flat fare
 * (base_fare + booking_fee) is what ASSIGN posts to the guest folio. */
export async function getTransportVehicleTypes(): Promise<{ id: string; name: string; seats: number; description: string | null; base_fare: number; booking_fee: number }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("transport_vehicle_types")
    .select("id,name,seats,description,base_fare,booking_fee")
    .eq("active", true)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Transport vehicle query failed${error.code ? ` (${error.code})` : ""}`);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), seats: Number(row.seats), description: row.description as string | null, base_fare: Number(row.base_fare), booking_fee: Number(row.booking_fee) }));
}

/** Centralized hotel label for the fixed side of a trip (future TomTom origin). */
export async function getHotelTransferLabel(): Promise<string> {
  if (!supabase) return "HAVEN Hotel & Residences";
  const { data } = await supabase.from("hotel_operational_policies").select("transfer_hotel_label").eq("key", "default").maybeSingle();
  return data?.transfer_hotel_label?.trim() || "HAVEN Hotel & Residences";
}
