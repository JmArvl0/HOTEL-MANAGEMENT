import { readAllRows } from "@/lib/read-all-rows";
import { supabase } from "@/lib/supabase";
import type { AnalyticsInputs } from "./data";
import { LABOR_TASK_TYPES } from "./housekeeping";
import {
  applyRecoveredActuals, closedLaborHours, closedOccupancy, collectDailyEvidence, compareForecasts, EVALUATION_DAYS, EVALUATION_VERSION,
  type DayEvidence, type EvaluationMetric, type EvaluationPrediction, type EvidenceRun, type InventoryActual
} from "./evaluation";
import { dailyRecordedConsumption, FORECAST_DAYS } from "./inventory";
import { DAILY_FORECAST_DAYS, PICKUP_HISTORY_DAYS, type ClosedPickup } from "./occupancy";
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
  const runs = await evidenceRuns(shiftDate(from, 1), shiftDate(through, 7), "occupancy");
  for (const [issuedOn, { evidence, recordedAt }] of collectDailyEvidence(runs, "occupancy")) {
    const value = evidence.actual;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) {
      actuals.set(shiftDate(issuedOn, -1), { percent: value, recordedAt });
    }
  }
  return actuals;
}

export async function readOccupancyPickupHistory(today: string): Promise<ClosedPickup[]> {
  const from = shiftDate(today, -PICKUP_HISTORY_DAYS);
  const days = collectDailyEvidence(
    await evidenceRuns(shiftDate(from, -DAILY_FORECAST_DAYS + 1), today, "occupancy"), "occupancy"
  );
  return [...days.values()].flatMap(({ evidence }) => Object.entries(evidence.bookedByDate ?? {}).flatMap(([night, booked]) => {
    if (night < from || night >= today || !Number.isInteger(booked) || booked < 0 || night < evidence.issuedOn) return [];
    const capacity = days.get(night)?.evidence.activeRooms;
    const actual = days.get(shiftDate(night, 1))?.evidence.actual;
    if (!capacity || typeof actual !== "number" || actual < 0 || actual > 100) return [];
    const lead = (Date.parse(night) - Date.parse(evidence.issuedOn)) / 86_400_000;
    return [{ night, lead, booked, occupied: Math.round(actual * capacity / 100) }];
  }));
}

export async function captureEvaluation(input: AnalyticsInputs) {
  const db = supabase;
  if (!db) throw new Error("Analytics evidence requires a database.");
  const today = input.today;
  const yesterday = shiftDate(today, -1);
  const recoveryStart = shiftDate(today, -7);
  const [history, tasks] = await Promise.all([
    evidenceRuns(recoveryStart, yesterday),
    readAllRows<TaskLike>(() => db.from("housekeeping_tasks").select("id,status,created_at,started_at,completed_at")
      .eq("status", "completed").in("task_type", LABOR_TASK_TYPES)
      .gte("completed_at", hotelMidnight(recoveryStart)).lt("completed_at", hotelMidnight(today)).returns<TaskLike[]>())
  ]);
  const days = {
    occupancy: collectDailyEvidence(history, "occupancy"),
    housekeeping: collectDailyEvidence(history, "housekeeping"),
    inventory: collectDailyEvidence(history, "inventory")
  };
  const usage = dailyRecordedConsumption(input.movements, recoveryStart, yesterday);
  const tasksByDate = new Map<string, TaskLike[]>();
  for (const task of tasks) {
    if (!task.completed_at) continue;
    const date = analyticsDay(task.completed_at);
    const group = tasksByDate.get(date) ?? [];
    group.push(task);
    tasksByDate.set(date, group);
  }
  const actualsFor = (night: string): Record<EvaluationMetric, DayEvidence["actual"]> => ({
    occupancy: closedOccupancy(input.reservations, night, days.occupancy.get(night)?.evidence.activeRooms),
    housekeeping: closedLaborHours(tasksByDate.get(night) ?? []),
    inventory: Object.fromEntries(input.inventoryItems.flatMap(item => {
      const value = usage.get(item.id)?.get(night);
      if (value === undefined || (item.created_at && Date.parse(item.created_at) > Date.parse(hotelMidnight(night)))) return [];
      return [[item.id, { unit: item.unit, value } satisfies InventoryActual]];
    }))
  });
  const actuals = actualsFor(yesterday);
  const basis = { version: EVALUATION_VERSION, issuedOn: today } as const;
  const closed: Record<EvaluationMetric, DayEvidence> = {
    occupancy: { ...basis, activeRooms: input.rooms.filter(room => room.administratively_active !== false).length, actual: actuals.occupancy },
    housekeeping: { ...basis, actual: actuals.housekeeping },
    inventory: { ...basis, inventoryCoverage: "recorded", actual: actuals.inventory }
  };
  for (let night = recoveryStart; night < yesterday; night = shiftDate(night, 1)) {
    if (metrics.every(metric => days[metric].get(shiftDate(night, 1))?.evidence.actual != null)) continue;
    const recovered = actualsFor(night);
    for (const metric of metrics) {
      const value = recovered[metric];
      if (value === null || days[metric].get(shiftDate(night, 1))?.evidence.actual != null) continue;
      if (metric === "inventory" && !Object.keys(value).length) continue;
      (closed[metric].recoveredActuals ??= {})[night] = value;
    }
  }
  for (const metric of metrics) applyRecoveredActuals(days[metric], closed[metric], new Date().toISOString());
  return { days, closed };
}

export async function loadForecastEvaluation(metric: EvaluationMetric, from: string, through: string) {
  const db = supabase;
  if (!db) return { databaseMode: "demo", rows: [] } as const;
  const horizon = metric === "inventory" ? FORECAST_DAYS : DAILY_FORECAST_DAYS - 1;
  const predictionType = metric === "inventory" ? "inventory_shortage" : metric;
  const [runs, predictions] = await Promise.all([
    evidenceRuns(shiftDate(from, -horizon), shiftDate(through, 7), metric),
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
