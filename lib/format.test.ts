import { describe, expect, it } from "vitest";
import { formatHotelDateTime } from "./format";

describe("formatHotelDateTime", () => {
  it("uses the authoritative hotel timezone and readable format", () => {
    const value = formatHotelDateTime("2026-09-18T08:25:00.000Z");
    expect(value).toContain("Sep 18, 2026");
    expect(value).toContain("4:25 PM");
  });

  it("handles missing and invalid values safely", () => {
    expect(formatHotelDateTime(null)).toBe("—");
    expect(formatHotelDateTime("not-a-date")).toBe("not-a-date");
  });
});
