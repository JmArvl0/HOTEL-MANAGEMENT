import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-route", () => ({
  guardCatalog: vi.fn(),
  adminGuardFailed: (value: unknown) => value instanceof Response,
  adminRpcFailure: () => Response.json({ error: "RPC failed" }, { status: 409 }),
}));
vi.mock("@/lib/analytics/pricing-service", () => ({ getPricingRecommendations: vi.fn() }));

const { guardCatalog } = await import("@/lib/admin-route");
const { getPricingRecommendations } = await import("@/lib/analytics/pricing-service");
const { GET } = await import("@/app/api/analytics/pricing-recommendations/route");
const { POST } = await import("@/app/api/analytics/pricing-recommendations/propose/route");

const modelRunId = "11111111-1111-4111-8111-111111111111";
const roomTypeId = "22222222-2222-4222-8222-222222222222";
const recommendation = {
  roomTypeId, roomTypeName: "Garden Twin", targetDate: "2026-09-23", baseRate: 5800,
  projectedOccupancy: 85, recommendedRate: 6960, percentageChange: 20,
  demandTier: "high" as const, reasoning: "+20% surge due to demand.", bookingPace: 2,
  confidence: "medium" as const, occupancyBasis: "prediction" as const,
  floorRate: 4640, ceilingRate: 7830, boundApplied: null,
};
const pricing = { generatedAt: "2026-09-22T00:00:00Z", modelRunId, modelVersion: "dynamic-pricing-v1", recommendations: [recommendation], confidence: { level: "medium" as const, basis: "Supported." } };

beforeEach(() => {
  vi.mocked(guardCatalog).mockReset();
  vi.mocked(getPricingRecommendations).mockReset();
  vi.mocked(getPricingRecommendations).mockResolvedValue(pricing);
});

describe("pricing recommendation authorization", () => {
  it.each(["front_desk", "guest"])("rejects %s from recommendation reads", async (role) => {
    vi.mocked(guardCatalog).mockResolvedValue({ actorId: "user", role, client: {} } as never);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(getPricingRecommendations).not.toHaveBeenCalled();
  });

  it.each(["manager", "owner", "admin"])("allows %s to read recommendations", async (role) => {
    vi.mocked(guardCatalog).mockResolvedValue({ actorId: "user", role, client: {} } as never);
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it.each(["front_desk", "guest", "owner", "admin"])("rejects %s from proposal submission", async (role) => {
    vi.mocked(guardCatalog).mockResolvedValue({ actorId: "user", role, client: {} } as never);
    const response = await POST(new Request("http://haven.test/api/analytics/pricing-recommendations/propose", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
  });

  it("submits a Manager-reviewed rate through the governed database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { submitted: 1, status: "pending_approval" }, error: null });
    vi.mocked(guardCatalog).mockResolvedValue({ actorId: "manager-id", role: "manager", client: { rpc } } as never);
    const response = await POST(new Request("http://haven.test/api/analytics/pricing-recommendations/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelRunId, recommendations: [{ roomTypeId, targetDate: recommendation.targetDate, nightlyRate: 7100.25 }] }),
    }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("manager_propose_analytics_rate_plans", expect.objectContaining({
      p_model_run_id: modelRunId,
      p_actor_user_id: "manager-id",
      p_recommendations: [expect.objectContaining({ roomTypeId, nightlyRate: 7100.25 })],
    }));
  });

  it("rejects rates with fractional centavos before reaching the database", async () => {
    const rpc = vi.fn();
    vi.mocked(guardCatalog).mockResolvedValue({ actorId: "manager-id", role: "manager", client: { rpc } } as never);
    const response = await POST(new Request("http://haven.test/api/analytics/pricing-recommendations/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelRunId, recommendations: [{ roomTypeId, targetDate: recommendation.targetDate, nightlyRate: 7100.251 }] }),
    }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
