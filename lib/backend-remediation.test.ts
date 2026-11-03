import { describe, expect, it, vi } from "vitest";
import { encode, decode } from "next-auth/jwt";
import { DEFAULT_SECURITY_POLICY, evaluateSessionExpiry } from "./security-policy";
import { authOptions } from "./auth";

describe("absolute login lifetime", () => {
  it("preserves the original login clock across a real NextAuth token renewal", async () => {
    const now = Math.floor(Date.now() / 1000);
    const original = now - 7 * 3600;
    const jwt = authOptions.callbacks!.jwt!;
    const first = await jwt({ token: { sub: "offline-user", iat: original, persistent: true } } as never);
    const renewed = await decode({
      token: await encode({ token: first, secret: "offline-regression-secret" }),
      secret: "offline-regression-secret",
    });
    const token = await jwt({ token: renewed } as never);
    expect(token.loginIssuedAt).toBe(original);
    const future = (now + 2 * 3600) * 1000;
    expect(evaluateSessionExpiry({
      issuedAtSec: token.loginIssuedAt as number,
      lastSeenAt: new Date(future - 1000).toISOString(), persistent: true,
      policy: DEFAULT_SECURITY_POLICY, nowMs: future,
    })).toBe("absolute");
  });
});

const session = vi.hoisted(() => ({ user: { id: "front-desk", role: "front_desk", disabled: false } }));
vi.mock("next-auth", () => ({ getServerSession: async () => session }));

describe("generic resource boundary", () => {
  it.each([{ total: 1 }, { check_out: "2027-12-31" }, { user_id: "different-user" }])(
    "refuses direct reservation fields %j", async (patch) => {
      const { PATCH } = await import("@/app/api/resources/[resource]/route");
      const response = await PATCH(new Request("http://localhost/api/resources/reservations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "RSV-protected", ...patch }),
      }) as never, { params: Promise.resolve({ resource: "reservations" }) });
      expect(response.status).toBe(403);
    },
  );
});
