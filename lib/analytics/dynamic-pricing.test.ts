import { describe, expect, it } from "vitest";
import { calculateDynamicRateRecommendations } from "./dynamic-pricing";
import type { OccupancyForecast } from "./occupancy";

const forecast = (date: string, occupancy: number): OccupancyForecast => ({
  today: date,
  method: "test forecast",
  notes: [],
  days: [{
    date,
    totalRooms: 10,
    knownOccupied: Math.round(occupancy / 10),
    knownOccupancyPct: occupancy,
    predictedOccupied: Math.round(occupancy / 10),
    predictedOccupancyPct: occupancy,
    pickupRooms: 0,
    riskLevel: occupancy >= 85 ? "high" : occupancy >= 60 ? "medium" : "low",
    dataQuality: "medium",
    basisObservations: 12,
  }],
});

const room = { id: "garden", name: "Garden Twin", baseRate: 10_000 };

describe("calculateDynamicRateRecommendations", () => {
  it.each([
    ["high", 90, 12_300, 23, "high"],
    ["moderate", 65, 10_000, 0, "moderate"],
    ["low", 0, 8_000, -20, "low"],
  ] as const)("calculates the %s demand rule with centavo-exact rates", (_label, occupancy, expectedRate, expectedChange, tier) => {
    const [result] = calculateDynamicRateRecommendations({
      forecast: forecast("2026-09-14", occupancy),
      reservations: [],
      roomTypes: [room],
      now: "2026-09-13T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      roomTypeId: "garden",
      targetDate: "2026-09-14",
      baseRate: 10_000,
      projectedOccupancy: occupancy,
      recommendedRate: expectedRate,
      percentageChange: expectedChange,
      demandTier: tier,
    });
  });

  it("incorporates net 48-hour booking pace and day-of-week demand transparently", () => {
    const [result] = calculateDynamicRateRecommendations({
      forecast: forecast("2026-09-18", 90), // Friday
      roomTypes: [room],
      now: "2026-09-17T12:00:00.000Z",
      reservations: [
        { id: "new-1", room_type: room.name, status: "confirmed", check_in: "2026-09-18", check_out: "2026-09-19", created_at: "2026-09-17T08:00:00.000Z" },
        { id: "new-2", room_type: room.name, status: "confirmed", check_in: "2026-09-18", check_out: "2026-09-19", created_at: "2026-09-16T13:00:00.000Z" },
        { id: "cancelled", room_type: room.name, status: "cancelled", check_in: "2026-09-18", check_out: "2026-09-19", created_at: "2026-09-17T09:00:00.000Z" },
      ],
    });

    expect(result.bookingPace).toBe(1);
    expect(result.percentageChange).toBe(27);
    expect(result.reasoning).toContain("90% projected Friday occupancy");
    expect(result.reasoning).toContain("net +1 booking in the last 48 hours");
  });

  it("enforces room-type floor and ceiling bounds after demand calculation", () => {
    const [low] = calculateDynamicRateRecommendations({
      forecast: forecast("2026-09-14", 0), reservations: [], now: "2026-09-13T00:00:00.000Z",
      roomTypes: [{ ...room, floorRate: 9_000, ceilingRate: 15_000 }],
    });
    const [high] = calculateDynamicRateRecommendations({
      forecast: forecast("2026-09-14", 100), reservations: [], now: "2026-09-13T00:00:00.000Z",
      roomTypes: [{ ...room, floorRate: 5_000, ceilingRate: 11_000 }],
    });

    expect(low.recommendedRate).toBe(9_000);
    expect(low.percentageChange).toBe(-10);
    expect(low.boundApplied).toBe("floor");
    expect(high.recommendedRate).toBe(11_000);
    expect(high.percentageChange).toBe(10);
    expect(high.boundApplied).toBe("ceiling");
  });

  it("falls back to a fact occupancy value when prediction history is insufficient", () => {
    const limited = forecast("2026-09-14", 20);
    limited.days[0].predictedOccupancyPct = undefined;
    limited.days[0].dataQuality = "limited";
    const [result] = calculateDynamicRateRecommendations({ forecast: limited, reservations: [], roomTypes: [room], now: "2026-09-13T00:00:00.000Z" });
    expect(result.projectedOccupancy).toBe(20);
    expect(result.occupancyBasis).toBe("fact");
    expect(result.confidence).toBe("limited");
  });
});
