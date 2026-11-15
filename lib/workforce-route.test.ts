import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: boundary.rpc } }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
const { getServerSession } = await import("next-auth");
const { POST: receive } = await import("@/app/api/integrations/workforce/availability/route");
const { GET, POST: manage } = await import("@/app/api/staff/workforce/route");
const actor = "11111111-1111-4111-8111-111111111111";
const event = { contract: "haven-workforce-v1", eventId: actor, sourceSystem: "workforce", propertyId: "haven", employeeId: "QA1", version: 1, observedAt: "2026-11-14T08:00:00+08:00", validUntil: "2026-11-14T08:10:00+08:00", employmentActive: true, department: "housekeeping", attendance: "clocked_in", shift: null };
const request = (body: unknown = event, headers = {}) => new Request("http://haven.test/api/integrations/workforce/availability", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${"t".repeat(40)}`, "idempotency-key": actor, ...headers }, body: JSON.stringify(body) });
const session = (role: string) => vi.mocked(getServerSession).mockResolvedValue({ user: { id: actor, role } } as never);
beforeEach(() => {
  vi.resetAllMocks(); boundary.rpc.mockResolvedValue({ data: { outcome: "accepted", staff: [] }, error: null });
  vi.stubEnv("HAVEN_WORKFORCE_ENABLED", "true"); vi.stubEnv("HAVEN_WORKFORCE_CONTRACT", "haven-workforce-v1"); vi.stubEnv("HAVEN_WORKFORCE_INBOUND_TOKEN", "t".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

describe("Workforce receiving boundary", () => {
  it("stays off until configured and rejects incorrect credentials before database access", async () => {
    vi.stubEnv("HAVEN_WORKFORCE_ENABLED", "false"); expect((await receive(request())).status).toBe(503);
    vi.stubEnv("HAVEN_WORKFORCE_ENABLED", "true"); expect((await receive(request(event, { authorization: "Bearer wrong" }))).status).toBe(401);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("requires matching idempotency header and complete snapshots", async () => {
    expect((await receive(request(event, { "idempotency-key": "wrong" }))).status).toBe(422);
    expect((await receive(request({ ...event, role: "admin" }))).status).toBe(422);
    expect((await receive(request({ data: "x".repeat(9000) }))).status).toBe(413);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("passes verified evidence to the atomic workflow without granting roles", async () => {
    const response = await receive(request()); expect(response.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("hotel_receive_workforce_availability", { p_event: event });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([["WORKFORCE_MAPPING_NOT_FOUND",404],["WORKFORCE_EVENT_CONFLICT",409],["WORKFORCE_SOURCE_MISMATCH",422],["WORKFORCE_INVALID_EVENT",422],["database down",503]])("reports %s without disclosing internals", async (message, status) => {
    boundary.rpc.mockResolvedValue({ error: { message } }); expect((await receive(request())).status).toBe(status);
  });
});
describe("Workforce staff and governance boundary", () => {
  it("rejects absent/disabled sessions and guest readers", async () => {
    expect((await GET()).status).toBe(401);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: actor, role: "admin", disabled: true } } as never); expect((await GET()).status).toBe(401);
    session("guest"); expect((await GET()).status).toBe(403);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated user for database-enforced read scoping", async () => {
    session("housekeeping"); expect((await GET()).status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("hotel_workforce_snapshot", { p_actor: actor });
  });
  it.each(["manager","front_desk","housekeeping","maintenance","accounting"])("prevents %s from managing employee mappings", async role => {
    session(role); expect((await manage(request({ action: "link", userId: actor, employeeId: "QA", reason: "Reviewed" }))).status).toBe(403); expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("permits reviewed Admin mapping without email/name joins", async () => {
    session("admin"); expect((await manage(request({ action: "link", userId: actor, employeeId: "QA", reason: "Reviewed mapping" }))).status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("hotel_link_workforce_employee", { p_actor: actor, p_user: actor, p_employee: "QA", p_link: null, p_reason: "Reviewed mapping" });
  });
  it("requires receiver configuration before enabling automatic checkout assignment", async () => {
    session("owner"); vi.stubEnv("HAVEN_WORKFORCE_ENABLED", "false");
    expect((await manage(request({ action: "configure", sourceSystem:"workforce",propertyId:"haven",autoAssignCheckout:true,expectedVersion:1,reason:"Reviewed activation" }))).status).toBe(409);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
