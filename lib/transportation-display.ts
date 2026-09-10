/**
 * Client-safe Transportation Service display helpers — no Supabase import, so
 * client components can import these without bundling the service-role client.
 * Server code re-exports these from lib/transportation.ts.
 */

export type TransportationServiceType = "PICKUP" | "DROPOFF" | "ROUND_TRIP";
export type TransportationStatus =
  | "REQUESTED" | "REVIEWED" | "SCHEDULED" | "ASSIGNED"
  | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "REJECTED";

export const TRANSPORTATION_STATUSES: TransportationStatus[] = [
  "REQUESTED", "REVIEWED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED",
];

export type TransportationAction = "REVIEW" | "SCHEDULE" | "ASSIGN" | "START" | "COMPLETE" | "CANCEL" | "REJECT";

export type TransportationTransition = { from: TransportationStatus[]; to: TransportationStatus };

/** Mirror of the SQL transition map — display/tests only, the RPC enforces. */
export const TRANSPORTATION_TRANSITIONS: Record<TransportationAction, TransportationTransition> = {
  REVIEW: { from: ["REQUESTED"], to: "REVIEWED" },
  SCHEDULE: { from: ["REVIEWED"], to: "SCHEDULED" },
  ASSIGN: { from: ["SCHEDULED"], to: "ASSIGNED" },
  START: { from: ["ASSIGNED"], to: "IN_PROGRESS" },
  COMPLETE: { from: ["IN_PROGRESS"], to: "COMPLETED" },
  CANCEL: { from: ["REQUESTED", "REVIEWED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"], to: "CANCELLED" },
  REJECT: { from: ["REQUESTED", "REVIEWED"], to: "REJECTED" },
};

export const canTransition = (from: string, action: TransportationAction) =>
  (TRANSPORTATION_TRANSITIONS[action].from as string[]).includes(from);

export const isTerminalStatus = (status: string) => ["COMPLETED", "CANCELLED", "REJECTED"].includes(status);

/** Customer may self-cancel only before the hotel commits resources. */
export const CUSTOMER_CANCELLABLE_STATUSES = ["REQUESTED", "REVIEWED"] as const;
export const isCustomerCancellable = (status: string) => (CUSTOMER_CANCELLABLE_STATUSES as readonly string[]).includes(status);

/** Driver/vehicle details become customer-visible once assigned. */
export const isAssignmentVisible = (status: string) =>
  ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(status);

export const SERVICE_TYPE_LABELS: Record<TransportationServiceType, string> = {
  PICKUP: "Airport Pickup",
  DROPOFF: "Hotel Drop-off",
  ROUND_TRIP: "Round Trip Transportation",
};

export const TRANSPORTATION_STATUS_LABELS: Record<TransportationStatus, string> = {
  REQUESTED: "Requested", REVIEWED: "Reviewed", SCHEDULED: "Scheduled", ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled", REJECTED: "Rejected",
};

/** Shape returned to the customer portal. staff_notes is never selected. */
export type CustomerTransportationRequest = {
  id: string; reservation_id: string; service_type: TransportationServiceType;
  pickup_location: string; dropoff_location: string; pickup_date: string; pickup_time: string;
  return_location: string | null; return_date: string | null; return_time: string | null;
  passenger_count: number; special_instructions: string | null; status: TransportationStatus;
  driver_name: string | null; vehicle_type: string | null; fare_amount: number | null;
  customer_visible_notes: string | null; cancellation_reason: string | null;
  version: number; created_at: string;
  reservation?: { confirmation_number: string | null; room_type: string; check_in: string; check_out: string } | null;
};
