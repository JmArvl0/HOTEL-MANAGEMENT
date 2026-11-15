import { describe, expect, it } from "vitest";
import { authorizeWorkforce, readWorkforceJson, workforceConfiguration, workforceEventSchema, WORKFORCE_CONTRACT } from "@/lib/workforce-contract";

export const workforceTestEvent = () => ({ contract: WORKFORCE_CONTRACT, eventId: "11111111-1111-4111-8111-111111111111", sourceSystem: "workforce", propertyId: "haven", employeeId: "EMP-QA-1", version: 1,
  observedAt: "2026-11-14T08:00:00+08:00", validUntil: "2026-11-14T08:10:00+08:00", employmentActive: true, department: "housekeeping", attendance: "clocked_in",
  shift: { startsAt: "2026-11-14T07:00:00+08:00", endsAt: "2026-11-14T16:00:00+08:00" } });

describe("proposed Workforce contract", () => {
  it("accepts complete versioned snapshots and explicit no-shift updates", () => {
    expect(workforceEventSchema.safeParse(workforceTestEvent()).success).toBe(true);
    expect(workforceEventSchema.safeParse({ ...workforceTestEvent(), shift: null, attendance: "clocked_out" }).success).toBe(true);
  });
  it.each([
    { validUntil: "2026-11-14T08:16:00+08:00" }, { validUntil: "2026-11-14T07:59:00+08:00" }, { employmentActive: "true" },
    { version: 0 }, { version: 1.1 }, { payroll: 25000 }, { attendance: "logged_in" }, { employeeId: "" },
    { shift: { startsAt: "2026-11-14T16:00:00+08:00", endsAt: "2026-11-14T07:00:00+08:00" } },
  ])("rejects unsafe or incomplete evidence %j", extra => expect(workforceEventSchema.safeParse({ ...workforceTestEvent(), ...extra }).success).toBe(false));
  it("requires explicit activation, contract agreement and a separate strong inbound credential", () => {
    const env = { HAVEN_WORKFORCE_ENABLED: "true", HAVEN_WORKFORCE_CONTRACT: WORKFORCE_CONTRACT, HAVEN_WORKFORCE_INBOUND_TOKEN: "x".repeat(40) };
    expect(workforceConfiguration({})).toBeNull();
    expect(workforceConfiguration({ ...env, HAVEN_WORKFORCE_ENABLED: "false" })).toBeNull();
    expect(workforceConfiguration({ ...env, HAVEN_WORKFORCE_CONTRACT: "unknown" })).toBeNull();
    expect(workforceConfiguration({ ...env, HAVEN_WORKFORCE_INBOUND_TOKEN: "short" })).toBeNull();
    expect(workforceConfiguration(env)?.key).toBe(env.HAVEN_WORKFORCE_INBOUND_TOKEN);
    expect(authorizeWorkforce(new Request("http://haven.test", { headers: { authorization: `Bearer ${env.HAVEN_WORKFORCE_INBOUND_TOKEN}` } }), env.HAVEN_WORKFORCE_INBOUND_TOKEN)).toBe(true);
    expect(authorizeWorkforce(new Request("http://haven.test", { headers: { authorization: `Bearer ${"y".repeat(40)}` } }), env.HAVEN_WORKFORCE_INBOUND_TOKEN)).toBe(false);
  });
  it("bounds bodies even without a content length", async () => {
    await expect(readWorkforceJson(new Request("http://haven.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x".repeat(9000) }) }))).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
});
