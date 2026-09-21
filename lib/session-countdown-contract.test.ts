import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("authenticated session countdown contract", () => {
  it("does not treat background session reads as meaningful activity", () => {
    const auth = read("lib/auth.ts");
    expect(auth).not.toMatch(/decision\s*===\s*"allow"[\s\S]{0,180}touchSecuritySeen/);
  });

  it("provides one server status route with a non-mutating GET and explicit activity POST", () => {
    const path = "app/api/auth/session-status/route.ts";
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const route = read(path);
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("touchSecuritySeen");
  });

  it("mounts the shared guard in customer, operational, admin, and owner header groups", () => {
    for (const path of [
      "components/customer/customer-shell.tsx",
      "components/manager/manager-dashboard-client.tsx",
      "components/admin/admin-dashboard-client.tsx",
      "components/owner/owner-dashboard-client.tsx",
    ]) expect(read(path)).toContain("<SessionExpiryGuard");
  });

  it("passes the authoritative deadline from authenticated server layouts", () => {
    expect(read("app/(booking)/(customer)/layout.tsx")).toContain("sessionExpiresAt={session.sessionExpiresAt}");
    expect(read("app/(manager)/manager_dashboard/page.tsx")).toContain("sessionExpiresAt={session.sessionExpiresAt}");
    expect(read("components/booking/booking-page-frame.tsx")).toContain("sessionExpiresAt={session.sessionExpiresAt}");
  });
});
