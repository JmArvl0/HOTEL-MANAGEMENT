import { analyticsDay, hotelMidnight, shiftDate, type DataQuality, type ReservationLike, type TaskLike } from "./types";
import { FORECAST_DAYS } from "./inventory";
import { FORECAST_LEADS } from "./occupancy";
import { minutesBetween } from "./housekeeping";

export const EVALUATION_VERSION = "closed-hotel-days-v1";
export const BASELINE_VERSION = "previous-seven-closed-days-v1";
export const MIN_MATCHED_PAIRS = 7;
export const EVALUATION_DAYS = 90;
export type EvaluationMetric = "occupancy" | "housekeeping" | "inventory";

export type InventoryActual = { unit: string; value: number };
export type DayEvidence = {
  version: typeof EVALUATION_VERSION;
  issuedOn: string;
  activeRooms?: number;
  bookedByDate?: Record<string, number>;
  inventoryCoverage?: "recorded";
  actual: number | null | Record<string, InventoryActual>;
  recoveredActuals?: Record<string, NonNullable<DayEvidence["actual"]>>;
};

export type EvidenceRun = {
  id: string;
  model_type: EvaluationMetric;
  model_version: string;
  generated_at: string;
  parameters: { evaluation?: DayEvidence };
};

type Comparison = { baseline: number | null; historicalObservations: number };

export type EvaluationPrediction = {
  id: string;
  model_run_id: string;
  target_date: string;
  target_resource_id: string | null;
  predicted_value: number;
  data_quality: DataQuality;
  metadata: {
    knownOnly?: boolean;
    estimatedLaborHours?: number | null;
    available?: boolean;
    name?: string;
    unit?: string;
    evaluation?: Comparison;
  };
};

export type EvaluationRow = {
  id: string;
  runId: string;
  issuedOn: string;
  generatedAt: string;
  windowStart: string;
  targetDate: string;
  leadDays: number;
  actualSnapshotAt: string | null;
  modelVersion: string;
  itemId: string | null;
  itemName: string | null;
  unit: string;
  actual: number | null;
  predicted: number | null;
  baseline: number | null;
  historicalObservations: number;
  dataQuality: DataQuality;
  exclusion: "Forecast unavailable" | "Actual unavailable" | "Baseline unavailable" | null;
};

/** Occupied at the end of the Manila night, using recorded arrivals/departures. */
export function closedOccupancy(reservations: ReservationLike[], night: string, capacity?: number): number | null {
  if (!capacity) return null;
  const cutoff = Date.parse(hotelMidnight(shiftDate(night, 1)));
  let occupied = 0;
  for (const stay of reservations) {
    if (!["checked_in", "checked_out"].includes(stay.status)) continue;
    const arrival = Date.parse(stay.checked_in_at ?? "");
    const departure = Date.parse(stay.checked_out_at ?? "");
    if ((!arrival || (stay.status === "checked_out" && !departure)) && stay.check_in <= night && night < stay.check_out) return null;
    if (arrival && arrival < cutoff && (departure ? departure >= cutoff : stay.status === "checked_in")) occupied++;
  }
  return occupied <= capacity ? occupied / capacity * 100 : null;
}

export function closedLaborHours(completedTasks: TaskLike[]): number | null {
  let minutes = 0;
  for (const task of completedTasks) {
    const duration = minutesBetween(task.started_at, task.completed_at);
    if (duration === null) return null;
    minutes += duration;
  }
  return minutes / 60;
}

export type DailyEvidence = Map<string, { evidence: DayEvidence; recordedAt: string }>;

export function collectDailyEvidence(runs: EvidenceRun[], metric: EvaluationMetric): DailyEvidence {
  const days: DailyEvidence = new Map();
  const ordered = [...runs].sort((a, b) => a.generated_at.localeCompare(b.generated_at) || a.id.localeCompare(b.id));
  for (const run of ordered) {
    const evidence = run.parameters.evaluation;
    if (run.model_type !== metric || evidence?.version !== EVALUATION_VERSION) continue;
    if (analyticsDay(run.generated_at) !== evidence.issuedOn || days.has(evidence.issuedOn)) continue;
    days.set(evidence.issuedOn, { evidence, recordedAt: run.generated_at });
  }
  for (const run of ordered) {
    const evidence = run.parameters.evaluation;
    if (run.model_type !== metric || evidence?.version !== EVALUATION_VERSION || analyticsDay(run.generated_at) !== evidence.issuedOn) continue;
    applyRecoveredActuals(days, evidence, run.generated_at);
  }
  return days;
}

/** Preserve originally recorded outcomes. Later runs can fill absent closed-day evidence. */
export function applyRecoveredActuals(days: DailyEvidence, source: DayEvidence, recordedAt: string) {
  for (const [night, actual] of Object.entries(source.recoveredActuals ?? {})) {
    const expectedSnapshotDay = shiftDate(night, 1);
    if (expectedSnapshotDay >= source.issuedOn) continue;
    const previous = days.get(expectedSnapshotDay);
    if (previous?.evidence.actual != null) continue;
    days.set(expectedSnapshotDay, { evidence: {
      ...previous?.evidence, version: source.version, issuedOn: expectedSnapshotDay, actual,
      inventoryCoverage: source.inventoryCoverage
    }, recordedAt });
  }
}

