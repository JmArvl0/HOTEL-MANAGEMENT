import { NIGHT_COVERING_PAST_STATUSES, NIGHT_COVERING_STATUSES, occupancyRisk, shiftDate, type DataQuality, type ReservationLike, type RiskLevel, type RoomLike } from "./types";

/**
 * OCCUPANCY FORECAST — HAVEN's own model, not Gemini's.
 *
 * Method (explainable, deliberately simple):
 *   1. KNOWN occupancy (FACT): reservations with status confirmed/checked_in
 *      whose stay covers the night. A confirmed count is never labeled a prediction.
 *   2. PICKUP estimate (PREDICTION): for each lead k (0..6 days ahead), the mean
 *      extra rooms historically materialized for a night beyond what was already
 *      booked k days out, pooled across weekdays over the trailing 84 days.
 *      Requires MIN_PICKUP_OBSERVATIONS per lead; otherwise no prediction is
 *      published for that day and data quality is reported as limited.
 */

export const OCCUPANCY_MODEL_VERSION = "occupancy-v1";
const HISTORY_WINDOW_DAYS = 84;
const HORIZON_DAYS = 7;
const MIN_PICKUP_OBSERVATIONS = 5;
const MEDIUM_QUALITY_OBSERVATIONS = 14;

export interface OccupancyDay {
  date: string;
  totalRooms: number;
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
}

/** Count reservations covering the night of `date` (optionally only those booked on/before `knownThrough`). */
export function countNights(reservations: ReservationLike[], date: string, past: boolean, knownThrough?: string): number {
  const statuses = past ? NIGHT_COVERING_PAST_STATUSES : NIGHT_COVERING_STATUSES;
  return reservations.filter((reservation) =>
    statuses.includes(reservation.status as never)
    && reservation.check_in <= date
    && reservation.check_out > date
    && (knownThrough === undefined || reservation.created_at.slice(0, 10) <= knownThrough)
  ).length;
}

/** Mean historical pickup for a given lead, measured over trailing nights.
 *  Only nights with actual booking activity count as observations — trailing
 *  nights nobody ever booked teach nothing about pickup and must not inflate
 *  the basis (a young/empty system reports "limited", never a confident 84). */
export function pickupEstimate(reservations: ReservationLike[], today: string, lead: number): { pickup: number; observations: number } {
  const pickups: number[] = [];
  for (let back = 1; back <= HISTORY_WINDOW_DAYS; back++) {
    const night = shiftDate(today, -back);
    const bookedAtLead = shiftDate(night, -lead);
    const final = countNights(reservations, night, true);
    const knownAtLead = countNights(reservations, night, true, bookedAtLead);
    if (final === 0 && knownAtLead === 0) continue;
    pickups.push(final - knownAtLead);
  }
  const mean = pickups.length ? pickups.reduce((sum, value) => sum + value, 0) / pickups.length : 0;
  return { pickup: Math.max(0, Math.round(mean * 10) / 10), observations: pickups.length };
}

export function forecastOccupancy(input: OccupancyInput): OccupancyForecast {
  const horizon = input.horizon ?? HORIZON_DAYS;
  const totalRooms = input.rooms.filter((room) => room.administratively_active !== false).length;
  const notes: string[] = [];
  const days: OccupancyDay[] = [];

  for (let offset = 0; offset < horizon; offset++) {
    const date = shiftDate(input.today, offset);
    const knownOccupied = countNights(input.reservations, date, false);
    const knownOccupancyPct = totalRooms ? Math.round((knownOccupied / totalRooms) * 100) : 0;
    const { pickup, observations } = pickupEstimate(input.reservations, input.today, offset);

    const day: OccupancyDay = {
      date,
      totalRooms,
      knownOccupied,
      knownOccupancyPct,
      riskLevel: occupancyRisk(knownOccupancyPct),
      dataQuality: "limited",
      basisObservations: observations
    };

    if (observations >= MIN_PICKUP_OBSERVATIONS) {
      const predictedOccupied = Math.min(totalRooms, knownOccupied + Math.round(pickup));
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
    notes.push("Pickup estimation needs at least " + MIN_PICKUP_OBSERVATIONS + " days of booking history per lead time. Until then only known (booked) occupancy is reported — it is a fact, not a prediction.");
  }
  notes.push("Occupancy percentages are per-night room counts over administratively active rooms (" + totalRooms + ").");

  return {
    today: input.today,
    days,
    method: "Known booked occupancy + average historical pickup by lead time (pooled, trailing " + HISTORY_WINDOW_DAYS + " days)",
    notes
  };
}

/** Actual occupancy for a past night — used by prediction-vs-actual evaluation. */
export function actualOccupancy(reservations: ReservationLike[], date: string, totalRooms: number): number {
  const occupied = countNights(reservations, date, true);
  return totalRooms ? Math.round((occupied / totalRooms) * 100) : 0;
}
