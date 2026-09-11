// Pins the owner/admin sidebar category IA: every module belongs to exactly one
// category, categories are non-empty, and together they cover the full module
// list (grouping is presentational — nothing may be dropped or duplicated).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      "room_types", "rooms", "security", "system", "transport_services", "users"]);
  });
});

describe("shared collapsible sidebar rail", () => {
  it("provides a labelled rail toggle for staff, Admin, Owner, and Customer shells", () => {
    const files = [
      "components/manager/manager-dashboard-client.tsx",
      "components/admin/admin-dashboard-client.tsx",
      "components/owner/owner-dashboard-client.tsx",
      "components/customer/customer-shell.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));

    for (const source of files) {
      expect(source).toContain("sidebar-collapse");
      expect(source).toContain("aria-controls=");
      expect(source).toContain("aria-expanded=");
    }
  });

  it("hides the secondary toggle in icon-rail and mobile-drawer modes", () => {
    const staffCss = readFileSync(resolve(process.cwd(), "app/manager-dashboard-theme.css"), "utf8");
    const customerCss = readFileSync(resolve(process.cwd(), "app/customer-portal.css"), "utf8");

    expect(staffCss).toMatch(/\.sidebar\.collapsed \.sidebar-collapse-button\{display:none\}/);
    expect(customerCss).toMatch(/\.customer-sidebar\.collapsed \.customer-sidebar-collapse\{display:none\}/);
    expect(staffCss).toMatch(/@media\(max-width:1000px\)\{[\s\S]*?\.sidebar-collapse-button\{display:none\}/);
    expect(customerCss).toMatch(/@media\(max-width:900px\)[^{]*\{[\s\S]*?\.customer-sidebar-collapse\{display:none\}/);
  });
});
