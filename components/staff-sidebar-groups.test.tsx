// Pins the owner/admin sidebar category IA: every module belongs to exactly one
// category, categories are non-empty, and together they cover the full module
// list (grouping is presentational — nothing may be dropped or duplicated).
import { describe, expect, it } from "vitest";
import { NAV_GROUPS as OWNER_GROUPS } from "./owner/owner-dashboard-client";
import { NAV_GROUPS as ADMIN_GROUPS } from "./admin/admin-dashboard-client";

describe("owner/admin sidebar category grouping", () => {
  it("covers every Owner module exactly once", () => {
    const all = OWNER_GROUPS.flatMap((group) => group.sections);
    for (const group of OWNER_GROUPS) expect(group.sections.length).toBeGreaterThan(0);
    expect(all).toHaveLength(new Set(all).size);
    expect([...all].sort()).toEqual(["admins", "audit", "departments", "exceptions", "financial",
      "operations", "overview", "policy", "reports", "roles", "room_types", "security",
      "transport_services", "transportation"]);
  });
  it("covers every Admin module exactly once", () => {
    const all = ADMIN_GROUPS.flatMap((group) => group.sections);
    for (const group of ADMIN_GROUPS) expect(group.sections.length).toBeGreaterThan(0);
    expect(all).toHaveLength(new Set(all).size);
    expect([...all].sort()).toEqual(["audit", "overview", "policy", "reports", "roles",
      "room_types", "rooms", "security", "transport_services", "users"]);
  });
});
