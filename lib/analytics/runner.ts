import { supabase } from "@/lib/supabase";
import { getAnalyticsInputs, type AnalyticsInputs } from "./data";
import { forecastHousekeeping, HOUSEKEEPING_MODEL_VERSION, type HousekeepingForecast } from "./housekeeping";
import { actualConsumption, forecastInventory, INVENTORY_MODEL_VERSION, type InventoryForecast } from "./inventory";
import { assessMaintenanceRisk, MAINTENANCE_MODEL_VERSION, type MaintenanceRiskReport } from "./maintenance";
import { actualOccupancy, forecastOccupancy, OCCUPANCY_MODEL_VERSION, type OccupancyForecast } from "./occupancy";
import { shiftDate } from "./types";

/**
 * Analytics runner: computes all four forecasts, persists model runs and
 * prediction snapshots (Supabase mode), and evaluates past predictions
 * against actuals. This is the ONLY predictor in the system — Gemini never
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
    forecastOccupancy({ reservations: input.reservations, rooms: input.rooms, today: input.today }),
    forecastHousekeeping({ reservations: input.reservations, tasks: input.tasks, today: input.today, inspectionRequired: input.inspectionRequired }),
    forecastInventory({ items: input.inventoryItems, movements: input.movements, today: input.today }),
    assessMaintenanceRisk({ orders: input.orders, today: input.today })
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

async function insertModelRun(modelType: string, modelVersion: string, parameters: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("analytics_model_runs").insert({
    model_type: modelType,
    model_version: modelVersion,
    status: "completed",
    parameters
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function generateAndPersistInsights(inputs?: AnalyticsInputs): Promise<InsightsResult> {
  const input = inputs ?? await getAnalyticsInputs();
  const result = await generateInsights(input);
  if (!supabase) return result; // demo mode: compute-only

  // Occupancy snapshot — one prediction row per horizon day.
  const occupancyRunId = await insertModelRun("occupancy", OCCUPANCY_MODEL_VERSION, { horizon: 7 });
  if (occupancyRunId) {
    const rows: PredictionInsert[] = result.occupancy.days.map((day) => ({
      model_run_id: occupancyRunId,
      prediction_type: "occupancy",
      target_date: day.date,
      target_resource_type: "hotel",
      target_resource_id: null,
      predicted_value: day.predictedOccupancyPct ?? day.knownOccupancyPct,
      risk_level: day.riskLevel,
      data_quality: day.dataQuality,
      metadata: { knownOnly: day.predictedOccupancyPct === undefined, knownOccupied: day.knownOccupied, totalRooms: day.totalRooms, pickupRooms: day.pickupRooms ?? null, basisObservations: day.basisObservations }
    }));
    const { error } = await supabase.from("analytics_predictions").insert(rows);
    if (error) throw error;
  }

  // Housekeeping snapshot — one row per horizon day.
  const housekeepingRunId = await insertModelRun("housekeeping", HOUSEKEEPING_MODEL_VERSION, { horizon: 7, inspectionRequired: input.inspectionRequired });
  if (housekeepingRunId) {
    const rows: PredictionInsert[] = result.housekeeping.days.map((day) => ({
      model_run_id: housekeepingRunId,
      prediction_type: "housekeeping",
      target_date: day.date,
      target_resource_type: "hotel",
      target_resource_id: null,
      predicted_value: day.totalTasks,
      risk_level: day.workload,
      data_quality: day.dataQuality,
      metadata: { checkoutCleans: day.checkoutCleans, stayoverServices: day.stayoverServices, guestRequestTasks: day.guestRequestTasks, inspections: day.inspections, estimatedLaborHours: day.estimatedLaborHours ?? null, meanTaskMinutes: day.meanTaskMinutes ?? null }
    }));
    const { error } = await supabase.from("analytics_predictions").insert(rows);
    if (error) throw error;
  }

  // Inventory snapshot — one row per item, target = today + 3 days.
  const inventoryRunId = await insertModelRun("inventory", INVENTORY_MODEL_VERSION, { horizonDays: 3 });
  if (inventoryRunId) {
    const rows: PredictionInsert[] = result.inventory.items.map((item) => ({
      model_run_id: inventoryRunId,
      prediction_type: "inventory_shortage",
      target_date: shiftDate(input.today, 3),
      target_resource_type: "inventory_item",
      target_resource_id: item.itemId,
      predicted_value: item.predictedConsumption ?? 0,
      risk_level: item.risk,
      data_quality: item.dataQuality,
      metadata: { name: item.name, unit: item.unit, available: item.predictedConsumption !== null, currentStock: item.currentStock, reorderPoint: item.reorderPoint, projectedShortage: item.projectedShortage, recommendedReorder: item.recommendedReorder, riskBasis: item.riskBasis, movementDays: item.movementDays }
    }));
    const { error } = await supabase.from("analytics_predictions").insert(rows);
    if (error) throw error;
  }

  // Maintenance snapshot — one row per recurring-issue group.
  const maintenanceRunId = await insertModelRun("maintenance_risk", MAINTENANCE_MODEL_VERSION, {});
  if (maintenanceRunId) {
    const rows: PredictionInsert[] = result.maintenance.risks.map((risk) => ({
      model_run_id: maintenanceRunId,
      prediction_type: "maintenance_risk",
      target_date: input.today,
      target_resource_type: "room",
      target_resource_id: risk.roomId,
      predicted_value: risk.incidents90Days,
      risk_level: risk.risk,
      data_quality: risk.dataQuality,
      metadata: { roomNumber: risk.roomNumber, category: risk.category, trend: risk.trend, openIncidents: risk.openIncidents, daysSinceLast: risk.daysSinceLast, reason: risk.reason, suggestedAction: risk.suggestedAction }
    }));
    const { error } = await supabase.from("analytics_predictions").insert(rows);
    if (error) throw error;
  }

  return { ...result, persisted: true };
}

/** True when the last run for ANY model is inside the cooldown window. */
export async function generationCoolingDown(): Promise<boolean> {
  if (!supabase) {
    return demoGenerationCooldown !== null && Date.now() - demoGenerationCooldown < GENERATION_COOLDOWN_MS;
  }
  const { data } = await supabase.from("analytics_model_runs").select("generated_at").order("generated_at", { ascending: false }).limit(1);
  const last = data?.[0]?.generated_at;
  return Boolean(last) && Date.now() - new Date(last).getTime() < GENERATION_COOLDOWN_MS;
}

