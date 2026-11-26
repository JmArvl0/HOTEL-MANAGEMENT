import { supabase } from "@/lib/supabase";
import { getAnalyticsInputs, type AnalyticsInputs } from "./data";
import { forecastHousekeeping, HOUSEKEEPING_MODEL_VERSION, type HousekeepingForecast } from "./housekeeping";
import { FORECAST_DAYS, forecastInventory, INVENTORY_MODEL_VERSION, type InventoryForecast } from "./inventory";
import { assessMaintenanceRisk, MAINTENANCE_MODEL_VERSION, type MaintenanceRiskReport } from "./maintenance";
import { DAILY_FORECAST_DAYS, forecastOccupancy, FORECAST_LEADS, OCCUPANCY_MODEL_VERSION, type OccupancyForecast } from "./occupancy";
import { BASELINE_VERSION, previousWeekBaseline } from "./evaluation";
import { captureEvaluation } from "./evaluation-data";
import { shiftDate } from "./types";

/**
 * Analytics runner: computes all four forecasts, persists model runs and
 * prediction snapshots and their evaluation evidence (Supabase mode).
 * This is the ONLY predictor in the system — Gemini never
 * sees a forecasting task.
 */

export const GENERATION_COOLDOWN_MS = 60 * 60 * 1000; // manual refresh + cron both respect 1h between runs

export interface InsightsResult {
  generatedAt: string;
  persisted: boolean;
  occupancy: OccupancyForecast;
  housekeeping: HousekeepingForecast;
  inventory: InventoryForecast;
  maintenance: MaintenanceRiskReport;
}

export async function generateInsights(inputs?: AnalyticsInputs): Promise<InsightsResult> {
  const input = inputs ?? await getAnalyticsInputs();
  const [occupancy, housekeeping, inventory, maintenance] = [
    forecastOccupancy({ reservations: input.reservations, rooms: input.rooms, today: input.today, pickupHistory: input.pickupHistory }),
    forecastHousekeeping({ reservations: input.reservations, tasks: input.tasks, today: input.today, inspectionRequired: input.inspectionRequired }),
    forecastInventory({ items: input.inventoryItems, movements: input.movements, today: input.today }),
    assessMaintenanceRisk({ orders: input.orders, assets: input.assets, today: input.today })
  ];
  return { generatedAt: new Date().toISOString(), persisted: false, occupancy, housekeeping, inventory, maintenance };
}

type PredictionInsert = {
  model_run_id: string;
  prediction_type: string;
  target_date: string;
  target_resource_type: string;
  target_resource_id: string | null;
  predicted_value: number;
  risk_level: string;
  data_quality: string;
  metadata: Record<string, unknown>;
};

