import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/types";

const state = vi.hoisted(() => ({ role: "guest" as Role, disabled: false, traces: [] as { method: string; args: unknown[] }[], rpc: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "123e4567-e89b-42d3-a456-426614174000", role: state.role, disabled: state.disabled } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => {
  class Query {
    select(...args: unknown[]) { state.traces.push({ method: "select", args }); return this; }
    eq(...args: unknown[]) { state.traces.push({ method: "eq", args }); return this; }
    in(...args: unknown[]) { state.traces.push({ method: "in", args }); return this; }
    order(...args: unknown[]) { state.traces.push({ method: "order", args }); return this; }
    limit() { return this; } lt() { return this; } gt() { return this; }
    range() { return this; }
    async maybeSingle() { return { data: { id: "123e4567-e89b-42d3-a456-426614174000", role: state.role, active: true, recovery_required: false }, error: null }; }
    then<T>(resolve: (value: { data: unknown[]; error: null }) => T) { return Promise.resolve({ data: [], error: null }).then(resolve); }
  }
  return { supabase: { from: () => new Query(), rpc: state.rpc } };
});
import { GET as operationsGET, POST as operationsPOST } from "@/app/api/staff/operations/route";
import { GET as foundGET } from "@/app/api/staff/lost-found/route";
import { GET as poGET, POST as poPOST } from "@/app/api/inventory/purchase-orders/route";
import { POST as submitPO } from "@/app/api/inventory/purchase-orders/[id]/submit/route";
import { POST as reviewPO } from "@/app/api/inventory/purchase-orders/approvals/[id]/review/route";
import { POST as registerAsset } from "@/app/api/maintenance/assets/route";
import { POST as assetWork } from "@/app/api/maintenance/asset-work/route";
import { POST as editAccount } from "@/app/api/admin/users/[id]/action/route";

beforeEach(() => { state.role = "guest"; state.disabled = false; state.traces.length = 0; state.rpc.mockReset(); });
describe("role scope at the new HTTP boundaries", () => {
  it.each<Role>(["owner", "admin", "guest"])("denies %s the operational roster endpoint", async role => {
    state.role = role;
    expect((await operationsGET(new Request("http://localhost/api/staff/operations"))).status).toBe(403);
  });
  it.each<Role>(["front_desk", "housekeeping", "maintenance", "accounting"])("limits %s to their own roster and department handovers", async role => {
    state.role = role;
    expect((await operationsGET(new Request("http://localhost/api/staff/operations?from=2030-01-01"))).status).toBe(200);
    expect(state.traces).toContainEqual({ method: "eq", args: ["staff_user_id", "123e4567-e89b-42d3-a456-426614174000"] });
    expect(state.traces).toContainEqual({ method: "eq", args: ["department", role] });
  });
  it.each<Role>(["front_desk", "manager"])("blocks new Hotel staff schedules for %s", async role => {
    state.role = role;
    const response = await operationsPOST(new Request("http://localhost/api/staff/operations", { method: "POST", body: JSON.stringify({ action: "schedule", id: "123e4567-e89b-42d3-a456-426614174001", staffId: "123e4567-e89b-42d3-a456-426614174000", startsAt: "2030-01-01T08:00:00+08:00", endsAt: "2030-01-01T16:00:00+08:00" }) }));
    expect(response.status).toBe(403); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("excludes claim notes from Housekeeping reads", async () => {
    state.role = "housekeeping";
    expect((await foundGET()).status).toBe(200);
    expect(state.traces.filter(t => t.method === "select").some(t => String(t.args[0]).includes("claimant_note"))).toBe(false);
  });
  it.each<Role>(["owner", "admin", "guest", "maintenance", "accounting"])("denies %s the Lost & Found register", async role => {
    state.role = role; expect((await foundGET()).status).toBe(403);
  });
  it("shows Housekeeping eligible deliveries without allowing PO creation", async () => {
    state.role = "housekeeping";
    expect((await poGET(new Request("http://localhost/api/inventory/purchase-orders?status=draft"))).status).toBe(200);
    expect(state.traces).toContainEqual({ method: "in", args: ["status", ["approved", "partially_received"]] });
    expect((await poPOST()).status).toBe(403);
  });
  it("retires PO creation for Manager before reaching the database", async () => {
    state.role = "manager";
    expect((await poPOST()).status).toBe(410);
    expect((await submitPO()).status).toBe(410);
    expect(state.traces).toEqual([]);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("allows resolving an existing approval without approving a new purchase commitment", async () => {
    state.role = "admin";
    const params = Promise.resolve({ id: "existing-approval" });
    const request = (decision: string) => new Request("http://localhost/review", { method: "POST", body: JSON.stringify({ decision, reason: "Transfer to Supply Chain" }) });
    expect((await reviewPO(request("approve"), { params })).status).toBe(410);
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({ data: {}, error: null });
    expect((await reviewPO(request("reject"), { params })).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("review_purchase_order_approval", expect.objectContaining({ p_decision: "reject" }));
  });
  it("retires asset registration and new preventive work while preserving linked completion", async () => {
    state.role = "maintenance";
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const request = (body: object) => new Request("http://localhost/asset-work", { method: "POST", body: JSON.stringify(body) });
    expect((await registerAsset()).status).toBe(410);
    expect((await assetWork(request({ action: "create", assetId: id, technicianId: id }))).status).toBe(410);
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({ data: {}, error: null });
    expect((await assetWork(request({ action: "record_service", orderId: "EXISTING", serviceDate: "2030-01-01" }))).status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith("record_linked_asset_service", expect.objectContaining({ p_order: "EXISTING" }));
  });
  it.each(["role", "convert"])("blocks adding Accounting authority through %s", async action => {
    state.role = "admin";
    const request = new Request("http://localhost/accounts", { method: "POST", body: JSON.stringify({ action, role: "accounting", reason: "Test role scope", version: 1 }) });
    expect((await editAccount(request, { params: Promise.resolve({ id: "target" }) })).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects disabled accounts before querying staff or item records", async () => {
    state.role = "manager"; state.disabled = true;
    expect((await operationsGET(new Request("http://localhost/api/staff/operations"))).status).toBe(401);
    expect((await foundGET()).status).toBe(401); expect(state.traces).toHaveLength(0);
  });
});
