import { NIGHT_COVERING_STATUSES, shiftDate, type DataQuality, type ReservationLike, type TaskLike, type WorkloadLevel } from "./types";

/**
 * HOUSEKEEPING WORKLOAD FORECAST — derived from reservations (expected
 * departures and stayovers) plus the hotel's own task history for durations
 * and request volume. No staffing numbers are invented: labor hours only
 * appear when real completed-task durations exist.
 */

export const HOUSEKEEPING_MODEL_VERSION = "housekeeping-v1";
const REQUEST_HISTORY_DAYS = 14;
const DURATION_HISTORY_DAYS = 30;
const MIN_DURATION_SAMPLES = 5;
const MIN_WORKLOAD_HISTORY_DAYS = 10;

export interface HousekeepingDayForecast {
  date: string;
  checkoutCleans: number;
  stayoverServices: number;
  guestRequestTasks: number;
  inspections: number;
  totalTasks: number;
  workload: WorkloadLevel;
  estimatedLaborHours?: number;
  meanTaskMinutes?: number;
  dataQuality: DataQuality;
  basisNote: string;
}

export interface HousekeepingForecast {
  today: string;
  days: HousekeepingDayForecast[];
  method: string;
  notes: string[];
}

export interface HousekeepingInput {
  reservations: ReservationLike[];
  tasks: TaskLike[];
  today: string;
  horizon?: number;
  inspectionRequired?: boolean;
}

// created_at/completed_at are timestamptz; bucket by the Asia/Manila hotel day, like hotelToday().
const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (timestamp: string): string => manilaDay.format(new Date(timestamp));

const minutesBetween = (start: string | null | undefined, end: string | null | undefined): number | null => {
  if (!start || !end) return null;
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  return value > 0 && value < 24 * 60 ? value : null; // ignore absurd durations (clock skew, mid-night rollovers)
};

export function forecastHousekeeping(input: HousekeepingInput): HousekeepingForecast {
  const horizon = input.horizon ?? 7;
  const inspectionRequired = input.inspectionRequired ?? true;
  const notes: string[] = [];

  // Expected guest-request volume: mean daily guest_request tasks over trailing window.
  const requestWindowStart = shiftDate(input.today, -REQUEST_HISTORY_DAYS);
  const requestTasks = input.tasks.filter((task) => task.task_type === "guest_request" && task.created_at.slice(0, 10) >= requestWindowStart);
  const meanDailyRequests = Math.round((requestTasks.length / REQUEST_HISTORY_DAYS) * 10) / 10;

  // Mean completed-task duration (hours) from real history.
  const durationWindowStart = shiftDate(input.today, -DURATION_HISTORY_DAYS);
  const durations = input.tasks
    .filter((task) => task.status === "completed" && task.completed_at && task.started_at && task.completed_at.slice(0, 10) >= durationWindowStart)
    .map((task) => minutesBetween(task.started_at, task.completed_at))
    .filter((value): value is number => value !== null);
  const meanTaskMinutes = durations.length >= MIN_DURATION_SAMPLES
    ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
    : null;

  // Historical completed-per-day distribution sets the workload thresholds.
  const completedByDay = new Map<string, number>();
  for (const task of input.tasks) {
    if (task.status !== "completed" || !task.completed_at) continue;
    const key = dayKey(task.completed_at);
    completedByDay.set(key, (completedByDay.get(key) ?? 0) + 1);
  }
  const historicalDaily = [...completedByDay.values()].filter((value) => value > 0).sort((a, b) => a - b);
  const historyDays = historicalDaily.length;
  const highThreshold = historyDays >= MIN_WORKLOAD_HISTORY_DAYS ? historicalDaily[Math.floor(historyDays * 0.75)] : 20;
  const mediumThreshold = historyDays >= MIN_WORKLOAD_HISTORY_DAYS ? historicalDaily[Math.floor(historyDays * 0.5)] : 10;
  if (historyDays < MIN_WORKLOAD_HISTORY_DAYS) {
    notes.push(`Workload thresholds use documented fixed cutoffs (<${mediumThreshold} low, ${mediumThreshold}–${highThreshold} medium, >${highThreshold} high) because only ${historyDays} days of completed-task history exist.`);
  }

  const days: HousekeepingDayForecast[] = [];
  for (let offset = 0; offset < horizon; offset++) {
    const date = shiftDate(input.today, offset);
    const covering = input.reservations.filter((reservation) =>
      NIGHT_COVERING_STATUSES.includes(reservation.status as never)
      && reservation.check_in <= date
      && reservation.check_out > date
    );
    // Departure-day turnover cleans: a room vacated on `date` needs its clean that day
    // (matches when HAVEN's checkout actually creates the task, so predicted-vs-actual
    // evaluation compares the same day). Stayover services: rooms still occupied the
    // following night (guests continuing their stay).
    const checkoutCleans = input.reservations.filter((reservation) =>
      NIGHT_COVERING_STATUSES.includes(reservation.status as never)
      && reservation.check_out === date
    ).length;
    const stayoverServices = covering.filter((reservation) => reservation.check_out > shiftDate(date, 1)).length;
    const guestRequestTasks = offset === 0 ? input.tasks.filter((task) => task.task_type === "guest_request" && ["pending", "assigned", "in_progress", "deferred"].includes(task.status)).length : meanDailyRequests;
    const inspections = inspectionRequired ? checkoutCleans : 0;
    const totalTasks = checkoutCleans + stayoverServices + guestRequestTasks + inspections;
    const workload: WorkloadLevel = totalTasks > highThreshold ? "high" : totalTasks >= mediumThreshold ? "medium" : "low";
    const day: HousekeepingDayForecast = {
      date,
      checkoutCleans,
      stayoverServices,
      guestRequestTasks: Math.round(guestRequestTasks * 10) / 10,
      inspections,
      totalTasks: Math.round(totalTasks * 10) / 10,
      workload,
      dataQuality: historyDays >= MIN_WORKLOAD_HISTORY_DAYS ? "medium" : "limited",
      basisNote: meanTaskMinutes
        ? `Durations from ${durations.length} completed tasks (mean ${meanTaskMinutes} min).`
        : "No completed-task duration history yet — labor hours unavailable."
    };
    if (meanTaskMinutes) {
      day.meanTaskMinutes = meanTaskMinutes;
      day.estimatedLaborHours = Math.round((totalTasks * meanTaskMinutes / 60) * 10) / 10;
    }
    days.push(day);
  }

  return {
    today: input.today,
    days,
    method: "Expected departures/stayovers from reservations + historical guest-request rate and task durations",
    notes
  };
}

/** Actual tasks created for a date — used by prediction-vs-actual evaluation. */
export function actualTaskCount(tasks: TaskLike[], date: string): number {
  return tasks.filter((task) => dayKey(task.created_at) === date).length;
}
