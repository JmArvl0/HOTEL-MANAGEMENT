import { describe, expect, it } from "vitest";
import { NAV_ITEMS, canOpenSection } from "@/config/role-navigation";

// Room operations, reservation processing and guest profiles have distinct
// navigation entries while the legacy rooms route remains renderable.
describe("room rack navigation", () => {
  it("opens the fused rack when both underlying resources are permitted", () => {
    expect(canOpenSection(["overview", "reservations", "rooms"], "room_rack")).toBe(true);
  });

  it("keeps the fused rack closed when either resource is unavailable", () => {
    expect(canOpenSection(["overview", "reservations"], "room_rack")).toBe(false);
    expect(canOpenSection(["overview", "rooms"], "room_rack")).toBe(false);
    expect(canOpenSection(["overview"], "room_rack")).toBe(false);
    expect(canOpenSection(["overview"], "hotel_operations")).toBe(false);
  });
  it("exposes Room Management to front office roles only", () => {
    const rack = NAV_ITEMS.find((item) => item.section === "room_rack");
    expect(rack?.label).toBe("Room Management");
    expect(rack?.group).toBe("front_office");
    expect(rack?.roles?.sort()).toEqual(["front_desk", "manager", "owner"]);
    expect(rack?.hidden).toBeFalsy();
  });

  it("keeps the legacy room grid hidden from the sidebar", () => {
    for (const section of ["rooms"] as const) {
      const item = NAV_ITEMS.find((i) => i.section === section);
      expect(item, section).toBeDefined();
      expect(item?.hidden).toBe(true);
    }
  });

  it("separates room and reservation modules", () => {
    const visible = NAV_ITEMS.filter(
      (i) => ["room_rack", "reservations", "rooms"].includes(i.section) && !i.hidden
    );
    expect(visible.map((i) => i.section)).toEqual(["room_rack", "reservations"]);
    expect(NAV_ITEMS.find(i => i.section === "guests")?.label).toBe("Guest Management");
  });
});
