import { describe, expect, it } from "vitest";
import { auditPerformance, validateReportRange, type NightAudit } from "./analytical-report";

const close = (date: string, nights: number, supply: number, accrual: number | null): NightAudit => ({
  business_date: date, snapshot: { capacityBasis: "closing_active_inventory", bookedNights: nights, serviceableCapacity: supply, roomAccrual: accrual }
});

describe("analytical report periods", () => {
  it("weights occupancy and revenue ratios by room-nights and separates cash receipts", () => {
    const result = auditPerformance([close("2026-11-10", 8, 10, 24000), close("2026-11-11", 5, 20, 10000)], 2);
    expect(result.bookedOccupancy).toBeCloseTo(13 / 30 * 100);
    expect(result.adr).toBe(2615.38);
    expect(result.revpar).toBe(1133.33);
    expect(result.accrual).toBe(34000);
  });

  it("handles incomplete closes, unpriced rooms, and true zeroes separately", () => {
    const first = close("2026-11-10", 0, 10, 0);
    expect(auditPerformance([first], 2)).toMatchObject({ closedDays: 1, bookedOccupancy: null, adr: null, revpar: null });
    expect(auditPerformance([first], 1)).toMatchObject({ bookedOccupancy: 0, adr: null, revpar: 0 });
    expect(auditPerformance([close("2026-11-10", 8, 10, null)], 1)).toMatchObject({ bookedOccupancy: 80, adr: null, revpar: null });
  });

  it("rejects open, reversed, oversized, and impossible periods", () => {
    const today = "2026-11-22";
    expect(validateReportRange("2026-11-21", "2026-11-21", today)).toEqual({ from: "2026-11-21", through: "2026-11-21" });
    expect(validateReportRange("2026-11-21", today, today)).toBeNull();
    expect(validateReportRange(today, "2026-11-21", today)).toBeNull();
    expect(validateReportRange("2026-01-01", "2026-11-21", today)).toBeNull();
    expect(validateReportRange("2026-02-30", "2026-03-01", today)).toBeNull();
  });
});
