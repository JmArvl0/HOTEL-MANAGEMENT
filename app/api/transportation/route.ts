import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { submitFleetTransportation } from "@/lib/fleet-submission";
import { canOperateTransportation, canViewTransportation } from "@/lib/permissions";
import { getFleetDeliveryState, getTransportVehicleTypes, transportationRequestSchema, wasDispatchedToFleet } from "@/lib/transportation";
import { guardTransportation, transportationGuardFailed } from "@/lib/transportation-route";
export async function GET() {
  const context = await guardTransportation(canViewTransportation);
  if (transportationGuardFailed(context)) return context;
  try {
    const columns = "id,reservation_id,user_id,service_type,pickup_location,dropoff_location,pickup_date,pickup_time,return_location,return_date,return_time,passenger_count,special_instructions,status,driver_name,fare_amount,staff_notes,customer_visible_notes,cancellation_reason,reviewed_at,scheduled_at,assigned_at,started_at,completed_at,cancelled_at,version,created_at,updated_at,transport_vehicle_types(name),reservations(confirmation_number,guest_name,guest_email,check_in,check_out,status),fleet_transport_links(partner_status,needs_review,fleet_transport_outbox(attempts,auto_dispatch,state))";
    const [{ data, error }, vehicleTypes] = await Promise.all([
      context.client.from("transportation_requests").select(columns).order("created_at", { ascending: false }),
      getTransportVehicleTypes(),
    ]);
    if (error) throw error;
    return publicJson({ data: (data ?? []).map(({ fleet_transport_links, ...trip }) => {
      const links = fleet_transport_links ?? [];
      const delivery = getFleetDeliveryState(links);
      return { ...trip, fleetDispatched: wasDispatchedToFleet(links), fleetManaged: Boolean(delivery),
        fleetAttention: delivery === "attention", fleetAccepted: delivery === "accepted" };
    }), vehicleTypes });
  } catch {
    return publicJson({ error: "Unable to load transportation requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await guardTransportation(canOperateTransportation);
  if (transportationGuardFailed(context)) return context;
  const parsed = transportationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error), { status: 400 });
  return submitFleetTransportation(context, parsed.data);
}
