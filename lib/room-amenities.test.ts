import { describe, expect, it } from "vitest";
import { hasConflictingAmenities, normalizeAmenities, resolveRoomAmenities } from "./room-amenities";

describe("room amenity inheritance", () => {
  it("inherits all type defaults for a room without overrides", () => {
    expect(resolveRoomAmenities(["Wi-Fi", "Air conditioning", "Desk"]).effective).toEqual(["Wi-Fi", "Air conditioning", "Desk"]);
  });
  it("changes one room without mutating its parent or sibling", () => {
    const standard = ["Wi-Fi", "Air conditioning", "Desk"];
    expect(resolveRoomAmenities(standard, ["Microwave"], ["Desk"]).effective).toEqual(["Wi-Fi", "Air conditioning", "Microwave"]);
    expect(resolveRoomAmenities(standard).effective).toEqual(standard);
    expect(standard).toEqual(["Wi-Fi", "Air conditioning", "Desk"]);
  });
  it("recomputes from a new parent and preserves room additions and dormant exclusions", () => {
    const room = resolveRoomAmenities(["Wi-Fi", "Bath"], ["Microwave"], ["Desk"]);
    expect(room.effective).toEqual(["Wi-Fi", "Bath", "Microwave"]);
    expect(room.dormantExclusions).toEqual(["Desk"]);
  });
  it("normalizes duplicate labels without discarding an explicit room addition", () => {
    expect(normalizeAmenities([" Wi-Fi ", "wi-fi", "Air   conditioning", null])).toEqual(["Wi-Fi", "Air conditioning"]);
    expect(resolveRoomAmenities([], ["Wi-Fi"]).effective).toEqual(["Wi-Fi"]);
  });
  it("detects conflicting overrides and restores inheritance when cleared", () => {
    expect(hasConflictingAmenities(["Desk"], [" desk "])).toBe(true);
    expect(hasConflictingAmenities(["Microwave"], ["Desk"])).toBe(false);
    expect(resolveRoomAmenities(["Desk"], [], []).effective).toEqual(["Desk"]);
  });
});
