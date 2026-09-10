import { describe, expect, it } from "vitest";
import { actualOccupancy, countNights, forecastOccupancy, pickupEstimate } from "@/lib/analytics/occupancy";
import { shiftDate, type ReservationLike, type RoomLike } from "@/lib/analytics/types";

const TODAY = "2026-09-08";
const ROOMS: RoomLike[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, number: `${100 + i}`, status: "available" }));

const reservation = (over: Partial<ReservationLike>): ReservationLike => ({
  id: Math.random().toString(36).slice(2),
  status: "confirmed",
  check_in: TODAY,
  check_out: shiftDate(TODAY, 1),
  created_at: `${TODAY}T00:00:00Z`,
  ...over
});

describe("countNights — the FACT basis", () => {
  it("counts confirmed and checked_in stays covering the night", () => {
    const rows = [
      reservation({ check_in: "2026-09-07", check_out: "2026-09-09" }),
      reservation({ status: "checked_in", check_in: "2026-09-08", check_out: "2026-09-10" })
    ];
    expect(countNights(rows, "2026-09-08", false)).toBe(2);
  });

  it("never counts cancelled or no_show reservations", () => {
    const rows = [
      reservation({ status: "cancelled", check_in: "2026-09-08", check_out: "2026-09-09" }),
      reservation({ status: "no_show", check_in: "2026-09-08", check_out: "2026-09-09" })
    ];
    expect(countNights(rows, "2026-09-08", false)).toBe(0);
  });

  it("treats the night boundaries as half-open [check_in, check_out)", () => {
    const rows = [reservation({ check_in: "2026-09-08", check_out: "2026-09-09" })];
    expect(countNights(rows, "2026-09-08", false)).toBe(1); // arrival night is covered
    expect(countNights(rows, "2026-09-09", false)).toBe(0); // departure night is not
  });

  it("counts checked_out stays only when evaluating a past night", () => {
    const rows = [reservation({ status: "checked_out", check_in: "2026-09-01", check_out: "2026-09-03" })];
    expect(countNights(rows, "2026-09-02", false)).toBe(0); // future evaluation ignores departed stays
    expect(countNights(rows, "2026-09-02", true)).toBe(1); // historical actual includes them
  });
});

describe("forecastOccupancy", () => {
  it("reports fact-only with honest limited quality when no booking history exists", () => {
    const forecast = forecastOccupancy({ reservations: [], rooms: ROOMS, today: TODAY });
    expect(forecast.days).toHaveLength(7);
    for (const day of forecast.days) {
      expect(day.knownOccupied).toBe(0);
      expect(day.knownOccupancyPct).toBe(0);
      expect(day.predictedOccupancyPct).toBeUndefined(); // never a fabricated prediction
      expect(day.dataQuality).toBe("limited");
    }
    expect(forecast.notes.some((note) => note.includes("at least 5 days of booking history"))).toBe(true);
  });

  it("publishes a prediction only when enough pickup observations exist", () => {
    // Two past nights with genuine late pickup: booked the day of arrival, not a week out
    // (late materialization is visible at lead >= 1, day-granularity booking dates).
    const late = [
      reservation({ check_in: shiftDate(TODAY, -2), check_out: shiftDate(TODAY, -1), created_at: `${shiftDate(TODAY, -2)}T20:00:00Z` }),
      reservation({ check_in: shiftDate(TODAY, -3), check_out: shiftDate(TODAY, -2), created_at: `${shiftDate(TODAY, -3)}T20:00:00Z` })
    ];
    const few = pickupEstimate(late, TODAY, 1);
    expect(few.observations).toBe(2);
    expect(few.pickup).toBeGreaterThan(0);

    const sparse = forecastOccupancy({ reservations: late, rooms: ROOMS, today: TODAY });
    expect(sparse.days.every((day) => day.predictedOccupancyPct === undefined)).toBe(true);

    // Same nights plus a longer stretch of real history → the lead-1 day publishes a prediction.
    const many = [
      ...late,
      ...Array.from({ length: 8 }, (_, i) =>
        reservation({
          check_in: shiftDate(TODAY, -4 - i),
          check_out: shiftDate(TODAY, -3 - i),
          created_at: `${shiftDate(TODAY, -4 - i)}T20:00:00Z`
        }))
    ];
    expect(pickupEstimate(many, TODAY, 1).observations).toBeGreaterThanOrEqual(5);
    const rich = forecastOccupancy({ reservations: many, rooms: ROOMS, today: TODAY });
    const tomorrow = rich.days[1];
    expect(tomorrow.predictedOccupancyPct).toBeDefined();
    expect(tomorrow.pickupRooms).toBeGreaterThan(0);
    expect(tomorrow.basisObservations).toBeGreaterThanOrEqual(5);
  });

  it("computes known occupancy from active rooms and current bookings", () => {
    const rooms = [...ROOMS, { id: "rx", number: "999", status: "available", administratively_active: false }];
    const rows = [
      reservation({ check_in: TODAY, check_out: shiftDate(TODAY, 1) }),
      reservation({ check_in: TODAY, check_out: shiftDate(TODAY, 2) }),
      reservation({ status: "cancelled", check_in: TODAY, check_out: shiftDate(TODAY, 1) })
    ];
    const forecast = forecastOccupancy({ reservations: rows, rooms, today: TODAY });
    expect(forecast.days[0].totalRooms).toBe(10); // retired room never counts
    expect(forecast.days[0].knownOccupied).toBe(2);
    expect(forecast.days[0].knownOccupancyPct).toBe(20);
    expect(forecast.days[0].riskLevel).toBe("low");
  });

  it("caps the predicted total at the room count and rates risk from the prediction", () => {
    const history = Array.from({ length: 8 }, (_, i) =>
      reservation({
        status: "checked_out",
        check_in: shiftDate(TODAY, -2 - i),
        check_out: shiftDate(TODAY, -1 - i),
        created_at: `${shiftDate(TODAY, -2 - i)}T23:00:00Z`
      }));
    // Nine rooms already booked through tomorrow, one late-booking pattern → predicted full.
    const current = Array.from({ length: 9 }, (_, i) =>
      reservation({ id: `cur${i}`, check_in: TODAY, check_out: shiftDate(TODAY, 2) }));
    const forecast = forecastOccupancy({ reservations: [...history, ...current], rooms: ROOMS, today: TODAY });
    const tomorrow = forecast.days[1];
    expect(tomorrow.knownOccupied).toBe(9);
    expect(tomorrow.predictedOccupied).toBe(10);
    expect(tomorrow.predictedOccupied).toBeLessThanOrEqual(10);
    expect(tomorrow.riskLevel).toBe("high"); // predicted full house
  });
});

describe("actualOccupancy — evaluation basis", () => {
  it("derives the realized percentage for a past night", () => {
    const rows = [
      reservation({ status: "checked_out", check_in: "2026-09-01", check_out: "2026-09-04" }),
      reservation({ status: "no_show", check_in: "2026-09-01", check_out: "2026-09-02" })
    ];
    expect(actualOccupancy(rows, "2026-09-02", 10)).toBe(10);
  });
});
