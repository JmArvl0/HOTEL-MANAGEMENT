import { describe, expect, it } from "vitest";
import {
  ROOM_TYPE_CHANGE_REASONS,
  financialDifference,
  roomTypeChangeReasonLabel,
  roomTypeChangeResponsibility,
} from "@/lib/room-type-change-reasons";

// The reason list is the TS mirror of the SQL allowlist
// (room_type_change_responsibility in migration 20260922010000). These sanity checks
// keep the mirror well-formed: every code unique and labeled, both responsibility
// groups populated, and unknown codes never resolve to a payer.
describe("room-type change reasons", () => {
  it("has unique codes, every code labeled, and both responsibility groups populated", () => {
    const codes = ROOM_TYPE_CHANGE_REASONS.map((reason) => reason.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const reason of ROOM_TYPE_CHANGE_REASONS) {
      expect(reason.label.trim().length).toBeGreaterThan(0);
      expect(["hotel", "guest"]).toContain(reason.responsibility);
    }
    expect(ROOM_TYPE_CHANGE_REASONS.some((reason) => reason.responsibility === "hotel")).toBe(true);
    expect(ROOM_TYPE_CHANGE_REASONS.some((reason) => reason.responsibility === "guest")).toBe(true);
  });
  it("maps hotel-caused codes to the hotel and guest-requested codes to the guest", () => {
    for (const reason of ROOM_TYPE_CHANGE_REASONS) {
      expect(roomTypeChangeResponsibility(reason.code)).toBe(reason.responsibility);
      // Hotel-caused codes are prefixed hotel_, guest-requested codes guest_.
      expect(reason.code.startsWith(reason.responsibility === "hotel" ? "hotel_" : "guest_")).toBe(true);
    }
  });
  it("never derives a payer from an unknown code", () => {
    expect(roomTypeChangeResponsibility("hotel_pays_because_staff_says_so")).toBeNull();
    expect(roomTypeChangeResponsibility("")).toBeNull();
    expect(roomTypeChangeResponsibility("financial_responsibility")).toBeNull();
  });
  it("labels known codes and passes unknown codes through", () => {
    expect(roomTypeChangeReasonLabel("hotel_overbooking")).toBe("Overbooking");
    expect(roomTypeChangeReasonLabel("guest_larger_room")).not.toBe("guest_larger_room");
    expect(roomTypeChangeReasonLabel("mystery_code")).toBe("mystery_code");
  });
  it("reads the stamped difference as number or Postgres string, rounded to cents", () => {
    expect(financialDifference({ difference: 1250 })).toBe(1250);
    expect(financialDifference({ difference: "1250.5" })).toBe(1250.5);
    expect(financialDifference({ difference: "1250.555" })).toBe(1250.56);
    expect(financialDifference({ difference: "-800" })).toBe(-800);
    expect(financialDifference(null)).toBe(0);
    expect(financialDifference({})).toBe(0);
  });
});
