import { analyticsDay, NIGHT_COVERING_PAST_STATUSES, NIGHT_COVERING_STATUSES, occupancyRisk, shiftDate, type DataQuality, type ReservationLike, type RiskLevel, type RoomLike } from "./types";

/**
 * OCCUPANCY FORECAST — HAVEN's own model, not Gemini's.
 *
 * Method (explainable, deliberately simple):
 *   1. KNOWN occupancy (FACT): reservations with status confirmed/checked_in
 *      whose stay covers the night. A confirmed count is never labeled a prediction.
 *   2. PICKUP estimate (PREDICTION): for each lead k (0..7 days ahead), the mean
 *      net change between the booking count saved k days out and verified
 *      rooms occupied at the end of that hotel night.
 *      Requires MIN_PICKUP_OBSERVATIONS per lead; otherwise no prediction is
 *      published for that day and data quality is reported as limited.
 */

export const OCCUPANCY_MODEL_VERSION = "occupancy-v2";
export const PICKUP_HISTORY_DAYS = 84;
export const FORECAST_LEADS = [1, 3, 7] as const;
export const DAILY_FORECAST_DAYS = 8; // Tonight plus seven future hotel nights.
const MIN_PICKUP_OBSERVATIONS = 5;
const MEDIUM_QUALITY_OBSERVATIONS = 14;

export interface OccupancyDay {
  date: string;
  totalRooms: number;
  serviceableRooms: number;
  roomsAvailableToSell: number;
  overbookedRooms: number;
  knownOccupied: number;
  knownOccupancyPct: number;
  /** Present only when pickup history supports a prediction. */
  predictedOccupied?: number;
  predictedOccupancyPct?: number;
  pickupRooms?: number;
  riskLevel: RiskLevel;
  dataQuality: DataQuality;
  basisObservations: number;
}

export interface OccupancyForecast {
  today: string;
  days: OccupancyDay[];
  method: string;
  notes: string[];
}

export interface OccupancyInput {
  reservations: ReservationLike[];
  rooms: RoomLike[];
  today: string;
  horizon?: number;
  pickupHistory?: readonly ClosedPickup[];
}

/** Count reservations covering the night of `date` (optionally only those booked on/before `knownThrough`). */
export function countNights(reservations: ReservationLike[], date: string, past: boolean, knownThrough?: string): number {
  const statuses = past ? NIGHT_COVERING_PAST_STATUSES : NIGHT_COVERING_STATUSES;
  return reservations.filter((reservation) =>
    statuses.includes(reservation.status as never)
    && reservation.check_in <= date
    && reservation.check_out > date
    && (knownThrough === undefined || analyticsDay(reservation.created_at) <= knownThrough)
  ).length;
}

export type ClosedPickup = { night: string; lead: number; booked: number; occupied: number };

/** A saved count preserves what was known at issuance, even after cancellations. */
export function pickupEstimate(history: readonly ClosedPickup[], today: string, lead: number): { pickup: number; observations: number } {
  const from = shiftDate(today, -PICKUP_HISTORY_DAYS);
  const nights = history.filter(row => row.lead === lead && row.night >= from && row.night < today);
  const sum = nights.reduce((total, row) => total + row.occupied - row.booked, 0);
  return { pickup: nights.length ? Math.round(sum / nights.length * 10) / 10 : 0, observations: nights.length };
}

export function forecastOccupancy(input: OccupancyInput): OccupancyForecast {
  const horizon = input.horizon ?? DAILY_FORECAST_DAYS;
  const activeRooms = input.rooms.filter(room => room.administratively_active !== false);
  const totalRooms = activeRooms.length;
  const serviceableRooms = activeRooms.filter(room => room.status !== "maintenance").length;
  const notes: string[] = [];
  const days: OccupancyDay[] = [];

  for (let offset = 0; offset < horizon; offset++) {
    const date = shiftDate(input.today, offset);
    const knownOccupied = countNights(input.reservations, date, false);
    const knownOccupancyPct = totalRooms ? Math.round((knownOccupied / totalRooms) * 100) : 0;
    const { pickup, observations } = pickupEstimate(input.pickupHistory ?? [], input.today, offset);

    const day: OccupancyDay = {
      date,
      totalRooms,
      serviceableRooms,
      roomsAvailableToSell: Math.max(0, serviceableRooms - knownOccupied),
      overbookedRooms: Math.max(0, knownOccupied - serviceableRooms),
      knownOccupied,
      knownOccupancyPct,
      riskLevel: occupancyRisk(knownOccupancyPct),
      dataQuality: "limited",
      basisObservations: observations
    };

    if (totalRooms > 0 && observations >= MIN_PICKUP_OBSERVATIONS) {
      const predictedOccupied = Math.max(0, Math.min(totalRooms, knownOccupied + Math.round(pickup)));
      const predictedOccupancyPct = totalRooms ? Math.round((predictedOccupied / totalRooms) * 100) : 0;
      day.predictedOccupied = predictedOccupied;
      day.predictedOccupancyPct = predictedOccupancyPct;
      day.pickupRooms = Math.round(pickup);
      day.riskLevel = occupancyRisk(predictedOccupancyPct);
      day.dataQuality = observations >= MEDIUM_QUALITY_OBSERVATIONS ? "medium" : "limited";
    }

    days.push(day);
  }

  if (days.some((day) => day.predictedOccupancyPct === undefined)) {
    notes.push("Pickup estimation needs at least " + MIN_PICKUP_OBSERVATIONS + " matched booking snapshots and closed nights per lead time. Until then only known (booked) occupancy is reported — it is a fact, not a prediction.");
  }
  notes.push("Occupancy uses " + totalRooms + " active rooms. Sellable capacity reflects current maintenance blocks and carries forward as an estimate for future dates.");

  return {
    today: input.today,
    days,
    method: "Current bookings + average net pickup from saved booking counts and verified occupied nights at the same lead time",
    notes
  };
}

/** Actual occupancy for a past night — used by prediction-vs-actual evaluation. */
export function actualOccupancy(reservations: ReservationLike[], date: string, totalRooms: number): number {
  const occupied = countNights(reservations, date, true);
  return totalRooms ? Math.round((occupied / totalRooms) * 100) : 0;
}

export interface BookedOccupancyPoint {
  date: string;
  day: string;
  occupancy: number;
}

/**
 * Trailing BOOKED-occupancy series — one point per hotel day, oldest first, ending on `today`.
 *
 * This is the single definition of the dashboard/report seven-day trend. It reuses
 * `countNights`, so every surface shares one night-covering basis with the forecast:
 * stay dates decide the night, and only the last point (tonight) is measured with the
 * current/future statuses — a stay already checked out must never be counted as
 * occupying tonight, while it legitimately counts for nights that have passed.
 *
 * It is a reservation-stay-date measure, NOT the live room rack (`rooms.status`): a
 * reservation covering tonight whose room Front Desk has not marked occupied is booked
 * occupancy without live occupancy. Surfaces that show both must label which is which.
 *
 * `totalRooms` is the caller's denominator — the dashboard passes administratively
 * active rooms minus maintenance-blocked ones, matching its `metrics.occupancy`.
 */
export function bookedOccupancyTrend(reservations: ReservationLike[], totalRooms: number, today: string, days = 7): BookedOccupancyPoint[] {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDate(today, index - (days - 1));
    const booked = countNights(reservations, date, date < today);
    return { date, day: weekday.format(new Date(`${date}T00:00:00Z`)), occupancy: totalRooms ? Math.round((booked / totalRooms) * 100) : 0 };
  });
}
