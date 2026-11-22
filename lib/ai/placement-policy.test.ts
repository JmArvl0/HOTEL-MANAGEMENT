import { describe, expect, it } from "vitest";
import { allStaffPlacements, contextIdForPlacement, placementForRole, placementModuleId, validateHotelQuestion } from "./placement-policy";

describe("system-wide AI placement authority", () => {
  it("covers the 94 approved account and module entries without granting another role's module", () => {
    expect(allStaffPlacements()).toHaveLength(94);
    expect(placementForRole("front_desk", "Bookings")?.purpose).toBe("Booking process guide");
    expect(placementForRole("housekeeping", "Deposit Verification")).toBeNull();
    expect(placementForRole("guest", "Bookings")).toBeNull();
    expect(placementForRole("manager", "HAVEN AI")).toBeNull();
  });

  it("uses a bounded audit identifier for every approved module", () => {
    for (const { role, module } of allStaffPlacements()) {
      expect(placementModuleId(role, module.name)).toMatch(/^[a-z_]+$/);
    }
  });

  it("uses each operational role's own dashboard facts", () => {
    expect(contextIdForPlacement("front_desk", "Dashboard")).toBe("front_desk");
    expect(contextIdForPlacement("housekeeping", "Dashboard")).toBe("housekeeping");
    expect(contextIdForPlacement("maintenance", "Dashboard")).toBe("maintenance");
    expect(contextIdForPlacement("accounting", "Dashboard")).toBe("accounting");
    expect(contextIdForPlacement("owner", "Dashboard")).toBeNull();
  });
});

describe("manual hotel question boundary", () => {
  it("rejects personal use, executable code, and credential disclosure", () => {
    expect(validateHotelQuestion("Write Python code for my class").ok).toBe(false);
    expect(validateHotelQuestion("Give me the hotel API key").ok).toBe(false);
    expect(validateHotelQuestion("Write an essay about my vacation").ok).toBe(false);
  });

  it("allows a legitimate booking code question and a hotel process question", () => {
    expect(validateHotelQuestion("Where can I find the booking code for check-in?").ok).toBe(true);
    expect(validateHotelQuestion("How should I prepare this arrival if the room is dirty?").ok).toBe(true);
  });
});
