import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateDynamicRateRecommendations, DYNAMIC_PRICING_MODEL_VERSION, type DynamicRateRecommendation } from "./dynamic-pricing";
import { getAnalyticsInputs } from "./data";
import { forecastOccupancy } from "./occupancy";

export interface PricingRecommendationResult {
  generatedAt: string;
  modelRunId: string | null;
  modelVersion: string;
  recommendations: DynamicRateRecommendation[];
  confidence: { level: "medium" | "limited"; basis: string };
}

type RoomTypeRow = {
  id: string;
  name: string;
  base_rate: number | string;
  dynamic_rate_floor: number | string | null;
  dynamic_rate_ceiling: number | string | null;
};

export async function getPricingRecommendations(client: SupabaseClient): Promise<PricingRecommendationResult> {
  const [inputs, roomTypeResult, runResult] = await Promise.all([
    getAnalyticsInputs(),
    client.from("room_types").select("id,name,base_rate,dynamic_rate_floor,dynamic_rate_ceiling").eq("active", true).order("name"),
    client.from("analytics_model_runs").select("id,generated_at").eq("model_type", "occupancy").eq("status", "completed").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (roomTypeResult.error) throw roomTypeResult.error;
  if (runResult.error) throw runResult.error;

  const occupancy = forecastOccupancy({ reservations: inputs.reservations, rooms: inputs.rooms, today: inputs.today });
  const recommendations = calculateDynamicRateRecommendations({
    forecast: occupancy,
    reservations: inputs.reservations,
    roomTypes: ((roomTypeResult.data ?? []) as RoomTypeRow[]).map((roomType) => ({
      id: roomType.id,
      name: roomType.name,
      baseRate: roomType.base_rate,
      floorRate: roomType.dynamic_rate_floor,
      ceilingRate: roomType.dynamic_rate_ceiling,
    })),
    now: new Date().toISOString(),
  });
  const limited = recommendations.filter((entry) => entry.confidence === "limited").length;
  return {
    generatedAt: new Date().toISOString(),
    modelRunId: runResult.data?.id ?? null,
    modelVersion: DYNAMIC_PRICING_MODEL_VERSION,
    recommendations,
    confidence: {
      level: limited > 0 ? "limited" : "medium",
      basis: limited > 0
        ? `${limited} recommendation${limited === 1 ? " uses" : "s use"} booked occupancy because pickup history is still limited.`
        : "All recommendations use the supported occupancy forecast and its recorded pickup observations.",
    },
  };
}
