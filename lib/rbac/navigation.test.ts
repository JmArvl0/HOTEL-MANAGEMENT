// Navigation domain-separation contracts. config/role-navigation.ts is the
// single structural authority; manager-dashboard-client derives icons only.
// These tests pin the redundancy eliminations: no dead maintenance tab, one
// room grid, accounting-only verification authority, scoped filer approvals.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS, NAV_ITEMS, groupedNav } from "@/config/role-navigation";
import { canAccess, canVerifyDeposit, canReviewManagerApprovals } from "@/lib/permissions";
import type { Resource, Role } from "@/lib/types";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const sectionsFor = (role: string) =>
  NAV_ITEMS.filter((item) => !item.roles || (item.roles as string[]).includes(role)).map((item) => item.section);

describe("role navigation structure", () => {
  it("maintenance has no Guest Requests tab (its render path never existed)", () => {
    expect(sectionsFor("maintenance")).not.toContain("guest_requests");
    expect(sectionsFor("maintenance")).toEqual(
      expect.arrayContaining(["overview", "rooms", "maintenance_orders", "inventory"])
    );
  });

  it("guest requests stay with inbox, oversight, and fulfillment roles only", () => {
    const roles = NAV_ITEMS.find((item) => item.section === "guest_requests")?.roles;
    expect(roles).toEqual(["front_desk", "manager", "housekeeping"]);
  });

  it("housekeeping still reaches fulfillment; front desk keeps the inbox", () => {
    expect(sectionsFor("housekeeping")).toContain("guest_requests");
    expect(sectionsFor("front_desk")).toContain("guest_requests");
    expect(sectionsFor("accounting")).not.toContain("guest_requests");
  });

  it("deposit verification is actionable by accounting alone", () => {
    expect(canVerifyDeposit("accounting")).toBe(true);
    for (const role of ["front_desk", "manager", "housekeeping", "maintenance", "owner"] as const) {
      expect(canVerifyDeposit(role)).toBe(false);
    }
  });

  it("approval review authority stays with the manager", () => {
    expect(canReviewManagerApprovals("manager")).toBe(true);
    for (const role of ["front_desk", "housekeeping", "maintenance", "accounting"] as const) {
      expect(canReviewManagerApprovals(role)).toBe(false);
    }
  });

  it("every resource nav section resolves for at least one role with access-map cover", () => {
    const allRoles: Role[] = ["owner", "manager", "front_desk", "housekeeping", "maintenance", "accounting"];
    const resources = ["reservations", "rooms", "guests", "guest_requests", "housekeeping_tasks", "maintenance_orders", "invoices", "payments", "refunds", "inventory", "staff"];
    for (const item of NAV_ITEMS.filter((entry) => resources.includes(entry.section))) {
      const roles = (item.roles ?? allRoles) as Role[];
      expect(
        roles.some((role) => canAccess(role, item.section as Resource)),
        `${item.section} has no role with access-map cover`
      ).toBe(true);
    }
  });

  it("grouping keeps every item in exactly one non-empty group", () => {
    const groups = groupedNav(NAV_ITEMS);
    expect(groups.length).toBe(NAV_GROUPS.length);
    const seen = groups.flatMap((group) => group.items.map((item) => item.section));
    expect(new Set(seen).size).toBe(NAV_ITEMS.length);
  });
});

describe("domain-separation surface contracts", () => {
  it("all room views render through the single unified matrix", () => {
    const client = read("components/manager/manager-dashboard-client.tsx");
    expect(client).toContain("<UnifiedRoomMatrix");
    expect(client).toContain('resource === "rooms" && <UnifiedRoomMatrix');
    expect(client).not.toContain("room-card-grid");
    const matrix = read("components/shared/unified-room-matrix.tsx");
    expect(matrix).toContain("room-card-grid");
    expect(matrix).toContain("canAdvanceStatus");
  });

  it("housekeeping fulfillment shares the batch queue (All default, Open filter available)", () => {
    const panel = read("components/manager/guest-requests-panel.tsx");
    expect(panel).toContain('useState("all")');
    expect(panel).toContain('["open", "Open work"]');
  });

  it("deposit queue states its read-only boundary for non-accounting roles", () => {
    expect(read("components/manager/manager-dashboard-client.tsx")).toContain("other roles see status only");
  });

  it("filer approvals default to filed-by-me scope with an explicit toggle", () => {
    const client = read("components/manager/manager-dashboard-client.tsx");
    expect(client).toContain('useState(canReview ? "all" : "mine")');
    expect(client).toContain("My requests");
    expect(client).toContain("actorId={user.id}");
  });

  it("nav structure lives in config, dashboard only adds icons", () => {
    const client = read("components/manager/manager-dashboard-client.tsx");
    expect(client).toContain('from "@/config/role-navigation"');
    expect(client).toContain("NAV_ITEMS.map");
    expect(client).not.toContain('{ label: "Guest Requests"');
  });
});
