import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: boundary.rpc } }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
const { getServerSession } = await import("next-auth");
const actions = [
  ["start", (await import("@/app/api/housekeeping/tasks/[id]/start/route")).POST, {}],
  ["complete", (await import("@/app/api/housekeeping/tasks/[id]/complete/route")).POST, { checklist: {} }],
  ["inspect", (await import("@/app/api/housekeeping/tasks/[id]/inspect/route")).POST, { result: "passed", idempotencyKey: "11111111-1111-4111-8111-111111111111" }],
  ["defer", (await import("@/app/api/housekeeping/tasks/[id]/defer/route")).POST, { reason: "Guest requested DND" }],
  ["maintenance", (await import("@/app/api/housekeeping/tasks/[id]/maintenance/route")).POST, { category: "Plumbing", description: "Leaking tap", priority: "normal", idempotencyKey: "11111111-1111-4111-8111-111111111111" }],
] as const;
beforeEach(() => { vi.resetAllMocks(); boundary.rpc.mockResolvedValue({ data: {}, error: null }); });

describe.each(actions)("Housekeeping %s route uses the shared guard", (action, post, body) => {
  const request = () => post(new Request(`http://haven.test/api/housekeeping/tasks/task-1/${action}`, {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  }), { params: Promise.resolve({ id: "task-1" }) });
  it.each([null, { user: { id: "actor", role: "housekeeping", disabled: true } }])("rejects an unavailable session before RPC", async (session) => {
    vi.mocked(getServerSession).mockResolvedValue(session as never);
    expect((await request()).status).toBe(401);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it.each(["admin", "manager", "front_desk", "accounting", "guest", "maintenance"])("rejects routine work by %s", async (role) => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "actor", role } } as never);
    expect((await request()).status).toBe(403);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("passes the authenticated Housekeeping actor to the workflow", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "actor", role: "housekeeping" } } as never);
    expect((await request()).status).toBe(action === "maintenance" ? 201 : 200);
    expect(boundary.rpc).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ p_task_id: "task-1", p_staff_user_id: "actor" }));
  });
});
