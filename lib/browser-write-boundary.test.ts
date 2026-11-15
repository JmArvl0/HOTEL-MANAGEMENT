import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const request = (path: string, headers: Record<string, string>) => new NextRequest("https://hotel.example" + path, {
  method: "POST", headers, body: "{}",
});
describe("browser writes", () => {
  it("rejects a cross-site cookie write before the route runs", () => {
    expect(proxy(request("/api/account/password", { origin: "https://foreign.example", "content-type": "application/json" })).status).toBe(403);
    expect(proxy(request("/api/auth/session-status", { "sec-fetch-site": "cross-site", "content-type": "application/json" })).status).toBe(403);
  });
  it("accepts same-origin JSON and rejects a form-encoded custom write", () => {
    expect(proxy(request("/api/account/password", { origin: "https://hotel.example", "content-type": "application/json" })).status).toBe(200);
    expect(proxy(request("/api/account/password", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
  });
  it("preserves provider callbacks and the NextAuth CSRF flow", () => {
    expect(proxy(request("/api/webhooks/xendit", { "content-type": "application/json" })).status).toBe(200);
    expect(proxy(request("/api/auth/callback/credentials", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(200);
  });
});
