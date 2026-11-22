import { describe, expect, it } from "vitest";
import {
  closedLaborHours, closedOccupancy, collectDailyEvidence, compareForecasts, EVALUATION_VERSION,
  previousWeekBaseline, scoreForecasts, type EvaluationMetric, type EvaluationPrediction, type EvidenceRun
} from "./evaluation";
import { shiftDate, type ReservationLike, type TaskLike } from "./types";

const date = "2026-11-10";

function run(metric: EvaluationMetric, issuedOn: string, actual: NonNullable<EvidenceRun["parameters"]["evaluation"]>["actual"], hour = 18): EvidenceRun {
  return {
    id: `${metric}-${issuedOn}-${hour}`, model_type: metric, model_version: `${metric}-v1`,
    // 18:35 UTC on the prior calendar day is 02:35 on the issuance day in Manila.
    generated_at: `${shiftDate(issuedOn, -1)}T${hour}:35:00Z`,
    parameters: { evaluation: { version: EVALUATION_VERSION, issuedOn, actual } }
  };
}

function prediction(source: EvidenceRun, target: string, overrides: Partial<EvaluationPrediction> = {}): EvaluationPrediction {
  return {
    id: `forecast-${source.id}`, model_run_id: source.id, target_date: target, target_resource_id: null,
    predicted_value: 55, data_quality: "medium", metadata: { evaluation: { baseline: 40, historicalObservations: 17 } }, ...overrides
  };
}

describe("forecast evaluation", () => {
  it("freezes a trailing-seven-day benchmark and preserves missing days and real zeroes", () => {
    const days = Array.from({ length: 7 }, (_, i) => run("occupancy", shiftDate(date, -i), i === 4 ? 0 : 70));
    const newRun = days[0].parameters.evaluation!;
    const history = collectDailyEvidence([...days, run("occupancy", shiftDate(date, -4), 99, 21)], "occupancy");
    expect(previousWeekBaseline(history, newRun)).toBe(60);
    history.delete(shiftDate(date, -2));
    expect(previousWeekBaseline(history, newRun)).toBeNull();
  });

  it("uses first eligible snapshots at the fixed lead and suppresses booked-only values", () => {
    const first = run("occupancy", date, 10);
    const later = run("occupancy", date, 10, 21);
    const actual = run("occupancy", shiftDate(date, 2), 50);
    const target = shiftDate(date, 1);
    const laterForecast = prediction(later, target, { predicted_value: 80 });
    const firstForecast = prediction(first, target);
    const runs = [later, first, actual];
    expect(compareForecasts("occupancy", runs, [laterForecast, prediction(actual, target), firstForecast])).toMatchObject([
      { predicted: 55, actual: 50, baseline: 40, historicalObservations: 17, actualSnapshotAt: actual.generated_at }
    ]);
    firstForecast.metadata.knownOnly = true;
    expect(compareForecasts("occupancy", runs, [laterForecast, firstForecast])).toMatchObject([{ predicted: null, exclusion: "Forecast unavailable" }]);
  });

  it("uses saved housekeeping hours and withholds results if a task duration is missing", () => {
    const tasks: TaskLike[] = [{ id: "a", created_at: "", status: "completed", started_at: "2026-11-10T15:45:00Z", completed_at: "2026-11-10T16:15:00Z" }];
    expect(closedLaborHours(tasks)).toBe(0.5);
    expect(closedLaborHours([{ ...tasks[0], started_at: null }])).toBeNull();
    const first = run("housekeeping", date, 0);
    const actual = run("housekeeping", shiftDate(date, 2), 0.5);
    const row = prediction(first, shiftDate(date, 1), { metadata: { estimatedLaborHours: 1.25, evaluation: { baseline: 0.75, historicalObservations: 11 } } });
    expect(compareForecasts("housekeeping", [first, actual], [row])).toMatchObject([{ unit: "h", predicted: 1.25, actual: 0.5, baseline: 0.75 }]);
  });

  it("sums exactly three full days for the selected item and unit", () => {
    const makeActual = (offset: number, value: number, unit = "bottles") => run("inventory", shiftDate(date, offset), { item: { unit, value }, other: { unit, value: 900 } });
    const first = makeActual(0, 100);
    const row = prediction(first, shiftDate(date, 3), { target_resource_id: "item", metadata: { available: true, unit: "bottles", evaluation: { baseline: 7, historicalObservations: 9 } } });
    const runs = [first, makeActual(1, 100), makeActual(2, 2), makeActual(3, 0), makeActual(4, 5), makeActual(5, 100)];
    expect(compareForecasts("inventory", runs, [row])).toMatchObject([{ actual: 7, unit: "bottles", windowStart: shiftDate(date, 1), targetDate: shiftDate(date, 3) }]);
    expect(compareForecasts("inventory", runs.filter(entry => entry !== runs[3]), [row])).toMatchObject([{ actual: null, exclusion: "Actual unavailable" }]);
    runs[3] = makeActual(3, 10, "cases");
    expect(compareForecasts("inventory", runs, [row])).toMatchObject([{ actual: null, exclusion: "Actual unavailable" }]);
  });

  it("uses room capacity recorded on the actual date and excludes unavailable stay evidence", () => {
    const stay: ReservationLike = { id: "r1", status: "checked_out", check_in: date, check_out: shiftDate(date, 1), created_at: "", checked_in_at: "2026-11-10T07:00:00+00:00", checked_out_at: "2026-11-11T04:00:00+00:00" };
    expect(closedOccupancy([stay], date, 5)).toBe(20);
    expect(closedOccupancy([stay], date)).toBeNull();
    expect(closedOccupancy([{ ...stay, checked_in_at: null }], date, 5)).toBeNull();
    expect(closedOccupancy([{ ...stay, status: "confirmed" }], date, 5)).toBe(0);
  });

  it("matches cohorts for MAE, excludes zero only for MAPE, and requires seven pairs", () => {
    const runs = Array.from({ length: 9 }, (_, i) => run("occupancy", shiftDate(date, i), i === 2 ? 0 : 50));
    const rows = compareForecasts("occupancy", runs, runs.map((source, i) => prediction(source, shiftDate(date, i + 1))));
    expect(scoreForecasts(rows.slice(0, 6)).meanError).toBeNull();
    const score = scoreForecasts(rows);
    expect(score.observations).toBe(7);
    expect(score.zeroActuals).toBe(1);
    expect(score.meanError).toBeCloseTo((55 + 6 * 5) / 7);
    expect(score.baselineError).toBeCloseTo((40 + 6 * 10) / 7);
    expect(score.percentageError).toBe(10);
  });
});
