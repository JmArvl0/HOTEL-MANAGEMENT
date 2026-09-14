import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Global database header badge: no role header may render a "Supabase live"
// indicator. System Administrator → System Health is the single authoritative
// surface for database status (live probe in app/api/admin/data?section=system).
const manager = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const admin = readFileSync("components/admin/admin-dashboard-client.tsx", "utf8");
const owner = readFileSync("components/owner/owner-dashboard-client.tsx", "utf8");
const customer = readFileSync("components/customer/customer-shell.tsx", "utf8");
const adminRoute = readFileSync("app/api/admin/data/route.ts", "utf8");

describe("global database header badge", () => {
  it("shows no Supabase badge in any role header", () => {
    for (const source of [manager, admin, owner, customer]) expect(source).not.toContain("Supabase live");
  });

  it("keeps the honest Demo-data signal in the manager header only", () => {
    expect(manager).toContain("Demo data");
    expect(manager).toContain('mode === "demo"');
    for (const source of [admin, owner, customer]) expect(source).not.toContain("Demo data");
  });

  it("serves database health only from the guarded System Health source", () => {
    expect(adminRoute).toContain("guardAdmin");
    expect(adminRoute).toContain("systemHealth(");
    expect(admin).toContain("SystemHealthView");
  });
});