function numericActual(evidence: DayEvidence | undefined, itemId?: string, unit?: string): number | null {
  const value = evidence?.actual;
  if (!itemId) return typeof value === "number" ? value : null;
  const item = value && typeof value === "object" ? value[itemId] : undefined;
  return item && item.unit === unit && (item.value !== 0 || evidence?.inventoryCoverage === "recorded") ? item.value : null;
}

/** The closing snapshot for a night is written on the following hotel day. */
export function previousWeekBaseline(days: DailyEvidence, current: DayEvidence, itemId?: string, unit?: string): number | null {
  let sum = 0;
  for (let offset = 0; offset < 7; offset++) {
    const evidence = offset === 0 ? current : days.get(shiftDate(current.issuedOn, -offset))?.evidence;
    const actual = numericActual(evidence, itemId, unit);
    if (actual === null) return null;
    sum += actual;
  }
  return sum / 7 * (itemId ? FORECAST_DAYS : 1);
}

export function compareForecasts(metric: EvaluationMetric, runs: EvidenceRun[], predictions: EvaluationPrediction[]): EvaluationRow[] {
  const byId = new Map(runs.map(run => [run.id, run]));
  const days = collectDailyEvidence(runs, metric);
  const inventory = metric === "inventory";

  const unique = new Map<string, EvaluationRow>();
  for (const prediction of predictions) {
    const run = byId.get(prediction.model_run_id);
    const metadata = prediction.metadata;
    const comparison = metadata.evaluation;
    const issuedOn = run?.parameters.evaluation?.issuedOn;
    if (!run || run.model_type !== metric || !comparison || !issuedOn
      || run.parameters.evaluation?.version !== EVALUATION_VERSION || analyticsDay(run.generated_at) !== issuedOn) continue;
    const leadDays = (inventory ? [FORECAST_DAYS] : FORECAST_LEADS)
      .find(lead => shiftDate(issuedOn, lead) === prediction.target_date);
    if (leadDays === undefined) continue;
    const horizon = inventory ? FORECAST_DAYS : 1;
    const itemId = inventory ? prediction.target_resource_id : null;
    const unit = inventory ? metadata.unit : metric === "occupancy" ? "%" : "h";
    if (!unit || (inventory && !itemId)) continue;
    const predicted = metric === "housekeeping" ? metadata.estimatedLaborHours ?? null
      : (inventory ? metadata.available : !metadata.knownOnly) ? Number(prediction.predicted_value) : null;
    const firstDay = inventory ? shiftDate(issuedOn, 1) : prediction.target_date;
    let actual: number | null = 0;
    let actualSnapshotAt: string | null = null;
    for (let offset = 0; offset < horizon; offset++) {
      const recorded = days.get(shiftDate(firstDay, offset + 1));
      const value = numericActual(recorded?.evidence, itemId ?? undefined, unit);
      if (value === null || !recorded) {
        actual = null;
        actualSnapshotAt = null;
        break;
      }
      actual += value;
      actualSnapshotAt = recorded.recordedAt;
    }
    const { baseline, historicalObservations } = comparison;
    const exclusion = predicted === null ? "Forecast unavailable"
      : actual === null ? "Actual unavailable" : baseline === null ? "Baseline unavailable" : null;
    const key = JSON.stringify([prediction.target_date, leadDays, itemId, unit, run.model_version]);
    const previous = unique.get(key);
    if (previous && (previous.generatedAt < run.generated_at || (previous.generatedAt === run.generated_at && previous.id < prediction.id))) continue;
    unique.set(key, {
      id: prediction.id, runId: run.id, issuedOn, generatedAt: run.generated_at, windowStart: firstDay,
      targetDate: prediction.target_date, leadDays, actualSnapshotAt, modelVersion: run.model_version,
      itemId, itemName: inventory ? metadata.name ?? itemId : null, unit, actual, predicted, baseline,
      historicalObservations, dataQuality: prediction.data_quality, exclusion
    });
  }
  return [...unique.values()].sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.leadDays - b.leadDays || a.id.localeCompare(b.id));
}

export function scoreForecasts(rows: EvaluationRow[]) {
  const modelPairs = rows.filter(row => row.actual !== null && row.predicted !== null);
  const pairs = modelPairs.filter(row => row.baseline !== null);
  const observations = pairs.length;
  const percentagePairs = pairs.filter(row => row.actual !== 0);
  const sufficient = observations >= MIN_MATCHED_PAIRS;
  const absoluteError = (row: EvaluationRow, series: "predicted" | "baseline") => Math.abs(row[series]! - row.actual!);
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    observations,
    modelObservations: modelPairs.length,
    modelMeanError: modelPairs.length >= MIN_MATCHED_PAIRS ? mean(modelPairs.map(row => absoluteError(row, "predicted"))) : null,
    percentageObservations: percentagePairs.length,
    zeroActuals: observations - percentagePairs.length,
    meanError: sufficient ? mean(pairs.map(row => absoluteError(row, "predicted"))) : null,
    baselineError: sufficient ? mean(pairs.map(row => absoluteError(row, "baseline"))) : null,
    percentageError: sufficient ? mean(percentagePairs.map(row => absoluteError(row, "predicted") / row.actual! * 100)) : null
  };
}
