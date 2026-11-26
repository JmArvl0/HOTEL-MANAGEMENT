import type { OccupancyForecast } from "./occupancy";
import type { DataQuality, ReservationLike } from "./types";

export const MAX_RATE_PROPOSALS = 50;
export const DYNAMIC_PRICING_MODEL_VERSION = "dynamic-pricing-v2";

export type DemandTier = "low" | "moderate" | "high";
export type OccupancyBasis = "fact" | "prediction";
export type RateBound = "floor" | "ceiling" | null;

export interface RoomTypePricingInput {
  id: string;
  name: string;
  baseRate: number | string;
  sellingRates?: Record<string, number>;
  /** Optional configured bounds. When absent, HAVEN's room-type bounds are 80–135% of base. */
  floorRate?: number | string | null;
  ceilingRate?: number | string | null;
}

export interface DynamicRateRecommendation {
  roomTypeId: string;
  roomTypeName: string;
  targetDate: string;
  baseRate: number;
  sellingRate: number;
  observations: number;
  projectedOccupancy: number;
  recommendedRate: number;
  percentageChange: number;
  demandTier: DemandTier;
  reasoning: string;
  bookingPace: number;
  confidence: DataQuality;
  occupancyBasis: OccupancyBasis;
  floorRate: number;
  ceilingRate: number;
  boundApplied: RateBound;
}

export type BookingPaceEvent = { reservationId: string; at: string; delta: 1 | -1 };

export interface DynamicPricingInput {
  events?: readonly BookingPaceEvent[];
  forecast: OccupancyForecast;
  reservations: ReservationLike[];
  roomTypes: RoomTypePricingInput[];
  /** ISO timestamp. Injected so the pure engine remains deterministic in tests and snapshots. */
  now: string;
}

const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "checked_in", "checked_out"]);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const money = (value: number | string | null | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
};
const fromCents = (value: number) => value / 100;

function recentBookingChanges(input: DynamicPricingInput) {
  const end = Date.parse(input.now);
  const start = end - 48 * 60 * 60 * 1000;
  const recorded = input.events ?? [];
  const confirmed = new Set(recorded.filter(event => event.delta === 1).map(event => event.reservationId));
  const reversed = new Set(recorded.filter(event => event.delta === -1).map(event => event.reservationId));
  const created: BookingPaceEvent[] = input.reservations.flatMap(reservation =>
    !confirmed.has(reservation.id) && (ACTIVE_BOOKING_STATUSES.has(reservation.status) || (reservation.source && reservation.source !== "Website" && reversed.has(reservation.id)))
      ? [{ reservationId: reservation.id, at: reservation.created_at, delta: 1 }] : []);
  const changes = new Map<string, number>();
  const seen = new Set<string>();
  for (const event of [...recorded, ...created]) {
    const at = Date.parse(event.at);
    const key = `${event.reservationId}:${event.delta}`;
    if (!Number.isFinite(at) || at < start || at > end || seen.has(key)) continue;
    seen.add(key);
    changes.set(event.reservationId, (changes.get(event.reservationId) ?? 0) + event.delta);
  }
  return changes;
}

function demandAdjustment(occupancy: number, pace: number, targetDate: string): { tier: DemandTier; percent: number; dayLabel: string } {
  const date = new Date(`${targetDate}T00:00:00Z`);
  const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(date);
  const weekendLift = date.getUTCDay() === 5 || date.getUTCDay() === 6 ? 2 : 0;

  if (occupancy >= 80) {
    const occupancyLift = 15 + ((clamp(occupancy, 80, 100) - 80) / 20) * 15;
    return { tier: "high", percent: clamp(Math.round(occupancyLift) + clamp(pace * 2, -5, 5) + weekendLift, 15, 35), dayLabel };
  }
  if (occupancy >= 50) {
    const occupancyAdjustment = Math.round(((clamp(occupancy, 50, 79.99) - 65) / 15) * 3);
    return { tier: "moderate", percent: clamp(occupancyAdjustment + clamp(pace, -2, 2) + (weekendLift ? 1 : 0), -5, 5), dayLabel };
  }
  if (occupancy < 30) {
    const discount = Math.round(-20 + (clamp(occupancy, 0, 30) / 30) * 10);
    return { tier: "low", percent: clamp(discount + clamp(pace, -2, 2) + (weekendLift ? 1 : 0), -20, -10), dayLabel };
  }
  return { tier: "low", percent: clamp(-5 + clamp(pace, -2, 2) + (weekendLift ? 1 : 0), -5, 0), dayLabel };
}