export async function generateAndPersistInsights(inputs?: AnalyticsInputs): Promise<InsightsResult> {
  const input = inputs ?? await getAnalyticsInputs();
  const result = await generateInsights(input);
  if (!supabase) return result; // demo mode: compute-only
  const { closed, days } = await captureEvaluation(input);
  const scoreDates = new Set(FORECAST_LEADS.map(lead => shiftDate(input.today, lead)));
  closed.occupancy.bookedByDate = Object.fromEntries(result.occupancy.days.map(day => [day.date, day.knownOccupied]));
  const occupancyBaseline = previousWeekBaseline(days.occupancy, closed.occupancy);
  const laborBaseline = previousWeekBaseline(days.housekeeping, closed.housekeeping);
  const models: { modelType: string; modelVersion: string; parameters: Record<string, unknown>; predictions: Omit<PredictionInsert, "model_run_id">[] }[] = [];

  // Occupancy snapshot — one prediction row per horizon day.
  {
    const rows: Omit<PredictionInsert, "model_run_id">[] = result.occupancy.days.map((day) => ({
      prediction_type: "occupancy",
      target_date: day.date,
      target_resource_type: "hotel",
      target_resource_id: null,
      predicted_value: day.predictedOccupancyPct ?? day.knownOccupancyPct,
      risk_level: day.riskLevel,
      data_quality: day.dataQuality,
      metadata: {
        knownOnly: day.predictedOccupancyPct === undefined, knownOccupied: day.knownOccupied,
        totalRooms: day.totalRooms, pickupRooms: day.pickupRooms ?? null, basisObservations: day.basisObservations,
        ...(scoreDates.has(day.date) && { evaluation: { baseline: occupancyBaseline, historicalObservations: day.basisObservations } })
      }
    }));
    models.push({ modelType: "occupancy", modelVersion: OCCUPANCY_MODEL_VERSION, parameters: { horizon: DAILY_FORECAST_DAYS - 1, evaluation: closed.occupancy, baselineVersion: BASELINE_VERSION }, predictions: rows });
  }

  // Housekeeping snapshot — one row per horizon day.
  {
    const rows: Omit<PredictionInsert, "model_run_id">[] = result.housekeeping.days.map((day) => ({
      prediction_type: "housekeeping",
      target_date: day.date,
      target_resource_type: "hotel",
      target_resource_id: null,
      predicted_value: day.totalTasks,
      risk_level: day.workload,
      data_quality: day.dataQuality,
      metadata: {
        checkoutCleans: day.checkoutCleans, stayoverServices: day.stayoverServices, guestRequestTasks: day.guestRequestTasks, inspections: day.inspections,
        estimatedLaborHours: day.estimatedLaborHours ?? null, meanTaskMinutes: day.meanTaskMinutes ?? null,
        ...(scoreDates.has(day.date) && { evaluation: { baseline: laborBaseline, historicalObservations: day.durationObservations } })
      }
    }));
    models.push({ modelType: "housekeeping", modelVersion: HOUSEKEEPING_MODEL_VERSION, parameters: { horizon: DAILY_FORECAST_DAYS - 1, inspectionRequired: input.inspectionRequired, evaluation: closed.housekeeping, baselineVersion: BASELINE_VERSION }, predictions: rows });
  }

  // Inventory snapshot — one row per item, target = today + 3 days.
  {
    const rows: Omit<PredictionInsert, "model_run_id">[] = result.inventory.items.map((item) => ({
      prediction_type: "inventory_shortage",
      target_date: shiftDate(input.today, FORECAST_DAYS),
      target_resource_type: "inventory_item",
      target_resource_id: item.itemId,
      predicted_value: item.predictedConsumption ?? 0,
      risk_level: item.risk,
      data_quality: item.dataQuality,
      metadata: {
        name: item.name, unit: item.unit, available: item.predictedConsumption !== null, currentStock: item.currentStock,
        reorderPoint: item.reorderPoint, projectedShortage: item.projectedShortage, recommendedReorder: item.recommendedReorder,
        riskBasis: item.riskBasis, movementDays: item.movementDays,
        evaluation: { baseline: previousWeekBaseline(days.inventory, closed.inventory, item.itemId, item.unit), historicalObservations: item.movementDays }
      }
    }));
    models.push({ modelType: "inventory", modelVersion: INVENTORY_MODEL_VERSION, parameters: { horizonDays: FORECAST_DAYS, evaluation: closed.inventory, baselineVersion: BASELINE_VERSION }, predictions: rows });
  }

  // Maintenance snapshot — one row per recurring-issue group.
  {
    const rows: Omit<PredictionInsert, "model_run_id">[] = result.maintenance.risks.map((risk) => ({
      prediction_type: "maintenance_risk",
      target_date: input.today,
      target_resource_type: "room",
      target_resource_id: risk.roomId,
      predicted_value: risk.incidents90Days,
      risk_level: risk.risk,
      data_quality: risk.dataQuality,
      metadata: { roomNumber: risk.roomNumber, category: risk.category, assetId: risk.assetId ?? null, assetName: risk.assetName ?? null, trend: risk.trend, openIncidents: risk.openIncidents, daysSinceLast: risk.daysSinceLast, reason: risk.reason, suggestedAction: risk.suggestedAction }
    }));
    models.push({ modelType: "maintenance_risk", modelVersion: MAINTENANCE_MODEL_VERSION, parameters: {}, predictions: rows });
  }

  const { data, error } = await supabase.rpc("persist_analytics_generation", { p_models: models });
  if (error) throw new Error(error.message.includes("ANALYTICS_COOLDOWN") ? "ANALYTICS_COOLDOWN" : "ANALYTICS_PERSIST_FAILED");
  if (!data || (data as { error?: string }).error) throw new Error("ANALYTICS_PERSIST_FAILED");
  return { ...result, persisted: true };
}

/** True when the last run for ANY model is inside the cooldown window. */
export async function generationCoolingDown(): Promise<boolean> {
  if (!supabase) {
    return demoGenerationCooldown !== null && Date.now() - demoGenerationCooldown < GENERATION_COOLDOWN_MS;
  }
  const { data, error } = await supabase.from("analytics_model_runs").select("generated_at").eq("status", "completed").order("generated_at", { ascending: false }).limit(1);
  if (error) throw error;
  const last = data?.[0]?.generated_at;
  return Boolean(last) && Date.now() - new Date(last).getTime() < GENERATION_COOLDOWN_MS;
}

// ponytail: demo-mode cooldown is per-process; fine for the zero-config demo.
let demoGenerationCooldown: number | null = null;
export const markDemoGeneration = () => { demoGenerationCooldown = Date.now(); };
