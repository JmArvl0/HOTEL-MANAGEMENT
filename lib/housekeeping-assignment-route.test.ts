import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/types";

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: boundary.rpc } }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const { getServerSession } = await import("next-auth");
const { POST } = await import("@/app/api/housekeeping/tasks/[id]/assign/route");
const actor = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const session = (role: Role, disabled = false) => vi.mocked(getServerSession).mockResolvedValue({ user: { id: actor, role, disabled } } as never);
const assign = (body: unknown = {}) => POST(new Request("http://haven.test/api/housekeeping/tasks/task-1/assign", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "task-1" }) });

beforeEach(() => { vi.resetAllMocks(); boundary.rpc.mockResolvedValue({ data: { taskId: "task-1", status: "assigned" }, error: null }); });

describe("Housekeeping assignment HTTP authorization", () => {
  it("allows the Owner's existing suggested-assignment action", async () => {
    session("owner");
    const response = await assign({ assignedUserId: worker, reason: "Assign suggested teammate" });
    expect(response.status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("housekeeping_assign_task", {
      p_task_id: "task-1", p_assigned_user_id: worker, p_reason: "Assign suggested teammate", p_staff_user_id: actor,
    });
  });

  it("requires an Owner to choose a Housekeeping employee instead of self-claiming", async () => {
    session("owner");
    expect((await assign()).status).toBe(400);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("preserves Housekeeping self-claim and the server-stamped actor", async () => {
    session("housekeeping");
    expect((await assign({ reason: "Claim", staffUserId: worker })).status).toBe(200);
    expect(boundary.rpc).toHaveBeenCalledWith("housekeeping_assign_task", expect.objectContaining({ p_assigned_user_id: actor, p_staff_user_id: actor }));
  });

  it.each<Role>(["admin", "manager", "front_desk", "maintenance", "accounting", "guest"])("does not grant assignment to %s", async role => {
    session(role);
    expect((await assign({ assignedUserId: worker })).status).toBe(403);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("rejects disabled Housekeeping sessions before making a database call", async () => {
    session("housekeeping", true);
    expect((await assign()).status).toBe(401);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("preserves database ownership rejection", async () => {
    session("housekeeping");
    boundary.rpc.mockResolvedValue({ data: null, error: { message: "SELF_ASSIGNMENT_ONLY" } });
    const response = await assign({ assignedUserId: worker });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("only for themselves");
  });
});
