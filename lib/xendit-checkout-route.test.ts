import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/booking/payments/xendit/route";
const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: auth }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
const token = "63c2ef1f-b04c-4e14-9230-89c3e1b14fee";
const attempt = { paymentId: "payment", reservationId: "RES-1", reference: "reference", amount: 100, create: false };
const request = (body: unknown = { holdToken: token }) => new Request("https://untrusted.invalid/api/booking/payments/xendit", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  auth.mockReset(); rpc.mockReset();
  auth.mockResolvedValue({ user: { id: "guest-placeholder", role: "guest", disabled: false } });
  rpc.mockResolvedValue({ data: attempt, error: null });
  vi.stubEnv("XENDIT_SECRET_KEY", "xnd_development_placeholder"); vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "placeholder"); vi.stubEnv("APP_BASE_URL", "https://configured.invalid");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("requires an active signed-in guest before database/provider access", async () => {
  for (const session of [null, { user: { disabled: true } }, { user: { role: "manager" } }]) {
    auth.mockResolvedValue(session); expect([401, 403]).toContain((await POST(request())).status);
  }
  expect(rpc).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("does not accept a guest-supplied amount or reservation reference", async () => {
  expect((await POST(request({ holdToken: token, amount: 1, reference: "other" }))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
});
it("does not create another provider session for an already claimed attempt", async () => {
  const result = await POST(request()); expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ data: { confirmationUrl: "/booking/confirmation/RES-1" } });
  expect(fetch).not.toHaveBeenCalled();
});
it("leaves ambiguous provider failures claimed and returns a pending confirmation", async () => {
  rpc.mockResolvedValue({ data: { ...attempt, create: true, expiresAt: "2026-12-01T10:16:00Z", firstName: "Test", lastName: "Guest" } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
  const result = await POST(request()); expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ data: { confirmationUrl: "/booking/confirmation/RES-1" } });
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("never treats a completed session found during retry as a paid booking", async () => {
  rpc.mockResolvedValue({ data: { ...attempt, checkoutUrl: "https://dev.xen.to/test", sessionId: "ps-test" } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ payment_session_id: "ps-test", reference_id: "reference", amount: 100,
    session_type: "PAY", mode: "PAYMENT_LINK", currency: "PHP", country: "PH", status: "COMPLETED", payment_id: "py-test", expires_at: "2026-12-01T10:16:00Z" })));
  expect((await POST(request())).status).toBe(200); expect(rpc).toHaveBeenCalledTimes(1);
});
