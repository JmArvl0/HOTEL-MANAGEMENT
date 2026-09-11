import { describe, expect, it } from "vitest";
import { ROOM_TYPE_COLORS, roomTypeBadgeClass } from "./room-type-badge";

describe("room-type badge palette", () => {
  it("has eight unique semantic keys", () => {
    expect(ROOM_TYPE_COLORS).toHaveLength(8);
    expect(new Set(ROOM_TYPE_COLORS).size).toBe(8);
  });

  it("maps a key to its variant class", () => {
    expect(roomTypeBadgeClass("sage")).toBe("room-type rt-sage");
    expect(roomTypeBadgeClass("ocean")).toBe("room-type rt-ocean");
  });

  it("falls back to the neutral base for null, unknown, and legacy values", () => {
    expect(roomTypeBadgeClass(null)).toBe("room-type");
    expect(roomTypeBadgeClass(undefined)).toBe("room-type");
    expect(roomTypeBadgeClass("")).toBe("room-type");
    expect(roomTypeBadgeClass("neon-pink")).toBe("room-type");
  });
});
