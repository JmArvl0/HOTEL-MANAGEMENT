import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { numericInput } from "@/lib/input-validation";

import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { MAX_RATE_PROPOSALS } from "@/lib/analytics/dynamic-pricing";
import { getPricingRecommendations } from "@/lib/analytics/pricing-service";

const staleForecast = "The pricing forecast changed. Refresh and review the latest recommendations.";

const proposalSchema = z.object({
  modelRunId: z.string().uuid(),
  recommendations: z.array(z.object({
    roomTypeId: z.string().uuid(),
    reviewKey: z.string().regex(/^[a-f0-9]{64}$/),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nightlyRate: numericInput(z.number().positive().max(10_000_000)).refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      "Rates may use at most two decimal places."
    ),
  })).min(1).max(MAX_RATE_PROPOSALS),
});

export async function POST(request: Request) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (c.role !== "manager") return publicJson({ error: "Only a Manager can submit predictive rate proposals." }, { status: 403 });

  const parsed = proposalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Select valid recommendations and rates before submitting." }), { status: 400 });

  try {
    const current = await getPricingRecommendations(c.client);
    if (!current.modelRunId || current.modelRunId !== parsed.data.modelRunId) {
      return publicJson({ error: staleForecast }, { status: 409 });
    }
    const byKey = new Map(current.recommendations.map((entry) => [`${entry.roomTypeId}:${entry.targetDate}`, entry]));
    if (parsed.data.recommendations.some(selected => byKey.get(`${selected.roomTypeId}:${selected.targetDate}`)?.reviewKey !== selected.reviewKey)) {
      return publicJson({ error: staleForecast }, { status: 409 });
    }
    const recommendations = parsed.data.recommendations.map((selected) => {
      const recommendation = byKey.get(`${selected.roomTypeId}:${selected.targetDate}`);
      const nightlyRate = Math.round(selected.nightlyRate * 100) / 100;
      if (!recommendation || nightlyRate < recommendation.floorRate || nightlyRate > recommendation.ceilingRate) throw new Error("INVALID_ANALYTICS_RATE_PROPOSAL");
      return {
        roomTypeId: selected.roomTypeId,
        targetDate: selected.targetDate,
        nightlyRate,
        reason: `${recommendation.reasoning} Selling ₱${recommendation.sellingRate.toFixed(2)}. Recommended ₱${recommendation.recommendedRate.toFixed(2)}. Proposed ₱${nightlyRate.toFixed(2)}.`,
      };
    });

    const { data, error } = await c.client.rpc("manager_propose_analytics_rate_plans", {
      p_recommendations: recommendations,
      p_model_run_id: parsed.data.modelRunId,
      p_actor_user_id: c.actorId,
    });
    if (error) return adminRpcFailure(error, "Unable to submit the predictive rate proposal.");
    return publicJson({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("INVALID_ANALYTICS_RATE_PROPOSAL")) {
      return publicJson({ error: "A proposed rate falls outside its allowed room-type bounds." }, { status: 400 });
    }
    return publicJson({ error: "Unable to submit the predictive rate proposal." }, { status: 500 });
  }
}
