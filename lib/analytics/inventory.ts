import { analyticsDay, hotelMidnight, shiftDate, toNumber, type DataQuality, type InventoryItemLike, type InventoryMovementLike, type RiskLevel } from "./types";

/**
 * INVENTORY DEMAND / SHORTAGE FORECAST — genuinely predictive, deliberately
 * distinct from the existing low-stock alert (quantity < reorder point):
 * a shortage is predicted when forecast 3-day consumption will exceed stock.
 *
 * Consumption forecasts come ONLY from recorded inventory_movements. HAVEN's
 * original schema stored current quantities only, so items without movement
 * history honestly report "insufficient history" instead of a fabricated
 * number — the movement log added in the innovation migration is the fix.
 */

export const INVENTORY_MODEL_VERSION = "inventory-v4";
export const FORECAST_DAYS = 3;
const MOVEMENT_WINDOW_DAYS = 30;
const MIN_MOVEMENT_DAYS = 7;
const QUANTITY_SCALE = 100;

export interface InventoryRisk {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderPoint: number;
  predictedConsumption: number | null;
  projectedShortage: number | null;
  recommendedReorder: number | null;
  risk: RiskLevel;
  riskBasis: "predicted-shortage" | "predicted-below-reorder" | "current-low-stock" | "none";
  dataQuality: DataQuality;
  movementDays: number;
  eligibleDays: number;
  belowReorderPoint: boolean;
  /** Recorded daily consumption and the daily mean underlying the three-day forecast. */
  usageHistory?: { date: string; quantity: number | null }[];
  dailyExpected?: number;
}

export interface InventoryForecast {
  today: string;
  items: InventoryRisk[];
  attentionCount: number;
  shortageCount: number;
  method: string;
  notes: string[];
}

export interface InventoryInput {
  items: InventoryItemLike[];
  movements: InventoryMovementLike[];
  today: string;
}

export function forecastInventory(input: InventoryInput): InventoryForecast {
  const windowStart = shiftDate(input.today, -MOVEMENT_WINDOW_DAYS);
  const notes: string[] = [];
  const consumptionByItem = dailyRecordedConsumption(input.movements, windowStart, shiftDate(input.today, -1));
  const items: InventoryRisk[] = input.items.map((item) => {
    const currentStock = toNumber(item.quantity);
    const reorderPoint = toNumber(item.reorder_point);
    const createdDay = item.created_at ? analyticsDay(item.created_at) : "";
    const firstClosedDay = createdDay && Date.parse(item.created_at!) > Date.parse(hotelMidnight(createdDay))
      ? shiftDate(createdDay, 1) : createdDay || windowStart;
    const eligibleDays = Array.from({ length: MOVEMENT_WINDOW_DAYS }, (_, index) => shiftDate(windowStart, index))
      .filter(date => date >= firstClosedDay);
    const recorded = consumptionByItem.get(item.id);
    const quantities = eligibleDays.flatMap(date => recorded?.has(date) ? [recorded.get(date)!] : []);
    const movementDays = quantities.length;
    const belowReorderPoint = currentStock <= reorderPoint;
    const usageHistory = Array.from({ length: 14 }, (_, index) => {
      const date = shiftDate(input.today, index - 14);
      return { date, quantity: date >= firstClosedDay ? recorded?.get(date) ?? null : null };
    });

    // Not enough consumption history: report the current-stock facts only.
    if (movementDays < MIN_MOVEMENT_DAYS) {
      const low = currentStock <= reorderPoint;
      return {
        itemId: item.id, name: item.name, category: item.category, unit: item.unit,
        currentStock, reorderPoint,
        predictedConsumption: null, projectedShortage: null, recommendedReorder: null,
        risk: low ? "high" : "low",
        riskBasis: low ? "current-low-stock" : "none",
        dataQuality: "limited",
        movementDays, eligibleDays: eligibleDays.length, belowReorderPoint, usageHistory
      };
    }

    // Inventory movements and stock quantities are recorded to two decimal places.
    const dailyHundredths = quantities.reduce((sum, quantity) => sum + Math.round(quantity * QUANTITY_SCALE), 0) / movementDays;
    const forecastHundredths = Math.round(dailyHundredths * FORECAST_DAYS);
    const stockAfterForecast = Math.round(currentStock * QUANTITY_SCALE) - forecastHundredths;
    const reorderHundredths = Math.round(reorderPoint * QUANTITY_SCALE);
    const predictedConsumption = forecastHundredths / QUANTITY_SCALE;
    const projectedShortage = Math.max(0, -stockAfterForecast) / QUANTITY_SCALE;
    const projectedBelowReorder = stockAfterForecast <= reorderHundredths;
    const risk: RiskLevel = projectedShortage > 0 ? "high" : projectedBelowReorder ? "medium" : "low";
    return {
      itemId: item.id, name: item.name, category: item.category, unit: item.unit,
      currentStock, reorderPoint,
      predictedConsumption,
      projectedShortage,
      recommendedReorder: Math.max(0, reorderHundredths - stockAfterForecast) / QUANTITY_SCALE,
      risk,
      riskBasis: projectedShortage > 0 ? "predicted-shortage" : belowReorderPoint ? "current-low-stock" : projectedBelowReorder ? "predicted-below-reorder" : "none",
      dataQuality: movementDays >= 14 && movementDays >= eligibleDays.length * 0.8 ? "medium" : "limited",
      movementDays, eligibleDays: eligibleDays.length, belowReorderPoint, usageHistory, dailyExpected: Math.round(dailyHundredths) / QUANTITY_SCALE
    };
  });

  const withoutHistory = items.filter((item) => item.predictedConsumption === null).length;
  if (withoutHistory > 0) {
    notes.push(`${withoutHistory} of ${items.length} items have fewer than ${MIN_MOVEMENT_DAYS} days of recorded consumption — for those, only current stock levels are reported. Consumption logging (inventory movements) is what makes the shortage forecast possible.`);
  }

  return {
    today: input.today,
    items,
    attentionCount: items.filter(item => item.riskBasis !== "none").length,
    shortageCount: items.filter((item) => item.projectedShortage !== null && item.projectedShortage > 0).length,
    method: `Mean recorded daily use within the last ${MOVEMENT_WINDOW_DAYS} closed hotel days × ${FORECAST_DAYS} days. Gaps are excluded.`,
    notes
  };
}

/** A missing movement does not establish that an item had no usage. */
export function dailyRecordedConsumption(movements: InventoryMovementLike[], from: string, through: string) {
  const items = new Map<string, Map<string, number>>();
  for (const movement of movements) {
    if (movement.direction !== "consumption") continue;
    const date = analyticsDay(movement.created_at);
    const quantity = Number(movement.quantity);
    if (date < from || date > through || !Number.isFinite(quantity) || quantity < 0) continue;
    let item = items.get(movement.item_id);
    if (!item) {
      item = new Map();
      items.set(movement.item_id, item);
    }
    item.set(date, (item.get(date) ?? 0) + quantity);
  }
  return items;
}

/** Actual consumption for an item over a window — used by prediction-vs-actual evaluation. */
export function actualConsumption(movements: InventoryMovementLike[], itemId: string, from: string, to: string): number {
  return movements
    .filter((movement) => movement.item_id === itemId && movement.direction === "consumption" && analyticsDay(movement.created_at) >= from && analyticsDay(movement.created_at) <= to)
    .reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
}
