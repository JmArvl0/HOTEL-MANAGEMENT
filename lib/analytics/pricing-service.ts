import { createHash } from "node:crypto";
import { readAllRows } from "@/lib/read-all-rows";
import { nightlyRates, parseFrozenRates, type RatePlan } from "@/lib/rate-plans";
import { shiftDate } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateDynamicRateRecommendations, DYNAMIC_PRICING_MODEL_VERSION, type BookingPaceEvent, type DynamicRateRecommendation } from "./dynamic-pricing";
import { getAnalyticsInputs } from "./data";
import { forecastOccupancy } from "./occupancy";

export interface PricingRecommendationResult {
  generatedAt: string;
  modelRunId: string | null;
  modelVersion: string;
  recommendations: ReviewedRate[];
  outcomes: RateOutcome[];
  confidence: { level: "medium" | "limited"; basis: string };
}

export type ReviewedRate = DynamicRateRecommendation & { reviewKey: string };
export type RateOutcome = { id: string; date: string; roomType: string; proposedRate: number; status: RatePlan["status"]; recordedAverage: number | null; recordedNights: number };

type RoomTypeRow = {
  id: string;
  name: string;
  base_rate: number | string;
  dynamic_rate_floor: number | string | null;
  dynamic_rate_ceiling: number | string | null;
};

export async function getPricingRecommendations(client: SupabaseClient): Promise<PricingRecommendationResult> {
  const now = new Date();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const [inputs, roomTypeResult, runResult, plans, confirmations, cancellations] = await Promise.all([
    getAnalyticsInputs(),
    client.from("room_types").select("id,name,base_rate,dynamic_rate_floor,dynamic_rate_ceiling").eq("active", true).order("name"),
    client.from("analytics_model_runs").select("id,generated_at").eq("model_type", "occupancy").eq("status", "completed").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    readAllRows<RatePlan>(() => client.from("room_rate_plans").select("id,room_type_id,name,start_date,end_date,days_of_week,nightly_rate,status,decided_at").eq("status", "active")),
    readAllRows<{ reservation_id: string; verified_at: string }>(() => client.from("payments").select("id,reservation_id,verified_at")
      .eq("purpose", "reservation_deposit").gte("verified_at", since).not("reservation_id", "is", null)),
    readAllRows<{ entity_id: string; created_at: string }>(() => client.from("audit_logs").select("id,entity_id,created_at")
      .eq("entity_type", "reservation").in("action", ["cancel_reservation", "reservation_no_show"])
      .eq("before_data->>status", "confirmed").gte("created_at", since))
  ]);
  if (roomTypeResult.error) throw roomTypeResult.error;
  if (runResult.error) throw runResult.error;

  const roomTypes = (roomTypeResult.data ?? []) as RoomTypeRow[];
  const occupancy = forecastOccupancy({ reservations: inputs.reservations, rooms: inputs.rooms, today: inputs.today, pickupHistory: inputs.pickupHistory });
  const events: BookingPaceEvent[] = [
    ...confirmations.map(row => ({ reservationId: row.reservation_id, at: row.verified_at, delta: 1 as const })),
    ...cancellations.map(row => ({ reservationId: row.entity_id, at: row.created_at, delta: -1 as const }))
  ];
  const recommendations = calculateDynamicRateRecommendations({
    forecast: occupancy,
    reservations: inputs.reservations,
    events,
    roomTypes: roomTypes.map((roomType) => ({
      id: roomType.id,
      name: roomType.name,
      baseRate: roomType.base_rate,
      sellingRates: Object.fromEntries(nightlyRates(roomType.base_rate, plans.filter(plan => plan.room_type_id === roomType.id),
        inputs.today, shiftDate(occupancy.days.at(-1)?.date ?? inputs.today, 1)).map(night => [night.date, night.rate])),
      floorRate: roomType.dynamic_rate_floor,
      ceilingRate: roomType.dynamic_rate_ceiling,
    })),
    now: now.toISOString(),
  }).map(entry => ({ ...entry, reviewKey: createHash("sha256").update(JSON.stringify([DYNAMIC_PRICING_MODEL_VERSION, entry])).digest("hex") }));
  const bookedOnly = recommendations.filter(entry => entry.occupancyBasis === "fact").length;
  const limited = recommendations.filter(entry => entry.occupancyBasis === "prediction" && entry.confidence === "limited").length;
  const outcomes = await loadRateOutcomes(client, inputs.today, roomTypes);
  return {
    generatedAt: new Date().toISOString(),
    modelRunId: runResult.data?.id ?? null,
    modelVersion: DYNAMIC_PRICING_MODEL_VERSION,
    recommendations,
    outcomes,
    confidence: {
      level: bookedOnly + limited > 0 ? "limited" : "medium",
      basis: bookedOnly + limited > 0
        ? `${bookedOnly} using booked occupancy only. ${limited} using an estimate with limited history.`
        : "Recommendations use saved pickup history.",
    },
  };
}

async function loadRateOutcomes(client: SupabaseClient, today: string, roomTypes: RoomTypeRow[]): Promise<RateOutcome[]> {
  const { data, error } = await client.from("room_rate_plans").select("id,room_type_id,start_date,nightly_rate,status,decided_at")
    .eq("created_from_analytics", true).gte("start_date", shiftDate(today, -30)).order("start_date", { ascending: false }).limit(50);
  if (error) throw error;
  const plans = (data ?? []) as Pick<RatePlan, "id" | "room_type_id" | "start_date" | "nightly_rate" | "status" | "decided_at">[];
  const retired = plans.filter(plan => plan.status === "retired" && plan.start_date < today).map(plan => plan.id);
  const approvals = retired.length ? await readAllRows<{ entity_id: string; created_at: string }>(() =>
    client.from("audit_logs").select("id,entity_id,created_at").eq("entity_type", "room_rate_plan")
      .eq("action", "review_room_rate_plan").eq("after_data->>decision", "approve").in("entity_id", retired)) : [];
  const approvedAt = new Map(approvals.map(row => [row.entity_id, row.created_at]));
  for (const plan of plans) {
    if (plan.status === "active" && plan.decided_at) approvedAt.set(plan.id, plan.decided_at);
  }
  const closedDates = plans.filter(plan => approvedAt.has(plan.id) && plan.start_date < today);
  const stays = closedDates.length ? await readAllRows<{ room_type: string; nightly_rates: unknown; created_at: string }>(() =>
    client.from("reservations").select("id,room_type,nightly_rates,created_at").in("status", ["checked_in", "checked_out"])
      .gt("check_out", shiftDate(today, -30)).lt("check_in", today).not("nightly_rates", "is", null)) : [];
  return plans.map(plan => {
    const roomType = roomTypes.find(type => type.id === plan.room_type_id)?.name ?? "Inactive room type";
    const approval = approvedAt.get(plan.id);
    const rates = approval && plan.start_date < today ? stays.flatMap(stay => stay.room_type === roomType && Date.parse(stay.created_at) >= Date.parse(approval)
      && (plan.status !== "retired" || Date.parse(stay.created_at) < Date.parse(plan.decided_at ?? ""))
      ? parseFrozenRates(stay.nightly_rates).filter(night => night.date === plan.start_date).map(night => night.rate) : []) : [];
    return { id: plan.id, date: plan.start_date, roomType, proposedRate: Number(plan.nightly_rate), status: plan.status,
      recordedAverage: rates.length ? rates.reduce((total, rate) => total + rate, 0) / rates.length : null, recordedNights: rates.length };
  });
}
