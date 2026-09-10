import { shiftDate, toNumber, type DataQuality, type InventoryItemLike, type InventoryMovementLike, type RiskLevel } from "./types";

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

export const INVENTORY_MODEL_VERSION = "inventory-v1";
export const FORECAST_DAYS = 3;
const MOVEMENT_WINDOW_DAYS = 30;
const MIN_MOVEMENT_DAYS = 7;

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
}

export interface InventoryForecast {
  today: string;
  items: InventoryRisk[];
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
  const items: InventoryRisk[] = input.items.map((item) => {
    const currentStock = toNumber(item.quantity);
    const reorderPoint = toNumber(item.reorder_point);
    const consumptions = input.movements.filter((movement) =>
      movement.item_id === item.id
      && movement.direction === "consumption"
      && movement.created_at.slice(0, 10) >= windowStart
    );
    const movementDays = new Set(consumptions.map((movement) => movement.created_at.slice(0, 10))).size;

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
        movementDays
      };
    }

    const dailyMean = consumptions.reduce((sum, movement) => sum + toNumber(movement.quantity), 0) / MOVEMENT_WINDOW_DAYS;
    const predictedConsumption = Math.round(dailyMean * FORECAST_DAYS);
    const projectedShortage = Math.max(0, predictedConsumption - currentStock);
    const stockAfterForecast = currentStock - predictedConsumption;
    const risk: RiskLevel = projectedShortage > 0 ? "high" : stockAfterForecast <= reorderPoint ? "medium" : "low";
    return {
      itemId: item.id, name: item.name, category: item.category, unit: item.unit,
      currentStock, reorderPoint,
      predictedConsumption,
      projectedShortage,
      recommendedReorder: Math.max(0, predictedConsumption + reorderPoint - currentStock),
      risk,
      riskBasis: projectedShortage > 0 ? "predicted-shortage" : stockAfterForecast <= reorderPoint ? "predicted-below-reorder" : "none",
      dataQuality: movementDays >= MOVEMENT_WINDOW_DAYS ? "medium" : "limited",
      movementDays
    };
  });

  const withoutHistory = items.filter((item) => item.predictedConsumption === null).length;
  if (withoutHistory > 0) {
    notes.push(`${withoutHistory} of ${items.length} items have fewer than ${MIN_MOVEMENT_DAYS} days of recorded consumption — for those, only current stock levels are reported. Consumption logging (inventory movements) is what makes the shortage forecast possible.`);
  }

  return {
    today: input.today,
    items,
    shortageCount: items.filter((item) => item.projectedShortage !== null && item.projectedShortage > 0).length,
    method: `Mean daily consumption from inventory movements (trailing ${MOVEMENT_WINDOW_DAYS} days) × ${FORECAST_DAYS}-day horizon`,
    notes
  };
}

/** Actual consumption for an item over a window — used by prediction-vs-actual evaluation. */
export function actualConsumption(movements: InventoryMovementLike[], itemId: string, from: string, to: string): number {
  return movements
    .filter((movement) => movement.item_id === itemId && movement.direction === "consumption" && movement.created_at.slice(0, 10) >= from && movement.created_at.slice(0, 10) <= to)
    .reduce((sum, movement) => sum + toNumber(movement.quantity), 0);
}
