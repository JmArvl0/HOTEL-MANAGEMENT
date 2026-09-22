import { NextResponse } from "next/server";
import { z } from "zod";
import { guardCatalog, adminGuardFailed, adminRpcFailure } from "@/lib/admin-route";
import { getPricingRecommendations } from "@/lib/analytics/pricing-service";

const proposalSchema = z.object({
  modelRunId: z.string().uuid(),
  recommendations: z.array(z.object({
    roomTypeId: z.string().uuid(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nightlyRate: z.coerce.number().positive().max(10_000_000).refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      "Rates may use at most two decimal places."
    ),
  })).min(1).max(50),
});

export async function POST(request: Request) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (c.role !== "manager") return NextResponse.json({ error: "Only a Manager can submit predictive rate proposals." }, { status: 403 });

  const parsed = proposalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select valid recommendations and rates before submitting." }, { status: 400 });

  try {
    const current = await getPricingRecommendations(c.client);
    if (!current.modelRunId || current.modelRunId !== parsed.data.modelRunId) {
      return NextResponse.json({ error: "The pricing forecast changed. Refresh and review the latest recommendations." }, { status: 409 });
    }
    const byKey = new Map(current.recommendations.map((entry) => [`${entry.roomTypeId}:${entry.targetDate}`, entry]));
    const recommendations = parsed.data.recommendations.map((selected) => {
      const recommendation = byKey.get(`${selected.roomTypeId}:${selected.targetDate}`);
      const nightlyRate = Math.round(selected.nightlyRate * 100) / 100;
      if (!recommendation || nightlyRate < recommendation.floorRate || nightlyRate > recommendation.ceilingRate) throw new Error("INVALID_ANALYTICS_RATE_PROPOSAL");
      return {
        roomTypeId: selected.roomTypeId,
        targetDate: selected.targetDate,
        nightlyRate,
        reason: `${recommendation.reasoning} Manager reviewed the recommended ₱${recommendation.recommendedRate.toFixed(2)} rate and proposed ₱${nightlyRate.toFixed(2)}.`,
      };
    });

    const { data, error } = await c.client.rpc("manager_propose_analytics_rate_plans", {
      p_recommendations: recommendations,
      p_model_run_id: parsed.data.modelRunId,
      p_actor_user_id: c.actorId,
    });
    if (error) return adminRpcFailure(error, "Unable to submit the predictive rate proposal.");
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("INVALID_ANALYTICS_RATE_PROPOSAL")) {
      return NextResponse.json({ error: "A proposed rate falls outside its allowed room-type bounds." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to submit the predictive rate proposal." }, { status: 500 });
  }
}
