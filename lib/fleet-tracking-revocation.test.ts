import { describe, expect, it } from "vitest";
import { fleetRevocationRequestSchema, fleetRevocationSuccessSchema, fleetRevocationConflictSchema } from "@/lib/fleet-wire";
import { fleetRetryAfter } from "@/lib/fleet-tracking-revocation";
import { authorizeFleet, fleetConfiguration } from "@/lib/fleet-contract";
import acceptance from "@/docs/integrations/contracts/examples/acceptance.json";

describe("Fleet permanent tracking withdrawal", () => {
  it.each([{ expected_request_version: 0 }, { expected_request_version: 2147483648 }, { expected_request_version: 1, event_id: "unexpected" }, {}, { expected_request_version: "1" }])("rejects wrong DELETE body %j", body => {
    expect(fleetRevocationRequestSchema.safeParse(body).success).toBe(false);
  });
  it("uses the exact one-field DELETE body, distinct from renewal", () => {
    expect(fleetRevocationRequestSchema.parse({ expected_request_version: 2147483647 })).toEqual({ expected_request_version: 2147483647 });
  });
  it.each(["revoked", "already_revoked"])("accepts %s with the full current snapshot and tracking:null", outcome => {
    const body = { success: true, outcome, data: acceptance.data };
    expect(fleetRevocationSuccessSchema.safeParse(body).success).toBe(true);
    expect(fleetRevocationSuccessSchema.safeParse({ ...body, data: { ...body.data, tracking: {} } }).success).toBe(false);
    expect(fleetRevocationSuccessSchema.safeParse({ ...body, outcome: "renewed" }).success).toBe(false);
  });
  it("keeps version conflicts separate from successful revocation", () => {
    const body = { success: false, outcome: "version_conflict", code: "REQUEST_VERSION_CONFLICT", data: acceptance.data };
    expect(fleetRevocationConflictSchema.safeParse(body).success).toBe(true);
    expect(fleetRevocationSuccessSchema.safeParse(body).success).toBe(false);
    expect(fleetRevocationConflictSchema.safeParse({ ...body, code: "OTHER" }).success).toBe(false);
  });
  it("honors valid Retry-After seconds and HTTP dates without advancing a stale date", () => {
    const now = Date.parse("2026-11-13T00:00:00Z");
    expect(fleetRetryAfter("900", now)).toBe("2026-11-13T00:15:00.000Z");
    expect(fleetRetryAfter("Fri, 13 Nov 2026 01:00:00 GMT", now)).toBe("2026-11-13T01:00:00.000Z");
    for (const value of [null, "", "bad", "-1", "999999999999999999999999999999", "Thu, 12 Nov 2026 01:00:00 GMT"]) expect(fleetRetryAfter(value, now)).toBeNull();
  });
  it("requires three distinct keys and never falls back to the legacy shared inbound key", () => {
    const env = { HAVEN_FLEET_MODE: "staging", HAVEN_FLEET_CONTRACT: "fleet-haven-2026-11-06", HAVEN_FLEET_CREATE_URL: "https://fleet.invalid/api/integration/transport-requests", HAVEN_FLEET_CALLBACK_KEY: "c".repeat(40), HAVEN_FLEET_PHOTO_KEY: "p".repeat(40), HAVEN_FLEET_OUTBOUND_KEY: "o".repeat(40) };
    const config = fleetConfiguration(env)!; expect(config).not.toBeNull();
    const callback = new Request("https://haven.invalid", { headers: { Authorization: `Bearer ${config.callbackKey}` } });
    const photo = new Request("https://haven.invalid", { headers: { Authorization: `Bearer ${config.photoKey}` } });
    expect(authorizeFleet(callback, config.photoKey)).toBe(false); expect(authorizeFleet(photo, config.callbackKey)).toBe(false);
    expect(fleetConfiguration({ ...env, HAVEN_FLEET_CALLBACK_KEY: undefined, HAVEN_FLEET_PHOTO_KEY: undefined, HAVEN_FLEET_INBOUND_KEY: "i".repeat(40) })).toBeNull();
  });
});
