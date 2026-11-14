import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/xendit/route";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc, from } }));
const data = { payment_session_id: "ps-test123", reference_id: "haven-reference", session_type: "PAY", mode: "PAYMENT_LINK", currency: "PHP", country: "PH", amount: 100,
  status: "COMPLETED", payment_id: "py-test123", payment_link_url: "https://dev.xen.to/test123", expires_at: "2026-12-01T10:16:00Z" };
const request = (body: unknown, token = "callback-placeholder") => new Request("https://hotel.invalid/api/webhooks/xendit", { method: "POST", headers: { "x-callback-token": token }, body: JSON.stringify(body) });
beforeEach(() => {
  rpc.mockReset(); from.mockReset(); rpc.mockResolvedValue({ data: { outcome: "confirmed", reservationId: "RES-1" }, error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "local-payment" }, error: null }) }) }) }) });
  vi.stubEnv("XENDIT_SECRET_KEY", "xnd_development_placeholder"); vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "callback-placeholder"); vi.stubEnv("APP_BASE_URL", "https://hotel.invalid");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("rejects unauthorized notifications before API/DB access", async () => {
  expect((await POST(request({ event: "payment_session.completed", data }, "wrong"))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("uses the authoritative test session and atomic settlement RPC", async () => {
  expect((await POST(request({ event: "payment_session.completed", data }))).status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith("hotel_process_xendit_event", expect.objectContaining({ p_session: "ps-test123", p_amount: 100, p_currency: "PHP", p_transaction: "py-test123" }));
});
it.each([{ amount: 101 }, { reference_id: "foreign" }, { currency: "USD" }, { payment_session_id: "ps-foreign" }, { payment_id: "py-foreign" }])("rejects incorrect notification details: %j", async patch => {
  expect((await POST(request({ event: "payment_session.completed", data: { ...data, ...patch } }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("keeps a delayed expiry from overwriting authoritative completion", async () => {
  expect((await POST(request({ event: "payment_session.expired", data: { ...data, status: "EXPIRED", payment_id: undefined } }))).status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith("hotel_process_xendit_event", expect.objectContaining({ p_event: "payment_session.completed" }));
});
it("accepts a real expiry when an optional transaction is omitted in the webhook and null in the API", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...data, status: "EXPIRED", payment_id: null })));
  expect((await POST(request({ event: "payment_session.expired", data: { ...data, status: "EXPIRED", payment_id: undefined } }))).status).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith("hotel_process_xendit_event", expect.objectContaining({ p_event: "payment_session.expired", p_transaction: null }));
});
it("requests webhook retry for temporary provider failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect((await POST(request({ event: "payment_session.completed", data }))).status).toBe(503); expect(rpc).not.toHaveBeenCalled();
});
it("requests retry if the database has not committed a matching payment", async () => {
  rpc.mockResolvedValue({ error: { message: "XENDIT_PAYMENT_NOT_FOUND" } });
  expect((await POST(request({ event: "payment_session.completed", data }))).status).toBe(503);
});
it("ignores unrelated events", async () => {
  expect((await POST(request({ event: "payment.failure" }))).status).toBe(200); expect(rpc).not.toHaveBeenCalled();
});
it("acknowledges an authenticated Dashboard sample with no matching local booking", async () => {
  from.mockReturnValue({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) });
  const response = await POST(request({ event: "payment_session.completed", data }));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ outcome: "ignored_unmatched_reference" });
  expect(fetch).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
