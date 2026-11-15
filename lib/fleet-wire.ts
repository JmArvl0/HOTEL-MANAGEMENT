import { z } from "zod";
import { allowedFleetTrackingUrl } from "@/lib/fleet-safety";

export const FLEET_CONTRACT = "fleet-haven-2026-11-06";
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const revision = z.number().int().positive().max(2147483647);
const identifier = z.string().min(1).max(255).regex(/^[A-Za-z0-9._:-]+$/).refine(value => ![".", ".."].includes(value));
const clean = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const timestamp = z.string().datetime({ offset: true });
const tracking = z.object({ url: z.string().url().max(2048), expires_at: timestamp, assignment_reference: z.string().uuid() }).strict();
const vehicle = z.object({ plate_number: z.string().max(50).nullable(), description: z.string().max(510).nullable() }).strict();
const assignment = z.object({
  driver_reference: positive, vehicle_reference: positive,
  vehicle_plate: z.string().max(50).nullable(), vehicle_model: z.string().max(100).nullable(),
  driver_name: z.string().max(201), vehicle_description: z.string().max(510).nullable(),
}).strict();
const fare = z.object({
  fare_amount_minor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), currency: z.literal("PHP"),
  fare_version: positive, fare_reference: z.string().uuid(), fare_revision_id: z.string().uuid(),
  previous_fare_revision_id: z.string().uuid().nullable(), previous_fare_version: positive.nullable(), correction_reason: z.string().max(500).nullable(),
}).strict();

/** Exact supplied HAVEN wire; aliases are consistency checks, never fallbacks. */
export const fleetWireSnapshotSchema = z.object({
  contract_version: z.literal(2), source_system: z.literal("HAVEN"), event_id: z.string().uuid(),
  external_request_id: z.string().min(1).max(255), external_booking_id: z.string().min(1).max(255), external_revision: positive,
  fleet_request_id: positive, fleet_trip_id: positive.nullable(), request_version: positive,
  id: z.string().regex(/^[1-9]\d*$/), fleet_reference: z.string().regex(/^[1-9]\d*$/),
  status: z.enum(["RECEIVED", "SCHEDULED", "ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED", "REJECTED"]),
  occurred_at: timestamp, confirmed_pickup_datetime: timestamp.nullable(),
  pickup_profile_accepted: z.boolean(), ride_details_accepted: z.boolean(),
  assignment_active: z.boolean(), assignment_reference: z.string().uuid().nullable(), assignment: assignment.nullable(),
  driver: z.object({ name: z.string().max(201) }).strict().nullable(), vehicle: vehicle.nullable(), tracking: tracking.nullable(),
  cancellation_outcome: z.string().nullable(), cancellation_reason: z.string().nullable(),
  round_trip_reference: z.string().nullable(), leg_kind: z.string().nullable(), fare: fare.nullable(),
}).strict().superRefine((snapshot, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (snapshot.external_request_id !== snapshot.external_booking_id) issue("Conflicting external identities.");
  if (snapshot.id !== String(snapshot.fleet_request_id) || snapshot.fleet_reference !== snapshot.id) issue("Conflicting Fleet identities.");
  if ((snapshot.driver?.name ?? null) !== (snapshot.assignment?.driver_name ?? null)) issue("Conflicting driver aliases.");
  if (snapshot.assignment?.vehicle_plate && snapshot.vehicle?.plate_number && snapshot.assignment.vehicle_plate !== snapshot.vehicle.plate_number) issue("Conflicting plate aliases.");
  if (snapshot.assignment_active && (!["ASSIGNED", "IN_TRANSIT"].includes(snapshot.status) || !snapshot.assignment_reference || !snapshot.assignment || !snapshot.vehicle?.plate_number?.trim())) issue("Active assignment requires current driver and vehicle.");
  if (snapshot.tracking && (!snapshot.assignment_active || snapshot.tracking.assignment_reference !== snapshot.assignment_reference || !allowedFleetTrackingUrl(snapshot.tracking.url, process.env.HAVEN_FLEET_TRACKING_ORIGINS ?? ""))) issue("Tracking is not bound to an approved active assignment.");
});
export type FleetWireSnapshot = z.infer<typeof fleetWireSnapshotSchema>;

