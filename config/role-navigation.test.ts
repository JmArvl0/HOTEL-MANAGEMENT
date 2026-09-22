import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/config/role-navigation";

// Rack consolidation contract: exactly one visible Front Office entry for
// rooms + reservations; the deprecated sections stay defined but hidden.
describe("room rack navigation", () => {
  it("exposes Room Rack & Reservations to front office roles only", () => {
    const rack = NAV_ITEMS.find((item) => item.section === "room_rack");
    expect(rack?.label).toBe("Room Rack & Reservations");
    expect(rack?.group).toBe("front_office");
    expect(rack?.roles?.sort()).toEqual(["front_desk", "manager", "owner"]);
    expect(rack?.hidden).toBeFalsy();
  });

  it("keeps deprecated sections defined but hidden from the sidebar", () => {
    for (const section of ["reservations", "rooms"] as const) {
      const item = NAV_ITEMS.find((i) => i.section === section);
      expect(item, section).toBeDefined();
      expect(item?.hidden).toBe(true);
    }
  });

  it("keeps a single visible room/reservation surface", () => {
    const visible = NAV_ITEMS.filter(
      (i) => ["room_rack", "reservations", "rooms"].includes(i.section) && !i.hidden
    );
    expect(visible.map((i) => i.section)).toEqual(["room_rack"]);
  });
});
