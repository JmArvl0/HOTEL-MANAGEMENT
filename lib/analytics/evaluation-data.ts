import { readAllRows } from "@/lib/read-all-rows";
import { supabase } from "@/lib/supabase";
import type { AnalyticsInputs } from "./data";
import { LABOR_TASK_TYPES } from "./housekeeping";
import {
  closedLaborHours, closedOccupancy, collectDailyEvidence, compareForecasts, EVALUATION_DAYS, EVALUATION_VERSION,
  type DayEvidence, type EvaluationMetric, type EvaluationPrediction, type EvidenceRun, type InventoryActual
} from "./evaluation";
import { FORECAST_DAYS } from "./inventory";
import type { OccupancyActual } from "./seasonal-occupancy";
import { analyticsDay, hotelMidnight, shiftDate, type TaskLike } from "./types";

const metrics = ["occupancy", "housekeeping", "inventory"] as const;

async function evidenceRuns(from: string, through: string, metric?: EvaluationMetric) {
  const db = supabase;
  if (!db) return [];
  return readAllRows<EvidenceRun>(() => db.from("analytics_model_runs")
    .select("id,model_type,model_version,generated_at,parameters")
    .eq("status", "completed").in("model_type", metric ? [metric] : metrics)
    .not("parameters->evaluation", "is", null)
    .gte("generated_at", hotelMidnight(from)).lt("generated_at", hotelMidnight(shiftDate(through, 1)))
    .returns<EvidenceRun[]>());
}

export async function readRecordedOccupancy(from: string, through: string): Promise<Map<string, OccupancyActual>> {
  const actuals = new Map<string, OccupancyActual>();
  if (through < from) return actuals;
  const runs = await evidenceRuns(shiftDate(from, 1), shiftDate(through, 1), "occupancy");
  for (const [issuedOn, { evidence, recordedAt }] of collectDailyEvidence(runs, "occupancy")) {
    const value = evidence.actual;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) {
      actuals.set(shiftDate(issuedOn, -1), { percent: value, recordedAt });
    }
  }
  return actuals;
}

export async function captureEvaluation(input: AnalyticsInputs) {
  const db = supabase;
  if (!db) throw new Error("Analytics evidence requires a database.");
  const today = input.today;
  const yesterday = shiftDate(today, -1);
  const [history, tasks] = await Promise.all([
    evidenceRuns(shiftDate(today, -6), yesterday),
    readAllRows<TaskLike>(() => db.from("housekeeping_tasks").select("id,status,created_at,started_at,completed_at")
      .eq("status", "completed").in("task_type", LABOR_TASK_TYPES)
      .gte("completed_at", hotelMidnight(yesterday)).lt("completed_at", hotelMidnight(today)).returns<TaskLike[]>())
  ]);
  const days = {
    occupancy: collectDailyEvidence(history, "occupancy"),
    housekeeping: collectDailyEvidence(history, "housekeeping"),
    inventory: collectDailyEvidence(history, "inventory")
  };
  const usage = new Map<string, number>();
  for (const movement of input.movements) {
    if (movement.direction !== "consumption" || analyticsDay(movement.created_at) !== yesterday) continue;
    usage.set(movement.item_id, (usage.get(movement.item_id) ?? 0) + Number(movement.quantity));
  }
  const inventory = Object.fromEntries(input.inventoryItems
    .filter(item => item.created_at && Date.parse(item.created_at) <= Date.parse(hotelMidnight(yesterday)))
    .map(item => [item.id, { unit: item.unit, value: usage.get(item.id) ?? 0 } satisfies InventoryActual]));
  const basis = { version: EVALUATION_VERSION, issuedOn: today } as const;
  const closed: Record<EvaluationMetric, DayEvidence> = {
    occupancy: {
      ...basis,
      activeRooms: input.rooms.filter(room => room.administratively_active !== false).length,
      actual: closedOccupancy(input.reservations, yesterday, days.occupancy.get(yesterday)?.evidence.activeRooms)
    },
    housekeeping: { ...basis, actual: closedLaborHours(tasks) },
    inventory: { ...basis, actual: inventory }
  };
  return { days, closed };
}

export async function loadForecastEvaluation(metric: EvaluationMetric, from: string, through: string) {
  const db = supabase;
  if (!db) return { databaseMode: "demo", rows: [] } as const;
  const horizon = metric === "inventory" ? FORECAST_DAYS : 1;
  const predictionType = metric === "inventory" ? "inventory_shortage" : metric;
  const [runs, predictions] = await Promise.all([
    evidenceRuns(shiftDate(from, -horizon), shiftDate(through, 1), metric),
    readAllRows<EvaluationPrediction>(() => db.from("analytics_predictions")
      .select("id,model_run_id,target_date,target_resource_id,predicted_value,data_quality,metadata")
      .eq("prediction_type", predictionType).not("metadata->evaluation", "is", null)
      .gte("target_date", from).lte("target_date", through).returns<EvaluationPrediction[]>())
  ]);
  return { databaseMode: "supabase", rows: compareForecasts(metric, runs, predictions) } as const;
}

export function evaluationRange(today: string, days: number) {
  return { from: shiftDate(today, -Math.min(days, EVALUATION_DAYS)), through: shiftDate(today, -1) };
}
