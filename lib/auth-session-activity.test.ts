import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "next-auth";
const state = vi.hoisted(() => ({
  activity: {} as Record<string, string>,
  unavailable: false,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      let id = "";
      const query = {
        select: () => query,
        eq: (field: string, value: string) => { if (field === "session_id") id = value; return query; },
        maybeSingle: async () => ({ data: state.activity[id] ? { last_seen_at: state.activity[id] } : null,
          error: state.unavailable ? { code: "temporary" } : null }),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/security-policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security-policy")>("@/lib/security-policy");
  return { ...actual, loadSecurityPolicyFresh: async () => ({ ...actual.DEFAULT_SECURITY_POLICY,
    cookieEnabled: true, idleTimeoutMinutes: 5, absoluteSessionMinutes: 480 }) };
});
import { authOptions } from "@/lib/auth";
const callback = authOptions.callbacks!.session!;
const check = async (id: string): Promise<Session> => await callback({
  session: { user: { id: "fixture", role: "guest" }, expires: new Date(Date.now() + 480 * 60000).toISOString() },
  token: { sub: "fixture", role: "guest", activityId: id, persistent: true, loginIssuedAt: Math.floor(Date.now() / 1000) - 600 },
} as never) as Session;
beforeEach(() => { state.activity = {}; state.unavailable = false; });
it("one device's activity cannot extend another device's idle session", async () => {
  state.activity.active = new Date().toISOString();
  state.activity.idle = new Date(Date.now() - 10 * 60000).toISOString();
  const active = await check("active");
  expect(active.user?.disabled).not.toBe(true);
  const idle = await check("idle");
  expect(idle.user?.disabled).toBe(true);
});
it("neutralizes a session when its activity authority is unreadable", async () => {
  state.unavailable = true;
  expect((await check("unavailable")).user?.disabled).toBe(true);
});
