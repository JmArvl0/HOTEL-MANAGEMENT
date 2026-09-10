// AI RBAC: manager/owner/admin only, enforced server-side before any data is
// fetched or any Gemini call is made. No AI access for operational roles or guests.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const { guardAiSession, AI_ROLES } = await import("@/lib/ai/guard");
const { getServerSession } = await import("next-auth");

const MANAGER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => { vi.mocked(getServerSession).mockReset(); });

describe("AI_ROLES", () => {
  it("is exactly manager, owner and admin", () => {
    expect([...AI_ROLES].sort()).toEqual(["admin", "manager", "owner"]);
  });
});

describe("guardAiSession", () => {
  it("refuses an anonymous caller with 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const guard = await guardAiSession();
    expect(guard instanceof Response && guard.status).toBe(401);
  });

  it("refuses a disabled session with 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: MANAGER, role: "manager", disabled: true } } as never);
    const guard = await guardAiSession();
    expect(guard instanceof Response && guard.status).toBe(401);
  });

  it("refuses every non-AI role with 403", async () => {
    for (const role of ["front_desk", "housekeeping", "maintenance", "accounting", "guest"]) {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: MANAGER, role, disabled: false } } as never);
      const guard = await guardAiSession();
      expect(guard instanceof Response && guard.status, role).toBe(403);
    }
  });

  it("admits manager, owner and admin with their session identity", async () => {
    for (const role of ["manager", "owner", "admin"]) {
      vi.mocked(getServerSession).mockResolvedValue({ user: { id: MANAGER, role, disabled: false } } as never);
      const guard = await guardAiSession();
      expect(guard, role).toMatchObject({ userId: MANAGER, role });
    }
  });
});