export const fleetWireSuccessSchema = z.object({ success: z.literal(true), data: fleetWireSnapshotSchema, outcome: z.string().optional() }).strict();
export const fleetWireAcceptanceSchema = fleetWireSuccessSchema.superRefine((response, ctx) => {
  if (!response.data.pickup_profile_accepted || !response.data.ride_details_accepted) ctx.addIssue({ code: "custom", message: "Incomplete stored acceptance." });
});
export const fleetWireRenewalSuccessSchema = fleetWireSuccessSchema.superRefine((response, ctx) => {
  if (response.outcome !== "renewed" || !response.data.tracking) ctx.addIssue({ code: "custom", message: "Missing renewal result." });
});

export const fleetCreateEnvelopeSchema = z.object({
  contract_version: z.literal(2), source_system: z.literal("HAVEN"),
  external_request_id: identifier, external_booking_id: identifier.optional(), external_revision: z.literal(1), event_id: z.string().uuid(), event_kind: z.literal("create"),
  round_trip_reference: identifier, leg_kind: z.enum(["outbound", "return"]),
  request: z.object({
    booking_reference: clean(100).nullable(), guest_reference: identifier,
    guest_name: clean(255), guest_phone: z.string().regex(/^\+[1-9]\d{7,14}$/), guest_email: z.string().email().max(254).nullable(),
    guest_photo_reference: identifier.nullable(), guest_photo_version: z.number().int().min(0).max(2147483647),
    pickup_location: clean(300), dropoff_location: clean(300), pickup_datetime: timestamp,
    passenger_count: revision, load_type: z.literal("Passenger"), service_code: z.literal("GUEST_TRANSPORT"), priority: z.literal("Normal"),
    special_requests: z.string().max(2000).nullable(),
    ride_preferences: z.array(z.enum(["QUIET_RIDE", "HELP_WITH_LUGGAGE", "COOL_CABIN"])).max(3).refine(items => new Set(items).size === items.length),
    luggage: z.object({ count: z.number().int().min(0).max(20), notes: z.string().max(300) }).strict(), passenger_notes: z.string().max(500),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if ((value.external_booking_id && value.external_booking_id !== value.external_request_id) || (value.request.guest_photo_reference && !value.request.guest_photo_version)) ctx.addIssue({ code: "custom", message: "Inconsistent request/photo identity." });
});

export const fleetPhotoRequestSchema = z.object({ external_request_id: z.string().min(1).max(255), photo_reference: z.string().uuid(), photo_version: revision, assignment_reference: z.string().uuid() }).strict();
export const fleetRenewalRequestSchema = z.object({ event_id: z.string().uuid(), expected_request_version: revision, assignment_reference: z.string().uuid() }).strict();
export const fleetRevocationRequestSchema = z.object({ expected_request_version: revision }).strict();
export const fleetRevocationSuccessSchema = z.object({ success: z.literal(true), outcome: z.enum(["revoked", "already_revoked"]), data: fleetWireSnapshotSchema }).strict().refine(value => value.data.tracking === null, "Revocation must clear tracking.");
export const fleetRevocationConflictSchema = z.object({ success: z.literal(false), code: z.literal("REQUEST_VERSION_CONFLICT"), outcome: z.literal("version_conflict"), error: z.string().optional(), data: fleetWireSnapshotSchema }).strict();

/** Preserve the immutable wire evidence; existing private SQL still uses PMS. */
export function normalizeFleetSnapshot(snapshot: FleetWireSnapshot) {
  return {
    event_id: snapshot.event_id, source_system: "PMS", external_request_id: snapshot.external_request_id, external_booking_id: snapshot.external_booking_id,
    fleet_reference: String(snapshot.fleet_request_id), request_version: snapshot.request_version, status: snapshot.status,
    assignment_active: snapshot.assignment_active, assignment_reference: snapshot.assignment_reference,
    driver: snapshot.assignment ? { name: snapshot.assignment.driver_name } : null,
    vehicle: snapshot.vehicle, tracking: snapshot.tracking, occurred_at: snapshot.occurred_at,
    wire_snapshot: snapshot,
  };
}
