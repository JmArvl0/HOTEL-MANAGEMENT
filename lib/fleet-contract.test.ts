import { describe, expect, it } from "vitest";
import { authorizeFleet, fleetConfiguration, fleetStatusSchema, limitedJson, pickupProfileSchema } from "@/lib/fleet-contract";
import { FLEET_CONTRACT, fleetWireAcceptanceSchema } from "@/lib/fleet-wire";
import acceptance from "@/docs/integrations/contracts/examples/acceptance.json";

const configured = { NODE_ENV: "test", HAVEN_FLEET_MODE: "staging", HAVEN_FLEET_CONTRACT: FLEET_CONTRACT, HAVEN_FLEET_CREATE_URL: "https://fleet.example.invalid/api/integration/transport-requests", HAVEN_FLEET_CALLBACK_KEY: "i".repeat(40), HAVEN_FLEET_PHOTO_KEY: "p".repeat(40), HAVEN_FLEET_OUTBOUND_KEY: "o".repeat(40) } as NodeJS.ProcessEnv;
describe("Fleet candidate boundary", () => {
  it("stays off until an enabled mode is explicitly selected", () => {
    expect(fleetConfiguration({})).toBeNull();
    for (const mode of ["off", "preview", ""]) expect(fleetConfiguration({ ...configured, HAVEN_FLEET_MODE: mode })).toBeNull();
  });
  describe.each(["staging", "production"] as const)("%s mode", mode => {
    const env: NodeJS.ProcessEnv = { ...configured, NODE_ENV: "production", HAVEN_FLEET_MODE: mode };

    it("requires the current contract and three distinct credentials", () => {
      expect(fleetConfiguration(env)).toMatchObject({ mode, endpoint: configured.HAVEN_FLEET_CREATE_URL });
      for (const overrides of [
        { HAVEN_FLEET_CONTRACT: "pickup-v1-candidate" }, { HAVEN_FLEET_CONTRACT: "" },
        { HAVEN_FLEET_CALLBACK_KEY: "short" }, { HAVEN_FLEET_OUTBOUND_KEY: "" },
        { HAVEN_FLEET_OUTBOUND_KEY: configured.HAVEN_FLEET_CALLBACK_KEY },
        { HAVEN_FLEET_PHOTO_KEY: configured.HAVEN_FLEET_CALLBACK_KEY },
        { HAVEN_FLEET_PHOTO_KEY: "" }, { HAVEN_FLEET_PHOTO_KEY: configured.HAVEN_FLEET_OUTBOUND_KEY },
      ]) expect(fleetConfiguration({ ...env, ...overrides })).toBeNull();
    });

    it.each(["http://fleet.example.invalid/intake", "https://user:password@fleet.example.invalid/intake", "https://fleet.example.invalid/intake?token=secret", "https://fleet.example.invalid/intake#secret", "not a URL"])("rejects unsafe endpoint %s", url => {
      expect(fleetConfiguration({ ...env, HAVEN_FLEET_CREATE_URL: url })).toBeNull();
    });
  });
  it("allows HTTP loopback only for staging in tests", () => {
    const env = { ...configured, HAVEN_FLEET_CREATE_URL: "http://127.0.0.1:1234/intake" };
    expect(fleetConfiguration(env)).not.toBeNull();
    expect(fleetConfiguration({ ...env, NODE_ENV: "production" })).toBeNull();
    expect(fleetConfiguration({ ...env, HAVEN_FLEET_MODE: "production" })).toBeNull();
  });
  it("requires the exact direction-specific bearer credential", () => {
    const key = configured.HAVEN_FLEET_CALLBACK_KEY!;
    expect(authorizeFleet(new Request("https://haven.invalid", { headers: { Authorization: `Bearer ${key}` } }), key)).toBe(true);
    for (const authorization of ["", `bearer ${key}`, `Bearer ${configured.HAVEN_FLEET_OUTBOUND_KEY}`, `Bearer ${key}x`]) expect(authorizeFleet(new Request("https://haven.invalid", { headers: { authorization } }), key)).toBe(false);
  });
  it("normalizes Philippine mobile numbers and keeps other passengers separate from account identity", () => {
    expect(pickupProfileSchema.parse({ travelerName: "Actual passenger", phone: "0917 123 4567", sharingEnabled: false, expectedVersion: 0 }).phone).toBe("+639171234567");
    expect(pickupProfileSchema.safeParse({ travelerName: "Actual passenger", phone: "123", sharingEnabled: true, expectedVersion: 0 }).success).toBe(false);
  });
  it("keeps unversioned events recognizable and requires unambiguous source IDs", () => {
    const event = { event_id: "event-1", source_system: "PMS", external_request_id: "haven:request:outbound", fleet_reference: 123, status: "SCHEDULED", occurred_at: "2026-11-05T10:00:00+08:00" };
    expect(fleetStatusSchema.parse(event).request_version).toBeUndefined();
    expect(fleetStatusSchema.parse(event).fleet_reference).toBe("123");
    for (const overrides of [{ source_system: "POS" }, { request_version: 0 }, { external_booking_id: "different-request" }, { status: "UNKNOWN" }]) expect(fleetStatusSchema.safeParse({ ...event, ...overrides }).success).toBe(false);
  });
  it("does not accept a current Fleet acknowledgment as proof guest fields were saved", () => {
    const row = { id: 123, source_system: "PMS", external_booking_id: "haven:request:outbound" };
    expect(fleetWireAcceptanceSchema.safeParse(row).success).toBe(false);
    expect(fleetWireAcceptanceSchema.parse(acceptance).data.fleet_request_id).toBe(123);
    expect(fleetWireAcceptanceSchema.safeParse({ ...acceptance, data: { ...acceptance.data, pickup_profile_accepted: false } }).success).toBe(false);
    expect(fleetWireAcceptanceSchema.safeParse({ ...acceptance, data: { ...acceptance.data, external_request_id: "another-request" } }).success).toBe(false);
  });
  it("limits JSON bytes even without content-length", async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":"' + "x".repeat(40) + '"}')); controller.close(); } }), { headers: { "Content-Type": "application/json" } });
    await expect(limitedJson(response, 20)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
  it("requires JSON media type and parses bounded JSON", async () => {
    await expect(limitedJson(new Response("{}"))).rejects.toThrow("INVALID_JSON");
    expect(await limitedJson(Response.json({ delivered: true }))).toEqual({ delivered: true });
  });
});
