import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createXenditSession, getXenditSession, testCheckoutUrl, verifyXenditToken, xenditConfigured, XenditError } from "@/lib/xendit";

const fixture = { payment_session_id: "ps-test123", reference_id: "haven-test-reference", session_type: "PAY", mode: "PAYMENT_LINK",
  currency: "PHP", country: "PH", amount: 1250.50, status: "ACTIVE", payment_link_url: "https://dev.xen.to/test123", expires_at: new Date(Date.now() + 16 * 60_000).toISOString() };
const input = { reference: fixture.reference_id, amount: fixture.amount, expiresAt: fixture.expires_at, reservationId: "RES-123", firstName: "Sandbox", lastName: "Guest" };
beforeEach(() => {
  vi.stubEnv("XENDIT_SECRET_KEY", "xnd_development_test_placeholder");
  vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "test-callback-placeholder");
  vi.stubEnv("APP_BASE_URL", "https://hotel.example.invalid");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("sandbox payment boundary", () => {
  it("uses Basic key: auth and peso amounts with the documented hosted-session fields", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(fixture)); vi.stubGlobal("fetch", request);
    await createXenditSession(input);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.xendit.co/sessions");
    expect(options.headers.authorization).toBe(`Basic ${Buffer.from("xnd_development_test_placeholder:").toString("base64")}`);
    expect(JSON.parse(options.body)).toMatchObject({ amount: 1250.50, session_type: "PAY", mode: "PAYMENT_LINK", capture_method: "AUTOMATIC",
      currency: "PHP", country: "PH", allowed_payment_channels: ["GCASH", "PAYMAYA"], success_return_url: "https://hotel.example.invalid/booking/confirmation/RES-123?checkout=returned" });
    expect(options.redirect).toBe("error");
  });
  it.each(["GCASH", "PAYMAYA"] as const)("restricts checkout to the requested documented %s channel", async channel => {
    const request = vi.fn().mockResolvedValue(Response.json(fixture)); vi.stubGlobal("fetch", request);
    await createXenditSession({ ...input, channel });
    expect(JSON.parse(request.mock.calls[0][1].body).allowed_payment_channels).toEqual([channel]);
  });
  it.each(["xnd_production_placeholder", "xnd_public_development_placeholder", "sk_live_placeholder", ""])("rejects a non-test secret before network I/O: %s", async key => {
    vi.stubEnv("XENDIT_SECRET_KEY", key); const request = vi.fn(); vi.stubGlobal("fetch", request);
    expect(xenditConfigured()).toBe(false); await expect(createXenditSession(input)).rejects.toThrow("XENDIT_TEST_KEY_REQUIRED"); expect(request).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:3000", "https://hotel.invalid/path", "https://user:password@hotel.invalid", "https://hotel.invalid?next=evil"])("rejects unsafe return origins: %s", async origin => {
    vi.stubEnv("APP_BASE_URL", origin); expect(xenditConfigured()).toBe(false);
  });
  it.each(["https://xen.to/live", "https://checkout.xendit.co/live", "https://dev.xen.to.evil.invalid/test", "javascript:alert(1)", "https://user@dev.xen.to/test"])("rejects live or foreign checkout: %s", url => expect(() => testCheckoutUrl(url)).toThrow());
  it.each([{ amount: 1200 }, { currency: "USD" }, { reference_id: "other-booking" }, { capture_method: "MANUAL" }, { payment_link_url: "https://xen.to/live" }])("rejects an inconsistent provider response: %j", async patch => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...fixture, ...patch })));
    await expect(createXenditSession(input)).rejects.toThrow();
  });
  it("authenticates callback tokens without accepting missing or partial tokens", () => {
    expect(verifyXenditToken("same-token", "same-token")).toBe(true);
    for (const value of [null, "", "same-toke", "same-tokex"]) expect(verifyXenditToken(value, "same-token")).toBe(false);
  });
  it("distinguishes a definitive channel rejection from an ambiguous timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error_code: "INVALID_PAYMENT_CHANNEL", message: "private diagnostic" }, { status: 400 })));
    await expect(createXenditSession(input)).rejects.toMatchObject({ code: "XENDIT_CHANNEL_UNAVAILABLE", definitive: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network details")));
    await expect(createXenditSession(input)).rejects.toMatchObject({ code: "XENDIT_REQUEST_UNCERTAIN", definitive: false });
  });
  it("retrieves only a validated session ID under the test credential", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(fixture)); vi.stubGlobal("fetch", request);
    await getXenditSession("ps-test123"); expect(request.mock.calls[0][0]).toBe("https://api.xendit.co/sessions/ps-test123");
    await expect(getXenditSession("../../live")).rejects.toThrow();
    expect(new XenditError("code").definitive).toBe(false);
  });
});
