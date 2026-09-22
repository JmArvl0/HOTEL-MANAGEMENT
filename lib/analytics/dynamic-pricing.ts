import type { OccupancyForecast } from "./occupancy";
import type { DataQuality, ReservationLike } from "./types";

export const DYNAMIC_PRICING_MODEL_VERSION = "dynamic-pricing-v1";

export type DemandTier = "low" | "moderate" | "high";
export type OccupancyBasis = "fact" | "prediction";
export type RateBound = "floor" | "ceiling" | null;

export interface RoomTypePricingInput {
  id: string;
  name: string;
  baseRate: number | string;
  /** Optional configured bounds. When absent, HAVEN's room-type bounds are 80–135% of base. */
  floorRate?: number | string | null;
  ceilingRate?: number | string | null;
}

export interface DynamicRateRecommendation {
  roomTypeId: string;
  roomTypeName: string;
  targetDate: string;
  baseRate: number;
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

export interface DynamicPricingInput {
  forecast: OccupancyForecast;
  reservations: ReservationLike[];
  roomTypes: RoomTypePricingInput[];
  /** ISO timestamp. Injected so the pure engine remains deterministic in tests and snapshots. */
  now: string;
}

const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "checked_in", "pending"]);
const NEGATIVE_BOOKING_STATUSES = new Set(["cancelled", "no_show"]);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const money = (value: number | string | null | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
};
const fromCents = (value: number) => value / 100;

function netBookingPace(reservations: ReservationLike[], roomType: string, targetDate: string, now: string): number {
  const end = Date.parse(now);
  const start = end - 48 * 60 * 60 * 1000;
  return reservations.reduce((net, reservation) => {
    const created = Date.parse(reservation.created_at);
    if (!Number.isFinite(created) || created < start || created > end) return net;
    if (reservation.room_type !== roomType || reservation.check_in > targetDate || reservation.check_out <= targetDate) return net;
    if (ACTIVE_BOOKING_STATUSES.has(reservation.status)) return net + 1;
    if (NEGATIVE_BOOKING_STATUSES.has(reservation.status)) return net - 1;
    return net;
  }, 0);
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
  for (const day of input.forecast.days) {
    const occupancyBasis: OccupancyBasis = day.predictedOccupancyPct === undefined ? "fact" : "prediction";
    const projectedOccupancy = day.predictedOccupancyPct ?? day.knownOccupancyPct;
    for (const roomType of input.roomTypes) {
      const baseCents = money(roomType.baseRate);
      if (baseCents <= 0) continue;
      const floorCents = roomType.floorRate == null ? Math.round(baseCents * 0.8) : money(roomType.floorRate);
      const ceilingCents = roomType.ceilingRate == null ? Math.round(baseCents * 1.35) : money(roomType.ceilingRate);
      const safeFloor = clamp(floorCents, 0, Math.max(0, ceilingCents));
      const safeCeiling = Math.max(safeFloor, ceilingCents);
      const bookingPace = netBookingPace(input.reservations, roomType.name, day.date, input.now);
      const demand = demandAdjustment(projectedOccupancy, bookingPace, day.date);
      const unconstrained = Math.round((baseCents * (100 + demand.percent)) / 100);
      const recommendedCents = clamp(unconstrained, safeFloor, safeCeiling);
      const boundApplied: RateBound = recommendedCents === unconstrained ? null : recommendedCents === safeFloor ? "floor" : "ceiling";
      const percentageChange = Math.round((((recommendedCents - baseCents) / baseCents) * 100) * 10) / 10;
      const signedChange = `${percentageChange >= 0 ? "+" : ""}${percentageChange}%`;
      const boundNote = boundApplied ? ` The ${boundApplied} bound limited the recommendation.` : "";

      recommendations.push({
        roomTypeId: roomType.id,
        roomTypeName: roomType.name,
        targetDate: day.date,
        baseRate: fromCents(baseCents),
        projectedOccupancy,
        recommendedRate: fromCents(recommendedCents),
        percentageChange,
        demandTier: demand.tier,
        reasoning: `${signedChange} ${demand.tier === "high" ? "surge" : demand.tier === "low" ? "adjustment" : "rate adjustment"} due to ${projectedOccupancy}% projected ${demand.dayLabel} occupancy and ${pacePhrase(bookingPace)}.${boundNote}`,
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
