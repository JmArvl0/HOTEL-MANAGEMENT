import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedFleetTrackingUrl, guestFleetSafety, type FleetSafetyRow } from "@/lib/fleet-safety";
import { fleetStatusSchema, pickupProfileSchema } from "@/lib/fleet-contract";

const origins = "https://track.fleet.example.invalid";
const now = Date.parse("2026-11-05T10:00:00Z");
const snapshot = { assignment_reference: "assignment-1", driver: { name: "Synthetic driver", phone: "+639171234567" }, vehicle: { plate_number: "QA 1234", description: "White test van" }, tracking: { url: `${origins}/ride/opaque-token`, expires_at: "2026-11-05T11:00:00Z", assignment_reference: "assignment-1" } };
const row: FleetSafetyRow = { id: "link-1", leg: "OUTBOUND", partner_status: "ASSIGNED", partner_version: 2, assignment_active: true, needs_review: false, guest_safety: snapshot };
afterEach(() => vi.unstubAllEnvs());

describe("Fleet tracking boundary", () => {
  it("allows only explicitly configured HTTPS origins", () => {
    expect(allowedFleetTrackingUrl(snapshot.tracking.url, origins)).toBe(snapshot.tracking.url);
    expect(allowedFleetTrackingUrl(snapshot.tracking.url, "")).toBeNull();
    expect(allowedFleetTrackingUrl(snapshot.tracking.url, `https://other.invalid, ${origins}`)).toBe(snapshot.tracking.url);
  });
  it.each(["javascript:alert(1)", "http://track.fleet.example.invalid/ride/token", "https://track.fleet.example.invalid.evil.invalid/ride/token", "https://track.fleet.example.invalid@evil.invalid/ride/token", "https://user:password@track.fleet.example.invalid/ride/token", "https://track.fleet.example.invalid:8443/ride/token"])("rejects unsafe or unapproved link %s", url => {
    expect(allowedFleetTrackingUrl(url, origins)).toBeNull();
  });
  it("projects only approved guest-facing fields", () => {
    const [ride] = guestFleetSafety([row], origins, now);
    expect(ride).toMatchObject({ plateNumber: "QA 1234", driverName: "Synthetic driver", trackingUrl: snapshot.tracking.url });
    expect(ride).not.toHaveProperty("driver.phone"); expect(ride).not.toHaveProperty("guest_safety");
  });
  it("retains the plate while withholding expired or assignment-mismatched tracking", () => {
    expect(guestFleetSafety([row], origins, Date.parse(snapshot.tracking.expires_at))[0]).toMatchObject({ plateNumber: "QA 1234", trackingUrl: null });
    expect(guestFleetSafety([{ ...row, guest_safety: { ...snapshot, assignment_reference: "new-assignment" } }], origins, now)[0].trackingUrl).toBeNull();
  });
  it("hides links when provider origin is disabled or vehicle plate is missing", () => {
    expect(guestFleetSafety([row], "", now)[0].trackingUrl).toBeNull();
    expect(guestFleetSafety([{ ...row, guest_safety: { ...snapshot, vehicle: null } }], origins, now)[0].trackingUrl).toBeNull();
  });
  it.each([{ assignment_active: false }, { needs_review: true }, { partner_version: 0 }, { partner_status: "COMPLETED" }])("does not expose noncurrent assignment %j", overrides => {
    expect(guestFleetSafety([{ ...row, ...overrides }], origins, now)).toEqual([]);
  });
  it("requires tracking to name a versioned active assignment and a plate", () => {
    vi.stubEnv("HAVEN_FLEET_TRACKING_ORIGINS", origins);
    const event = { ...snapshot, event_id: "event-1", source_system: "PMS", external_request_id: "request-1", fleet_reference: "fleet-1", request_version: 2, status: "ASSIGNED", assignment_active: true, occurred_at: "2026-11-05T10:00:00Z" };
    expect(fleetStatusSchema.safeParse(event).success).toBe(true);
    for (const overrides of [{ assignment_reference: "wrong" }, { assignment_active: false }, { status: "COMPLETED" }, { request_version: undefined }, { vehicle: null }]) expect(fleetStatusSchema.safeParse({ ...event, ...overrides }).success).toBe(false);
    vi.stubEnv("HAVEN_FLEET_TRACKING_ORIGINS", ""); expect(fleetStatusSchema.safeParse(event).success).toBe(false);
  });
});

describe("Optional photo and passenger ride details", () => {
  const profile = { travelerName: "Actual passenger", phone: "09171234567", sharingEnabled: true, expectedVersion: 0 };
  it("accepts a complete ride without any photo", () => {
    const data = pickupProfileSchema.parse({ ...profile, ridePreferences: ["QUIET_RIDE", "HELP_WITH_LUGGAGE"], luggageCount: 3, luggageNotes: "2 cases and a stroller", rideNotes: "Flight QA123" });
    expect(data).toMatchObject({ phone: "+639171234567", luggageCount: 3 });
    expect(data).not.toHaveProperty("photo");
  });
  it("defaults to no preferences and no luggage", () => {
    expect(pickupProfileSchema.parse(profile)).toMatchObject({ ridePreferences: [], luggageCount: 0, luggageNotes: "", rideNotes: "" });
  });
  it.each([{ ridePreferences: ["UNSUPPORTED"] }, { ridePreferences: ["QUIET_RIDE", "QUIET_RIDE"] }, { luggageCount: -1 }, { luggageCount: 21 }, { luggageCount: 1.5 }, { rideNotes: "x".repeat(501) }, { luggageNotes: "x".repeat(301) }])("rejects invalid ride detail %j", overrides => {
    expect(pickupProfileSchema.safeParse({ ...profile, ...overrides }).success).toBe(false);
  });
});
