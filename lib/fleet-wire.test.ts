import { afterEach, describe, expect, it, vi } from "vitest";
import Ajv from "ajv";
import schema from "@/docs/integrations/contracts/fleet-haven-2026-11-06.schema.json";
import acceptance from "@/docs/integrations/contracts/examples/acceptance.json";
import { fleetCreateEnvelopeSchema, fleetPhotoRequestSchema, fleetRenewalRequestSchema, fleetWireSnapshotSchema, fleetWireRenewalSuccessSchema, normalizeFleetSnapshot } from "@/lib/fleet-wire";
import { fleetRenewalUrl, fleetTrackingConfigured } from "@/lib/fleet-tracking-renewal";

const assignmentId = "afce4596-944c-4a64-ad1e-29ae74e2cff7";
const origin = "https://track.fleet.example.invalid";
const ajv = new Ajv({ allErrors: true, schemaId: "auto" });
ajv.addSchema(schema);
const valid = (name: string, value: unknown) => {
  const check = ajv.getSchema(`${schema.$id}#/definitions/${name}`)!;
  expect(check(value), JSON.stringify(check.errors)).toBe(true);
};
const assigned = () => ({ ...structuredClone(acceptance.data), request_version: 2, status: "ASSIGNED" as const,
  assignment_active: true, assignment_reference: assignmentId,
  assignment: { driver_reference: 1, vehicle_reference: 2, vehicle_plate: "QA 1234", vehicle_model: "Van", driver_name: "Synthetic driver", vehicle_description: "White van" },
  driver: { name: "Synthetic driver" }, vehicle: { plate_number: "QA 1234", description: "White van" },
  tracking: { url: `${origin}/ride/token`, expires_at: "2027-01-01T00:00:00Z", assignment_reference: assignmentId },
});
afterEach(() => vi.unstubAllEnvs());
describe("supplied Fleet contract", () => {
  it("validates the provided acceptance independently against the attached JSON Schema", () => valid("Acceptance", acceptance));
  it("validates and normalizes complete HAVEN callbacks without losing immutable wire evidence", () => {
    vi.stubEnv("HAVEN_FLEET_TRACKING_ORIGINS", origin);
    const event = assigned(); valid("StatusSnapshot", event);
    const parsed = fleetWireSnapshotSchema.parse(event); const normalized = normalizeFleetSnapshot(parsed);
    expect(normalized.source_system).toBe("PMS"); expect(normalized.fleet_reference).toBe("123");
    expect(normalized.driver?.name).toBe(event.assignment.driver_name); expect(normalized.wire_snapshot).toEqual(event);
  });
  it.each(["assignment", "driver", "vehicle", "tracking", "fare", "external_revision", "round_trip_reference", "leg_kind"])("rejects partial snapshots missing %s", key => {
    const event: Record<string, unknown> = structuredClone(acceptance.data); delete event[key];
    expect(fleetWireSnapshotSchema.safeParse(event).success).toBe(false);
  });
  it.each([
    { external_booking_id: "other" }, { fleet_request_id: 124 }, { fleet_reference: "124" },
    { source_system: "PMS" }, { guest_phone: "+639171234567" }, { status: "UNKNOWN" },
    { driver: { name: "Other driver" } }, { assignment_active: true },
  ])("rejects inconsistent, legacy or unknown fields %j", changes => {
    expect(fleetWireSnapshotSchema.safeParse({ ...acceptance.data, ...changes }).success).toBe(false);
  });
  it("rejects unsafe tracking, wrong assignment, missing plate and inactive sharing", () => {
    vi.stubEnv("HAVEN_FLEET_TRACKING_ORIGINS", origin);
    const event = assigned();
    for (const url of ["http://track.fleet.example.invalid/token", "https://evil.invalid/token", "https://u:p@track.fleet.example.invalid/token"]) expect(fleetWireSnapshotSchema.safeParse({ ...event, tracking: { ...event.tracking, url } }).success).toBe(false);
    expect(fleetWireSnapshotSchema.safeParse({ ...event, tracking: { ...event.tracking, assignment_reference: acceptance.data.event_id } }).success).toBe(false);
    expect(fleetWireSnapshotSchema.safeParse({ ...event, vehicle: { ...event.vehicle, plate_number: null } }).success).toBe(false);
    expect(fleetWireSnapshotSchema.safeParse({ ...event, assignment_active: false }).success).toBe(false);
    vi.stubEnv("HAVEN_FLEET_TRACKING_ORIGINS", ""); expect(fleetWireSnapshotSchema.safeParse(event).success).toBe(false);
  });
  it("accepts PHP centavo fare evidence, including correction links, without changing the normalized driver or vehicle", () => {
    const event = { ...acceptance.data, fare: { fare_amount_minor: 123456, currency: "PHP", fare_version: 2, fare_reference: assignmentId, fare_revision_id: acceptance.data.event_id, previous_fare_revision_id: assignmentId, previous_fare_version: 1, correction_reason: "Corrected fare" } };
    valid("StatusSnapshot", event); expect(normalizeFleetSnapshot(fleetWireSnapshotSchema.parse(event)).wire_snapshot.fare?.fare_amount_minor).toBe(123456);
    expect(fleetWireSnapshotSchema.safeParse({ ...event, fare: { ...event.fare, fare_amount_minor: 1.2 } }).success).toBe(false);
  });
  it("produces flat create requests valid against the independent supplied schema", () => {
    const envelope = { contract_version: 2, source_system: "HAVEN", external_request_id: "haven:test:outbound", external_booking_id: "haven:test:outbound", external_revision: 1, event_id: assignmentId, event_kind: "create", round_trip_reference: "test", leg_kind: "outbound", request: {
      booking_reference: "QA", guest_reference: assignmentId, guest_name: "Synthetic passenger", guest_phone: "+639171234567", guest_email: null, guest_photo_reference: null, guest_photo_version: 0,
      pickup_location: "Airport", dropoff_location: "Hotel", pickup_datetime: "2027-01-01T10:00:00+08:00", passenger_count: 2, load_type: "Passenger", service_code: "GUEST_TRANSPORT", priority: "Normal", special_requests: null,
      ride_preferences: ["QUIET_RIDE"], luggage: { count: 20, notes: "x".repeat(300) }, passenger_notes: "x".repeat(500),
    } };
    valid("InboundEnvelope", fleetCreateEnvelopeSchema.parse(envelope));
    for (const changes of [{ luggage: { count: 21, notes: "" } }, { passenger_notes: "x".repeat(501) }, { guest_photo_reference: assignmentId }, { traveler: {} }, { ride_preferences: ["QUIET_RIDE", "QUIET_RIDE"] }]) expect(fleetCreateEnvelopeSchema.safeParse({ ...envelope, request: { ...envelope.request, ...changes } }).success).toBe(false);
    valid("InboundEnvelope", fleetCreateEnvelopeSchema.parse({ ...envelope, request: { ...envelope.request, guest_photo_version: 9 } }));
  });
  it("requires all four signing fields and no untrusted URL", () => {
    const request = { external_request_id: "haven:test:outbound", photo_reference: assignmentId, photo_version: 2, assignment_reference: assignmentId };
    valid("PhotoSigningRequest", fleetPhotoRequestSchema.parse(request));
    expect(fleetPhotoRequestSchema.safeParse({ ...request, photo_version: 0 }).success).toBe(false);
    expect(fleetPhotoRequestSchema.safeParse({ ...request, url: "https://evil.invalid/a" }).success).toBe(false);
  });
  it("binds manual renewal to the original source path, version and assignment", () => {
    const body = { event_id: assignmentId, expected_request_version: 2, assignment_reference: assignmentId };
    valid("TrackingRenewal", fleetRenewalRequestSchema.parse(body));
    expect(fleetRenewalUrl("https://fleet.invalid/api/integration/transport-requests", "haven:test:outbound")).toBe("https://fleet.invalid/api/integration/transport-requests/source/haven%3Atest%3Aoutbound/tracking/renew");
    expect(() => fleetRenewalUrl("https://fleet.invalid/api", "..")).toThrow();
    expect(fleetTrackingConfigured("")).toBe(false); expect(fleetTrackingConfigured("https://fleet.invalid/path")).toBe(false); expect(fleetTrackingConfigured(origin)).toBe(true);
    vi.stubEnv("HAVEN_FLEET_TRACKING_ORIGINS", origin);
    const reply = { success: true, outcome: "renewed", data: assigned() }; valid("RenewalSuccess", reply);
    expect(fleetWireRenewalSuccessSchema.safeParse(reply).success).toBe(true);
    expect(fleetWireRenewalSuccessSchema.safeParse({ ...reply, outcome: "unchanged" }).success).toBe(false);
  });
});
