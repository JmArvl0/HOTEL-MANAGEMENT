import { DAILY_FORECAST_DAYS } from "./occupancy";
import { analyticsDay, NIGHT_COVERING_STATUSES, shiftDate, type DataQuality, type ReservationLike, type TaskLike, type WorkloadLevel } from "./types";

/**
 * HOUSEKEEPING WORKLOAD FORECAST — derived from reservations (expected
 * departures and stayovers) plus the hotel's own task history for durations
 * and request volume. No staffing numbers are invented: labor hours only
 * appear when real completed-task durations exist.
 */

export const HOUSEKEEPING_MODEL_VERSION = "housekeeping-v3";
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
  openTasks: number;
  expectedNewTasks: number;
  workload: WorkloadLevel;
  estimatedLaborHours?: number;
  meanTaskMinutes?: number;
  durationObservations: number;
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

export const LABOR_TASK_TYPES = ["checkout_cleaning", "stayover_cleaning", "guest_request"] as const;

export const minutesBetween = (start: string | null | undefined, end: string | null | undefined): number | null => {
  if (!start || !end) return null;
  const value = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  return value > 0 && value < 24 * 60 ? value : null; // ignore absurd durations (clock skew, mid-night rollovers)
};

export function forecastHousekeeping(input: HousekeepingInput): HousekeepingForecast {
  const horizon = input.horizon ?? DAILY_FORECAST_DAYS;
  const inspectionRequired = input.inspectionRequired ?? true;
  const notes: string[] = [];

  // Expected guest-request volume: mean daily guest_request tasks over trailing window.
  const requestWindowStart = shiftDate(input.today, -REQUEST_HISTORY_DAYS);
  const requestTasks = input.tasks.filter(task => {
    const date = analyticsDay(task.created_at);
    return task.task_type === "guest_request" && task.status !== "cancelled" && date >= requestWindowStart && date < input.today;
  });
  const meanDailyRequests = Math.round((requestTasks.length / REQUEST_HISTORY_DAYS) * 10) / 10;

  // Mean completed-task duration (hours) from real history.
  const durationWindowStart = shiftDate(input.today, -DURATION_HISTORY_DAYS);
  const durationByType = Object.fromEntries(LABOR_TASK_TYPES.map(type => {
    const durations = input.tasks.flatMap(task => {
      const date = task.completed_at ? analyticsDay(task.completed_at) : "";
      const duration = minutesBetween(task.started_at, task.completed_at);
      return task.status === "completed" && task.task_type === type && date >= durationWindowStart
        && date < input.today && duration !== null ? [duration] : [];
    });
    return [type, {
      count: durations.length,
      mean: durations.length >= MIN_DURATION_SAMPLES
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : null
    }];
  })) as Record<typeof LABOR_TASK_TYPES[number], { count: number; mean: number | null }>;
  const open = input.tasks.filter(task => ["pending", "assigned", "in_progress", "deferred"].includes(task.status));
  const openCheckouts = open.filter(task => task.task_type === "checkout_cleaning");
  const openStayovers = open.filter(task => task.task_type === "stayover_cleaning");
  const openInspections = input.tasks.filter(task => (task.task_type === "inspection" && open.includes(task))
    || (task.task_type !== "inspection" && task.status === "completed" && task.inspection_status === "pending"));
  const openRequests = open.filter(task => task.task_type === "guest_request");
  const otherOpenTasks = open.length - openCheckouts.length - openStayovers.length - openRequests.length
    - openInspections.filter(task => task.task_type === "inspection").length;
  const existingWork = new Set(input.tasks.filter(task => task.status !== "cancelled" && task.reservation_id
      && (open.includes(task) || analyticsDay(task.created_at) === input.today))
    .map(task => `${task.task_type}:${task.reservation_id}`));

  // Historical completed-per-day distribution sets the workload thresholds.
  const completedByDay = new Map<string, number>();
  for (const task of input.tasks) {
    if (task.status !== "completed" || !task.completed_at) continue;
    const key = analyticsDay(task.completed_at);
    if (key >= durationWindowStart && key < input.today) completedByDay.set(key, (completedByDay.get(key) ?? 0) + 1);
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
    const isToday = offset === 0;
    const scheduledCheckouts = input.reservations.filter(reservation =>
      NIGHT_COVERING_STATUSES.includes(reservation.status as never) && reservation.check_out === date
      && (!isToday || !existingWork.has(`checkout_cleaning:${reservation.id}`))).length;
    const scheduledStayovers = covering.filter(reservation => reservation.check_out > shiftDate(date, 1)
      && (!isToday || !existingWork.has(`stayover_cleaning:${reservation.id}`))).length;
    const checkoutCleans = scheduledCheckouts + (isToday ? openCheckouts.length : 0);
    const stayoverServices = scheduledStayovers + (isToday ? openStayovers.length : 0);
    const guestRequestTasks = isToday ? openRequests.length : meanDailyRequests;
    const plannedInspections = inspectionRequired ? checkoutCleans : 0;
    const inspections = plannedInspections + (isToday ? openInspections.length : 0);
    const openTasks = isToday ? open.length + openInspections.filter(task => task.task_type !== "inspection").length : 0;
    const totalTasks = checkoutCleans + stayoverServices + guestRequestTasks + inspections + (isToday ? otherOpenTasks : 0);
    const laborCounts = [checkoutCleans, stayoverServices, guestRequestTasks];
    const timedTypes = LABOR_TASK_TYPES.filter((_, index) => laborCounts[index] > 0);
    const missingTypes = timedTypes.filter(type => durationByType[type].mean === null);
    const observations = timedTypes.reduce((sum, type) => sum + durationByType[type].count, 0);
    const laborMinutes = LABOR_TASK_TYPES.reduce((sum, type, index) => sum
      + laborCounts[index] * (durationByType[type].mean ?? 0), 0);
    const workload: WorkloadLevel = totalTasks > highThreshold ? "high" : totalTasks >= mediumThreshold ? "medium" : "low";
    const day: HousekeepingDayForecast = {
      date,
      checkoutCleans,
      stayoverServices,
      guestRequestTasks: Math.round(guestRequestTasks * 10) / 10,
      inspections,
      totalTasks: Math.round(totalTasks * 10) / 10,
      openTasks,
      expectedNewTasks: Math.round((totalTasks - openTasks) * 10) / 10,
      workload,
      dataQuality: !missingTypes.length && observations >= 14 ? "medium" : "limited",
      durationObservations: observations,
      basisNote: !timedTypes.length ? "No cleaning or guest-request tasks in this estimate." : missingTypes.length
        ? `Labor hours need at least ${MIN_DURATION_SAMPLES} timed completions for each required task type. Missing history for ${missingTypes.map(type => type.replaceAll("_", " ")).join(", ")}.`
        : "Cleaning and guest-request hours use measured durations by task type. Inspection and other work are shown as task counts."
    };
    if (!missingTypes.length && timedTypes.length > 0) {
      day.estimatedLaborHours = Math.round(laborMinutes / 6) / 10;
      day.meanTaskMinutes = Math.round(laborMinutes / (checkoutCleans + stayoverServices + guestRequestTasks) * 10) / 10;
    }
    days.push(day);
  }

  return {
    today: input.today,
    days,
    method: "Open tasks today, expected departures and stayovers, and measured duration by task type",
    notes
  };
}

/** Actual tasks created for a date — used by prediction-vs-actual evaluation. */
export function actualTaskCount(tasks: TaskLike[], date: string): number {
  return tasks.filter((task) => analyticsDay(task.created_at) === date).length;
}
