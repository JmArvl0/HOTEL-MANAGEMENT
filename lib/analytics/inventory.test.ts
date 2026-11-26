import { describe, expect, it } from "vitest";
import { actualConsumption, forecastInventory } from "@/lib/analytics/inventory";
import { shiftDate, type InventoryItemLike, type InventoryMovementLike } from "@/lib/analytics/types";

const TODAY = "2026-09-08";

const item = (over: Partial<InventoryItemLike> = {}): InventoryItemLike => ({
  id: "i1", name: "Bath towels", category: "linen", quantity: 40, reorder_point: 60, unit: "pcs", ...over
});

const movement = (day: string, quantity: number, direction = "consumption", itemId = "i1"): InventoryMovementLike => ({
  id: Math.random().toString(36).slice(2), item_id: itemId, quantity, direction, created_at: `${day}T09:00:00Z`
});

/** Eight distinct consumption days inside the 30-day window (>= the 7-day minimum). */
const historyDays = Array.from({ length: 8 }, (_, i) => shiftDate(TODAY, -1 - i));

describe("forecastInventory", () => {
  it("flags items without movement history instead of guessing a forecast", () => {
    const forecast = forecastInventory({ items: [item()], movements: [], today: TODAY });
    const row = forecast.items[0];
    expect(row.predictedConsumption).toBeNull();
    expect(row.projectedShortage).toBeNull();
    expect(row.recommendedReorder).toBeNull();
    expect(row.dataQuality).toBe("limited");
    expect(row.movementDays).toBe(0);
    // Without history only the current-stock fact is reported — 40 under a reorder point of 60 is still noted.
    expect(row.risk).toBe("high");
    expect(row.riskBasis).toBe("current-low-stock");
    expect(forecast.notes.some((note) => note.includes("fewer than 7 days"))).toBe(true);
  });

  it("predicts a shortage when forecast consumption exceeds stock — not merely when stock is low", () => {
    // 30 pcs on each recorded day. Missing days do not count as zero.
    const movements = historyDays.map((day) => movement(day, 30));
    const forecast = forecastInventory({ items: [item({ quantity: 20 })], movements, today: TODAY });
    const row = forecast.items[0];
    expect(row.movementDays).toBe(8);
    expect(row.predictedConsumption).toBe(90);
    expect(row.projectedShortage).toBe(70);
    expect(row.recommendedReorder).toBe(130);
    expect(row.risk).toBe("high");
    expect(row.riskBasis).toBe("predicted-shortage");
    expect(forecast.shortageCount).toBe(1);
  });

  it("rates medium when stock survives the forecast but dips to the reorder point", () => {
    // Predicted 90 use from stock 130 → 40 left, below the 60 reorder point.
    const movements = historyDays.map((day) => movement(day, 30));
    const forecast = forecastInventory({ items: [item({ quantity: 130 })], movements, today: TODAY });
    const row = forecast.items[0];
    expect(row.projectedShortage).toBe(0);
    expect(row.risk).toBe("medium");
    expect(row.riskBasis).toBe("predicted-below-reorder");
    expect(forecast.shortageCount).toBe(0);
  });

  it("flags shortages for stock measured in fractional units", () => {
    const [row] = forecastInventory({
      items: [item({ quantity: "0.20", reorder_point: "0.10", unit: "L" })],
      movements: historyDays.map(day => movement(day, 0.12)),
      today: TODAY
    }).items;
    expect(row).toMatchObject({
      dailyExpected: 0.12,
      predictedConsumption: 0.36,
      projectedShortage: 0.16,
      recommendedReorder: 0.26,
      riskBasis: "predicted-shortage"
    });
  });

  it("does not use days before the item existed or treat logging gaps as zero", () => {
    const movements = historyDays.slice(0, 7).map(day => movement(day, 10));
    const [row] = forecastInventory({ items: [item({ quantity: 15, reorder_point: 5,
      created_at: `${shiftDate(TODAY, -9)}T10:00:00Z` })], movements, today: TODAY }).items;
    expect(row).toMatchObject({ eligibleDays: 8, movementDays: 7, predictedConsumption: 30, projectedShortage: 15 });
    expect(row.usageHistory?.find(day => day.date === shiftDate(TODAY, -8))?.quantity).toBeNull();
  });

  it("keeps a genuinely healthy stocked item at low risk", () => {
    const movements = historyDays.map((day) => movement(day, 2)); // 2 per recorded day
    const forecast = forecastInventory({ items: [item({ quantity: 500, reorder_point: 100 })], movements, today: TODAY });
    const row = forecast.items[0];
    expect(row.risk).toBe("low");
    expect(row.riskBasis).toBe("none");
  });

  it("uses only consumption movements in the trailing window — restocks and stale rows are excluded", () => {
    const movements = [
      ...historyDays.map((day) => movement(day, 30)),
      movement(TODAY, 500, "restock"), // direction restock — ignored by the consumption mean
      movement(shiftDate(TODAY, -45), 30) // outside the 30-day window — ignored
    ];
    const forecast = forecastInventory({ items: [item({ quantity: 20 })], movements, today: TODAY });
    expect(forecast.items[0].predictedConsumption).toBe(90); // 30 per recorded day × 3
  });
});

describe("actualConsumption — evaluation basis", () => {
  it("sums consumption quantities for the item inside the inclusive window", () => {
    const movements = [
      movement("2026-09-01", 4, "consumption", "i1"),
      movement("2026-09-03", 6, "consumption", "i1"),
      movement("2026-09-02", 50, "restock", "i1"),
      movement("2026-09-02", 9, "consumption", "i2")
    ];
    expect(actualConsumption(movements, "i1", "2026-09-01", "2026-09-03")).toBe(10);
  });
});
