import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const request = (path: string, headers: Record<string, string>) => new NextRequest("https://hotel.example" + path, {
  method: "POST", headers, body: "{}",
});
describe("browser writes", () => {
  it("rejects a cross-site cookie write before the route runs", async () => {
    expect((await proxy(request("/api/account/password", { origin: "https://foreign.example", "content-type": "application/json" }))).status).toBe(403);
    expect((await proxy(request("/api/auth/session-status", { "sec-fetch-site": "cross-site", "content-type": "application/json" }))).status).toBe(403);
  });
  it("accepts same-origin JSON and rejects a form-encoded custom write", async () => {
    expect((await proxy(request("/api/account/password", { origin: "https://hotel.example", "content-type": "application/json" }))).status).toBe(200);
    expect((await proxy(request("/api/account/password", { "content-type": "application/x-www-form-urlencoded" }))).status).toBe(415);
  });
  it.each([["POST", "/api/auth/session-status"], ["DELETE", "/api/booking/holds/example"]])("allows an empty %s stream on %s", async (method, path) => {
    const empty = new NextRequest("https://hotel.example" + path, { method, body: "" });
    empty.headers.delete("content-type");
    expect(empty.body).not.toBeNull();
    expect((await proxy(empty)).status).toBe(200);
    expect(await empty.text()).toBe("");
  });
  it("still requires a supported content type for bytes sent with a write", async () => {
    const unknown = request("/api/auth/session-status", {});
    unknown.headers.delete("content-type");
    expect((await proxy(unknown)).status).toBe(415);
  });
  it("preserves provider callbacks and the NextAuth CSRF flow", async () => {
    expect((await proxy(request("/api/webhooks/xendit", { "content-type": "application/json" }))).status).toBe(200);
    expect((await proxy(request("/api/auth/callback/credentials", { "content-type": "application/x-www-form-urlencoded" }))).status).toBe(200);
  });
});
