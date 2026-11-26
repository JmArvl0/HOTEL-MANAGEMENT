import { describe, expect, it } from "vitest";
import { calculateSeasonalOccupancy, matchingHotelDate, seasonalRange, seasonalTargetLimit, type OccupancyActual } from "./seasonal-occupancy";
import type { ReservationLike } from "./types";

const today = "2026-11-22";
const january = seasonalRange({ view: "month", target: "2027-01", referenceYear: 2026 }, today)!;
const date = seasonalRange({ view: "date", target: "2027-01-21", referenceYear: 2026 }, today)!;
const observed = (percent: number): OccupancyActual => ({ percent, recordedAt: "2026-01-22T02:35:00+08:00" });
const booking = (id: string, status = "confirmed"): ReservationLike => ({
  id, status, check_in: "2027-01-21", check_out: "2027-01-22", created_at: "2026-11-20T03:00:00Z"
});

describe("seasonal occupancy", () => {
  it("uses the exact same month and day in the selected reference year", () => {
    const actuals = new Map([["2026-01-21", observed(80)], ["2026-01-22", observed(40)]]);
    const result = calculateSeasonalOccupancy(date, today, 25, [booking("one"), booking("two", "cancelled")], actuals);
    expect(result.days).toMatchObject([{ date: "2027-01-21", referenceDate: "2026-01-21", bookedRooms: 1, projectedRooms: 20, projectedPercent: 80 }]);
    expect(result.summary).toMatchObject({ comparisonDays: 1, targetDays: 1, baselinePercent: 80, periodOccupancy: 80 });
  });

  it("can match the nearest weekday and shows night-audit bookings as a separate source", () => {
    expect(matchingHotelDate("2027-01-21", 2026, "weekday")).toBe("2026-01-22");
    const result = calculateSeasonalOccupancy({ ...date, match: "weekday" }, today, 25, [booking("one")],
      new Map(), new Map([["2026-01-22", observed(80)]]));
    expect(result.days[0]).toMatchObject({ referenceDate: "2026-01-22", reference: null, referenceBooked: { percent: 80 }, projectedRooms: null });
    expect(result.summary).toMatchObject({ comparisonDays: 0, auditDays: 1 });
  });

  it("keeps current bookings visible on day one and withholds unavailable forecasts", () => {
    const result = calculateSeasonalOccupancy(january, today, 25, [booking("one")], new Map());
    expect(result.summary).toMatchObject({ bookedRoomNights: 1, comparisonDays: 0, targetDays: 31, periodOccupancy: null, baselinePercent: null });
    expect(result.days[20]).toMatchObject({ bookedRooms: 1, bookedPercent: 4, projectedRooms: null });
    expect(result.days[21]).toMatchObject({ bookedRooms: 0, bookedPercent: 0, projectedRooms: null });
  });

  it("keeps booked rooms as a floor while allowing a genuinely recorded zero baseline", () => {
    const result = calculateSeasonalOccupancy(date, today, 25, [booking("one"), booking("two")], new Map([["2026-01-21", observed(0)]]));
    expect(result.days[0]).toMatchObject({ bookedRooms: 2, projectedRooms: 2 });
    expect(result.summary).toMatchObject({ baselinePercent: 0, periodOccupancy: 8 });
    const over = calculateSeasonalOccupancy(date, today, 1, [booking("one"), booking("two")], new Map([["2026-01-21", observed(80)]]));
    expect(over.days[0]).toMatchObject({ bookedRooms: 2, overCapacity: true, projectedPercent: null });
  });

  it("requires complete date coverage for the monthly totals", () => {
    const actuals = new Map(Array.from({ length: 31 }, (_, index) => [`2026-01-${String(index + 1).padStart(2, "0")}`, observed(80)]));
    expect(calculateSeasonalOccupancy(january, today, 25, [], actuals).summary).toMatchObject({ comparisonDays: 31, baselinePercent: 80, periodOccupancy: 80 });
    actuals.delete("2026-01-15");
    const result = calculateSeasonalOccupancy(january, today, 25, [], actuals);
    expect(result.summary).toMatchObject({ comparisonDays: 30, baselinePercent: null, periodOccupancy: null });
    expect(result.days[20].projectedRooms).toBe(20);
  });

  it("compares recorded outcomes on closed dates without generating a retroactive forecast", () => {
    const result = calculateSeasonalOccupancy(date, "2027-01-22", 25, [booking("one")], new Map([
      ["2026-01-21", observed(80)], ["2027-01-21", observed(76)]
    ]));
    expect(result.days[0]).toMatchObject({ actual: { percent: 76 }, bookedRooms: null, projectedRooms: null });
    expect(result.summary).toMatchObject({ baselinePercent: 80, periodOccupancy: 76, hasOpenDates: false });
  });

  it("leaves February 29 unmatched in a non-leap year and rejects malformed targets", () => {
    expect(matchingHotelDate("2028-02-29", 2027)).toBeNull();
    const february = seasonalRange({ view: "month", target: "2028-02", referenceYear: 2027 }, today)!;
    expect(february.through).toBe("2028-02-29");
    expect(calculateSeasonalOccupancy(february, today, 25, [], new Map()).days[28].referenceDate).toBeNull();
    expect(seasonalRange({ view: "date", target: "2027-02-29", referenceYear: 2026 }, today)).toBeNull();
    expect(seasonalRange({ view: "date", target: "2027-01-21", referenceYear: 2027 }, today)).toBeNull();
    expect(seasonalRange({ view: "month", target: "2029-01", referenceYear: 2028 }, today)).toBeNull();
    expect(seasonalRange({ view: "date", target: seasonalTargetLimit(today), referenceYear: 2027 }, today)).not.toBeNull();
  });
});