function pacePhrase(pace: number): string {
  if (pace === 0) return "flat net booking pace in the last 48 hours";
  return `net ${pace > 0 ? "+" : ""}${pace} booking${Math.abs(pace) === 1 ? "" : "s"} in the last 48 hours`;
}

/**
 * Pure, explainable dynamic-rate recommendation engine. All money math is
 * performed in integer centavos and converted back only at the API boundary.
 * It recommends; it never writes a rate or rate plan.
 */
export function calculateDynamicRateRecommendations(input: DynamicPricingInput): DynamicRateRecommendation[] {
  const recommendations: DynamicRateRecommendation[] = [];
  const changes = recentBookingChanges(input);
  for (const day of input.forecast.days) {
    if (day.totalRooms <= 0) continue;
    const occupancyBasis: OccupancyBasis = day.predictedOccupancyPct === undefined ? "fact" : "prediction";
    const projectedOccupancy = day.predictedOccupancyPct ?? day.knownOccupancyPct;
    for (const roomType of input.roomTypes) {
      const baseCents = money(roomType.baseRate);
      if (baseCents <= 0) continue;
      const floorCents = roomType.floorRate == null ? Math.round(baseCents * 0.8) : money(roomType.floorRate);
      const ceilingCents = roomType.ceilingRate == null ? Math.round(baseCents * 1.35) : money(roomType.ceilingRate);
      const safeFloor = clamp(floorCents, 0, Math.max(0, ceilingCents));
      const safeCeiling = Math.max(safeFloor, ceilingCents);
      const bookingPace = input.reservations.reduce((net, stay) => stay.room_type === roomType.name
        && stay.check_in <= day.date && stay.check_out > day.date ? net + (changes.get(stay.id) ?? 0) : net, 0);
      const sellingCents = money(roomType.sellingRates?.[day.date] ?? roomType.baseRate);
      if (sellingCents <= 0) continue;
      const demand = demandAdjustment(projectedOccupancy, bookingPace, day.date);
      const unconstrained = Math.round((baseCents * (100 + demand.percent)) / 100);
      const recommendedCents = clamp(unconstrained, safeFloor, safeCeiling);
      const boundApplied: RateBound = recommendedCents === unconstrained ? null : recommendedCents === safeFloor ? "floor" : "ceiling";
      const percentageChange = Math.round((((recommendedCents - sellingCents) / sellingCents) * 100) * 10) / 10;
      const signedChange = `${percentageChange >= 0 ? "+" : ""}${percentageChange}%`;
      const boundNote = boundApplied ? ` The ${boundApplied} bound limited the recommendation.` : "";

      recommendations.push({
        roomTypeId: roomType.id,
        roomTypeName: roomType.name,
        targetDate: day.date,
        baseRate: fromCents(baseCents),
        sellingRate: fromCents(sellingCents),
        observations: day.basisObservations,
        projectedOccupancy,
        recommendedRate: fromCents(recommendedCents),
        percentageChange,
        demandTier: demand.tier,
        reasoning: `${signedChange} vs the current selling rate. Uses ${projectedOccupancy}% ${occupancyBasis === "fact" ? "already booked" : "expected"} ${demand.dayLabel} occupancy and ${pacePhrase(bookingPace)}.${boundNote}`,
        bookingPace,
        confidence: day.dataQuality,
        occupancyBasis,
        floorRate: fromCents(safeFloor),
        ceilingRate: fromCents(safeCeiling),
        boundApplied,
      });
    }
  }
  return recommendations;
}