// ponytail: demo-mode cooldown is per-process; fine for the zero-config demo.
let demoGenerationCooldown: number | null = null;
export const markDemoGeneration = () => { demoGenerationCooldown = Date.now(); };

export interface PredictionMetrics {
  occupancy: { mae: number | null; mape: number | null; observations: number; skippedKnownOnly: number };
  housekeeping: { mae: number | null; observations: number };
  inventory: { mae: number | null; observations: number };
  methodNote: string;
}

/**
 * Prediction-vs-actual evaluation over elapsed target dates. Known-only
 * occupancy rows (no pickup basis yet) are excluded — they are facts, not
 * predictions, and grading them would inflate accuracy.
 */
export async function evaluatePredictions(): Promise<PredictionMetrics> {
  const inputs = await getAnalyticsInputs();
  const today = inputs.today;
  const metrics: PredictionMetrics = {
    occupancy: { mae: null, mape: null, observations: 0, skippedKnownOnly: 0 },
    housekeeping: { mae: null, observations: 0 },
    inventory: { mae: null, observations: 0 },
    methodNote: "Mean absolute error between stored predictions and actuals computed from live operational data. Occupancy rows without a pickup basis (known-only) are excluded."
  };
  if (!supabase) return metrics;

  const totalRooms = inputs.rooms.filter((room) => room.administratively_active !== false).length;

  const [occupancyResult, housekeepingResult, inventoryResult] = await Promise.all([
    supabase.from("analytics_predictions").select("target_date,predicted_value,metadata").eq("prediction_type", "occupancy").lt("target_date", today).order("generated_at", { ascending: false }).limit(200),
    supabase.from("analytics_predictions").select("target_date,predicted_value").eq("prediction_type", "housekeeping").lt("target_date", today).order("generated_at", { ascending: false }).limit(200),
    supabase.from("analytics_predictions").select("target_date,predicted_value,generated_at,target_resource_id,metadata").eq("prediction_type", "inventory_shortage").lt("target_date", today).order("generated_at", { ascending: false }).limit(400)
  ]);

  // Rows arrive newest-first; keep only the most recent prediction per key.
  const latestByKey = <T>(rows: T[], key: (row: T) => string): T[] => {
    const seen = new Set<string>();
    const kept: T[] = [];
    for (const row of rows) {
      const value = key(row);
      if (seen.has(value)) continue;
      seen.add(value);
      kept.push(row);
    }
    return kept;
  };

  const occupancyRows = latestByKey((occupancyResult.data ?? []) as { target_date: string; predicted_value: number; metadata: { knownOnly?: boolean } }[], (row) => row.target_date);
  const occupancyErrors: number[] = [];
  const occupancyPercents: number[] = [];
  for (const row of occupancyRows) {
    if (row.metadata?.knownOnly) { metrics.occupancy.skippedKnownOnly++; continue; }
    const actual = actualOccupancy(inputs.reservations, row.target_date, totalRooms);
    occupancyErrors.push(Math.abs(Number(row.predicted_value) - actual));
    if (actual > 0) occupancyPercents.push(Math.abs(Number(row.predicted_value) - actual) / actual);
    metrics.occupancy.observations++;
  }
  metrics.occupancy.mae = occupancyErrors.length ? Math.round((occupancyErrors.reduce((sum, value) => sum + value, 0) / occupancyErrors.length) * 10) / 10 : null;
  metrics.occupancy.mape = occupancyPercents.length ? Math.round((occupancyPercents.reduce((sum, value) => sum + value, 0) / occupancyPercents.length) * 1000) / 10 : null;

  const housekeepingRows = latestByKey((housekeepingResult.data ?? []) as { target_date: string; predicted_value: number }[], (row) => row.target_date);
  const housekeepingErrors = housekeepingRows.map((row) => Math.abs(Number(row.predicted_value) - inputs.tasks.filter((task) => task.created_at.slice(0, 10) === row.target_date).length));
  metrics.housekeeping.observations = housekeepingErrors.length;
  metrics.housekeeping.mae = housekeepingErrors.length ? Math.round((housekeepingErrors.reduce((sum, value) => sum + value, 0) / housekeepingErrors.length) * 10) / 10 : null;

  const inventoryRows = latestByKey(
    (inventoryResult.data ?? []) as { target_date: string; predicted_value: number; generated_at: string; target_resource_id: string; metadata: { available?: boolean } }[],
    (row) => `${row.target_resource_id}::${row.target_date}`
  ).filter((row) => row.metadata?.available);
  const inventoryErrors = inventoryRows.map((row) => {
    const from = row.generated_at.slice(0, 10);
    const actual = actualConsumption(inputs.movements, row.target_resource_id, from, row.target_date);
    return Math.abs(Number(row.predicted_value) - actual);
  });
  metrics.inventory.observations = inventoryErrors.length;
  metrics.inventory.mae = inventoryErrors.length ? Math.round((inventoryErrors.reduce((sum, value) => sum + value, 0) / inventoryErrors.length) * 10) / 10 : null;

  return metrics;
}
