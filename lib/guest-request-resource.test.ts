import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/resources/[resource]/route";

const state = vi.hoisted(() => ({
  role: "front_desk",
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "staff-fixture", role: state.role } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: null }));
vi.mock("@/lib/data", () => ({ create: state.create, update: state.update }));
vi.mock("@/lib/staff-data", () => ({ listForRole: state.list }));

const resource = { params: Promise.resolve({ resource: "guest_requests" }) };
const url = "https://hotel.example.test/api/resources/guest_requests";

beforeEach(() => {
  vi.clearAllMocks();
});

it.each(["front_desk", "housekeeping", "manager", "owner"])(
  "requires %s to use the guest-request workflow for writes",
  async (role) => {
    state.role = role;
    const payload = { id: "request-fixture", request: "Please bring a towel." };
    for (const [method, handler] of [["POST", POST], ["PATCH", PATCH]] as const) {
      const response = await handler(new NextRequest(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }), resource);
      expect(response.status).toBe(403);
      expect(await response.json()).toHaveProperty("error", expect.stringContaining("guest request workflow"));
    }
    expect(state.create).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  },
);

it("continues to reject generic guest-request writes for a role without resource access", async () => {
  state.role = "maintenance";
  const response = await PATCH(new NextRequest(url, { method: "PATCH" }), resource);
  expect(response.status).toBe(403);
  expect(state.update).not.toHaveBeenCalled();
});

it("keeps the role-scoped guest-request list available", async () => {
  state.role = "housekeeping";
  state.list.mockResolvedValue([{ id: "request-fixture", department: "housekeeping" }]);
  const response = await GET(new NextRequest(url), resource);
  expect(response.status).toBe(200);
  expect(state.list).toHaveBeenCalledWith("guest_requests", "housekeeping");
  expect(await response.json()).toEqual({ data: [{ id: "request-fixture", department: "housekeeping" }] });
});
